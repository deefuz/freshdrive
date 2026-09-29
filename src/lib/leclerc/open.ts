import fs from "node:fs";
import path from "node:path";
import { type CookieSite, importChromeCookies } from "../chrome/cookies";
import { NoStoreError } from "../drives/errors";
import { sharedGate } from "../drives/gate";
import type { OpenedStore } from "../drives/types";
import { LeclercConnector } from "./connector";
import { isLoggedIn } from "./embedded";
import { expired, HOME_URL, LeclercHttp, type LeclercHttpClient } from "./http";
import type { LeclercStore } from "./parse";
import { type LeclercSession, loadSession, STATE_PATH } from "./session";

export const LECLERC_COOKIES: CookieSite = { label: "Leclerc", domain: "leclercdrive.fr" };

const NO_STORE_MESSAGE =
  "Leclerc Drive ne voit aucun magasin : dans Chrome, connecte-toi sur leclercdrive.fr et choisis ton drive, puis réessaie.";

/** Dernier magasin trouvé, réutilisé quand ni l'accueil ni les cookies ne le donnent. */
export const STORE_PATH = "data/leclerc-store.json";

export function readSavedStore(file: string = STORE_PATH): LeclercStore | null {
  try {
    const s = JSON.parse(fs.readFileSync(file, "utf8")) as LeclercStore;
    return s.noPL && s.origin && s.storePath ? s : null;
  } catch {
    return null;
  }
}

export function saveStore(store: LeclercStore, file: string = STORE_PATH): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store));
}

/** Magasin courant d'après le cookie de session `clsWCCD125:@<point de livraison>` ; null s'il est absent ou ambigu. */
export function storeFromCookies(cookieNames: string[]): string | null {
  const ids = [...new Set(cookieNames.map((n) => n.match(/^clsWCCD125:@(\d+)$/)?.[1]).filter((id): id is string => !!id))];
  return ids.length === 1 ? ids[0] : null;
}

/**
 * Magasin choisi par l'utilisateur. Son point de livraison vient, dans l'ordre : de la redirection de l'accueil public
 * vers `?mag=<n°>` (elle n'a pas lieu à chaque visite), du cookie de session du magasin, puis du dernier magasin trouvé.
 * Ensuite, n'importe quel serveur `fdN-courses` redirige vers la boutique du magasin sur le bon serveur.
 */
export async function resolveStore(
  http: LeclercHttpClient,
  hints: { cookieNames?: string[]; saved?: LeclercStore | null } = {},
): Promise<LeclercStore> {
  const home = await http.getRedirect(HOME_URL);
  const noPL = home?.match(/[?&]mag=(\d+)/)?.[1] ?? storeFromCookies(hints.cookieNames ?? []) ?? hints.saved?.noPL;
  if (!noPL) throw new NoStoreError(NO_STORE_MESSAGE);
  const probe = `https://fd1-courses.leclercdrive.fr/magasin-${noPL}-${noPL}.aspx`;
  const location = await http.getRedirect(probe);
  const target = new URL(location ?? probe, probe);
  const storePath = target.pathname.match(/^\/magasin-\d+-[^/]+/)?.[0];
  if (!storePath || !storePath.startsWith(`/magasin-${noPL}-`)) throw new NoStoreError(NO_STORE_MESSAGE);
  return { noPL, origin: target.origin, storePath };
}

export interface OpenLeclercDeps {
  importChrome(): { profile: string; cookies: number };
  loadSession(): LeclercSession;
  makeHttp(session: LeclercSession): LeclercHttpClient;
  readStore(): LeclercStore | null;
  saveStore(store: LeclercStore): void;
}

export const defaultOpenDeps: OpenLeclercDeps = {
  importChrome: () => importChromeCookies(LECLERC_COOKIES, STATE_PATH),
  loadSession: () => loadSession(),
  makeHttp: (session) => new LeclercHttp(session, { gate: sharedGate("leclerc") }),
  readStore: () => readSavedStore(),
  saveStore: (store) => saveStore(store),
};

/**
 * Reprend la session du Chrome habituel (repli sur la session enregistrée), retrouve le magasin choisi,
 * puis vérifie que le client est connecté et que la boutique répond.
 */
export async function openLeclerc(
  opts: { importChrome?: boolean } = {},
  deps: OpenLeclercDeps = defaultOpenDeps,
): Promise<OpenedStore> {
  const warnings: string[] = [];
  let source: OpenedStore["source"] = "saved";
  if (opts.importChrome ?? true) {
    try {
      deps.importChrome();
      source = "chrome";
    } catch (e) {
      warnings.push(`Import depuis Chrome impossible (${(e as Error).message}) : session enregistrée utilisée.`);
    }
  }
  const session = deps.loadSession();
  const http = deps.makeHttp(session);
  const store = await resolveStore(http, { cookieNames: session.cookies.map((c) => c.name), saved: deps.readStore() });
  const connector = new LeclercConnector(http, store);
  if (!isLoggedIn(await http.getText(connector.pageUrl("home.aspx")))) throw expired();
  if (!(await connector.searchProducts("lait")).length) throw new NoStoreError(NO_STORE_MESSAGE);
  deps.saveStore(store);
  return { connector, source, warnings };
}
