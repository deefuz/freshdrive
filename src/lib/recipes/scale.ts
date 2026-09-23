import type { Recipe } from "./schema";

/** Recette ramenée à `servings` portions : quantités proportionnelles (g et ml arrondis à l'unité, pièces à la demie). */
export function scaleRecipe(recipe: Recipe, servings: number): Recipe {
  if (recipe.servings === servings || recipe.servings <= 0) return recipe;
  const ratio = servings / recipe.servings;
  return {
    ...recipe,
    servings,
    ingredients: recipe.ingredients.map((ing) => {
      const scaled = ing.quantity * ratio;
      const quantity = ing.unit === "pce" ? Math.max(0.5, Math.round(scaled * 2) / 2) : Math.max(1, Math.round(scaled));
      return { ...ing, quantity };
    }),
  };
}
