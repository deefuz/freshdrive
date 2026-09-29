import type { DriveId } from "./drive";

/** Espacement minimal entre deux requêtes ; partageable entre plusieurs clients pour un débit global. */
export class RequestGate {
  private last = Number.NEGATIVE_INFINITY;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly minIntervalMs: number = 350,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  wait(): Promise<void> {
    const turn = this.queue.then(async () => {
      const wait = this.last + this.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.last = this.now();
    });
    this.queue = turn.catch(() => undefined);
    return turn;
  }
}

const globalForGates = globalThis as typeof globalThis & { __freshdriveGates?: Partial<Record<DriveId, RequestGate>> };

/** Une porte par Drive pour tout le processus : au plus une requête toutes les 350 ms vers chaque site. */
export function sharedGate(drive: DriveId): RequestGate {
  const gates = (globalForGates.__freshdriveGates ??= {});
  gates[drive] ??= new RequestGate();
  return gates[drive];
}
