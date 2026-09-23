import type { Product } from "@/lib/types";
import type { Recipe } from "@/lib/recipes/schema";

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
