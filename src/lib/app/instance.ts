import { openAuchan } from "../auchan/open";
import { loadWeeklyContext } from "../context/cache";
import { selectBackend } from "../llm/backend";
import { WeekStore } from "../store/weeks";
import { MyFreshApp } from "./service";

const globalForApp = globalThis as typeof globalThis & { __myfreshApp?: MyFreshApp };

/**
 * Instance unique pour le processus serveur Next.js (les tâches en cours vivent en mémoire).
 * Rangée dans globalThis pour survivre aux rechargements de modules de `next dev`.
 */
export function getApp(): MyFreshApp {
  globalForApp.__myfreshApp ??= new MyFreshApp({
    store: new WeekStore(),
    backend: () => selectBackend(),
    openAuchan: () => openAuchan(),
    loadContext: (connector) => loadWeeklyContext(connector),
  });
  return globalForApp.__myfreshApp;
}
