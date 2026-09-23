import { z } from "zod";

export const IngredientSchema = z.object({
  name: z.string().describe("nom générique en français, ex. « tomates cerises »"),
  searchQuery: z.string().describe("requête courte (1 à 3 mots) pour le moteur de recherche Auchan, ex. « tomates cerises »"),
  quantity: z.number().describe("quantité totale pour la recette, au nombre de portions indiqué"),
  unit: z.enum(["g", "ml", "pce"]),
  pantryStaple: z.boolean().describe("true pour les basiques de placard : sel, poivre, huile, vinaigre, épices, farine, sucre"),
  fromPromo: z.boolean().describe("true si l'ingrédient vient de la liste des promos fournie"),
});

export const RecipeSchema = z.object({
  id: z.string().describe("identifiant court en kebab-case, unique dans le menu"),
  title: z.string(),
  summary: z.string(),
  servings: z.number().int(),
  prepMinutes: z.number().int(),
  cookMinutes: z.number().int(),
  tags: z.array(z.enum(["kids_friendly", "low_calorie", "vegan", "vegetarian", "unprocessed", "quick"])),
  ingredients: z.array(IngredientSchema),
  steps: z.array(z.string()),
  nutritionPerServing: z.object({ kcal: z.number(), proteinG: z.number(), carbsG: z.number(), fatG: z.number() }),
  whyThisWeek: z.string().describe("pourquoi cette recette cette semaine (promo, saison, événement)"),
});

export const MenuSchema = z.object({ recipes: z.array(RecipeSchema) });

export type Ingredient = z.infer<typeof IngredientSchema>;
export type Recipe = z.infer<typeof RecipeSchema>;
