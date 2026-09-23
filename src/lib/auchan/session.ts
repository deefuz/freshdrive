import fs from "node:fs";

export const STATE_PATH = "data/auchan-state.json";

export interface AuchanSession {
  cookieHeader: string;
  consentId: string | null;
}

export class SessionMissingError extends Error {
  constructor(path: string) {
    super(`Session Auchan absente (${path}). Lance d'abord : npm run auchan:login`);
    this.name = "SessionMissingError";
  }
}

interface StorageState {
  cookies: { name: string; value: string; domain: string; expires: number }[];
}

export function loadSession(statePath: string = STATE_PATH, nowMs: number = Date.now()): AuchanSession {
  if (!fs.existsSync(statePath)) throw new SessionMissingError(statePath);
  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as StorageState;
  const nowSec = nowMs / 1000;
  const cookies = state.cookies.filter(
    (c) => c.domain.replace(/^\./, "").endsWith("auchan.fr") && (c.expires === -1 || c.expires > nowSec),
  );
  const consent = cookies.find((c) => c.name === "lark-consentId");
  return {
    cookieHeader: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    consentId: consent ? decodeURIComponent(consent.value) : null,
  };
}
