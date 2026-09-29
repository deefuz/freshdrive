import { NoStoreError } from "../drives/errors";
import { sharedGate } from "../drives/gate";
import type { OpenedStore } from "../drives/types";
import type { StoreConnector } from "../types";
import { hasStoreSession } from "./check";
import { importChromeSession } from "./chrome-cookies";
import { AuchanConnector } from "./connector";
import { AuchanHttp } from "./http";
import { type AuchanSession, loadSession } from "./session";

const NO_STORE_MESSAGE =
  "Auchan ne voit aucun drive : dans Chrome, connecte-toi sur auchan.fr et choisis ton drive, puis réessaie.";

export interface OpenAuchanDeps {
  importChrome(): { profile: string; cookies: number };
  loadSession(): AuchanSession;
  makeConnector(session: AuchanSession): StoreConnector;
  checkStore(connector: StoreConnector): Promise<boolean>;
}

export const defaultOpenDeps: OpenAuchanDeps = {
  importChrome: () => importChromeSession(),
  loadSession: () => loadSession(),
  makeConnector: (session) => new AuchanConnector(new AuchanHttp(session, { gate: sharedGate("auchan") }), session),
  checkStore: (connector) => hasStoreSession(connector),
};

/** Reprend la session du Chrome habituel (repli sur la session enregistrée), puis vérifie qu'un drive est visible. */
export async function openAuchan(
  opts: { importChrome?: boolean } = {},
  deps: OpenAuchanDeps = defaultOpenDeps,
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
  const connector = deps.makeConnector(session);
  if (!(await deps.checkStore(connector))) throw new NoStoreError(NO_STORE_MESSAGE);
  return { connector, source, warnings };
}
