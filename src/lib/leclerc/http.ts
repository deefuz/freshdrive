import { SessionExpiredError } from "../drives/errors";
import { RequestGate } from "../drives/gate";
import type { LeclercSession } from "./session";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export const HOME_URL = "https://www.leclercdrive.fr/";

export interface LeclercHttpClient {
  /** page HTML (URL absolue) */
  getText(url: string): Promise<string>;
  /** en-tête Location d'une redirection, sans la suivre ; null si pas de redirection */
  getRedirect(url: string): Promise<string | null>;
  /** POST x-www-form-urlencoded, réponse JSON */
  postForm<T>(url: string, fields: Record<string, string>): Promise<T>;
}

export class LeclercHttpError extends Error {
  constructor(
    public status: number,
    public url: string,
  ) {
    super(`Leclerc Drive a répondu ${status} pour ${new URL(url).pathname}`);
    this.name = "LeclercHttpError";
  }
}

export const expired = () =>
  new SessionExpiredError("Session Leclerc expirée : ouvre leclercdrive.fr dans Chrome (connecté), puis réessaie.");

/** Réponse de DataDome (anti-robot) : on ne la contourne pas, l'utilisateur rouvre le site dans Chrome. */
const isChallenge = (body: string) => /captcha-delivery\.com|geo\.captcha-delivery/.test(body);

interface Options {
  fetchFn?: typeof fetch;
  /** porte partagée ; sinon une porte propre à ce client */
  gate?: RequestGate;
}

export class LeclercHttp implements LeclercHttpClient {
  private readonly fetchFn: typeof fetch;
  private readonly gate: RequestGate;

  constructor(
    private readonly session: LeclercSession,
    opts: Options = {},
  ) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.gate = opts.gate ?? new RequestGate();
  }

  private async request(url: string, init: RequestInit, extraHeaders: Record<string, string>): Promise<Response> {
    await this.gate.wait();
    return this.fetchFn(url, {
      ...init,
      headers: {
        Cookie: this.session.cookieHeaderFor(new URL(url).host),
        "User-Agent": USER_AGENT,
        "Accept-Language": "fr-FR,fr;q=0.9",
        ...extraHeaders,
      },
    });
  }

  /** Erreurs communes : session refusée (401/403, captcha) ou renvoi vers le site public. */
  private async checked(res: Response, url: string): Promise<string> {
    const body = await res.text();
    if (res.status === 401 || res.status === 403 || isChallenge(body)) throw expired();
    if (!res.ok) throw new LeclercHttpError(res.status, url);
    const final = res.url ? new URL(res.url) : null;
    // une page de boutique qui retombe sur l'accueil public ou une page d'erreur : magasin ou session perdus
    if (final && final.host !== new URL(url).host && final.host === "www.leclercdrive.fr") throw expired();
    if (final && /pgeWCSD002_Erreur/i.test(final.pathname)) throw new LeclercHttpError(res.status, url);
    return body;
  }

  async getText(url: string): Promise<string> {
    const res = await this.request(url, { method: "GET" }, { Accept: "text/html" });
    return this.checked(res, url);
  }

  async getRedirect(url: string): Promise<string | null> {
    const res = await this.request(url, { method: "GET", redirect: "manual" }, { Accept: "text/html" });
    if (res.status >= 300 && res.status < 400) return res.headers.get("location");
    await this.checked(res, url);
    return null;
  }

  async postForm<T>(url: string, fields: Record<string, string>): Promise<T> {
    const res = await this.request(
      url,
      { method: "POST", body: new URLSearchParams(fields).toString() },
      {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
    );
    const body = await this.checked(res, url);
    try {
      return JSON.parse(body) as T;
    } catch {
      // une page HTML à la place du JSON : en pratique, la page de connexion
      throw expired();
    }
  }
}
