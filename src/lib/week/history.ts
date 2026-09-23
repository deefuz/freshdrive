import type { Week } from "../store/weeks";
import { normalizeText } from "../text";

/** Nombre de semaines passées dont les recettes retenues sont à éviter. */
export const AVOID_WEEKS = 4;

/**
 * Titres des recettes retenues sur les `limit` dernières semaines (par date de création), sans doublons.
 * Les semaines sans recette retenue (préparation échouée, brouillon) ne comptent pas dans la fenêtre.
 */
export function recentSelectedTitles(weeks: Week[], excludeId?: string, limit: number = AVOID_WEEKS): string[] {
  const recent = weeks
    .filter((w) => w.id !== excludeId && w.selectedRecipeIds.length > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, limit);
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const week of recent) {
    for (const recipe of week.recipes) {
      const key = normalizeText(recipe.title);
      if (!week.selectedRecipeIds.includes(recipe.id) || seen.has(key)) continue;
      seen.add(key);
      titles.push(recipe.title);
    }
  }
  return titles;
}
