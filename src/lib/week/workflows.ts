import { chooseSelection } from "../budget/basket";
import { summarizeContext, type WeeklyContext } from "../context/build";
import type { JobContext } from "../jobs/runner";
import type { LlmBackend } from "../llm/backend";
import { type IngredientMatch, matchNeeds } from "../matching/match";
import { aggregateNeeds, type IngredientNeed } from "../matching/needs";
import { fetchOffInfo } from "../matching/off";
import type { ScoreOptions } from "../matching/score";
import type { Brief } from "../recipes/brief";
import { WeekNotFoundError, type Week, type WeekStore } from "../store/weeks";
import type { Product, StoreConnector } from "../types";
import { initialOverrides, reconcileOverrides } from "./edit";

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

async function matchFor(
  needs: IngredientNeed[],
  brief: Brief,
  connector: StoreConnector,
  deps: WorkflowDeps,
  job: JobContext,
): Promise<IngredientMatch[]> {
  const arbiter = deps.useArbiter === false ? undefined : deps.backend.arbitrate;
  job.step("Choix des produits Auchan");
  return matchNeeds(needs, scoreOptions(brief), {
    connector,
    arbiter,
    novaLookup: (deps.novaLookup ?? defaultNovaLookup)(connector),
    onProgress: (done, total) => {
      job.progress(done, total);
      if (done === total && arbiter) job.step("Vérification des produits par Claude");
    },
  });
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

    const matches = await matchFor(aggregateNeeds(recipes), week.brief, connector, deps, job);
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
  const fresh = await matchFor(
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
  });
}
