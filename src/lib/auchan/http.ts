import { BASE_URL } from "./parse";
import type { AuchanSession } from "./session";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export interface HttpClient {
  getText(path: string): Promise<string>;
  getJson<T>(path: string): Promise<T>;
  postJson<T>(path: string, body: unknown): Promise<T>;
}

export class AuchanHttpError extends Error {
  constructor(
    public status: number,
    public path: string,
  ) {
    super(`Auchan a répondu ${status} pour ${path}`);
    this.name = "AuchanHttpError";
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Session Auchan expirée. Relance : npm run auchan:login");
    this.name = "SessionExpiredError";
  }
}

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

interface Options {
  fetchFn?: typeof fetch;
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** porte partagée ; sinon une porte propre à ce client (minIntervalMs, now, sleep) */
  gate?: RequestGate;
}

export class AuchanHttp implements HttpClient {
  private readonly fetchFn: typeof fetch;
  private readonly gate: RequestGate;

  constructor(
    private readonly session: AuchanSession,
    opts: Options = {},
  ) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.gate = opts.gate ?? new RequestGate(opts.minIntervalMs ?? 350, opts.now, opts.sleep);
  }

  private async request(path: string, init: RequestInit, extraHeaders: Record<string, string>): Promise<Response> {
    await this.gate.wait();
    const res = await this.fetchFn(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Cookie: this.session.cookieHeader,
        "User-Agent": USER_AGENT,
        "Accept-Language": "fr-FR,fr;q=0.9",
        ...extraHeaders,
      },
    });
    if (res.status === 401 || res.status === 403) throw new SessionExpiredError();
    if (!res.ok) throw new AuchanHttpError(res.status, path);
    if (res.redirected && /login|connexion|identification|auth/i.test(res.url)) throw new SessionExpiredError();
    return res;
  }

  async getText(path: string): Promise<string> {
    const res = await this.request(path, { method: "GET" }, { Accept: "text/html" });
    return res.text();
  }

  async getJson<T>(path: string): Promise<T> {
    const res = await this.request(
      path,
      { method: "GET" },
      { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    );
    if (!(res.headers.get("content-type") ?? "").includes("json")) throw new SessionExpiredError();
    return (await res.json()) as T;
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await this.request(
      path,
      { method: "POST", body: JSON.stringify(body) },
      { Accept: "application/json", "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    );
    return (await res.json()) as T;
  }
}
