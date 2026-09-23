import { describe, expect, it } from "vitest";
import { makeMatch, makeNeed, makeProduct, makeRecipe, makeWeek } from "../../../tests/helpers/factories";
import {
  buildPrintData,
  isPrintable,
  kidStepIndexes,
  parsePrintOptions,
  printQuery,
  searchParamsRecord,
} from "./sheet";

const ing = (name: string, quantity: number, pantryStaple = false) => ({
  name,
  searchQuery: name,
  quantity,
  unit: "g" as const,
  pantryStaple,
  fromPromo: false,
});

describe("parsePrintOptions", () => {
  it("première visite : toutes les sections, sans nom ni notes", () => {
    expect(parsePrintOptions({})).toEqual({ family: "", sections: ["recettes", "courses"], notes: "" });
  });

  it("formulaire envoyé : sections cochées seulement (inconnues ignorées), textes nettoyés et bornés", () => {
    expect(
      parsePrintOptions({ o: "1", sections: ["courses", "pirate"], famille: ["  Martin ", "Autre"], notes: " Bon appétit " }),
    ).toEqual({ family: "Martin", sections: ["courses"], notes: "Bon appétit" });
    const long = parsePrintOptions({ famille: "x".repeat(200), notes: "y".repeat(5000) });
    expect(long.family).toHaveLength(60);
    expect(long.notes).toHaveLength(1000);
  });

  it("formulaire envoyé sans aucune case cochée : aucune section", () => {
    expect(parsePrintOptions({ o: "1" }).sections).toEqual([]);
  });

  it("aller-retour avec printQuery et searchParamsRecord", () => {
    const options = { family: "Martin & fils", sections: ["recettes" as const], notes: "Pas de sel" };
    const query = printQuery(options);
    expect(query).toBe("famille=Martin+%26+fils&sections=recettes&notes=Pas+de+sel&o=1");
    expect(parsePrintOptions(searchParamsRecord(new URLSearchParams(query)))).toEqual(options);
    expect(searchParamsRecord(new URLSearchParams("sections=recettes&sections=courses&o=1"))).toEqual({
      sections: ["recettes", "courses"],
      o: "1",
    });
  });
});

describe("kidStepIndexes", () => {
  it("ignore les indices hors limites, négatifs ou non entiers", () => {
    expect(kidStepIndexes({ steps: ["a", "b", "c"], kidSteps: [1, 3, -1, 1.5, 2, 1] })).toEqual(new Set([1, 2]));
    expect(kidStepIndexes({ steps: ["a"] })).toEqual(new Set());
  });
});

describe("isPrintable", () => {
  it("semaine prête ou envoyée avec au moins une recette retenue", () => {
    expect(isPrintable({ status: "ready", selectedRecipeIds: ["a"] })).toBe(true);
    expect(isPrintable({ status: "pushed", selectedRecipeIds: ["a"] })).toBe(true);
    expect(isPrintable({ status: "ready", selectedRecipeIds: [] })).toBe(false);
    expect(isPrintable({ status: "generating", selectedRecipeIds: ["a"] })).toBe(false);
  });
});

describe("buildPrintData", () => {
  const courgette = makeProduct({ brand: "AUCHAN BIO", name: "Courgettes", price: 2, pack: { value: 500, unit: "g" } });
  const courgetteBis = makeProduct({
    name: "Courgettes vrac",
    price: 1.5,
    pack: { value: 1000, unit: "g" },
    promo: { label: "-20%", kind: "price" },
  });
  const huile = makeProduct({ name: "Huile d'olive", price: 6, pack: { value: 500, unit: "ml" } });
  const recipe = makeRecipe({
    id: "tian",
    title: "Tian de courgettes",
    summary: "Fondant",
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 40,
    tags: ["kids_friendly", "vegan"],
    ingredients: [ing("courgette", 600), ing("huile", 20, true), ing("safran", 1)],
    steps: ["Laver les courgettes.", "Couper.", "Enfourner."],
    kidSteps: [0, 7],
    nutritionPerServing: { kcal: 321.6, proteinG: 8.2, carbsG: 30.5, fatG: 12.4 },
    whyThisWeek: "Courgettes en promo",
  });
  const other = makeRecipe({ id: "autre", title: "Non retenue", ingredients: [ing("courgette", 300)] });
  const week = makeWeek({
    id: "2026-09-23-1",
    status: "ready",
    brief: { dinners: 1, adults: 2, children: 2, budgetEur: 30, filters: [], notes: "", preferOrganic: false },
    recipes: [recipe, other],
    selectedRecipeIds: ["tian"],
    matches: [
      makeMatch(makeNeed({ key: "courgette|g", name: "courgette", quantity: 900, perRecipe: { tian: 600, autre: 300 } }), courgette, [
        courgetteBis,
      ]),
      makeMatch(makeNeed({ key: "huile|g", name: "huile", quantity: 20, perRecipe: { tian: 20 }, pantryStaple: true }), huile),
      makeMatch(makeNeed({ key: "safran|g", name: "safran", quantity: 1, perRecipe: { tian: 1 } }), null),
    ],
    overrides: { products: { "courgette|g": courgetteBis.productId }, pantry: ["huile|g"] },
  });

  it("fiches des seules recettes retenues : produits choisis (choix de l'utilisateur compris), placard, étapes enfants", () => {
    const data = buildPrintData(week, { family: "Martin", sections: ["recettes", "courses"], notes: "Bon appétit" });
    expect(data).toMatchObject({
      weekId: "2026-09-23-1",
      heading: "Semaine du 23 septembre 2026",
      family: "Martin",
      notes: "Bon appétit",
      showRecipes: true,
      showShopping: true,
    });
    expect(data.recipes).toEqual([
      {
        id: "tian",
        title: "Tian de courgettes",
        summary: "Fondant",
        prepMinutes: 15,
        cookMinutes: 40,
        servings: 4,
        tags: ["Enfants", "Vegan"],
        ingredients: [
          { name: "courgette", quantity: "600 g", product: "Courgettes vrac · 1000 g", inPantry: false },
          { name: "huile", quantity: "20 g", product: null, inPantry: true },
          { name: "safran", quantity: "1 g", product: null, inPantry: false },
        ],
        steps: [
          { text: "Laver les courgettes.", kid: true },
          { text: "Couper.", kid: false },
          { text: "Enfourner.", kid: false },
        ],
        nutrition: "≈ 322 kcal · protéines 8 g · glucides 31 g · lipides 12 g",
        whyThisWeek: "Courgettes en promo",
      },
    ]);
  });

  it("liste de courses : lignes du panier, placard à part, introuvables et totaux", () => {
    const { shopping } = buildPrintData(week, { family: "", sections: ["courses"], notes: "" });
    expect(shopping).toEqual({
      lines: [
        {
          key: "courgette|g",
          ingredient: "courgette (600 g)",
          product: "Courgettes vrac · 1000 g",
          packs: 1,
          cost: 1.5,
          promo: "-20%",
          uncertain: false,
        },
      ],
      pantry: [{ name: "huile", quantity: "20 g" }],
      missing: ["safran"],
      gross: 1.5,
      promoSaved: 0,
      net: 1.5,
      budget: 30,
    });
  });

  it("sections choisies", () => {
    expect(buildPrintData(week, { family: "", sections: ["courses"], notes: "" })).toMatchObject({
      showRecipes: false,
      showShopping: true,
    });
  });
});
