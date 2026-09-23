import { describe, expect, it } from "vitest";
import { makeProduct, makeRecipe } from "../../../tests/helpers/factories";
import type { WeeklyContext } from "../context/build";
import type { Brief } from "./brief";
import { buildRequestDocument, parseRecipesFile } from "./handoff";

const brief: Brief = {
  dinners: 4,
  adults: 2,
  children: 2,
  budgetEur: 60,
  filters: ["kids_friendly"],
  notes: "",
  preferOrganic: true,
};

const ctx: WeeklyContext = {
  generatedAt: "2026-10-20T08:00:00.000Z",
  season: "automne",
  seasonalProduce: ["potiron"],
  events: [],
  promos: [makeProduct({ name: "Potimarron", promo: { label: "-30%", kind: "price" } })],
  antiGaspi: [],
  themes: [],
};

describe("buildRequestDocument", () => {
  it("contient les consignes, le prompt, le schéma JSON et le fichier de sortie", () => {
    const doc = buildRequestDocument(brief, ctx, "data/recipes/2026-10-20.json");
    expect(doc).toContain("Tu es le chef");
    expect(doc).toContain("Potimarron");
    expect(doc).toContain("6 recettes");
    expect(doc).toContain('"recipes"');
    expect(doc).toContain('"pantryStaple"');
    expect(doc).toContain("data/recipes/2026-10-20.json");
  });
});

describe("parseRecipesFile", () => {
  const recipes = [makeRecipe({ id: "a" }), makeRecipe({ id: "b" })];

  it("accepte { recipes: [...] }", () => {
    expect(parseRecipesFile(JSON.stringify({ recipes }))).toEqual(recipes);
  });

  it("accepte un tableau nu", () => {
    expect(parseRecipesFile(JSON.stringify(recipes))).toEqual(recipes);
  });

  it("refuse un JSON invalide avec un message clair", () => {
    expect(() => parseRecipesFile("{oups")).toThrow(/JSON invalide/);
  });

  it("refuse un menu qui ne respecte pas le schéma, en citant le champ", () => {
    const bad = { recipes: [{ ...recipes[0], ingredients: [{ name: "x" }] }] };
    expect(() => parseRecipesFile(JSON.stringify(bad))).toThrow(/ingredients/);
  });

  it("refuse des identifiants de recette en double", () => {
    expect(() => parseRecipesFile(JSON.stringify([recipes[0], recipes[0]]))).toThrow(/en double/);
  });
});
