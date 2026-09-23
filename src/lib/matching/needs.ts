import type { Ingredient, Recipe } from "../recipes/schema";
import { normalizeText } from "../text";
import type { QtyUnit } from "../types";

export interface IngredientNeed {
  key: string;
  name: string;
  searchQuery: string;
  unit: QtyUnit;
  quantity: number;
  perRecipe: Record<string, number>;
  pantryStaple: boolean;
}

/** Clé d'un ingrédient : même requête (casse et accents ignorés) et même unité = même besoin. */
export function needKey(ing: Pick<Ingredient, "searchQuery" | "unit">): string {
  return `${normalizeText(ing.searchQuery)}|${ing.unit}`;
}

export function aggregateNeeds(recipes: Recipe[]): IngredientNeed[] {
  const byKey = new Map<string, IngredientNeed>();
  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      const key = needKey(ing);
      const need =
        byKey.get(key) ??
        byKey
          .set(key, {
            key,
            name: ing.name,
            searchQuery: ing.searchQuery,
            unit: ing.unit,
            quantity: 0,
            perRecipe: {},
            pantryStaple: true,
          })
          .get(key)!;
      need.quantity += ing.quantity;
      need.perRecipe[recipe.id] = (need.perRecipe[recipe.id] ?? 0) + ing.quantity;
      need.pantryStaple = need.pantryStaple && ing.pantryStaple;
    }
  }
  return [...byKey.values()];
}
