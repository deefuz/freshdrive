import { openAuchan } from "../auchan/open";
import { loadWeeklyContext } from "../context/cache";
import { illustrateRecipes } from "../illustrate";
import { selectBackend } from "../llm/backend";
import { FavoriteStore } from "../store/favorites";
import { WeekStore } from "../store/weeks";
import { FreshDriveApp } from "./service";

const globalForApp = globalThis as typeof globalThis & { __freshdriveApp?: FreshDriveApp };

/**
 * Instance unique pour le processus serveur Next.js (les tâches en cours vivent en mémoire).
 * Rangée dans globalThis pour survivre aux rechargements de modules de `next dev`.
 */
export function getApp(): FreshDriveApp {
  globalForApp.__freshdriveApp ??= new FreshDriveApp({
    store: new WeekStore(),
    favorites: new FavoriteStore(),
    backend: () => selectBackend(),
    openAuchan: () => openAuchan(),
    loadContext: (connector) => loadWeeklyContext(connector),
    // illustrations automatiques des recettes ; FRESHDRIVE_VISUELS=non pour les désactiver
    illustrate:
      process.env.FRESHDRIVE_VISUELS === "non"
        ? undefined
        : (recipes) => illustrateRecipes(recipes, (batch) => selectBackend().drawVisuals(batch)),
  });
  return globalForApp.__freshdriveApp;
}
