import type { OpenedStore } from "../auchan/open";
import type { WeeklyContext } from "../context/build";
import { JobRunner, reconcileStaleJob } from "../jobs/runner";
import type { LlmBackend } from "../llm/backend";
import type { Brief } from "../recipes/brief";
import type { Week, WeekStore } from "../store/weeks";
import type { StoreConnector } from "../types";
import { runCreateWeek, runPush, runReviseRecipe, type WorkflowDeps } from "../week/workflows";

export interface SessionStatus {
  ok: boolean;
  message: string;
  checkedAt: string;
}

export interface AppDeps {
  store: WeekStore;
  backend: () => LlmBackend;
  openAuchan: () => Promise<OpenedStore>;
  loadContext: (connector: StoreConnector) => Promise<WeeklyContext>;
  now?: () => Date;
}

/** Refus d'une action, avec un message à afficher tel quel. */
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

const MAX_INSTRUCTION = 500;

export class MyFreshApp {
  readonly store: WeekStore;
  readonly runner: JobRunner;
  session: SessionStatus | null = null;

  constructor(private readonly deps: AppDeps) {
    this.store = deps.store;
    this.runner = new JobRunner({
      now: deps.now,
      onUpdate: (state) => {
        if (this.store.get(state.weekId)) {
          this.store.update(state.weekId, (w) => {
            w.job = state;
          });
        }
      },
    });
  }

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  backendLabel(): string {
    return this.deps.backend().label;
  }

  /** Ouvre la session Auchan et mémorise son état pour l'accueil. */
  async openStore(): Promise<StoreConnector> {
    const checkedAt = this.now().toISOString();
    try {
      const opened = await this.deps.openAuchan();
      const base = opened.source === "chrome" ? "Session reprise de Chrome, drive détecté." : "Session enregistrée, drive détecté.";
      this.session = { ok: true, message: [base, ...opened.warnings].join(" "), checkedAt };
      return opened.connector;
    } catch (e) {
      this.session = { ok: false, message: (e as Error).message, checkedAt };
      throw e;
    }
  }

  async checkSession(): Promise<SessionStatus> {
    try {
      await this.openStore();
    } catch {
      // l'échec est déjà enregistré dans this.session
    }
    return this.session!;
  }

  private workflowDeps(): WorkflowDeps {
    return {
      store: this.store,
      backend: this.deps.backend(),
      openStore: () => this.openStore(),
      loadContext: this.deps.loadContext,
    };
  }

  private reconcile(week: Week): Week {
    const fixed = reconcileStaleJob(week, this.runner.current(), this.now());
    if (fixed !== week) this.store.save(fixed);
    return fixed;
  }

  getWeek(id: string): Week | null {
    const week = this.store.get(id);
    return week ? this.reconcile(week) : null;
  }

  listWeeks(): Week[] {
    return this.store.list().map((w) => this.reconcile(w));
  }

  private requireWeek(id: string): Week {
    const week = this.getWeek(id);
    if (!week) throw new ActionError("Semaine introuvable.");
    return week;
  }

  private assertIdle(): void {
    const current = this.runner.current();
    if (current?.status === "running") {
      throw new ActionError("Une tâche est déjà en cours : attends qu'elle se termine.");
    }
  }

  private launchCreate(id: string): Week {
    this.store.update(id, (w) => {
      w.status = "generating";
    });
    this.runner.start(id, "create", (job) => runCreateWeek(id, this.workflowDeps(), job));
    return this.store.get(id)!;
  }

  startCreateWeek(brief: Brief): Week {
    this.assertIdle();
    const week = this.store.create(brief, this.now());
    return this.launchCreate(week.id);
  }

  retryCreateWeek(id: string): Week {
    const week = this.requireWeek(id);
    if (week.status !== "draft" && week.status !== "generating") {
      throw new ActionError("Cette semaine est déjà préparée.");
    }
    this.assertIdle();
    return this.launchCreate(id);
  }

  startReviseRecipe(id: string, recipeId: string, instruction: string): void {
    const text = instruction.trim();
    if (!text) throw new ActionError("Écris ce que tu veux changer dans la recette.");
    if (text.length > MAX_INSTRUCTION) throw new ActionError(`Consigne trop longue (${MAX_INSTRUCTION} caractères au maximum).`);
    const week = this.requireWeek(id);
    if (week.status !== "ready" && week.status !== "pushed") throw new ActionError("La semaine n'est pas prête.");
    if (!week.recipes.some((r) => r.id === recipeId)) throw new ActionError("Recette introuvable.");
    this.assertIdle();
    this.runner.start(id, "revise-recipe", (job) => runReviseRecipe(id, recipeId, text, this.workflowDeps(), job));
  }

  startPush(id: string): void {
    const week = this.requireWeek(id);
    if (week.status === "pushed") throw new ActionError("Cette semaine a déjà été envoyée au panier.");
    if (week.pushStartedAt) {
      throw new ActionError(
        "Un envoi au panier a déjà été lancé pour cette semaine (peut-être interrompu). Vérifie ton panier sur auchan.fr avant toute action.",
      );
    }
    if (week.status !== "ready") throw new ActionError("La semaine n'est pas prête.");
    this.assertIdle();
    this.runner.start(id, "push", (job) =>
      runPush(id, { store: this.store, openStore: () => this.openStore() }, job, () => this.now()),
    );
  }

  /** Applique une édition (fonction pure de src/lib/week/edit.ts) et l'enregistre. */
  edit(id: string, change: (week: Week) => Week): Week {
    const week = this.requireWeek(id);
    const current = this.runner.current();
    if (current?.status === "running" && current.weekId === id) {
      throw new ActionError("Une tâche est en cours sur cette semaine : attends qu'elle se termine.");
    }
    if (week.status !== "ready" && week.status !== "pushed") throw new ActionError("La semaine n'est pas prête.");
    const next = change(week);
    this.store.save(next);
    return next;
  }
}
