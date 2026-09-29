import fs from "node:fs";

export const STATE_PATH = "data/leclerc-state.json";

interface SessionCookie {
  name: string;
  value: string;
  /** « .leclercdrive.fr » (tout le domaine) ou un hôte précis (« fd16-courses.leclercdrive.fr ») */
  domain: string;
}

/** Cookies de la session Leclerc Drive. Le site est réparti sur plusieurs hôtes : l'en-tête Cookie dépend de l'hôte. */
export class LeclercSession {
  constructor(readonly cookies: SessionCookie[]) {}

  /** Cookies que le navigateur enverrait à `host`, comme en-tête Cookie. */
  cookieHeaderFor(host: string): string {
    return this.cookies
      .filter((c) => (c.domain.startsWith(".") ? host === c.domain.slice(1) || host.endsWith(c.domain) : host === c.domain))
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }
}

export class SessionMissingError extends Error {
  constructor(path: string) {
    super(`Session Leclerc absente (${path}) : connecte-toi sur leclercdrive.fr dans Chrome, puis réessaie.`);
    this.name = "SessionMissingError";
  }
}

interface StorageState {
  cookies: { name: string; value: string; domain: string; expires: number }[];
}

export function loadSession(statePath: string = STATE_PATH, nowMs: number = Date.now()): LeclercSession {
  if (!fs.existsSync(statePath)) throw new SessionMissingError(statePath);
  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as StorageState;
  const nowSec = nowMs / 1000;
  return new LeclercSession(
    state.cookies
      .filter((c) => c.domain.replace(/^\./, "").endsWith("leclercdrive.fr") && (c.expires === -1 || c.expires > nowSec))
      .map(({ name, value, domain }) => ({ name, value, domain })),
  );
}
