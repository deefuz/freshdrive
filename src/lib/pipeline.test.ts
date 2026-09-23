import { describe, expect, it } from "vitest";
import { makeProduct, makeRecipe } from "../../tests/helpers/factories";
import { FakeConnector } from "../../tests/helpers/fake-connector";
import { basketToCartLines, chooseSelection, computeBasket } from "./budget/basket";
import { mergeWithCart } from "./cart/merge";
import { matchNeeds } from "./matching/match";
import { aggregateNeeds } from "./matching/needs";

const ing = (q: string, quantity: number, pantryStaple = false) => ({
  name: q,
  searchQuery: q,
  quantity,
  unit: "g" as const,
  pantryStaple,
  fromPromo: false,
});

describe("pipeline recettes → panier", () => {
  it("produit des lignes panier cumulées avec le panier existant", async () => {
    const tomates = makeProduct({ name: "Tomates", price: 2, pack: { value: 500, unit: "g" } });
    const pates = makeProduct({ name: "Pâtes", price: 1, pack: { value: 500, unit: "g" } });
    const truffe = makeProduct({ name: "Truffe", price: 40, pack: { value: 20, unit: "g" } });
    const sel = makeProduct({ name: "Sel", price: 0.5, pack: { value: 1000, unit: "g" } });
    const connector = new FakeConnector({ tomates: [tomates], pates: [pates], truffe: [truffe], sel: [sel] });
    connector.cart.items = [{ productId: tomates.productId, offerId: tomates.offerId, quantity: 1 }];

    const recipes = [
      makeRecipe({ id: "a", ingredients: [ing("tomates", 400), ing("pates", 500), ing("sel", 5, true)] }),
      makeRecipe({ id: "b", ingredients: [ing("tomates", 300)] }),
      makeRecipe({ id: "luxe", ingredients: [ing("truffe", 20)] }),
    ];
    const needs = aggregateNeeds(recipes);
    const matches = await matchNeeds(needs, { preferOrganic: false, unprocessed: false }, { connector });
    const exclude = new Set(needs.filter((n) => n.pantryStaple).map((n) => n.key));
    const selected = chooseSelection(recipes.map((r) => r.id), matches, 2, exclude);
    expect(selected).toEqual(["a", "b"]);

    const basket = computeBasket(matches, selected, exclude);
    expect(basket.total).toBe(5); // 2 × tomates (700 g) + 1 × pâtes
    const lines = mergeWithCart(await connector.getCart(), basketToCartLines(basket.lines));
    expect(lines.find((l) => l.productId === tomates.productId)?.quantity).toBe(3);
  });
});
