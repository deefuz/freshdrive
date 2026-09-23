import { describe, expect, it } from "vitest";
import { makeProduct } from "../../tests/helpers/factories";

describe("factories", () => {
  it("crée des produits distincts avec des valeurs par défaut", () => {
    const a = makeProduct();
    const b = makeProduct({ price: 2.5 });
    expect(a.productId).not.toBe(b.productId);
    expect(b.price).toBe(2.5);
  });
});
