import { chooseSelection } from "../budget/basket";
import { previewPush, productLabels, pushLines, stoppedBySessionExpiry } from "../cart/push";
import { summarizeContext, type WeeklyContext } from "../context/build";
import { type JobContext, pushFailureMessage } from "../jobs/runner";
import type { LlmBackend } from "../llm/backend";
import { type IngredientMatch, matchNeeds } from "../matching/match";
import { aggregateNeeds, type IngredientNeed } from "../matching/needs";
import { fetchOffInfo } from "../matching/off";
import type { Arbiter } from "../matching/arbiter";
import type { ScoreOptions } from "../matching/score";
import type { Brief } from "../recipes/brief";
import { LlmError } from "../recipes/generate";
import { type PushReport, WeekNotFoundError, type Week, type WeekStore } from "../store/weeks";
import type { Product, StoreConnector } from "../types";
import { initialOverrides, reconcileOverrides, weekTotals } from "./edit";

export interface WorkflowDeps {
  store: WeekStore;
  backend: LlmBackend;
  /** ouvre la session Auchan (import Chrome + vérification du drive) */
  openStore(): Promise<StoreConnector>;
  loadContext(connector: StoreConnector): Promise<WeeklyContext>;
  /** arbitrage des produits par Claude (défaut : true) */
  useArbiter?: boolean;
  novaLookup?: (connector: StoreConnector) => (p: Product) => Promise<number | null>;
}

export function scoreOptions(brief: Brief): ScoreOptions {
  return { preferOrganic: brief.preferOrganic, unprocessed: brief.filters.includes("unprocessed") };
}

export function defaultNovaLookup(connector: StoreConnector): (p: Product) => Promise<number | null> {
  return async (p) => {
    const { ean } = await connector.getProductDetails(p.url);
    return ean ? (await fetchOffInfo(ean)).nova : null;
  };
}

function requireWeek(deps: Pick<WorkflowDeps, "store">, weekId: string): Week {
  const week = deps.store.get(weekId);
  if (!week) throw new WeekNotFoundError(weekId);
  return week;
}

/** Arbitrage qui, si Claude échoue, garde le classement déterministe et note un avertissement. */
function tolerantArbiter(arbitrate: Arbiter, warnings: string[]): Arbiter {
  return async (items) => {
    try {
      return await arbitrate(items);
    } catch (e) {
      if (!(e instanceof LlmError)) throw e;
      warnings.push(
        `Vérification des produits par Claude impossible (${e.message}) : choix automatiques de MyFresh, à vérifier.`,
      );
      return new Map();
    }
  };
}

async function matchFor(
  needs: IngredientNeed[],
  brief: Brief,
  connector: StoreConnector,
  deps: WorkflowDeps,
  job: JobContext,
): Promise<{ matches: IngredientMatch[]; warnings: string[] }> {
  const warnings: string[] = [];
  const arbiter = deps.useArbiter === false ? undefined : tolerantArbiter(deps.backend.arbitrate, warnings);
  job.step("Choix des produits Auchan");
  const matches = await matchNeeds(needs, scoreOptions(brief), {
    connector,
    arbiter,
    novaLookup: (deps.novaLookup ?? defaultNovaLookup)(connector),
    onProgress: (done, total) => {
      job.progress(done, total);
      if (done === total && arbiter) job.step("Vérification des produits par Claude");
    },
  });
  return { matches, warnings };
}

function setWarnings(week: Week, warnings: string[]): void {
  if (warnings.length) week.warnings = warnings;
  else delete week.warnings;
}

/** Correspondances pour les nouveaux besoins : fraîches pour les ingrédients recherchés, anciennes sinon. */
export function mergeMatches(old: IngredientMatch[], needs: IngredientNeed[], fresh: IngredientMatch[]): IngredientMatch[] {
  const freshByKey = new Map(fresh.map((m) => [m.need.key, m]));
  const oldByKey = new Map(old.map((m) => [m.need.key, m]));
  return needs.flatMap((need) => {
    const m = freshByKey.get(need.key) ?? oldByKey.get(need.key);
    return m ? [{ ...m, need }] : [];
  });
}

export async function runCreateWeek(
  weekId: string,
  deps: WorkflowDeps,
  job: JobContext,
  opts: { includePantryStaples?: boolean } = {},
): Promise<void> {
  const week = requireWeek(deps, weekId);
  try {
    job.step("Connexion à Auchan");
    const connector = await deps.openStore();
    job.step("Contexte de la semaine");
    const ctx = await deps.loadContext(connector);
    deps.store.update(weekId, (w) => {
      w.contextSummary = summarizeContext(ctx);
    });

    let recipes = week.recipes;
    if (!recipes.length) {
      job.step(`Génération des recettes (${deps.backend.label})`);
      recipes = await deps.backend.generateMenu(week.brief, ctx);
      // enregistrées tout de suite : une relance après un échec ne rappelle pas Claude
      deps.store.update(weekId, (w) => {
        w.recipes = recipes;
      });
    }

    const { matches, warnings } = await matchFor(aggregateNeeds(recipes), week.brief, connector, deps, job);
    const overrides = initialOverrides(matches, opts.includePantryStaples);
    const selected = chooseSelection(
      recipes.map((r) => r.id),
      matches,
      week.brief.dinners,
      new Set(overrides.pantry),
    );
    deps.store.update(weekId, (w) => {
      w.matches = matches;
      w.overrides = overrides;
      w.selectedRecipeIds = selected;
      setWarnings(w, warnings);
      w.status = "ready";
    });
  } catch (e) {
    deps.store.update(weekId, (w) => {
      if (w.status === "generating") w.status = "draft";
    });
    throw e;
  }
}

export async function runReviseRecipe(
  weekId: string,
  recipeId: string,
  instruction: string,
  deps: WorkflowDeps,
  job: JobContext,
): Promise<void> {
  const week = requireWeek(deps, weekId);
  const recipe = week.recipes.find((r) => r.id === recipeId);
  if (!recipe) throw new Error("Recette introuvable.");

  job.step("Connexion à Auchan");
  const connector = await deps.openStore();
  job.step("Contexte de la semaine");
  const ctx = await deps.loadContext(connector);
  job.step(`Modification de « ${recipe.title} » (${deps.backend.label})`);
  const others = week.recipes.filter((r) => r.id !== recipeId);
  const revised = { ...(await deps.backend.reviseRecipe(week.brief, ctx, recipe, others, instruction)), id: recipeId };

  const recipes = week.recipes.map((r) => (r.id === recipeId ? revised : r));
  const needs = aggregateNeeds(recipes);
  const rematchKeys = new Set(aggregateNeeds([revised]).map((n) => n.key));
  const { matches: fresh, warnings } = await matchFor(
    needs.filter((n) => rematchKeys.has(n.key)),
    week.brief,
    connector,
    deps,
    job,
  );
  const matches = mergeMatches(week.matches, needs, fresh);

  deps.store.update(weekId, (w) => {
    w.overrides = reconcileOverrides(w.overrides, w.matches, matches, rematchKeys);
    w.recipes = recipes;
    w.matches = matches;
    setWarnings(w, warnings);
  });
}

export const PUSH_SESSION_EXPIRED_MESSAGE =
  "Session Auchan expirée avant l'envoi : reconnecte-toi sur auchan.fr dans Chrome puis relance l'envoi.";

export async function runPush(
  weekId: string,
  deps: Pick<WorkflowDeps, "store" | "openStore">,
  job: JobContext,
  now: () => Date = () => new Date(),
): Promise<void> {
  const week = requireWeek(deps, weekId);
  if (week.status === "pushed") throw new Error("Cette semaine a déjà été envoyée au panier.");
  if (week.pushStartedAt) {
    throw new Error(
      "Un envoi au panier a déjà été lancé pour cette semaine (peut-être interrompu). Vérifie ton panier sur auchan.fr avant toute action.",
    );
  }
  if (week.status !== "ready") throw new Error("La semaine n'est pas prête.");
  const { basket } = weekTotals(week);
  if (!basket.lines.length) throw new Error("Aucun produit à envoyer : retiens au moins une recette.");

  job.step("Connexion à Auchan");
  const connector = await deps.openStore();
  job.step("Lecture du panier Auchan");
  const { cartLines } = previewPush(await connector.getCart(), basket.lines);

  // posé avant le premier envoi de ligne : si le serveur redémarre en cours de route, un 2e envoi est refusé.
  deps.store.update(weekId, (w) => {
    w.pushStartedAt = now().toISOString();
  });

  const interrupted = (e: unknown) => new Error(pushFailureMessage(e instanceof Error ? e.message : String(e)));
  let report: PushReport;
  try {
    job.step("Ajout au panier Auchan");
    report = await pushLines(connector, cartLines, productLabels(basket.lines), {
      onProgress: (done, total) => job.progress(done, total),
      now: now(),
    });
  } catch (e) {
    // des lignes ont peut-être déjà été écrites : l'utilisateur doit vérifier son panier avant toute action
    throw interrupted(e);
  }

  if (stoppedBySessionExpiry(report) && !report.added.length && !report.adjusted.length) {
    // rien n'a été écrit dans le panier : l'envoi peut être relancé sans risque de doublon
    deps.store.update(weekId, (w) => {
      delete w.pushStartedAt;
    });
    throw new Error(PUSH_SESSION_EXPIRED_MESSAGE);
  }

  try {
    deps.store.update(weekId, (w) => {
      w.pushReport = report;
      w.status = "pushed";
    });
  } catch (e) {
    throw interrupted(e);
  }
}
