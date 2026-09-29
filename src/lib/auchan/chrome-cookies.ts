import { type CookieSite, importChromeCookies } from "../chrome/cookies";
import { STATE_PATH } from "./session";

/** Cookies que le navigateur enverrait à https://www.auchan.fr */
export function appliesToAuchanWww(hostKey: string): boolean {
  return hostKey === "www.auchan.fr" || hostKey === ".auchan.fr";
}

export const AUCHAN_COOKIES: CookieSite = { label: "Auchan", domain: "auchan.fr", keep: appliesToAuchanWww };

/** Écrit la session Auchan de Chrome dans data/auchan-state.json. */
export function importChromeSession(statePath: string = STATE_PATH): { profile: string; cookies: number } {
  return importChromeCookies(AUCHAN_COOKIES, statePath);
}
