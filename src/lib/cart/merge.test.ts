import { describe, expect, it } from "vitest";
import { mergeWithCart } from "./merge";

describe("mergeWithCart", () => {
  it("additionne la quantité déjà présente et fusionne les doublons", () => {
    const cart = { id: "c", totalPrice: 0, items: [{ productId: "p1", offerId: "o1", quantity: 2 }] };
    const line = (productId: string, quantity: number) => ({
      productId,
      offerId: `o${productId.slice(1)}`,
      sellerId: "s",
      sellerType: "GROCERY",
      quantity,
    });
    expect(mergeWithCart(cart, [line("p1", 1), line("p2", 1), line("p2", 2)])).toEqual([line("p1", 3), line("p2", 3)]);
  });
});
