import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { type Recipe, RecipeSchema } from "../recipes/schema";
import { normalizeText } from "../text";

export const FAVORITES_FILE = "data/favorites.json";

export interface Favorite {
  /** dérivé du titre : une même recette (même titre) n'est enregistrée qu'une fois */
  id: string;
  recipe: Recipe;
  /** semaine d'où vient la recette */
  sourceWeekId: string;
  addedAt: string;
}

const FavoriteSchema = z.object({
  id: z.string(),
  recipe: RecipeSchema,
  sourceWeekId: z.string(),
  addedAt: z.string(),
});

/** « Curry de légumes & riz » → « curry-de-legumes-riz » */
export function favoriteId(title: string): string {
  return (
    normalizeText(title)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "recette"
  );
}

/** Seul module qui lit et écrit data/favorites.json. */
export class FavoriteStore {
  constructor(private readonly file: string = FAVORITES_FILE) {}

  /** Favoris, les plus récents d'abord. Un fichier absent ou illisible donne une liste vide ; une entrée abîmée est ignorée. */
  list(): Favorite[] {
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      return [];
    }
    const entries = (data as { favorites?: unknown } | null)?.favorites;
    if (!Array.isArray(entries)) return [];
    return entries
      .flatMap((entry) => {
        const parsed = FavoriteSchema.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      })
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }

  get(id: string): Favorite | null {
    return this.list().find((f) => f.id === id) ?? null;
  }

  /** Vrai si une recette de ce titre est en favori. */
  has(title: string): boolean {
    return this.get(favoriteId(title)) !== null;
  }

  /** Ajoute la recette (ou remplace celle de même titre par cette version). */
  add(recipe: Recipe, sourceWeekId: string, now: Date = new Date()): Favorite {
    const favorite: Favorite = { id: favoriteId(recipe.title), recipe, sourceWeekId, addedAt: now.toISOString() };
    this.write([favorite, ...this.list().filter((f) => f.id !== favorite.id)]);
    return favorite;
  }

  /** Retire un favori ; faux s'il n'existait pas. */
  remove(id: string): boolean {
    const favorites = this.list();
    const kept = favorites.filter((f) => f.id !== id);
    if (kept.length === favorites.length) return false;
    this.write(kept);
    return true;
  }

  private write(favorites: Favorite[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ favorites }, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
