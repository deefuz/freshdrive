import { describe, expect, it } from "vitest";
import { makeProduct } from "../../../tests/helpers/factories";
import type { IngredientMatch } from "../matching/match";
import { scoreCandidate } from "../matching/score";
import type { Cart } from "../types";
import { basketToCartLines, chooseSelection, computeBasket, mergeBasketIntoCart } from "./basket";

const opts = { preferOrganic: false, unprocessed: false };

function match(key: string, perRecipe: Record<string, number>, price: number | null, packG = 250): IngredientMatch {
  const quantity = Object.values(perRecipe).reduce((a, b) => a + b, 0);
  const need = { key, name: key, searchQuery: key, unit: "g" as const, quantity, perRecipe, pantryStaple: false };
  const product = makeProduct({ name: key, price: price ?? 0, pack: { value: packG, unit: "g" } });
  return { need, chosen: price === null ? null : scoreCandidate(need, product, opts), alternatives: [] };
}

describe("computeBasket", () => {
  const matches = [
    match("tomates", { a: 200, b: 200 }, 2), // 250 g à 2 €
    match("pates", { b: 500, c: 500 }, 1, 500),
    match("truffe", { c: 10 }, null),
  ];

  it("recalcule les paquets pour les seules recettes retenues", () => {
    const basket = computeBasket(matches, ["a", "b"]);
    expect(basket.lines.map((l) => [l.key, l.quantityNeeded, l.packs, l.cost])).toEqual([
      ["tomates", 400, 2, 4],
      ["pates", 500, 1, 1],
    ]);
    expect(basket.total).toBe(5);
    expect(basket.missing).toEqual([]);
  });

  it("signale les ingrédients sans produit et respecte les exclusions", () => {
    const basket = computeBasket(matches, ["c"], new Set(["pates"]));
    expect(basket.lines).toEqual([]);
    expect(basket.missing).toEqual(["truffe"]);
  });
});

describe("chooseSelection", () => {
  it("garde les N recettes les moins chères, dans l'ordre d'origine", () => {
    const matches = [match("x", { a: 250 }, 9), match("y", { b: 250 }, 1), match("z", { c: 250 }, 3)];
    expect(chooseSelection(["a", "b", "c"], matches, 2)).toEqual(["b", "c"]);
  });
});

describe("basketToCartLines", () => {
  it("convertit en lignes panier", () => {
    const [line] = computeBasket([match("tomates", { a: 400 }, 2)], ["a"]).lines;
    expect(basketToCartLines([line])).toEqual([
      { productId: line.product.productId, offerId: line.product.offerId, sellerId: "seller-1", sellerType: "GROCERY", quantity: 2 },
    ]);
  });
});

describe("mergeBasketIntoCart", () => {
  it("fusionne en une seule ligne quand deux lignes du panier ciblent le même produit (compte réel avant confirmation)", () => {
    const [line] = computeBasket([match("tomates", { a: 400 }, 2)], ["a"]).lines;
    const cart: Cart = {
      id: "cart-1",
      items: [{ productId: line.product.productId, offerId: line.product.offerId, quantity: 1 }],
      totalPrice: 0,
    };
    const merged = mergeBasketIntoCart(cart, [line, line]);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(line.packs * 2 + 1);
  });
});
