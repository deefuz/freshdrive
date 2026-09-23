import type { IngredientMatch } from "@/lib/matching/match";
import type { IngredientNeed } from "@/lib/matching/needs";
import type { MatchCandidate } from "@/lib/matching/score";
import type { Recipe } from "@/lib/recipes/schema";
import type { Week } from "@/lib/store/weeks";
import type { Product } from "@/lib/types";
import { round2 } from "@/lib/units";

let seq = 0;

export function makeProduct(overrides: Partial<Product> = {}): Product {
  seq += 1;
  return {
    productId: `p-${seq}`,
    offerId: `o-${seq}`,
    sellerId: "seller-1",
    sellerType: "GROCERY",
    name: `Produit ${seq}`,
    brand: null,
    price: 1,
    unitPrice: null,
    unitPriceUnit: null,
    pack: null,
    isOrganic: false,
    isSeasonal: false,
    promo: null,
    stock: 10,
    url: `https://www.auchan.fr/produit-${seq}/pr-C${seq}`,
    ...overrides,
  };
}

export function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  seq += 1;
  return {
    id: `r-${seq}`,
    title: `Recette ${seq}`,
    summary: "",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    tags: [],
    ingredients: [],
    steps: ["Cuire."],
    nutritionPerServing: { kcal: 500, proteinG: 20, carbsG: 50, fatG: 15 },
    whyThisWeek: "",
    ...overrides,
  };
}

export function makeCandidate(product: Product, packs = 1): MatchCandidate {
  const cost = round2(product.price * packs);
  return { product, packs, cost, score: cost, uncertainQuantity: false };
}

export function makeNeed(overrides: Partial<IngredientNeed> & { key: string }): IngredientNeed {
  const [query, unit] = overrides.key.split("|");
  return {
    name: query,
    searchQuery: query,
    unit: (unit ?? "g") as IngredientNeed["unit"],
    quantity: 100,
    perRecipe: {},
    pantryStaple: false,
    ...overrides,
  };
}

export function makeMatch(need: IngredientNeed, chosen: Product | null, alternatives: Product[] = []): IngredientMatch {
  return {
    need,
    chosen: chosen ? makeCandidate(chosen) : null,
    alternatives: alternatives.map((p) => makeCandidate(p)),
  };
}

export function makeWeek(overrides: Partial<Week> = {}): Week {
  return {
    id: "2026-09-23-1",
    createdAt: "2026-09-23T10:00:00.000Z",
    brief: { dinners: 2, adults: 2, children: 0, budgetEur: 30, filters: [], notes: "", preferOrganic: false },
    contextSummary: null,
    recipes: [],
    selectedRecipeIds: [],
    matches: [],
    overrides: { products: {}, pantry: [] },
    status: "ready",
    job: null,
    pushReport: null,
    ...overrides,
  };
}
