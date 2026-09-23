import { describe, expect, it } from "vitest";
import { makeRecipe } from "../../../tests/helpers/factories";
import { scaleRecipe } from "./scale";

const ing = (name: string, quantity: number, unit: "g" | "ml" | "pce") => ({
  name,
  searchQuery: name,
  quantity,
  unit,
  pantryStaple: false,
  fromPromo: false,
});

describe("scaleRecipe", () => {
  it("met les quantités à l'échelle du nombre de portions", () => {
    const recipe = makeRecipe({
      servings: 4,
      ingredients: [ing("riz", 300, "g"), ing("lait de coco", 250, "ml"), ing("oignon", 1, "pce"), ing("sel", 1, "g")],
    });
    const scaled = scaleRecipe(recipe, 6);
    expect(scaled.servings).toBe(6);
    expect(scaled.ingredients.map((i) => i.quantity)).toEqual([450, 375, 1.5, 2]);
  });

  it("jamais moins d'une demi-pièce ou d'1 g", () => {
    const recipe = makeRecipe({ servings: 6, ingredients: [ing("citron", 0.5, "pce"), ing("sel", 1, "g")] });
    expect(scaleRecipe(recipe, 2).ingredients.map((i) => i.quantity)).toEqual([0.5, 1]);
  });

  it("même nombre de portions : recette inchangée", () => {
    const recipe = makeRecipe({ servings: 4, ingredients: [ing("riz", 300, "g")] });
    expect(scaleRecipe(recipe, 4)).toBe(recipe);
  });
});
