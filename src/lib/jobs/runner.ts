import type { JobKind, JobState, Week } from "../store/weeks";

export interface JobContext {
  step(label: string): void;
  progress(done: number, total: number): void;
}

export class JobBusyError extends Error {
  constructor(public readonly current: JobState) {
    super("Une tâche est déjà en cours : attends qu'elle se termine.");
    this.name = "JobBusyError";
  }
}

/** Exécute une tâche longue à la fois dans le processus serveur ; l'état est publié via onUpdate. */
export class JobRunner {
  private state: JobState | null = null;
  private running: Promise<void> = Promise.resolve();

  constructor(private readonly opts: { onUpdate?: (state: JobState) => void; now?: () => Date } = {}) {}

  private now(): string {
    return (this.opts.now ?? (() => new Date()))().toISOString();
  }

  current(): JobState | null {
    return this.state ? { ...this.state } : null;
  }

  isBusy(): boolean {
    return this.state?.status === "running";
  }

  start(weekId: string, kind: JobKind, fn: (job: JobContext) => Promise<void>): JobState {
    if (this.state?.status === "running") throw new JobBusyError({ ...this.state });
    const state: JobState = {
      weekId,
      kind,
      status: "running",
      step: "Démarrage",
      progress: null,
      error: null,
      startedAt: this.now(),
      finishedAt: null,
    };
    this.state = state;
    const emit = () => {
      try {
        this.opts.onUpdate?.({ ...state });
      } catch (e) {
        console.error(`FreshDrive : état de la tâche non enregistré (${(e as Error).message})`);
      }
    };
    emit();
    const job: JobContext = {
      step: (label) => {
        state.step = label;
        state.progress = null;
        emit();
      },
      progress: (done, total) => {
        state.progress = { done, total };
        emit();
      },
    };
    this.running = (async () => {
      try {
        await fn(job);
        state.status = "done";
        state.step = "Terminé";
      } catch (e) {
        state.status = "error";
        state.error = e instanceof Error ? e.message : String(e);
      }
      state.progress = null;
      state.finishedAt = this.now();
      emit();
    })();
    return { ...state };
  }

  /** Attend la fin de la tâche en cours (utile aux tests et au CLI). */
  idle(): Promise<void> {
    return this.running;
  }
}

/** Envoi au panier arrêté en cours de route : des lignes ont peut-être déjà été écrites, ne pas relancer à l'aveugle. */
export const PUSH_INTERRUPTED_MESSAGE = "Envoi interrompu : vérifie ton panier sur auchan.fr avant toute action.";

/** Message d'une tâche coupée par un redémarrage du serveur. */
export function interruptedJobMessage(kind: JobKind): string {
  return kind === "push" ? PUSH_INTERRUPTED_MESSAGE : "Tâche interrompue (le serveur a redémarré). Relance-la.";
}

/** Message d'un envoi au panier qui échoue après l'écriture possible de premières lignes. */
export function pushFailureMessage(cause: string): string {
  return cause ? `${PUSH_INTERRUPTED_MESSAGE} (Cause : ${cause})` : PUSH_INTERRUPTED_MESSAGE;
}

/** Une tâche « running » dans le fichier, inconnue de l'exécuteur (serveur redémarré), passe en erreur. */
export function reconcileStaleJob(week: Week, current: JobState | null, now: Date = new Date()): Week {
  const job = week.job;
  if (!job || job.status !== "running") return week;
  const alive =
    current?.status === "running" && current.weekId === week.id && current.startedAt === job.startedAt;
  if (alive) return week;
  return {
    ...week,
    status: week.status === "generating" ? "draft" : week.status,
    job: {
      ...job,
      status: "error",
      error: interruptedJobMessage(job.kind),
      finishedAt: now.toISOString(),
    },
  };
}
