import { describe, expect, it, vi } from "vitest";
import { makeProduct } from "../../../tests/helpers/factories";
import { FakeConnector } from "../../../tests/helpers/fake-connector";
import { SessionExpiredError } from "../auchan/http";
import type { BasketLine } from "../budget/basket";
import type { Product } from "../types";
import { round2 } from "../units";
import { PUSH_SESSION_EXPIRED_LINE, previewPush, productLabels, pushLines, stoppedBySessionExpiry } from "./push";

const line = (key: string, name: string, product: Product, packs: number): BasketLine => ({
  key,
  name,
  product,
  quantityNeeded: 100,
  unit: "g",
  packs,
  cost: round2(packs * product.price),
  uncertainQuantity: false,
});

describe("previewPush", () => {
  it("regroupe par produit et ajoute la quantité déjà présente dans le panier", () => {
    const tomates = makeProduct({ name: "Tomates", brand: "AUCHAN", price: 2 });
    const lines = [line("tomates|g", "tomates", tomates, 1), line("tomates cerises|g", "tomates cerises", tomates, 2)];
    const cart = { id: "c", items: [{ productId: tomates.productId, offerId: tomates.offerId, quantity: 1 }], totalPrice: 2 };
    const p = previewPush(cart, lines);
    expect(p.rows).toEqual([
      {
        productId: tomates.productId,
        productName: "AUCHAN Tomates",
        ingredients: ["tomates", "tomates cerises"],
        url: tomates.url,
        packs: 3,
        inCart: 1,
        finalQuantity: 4,
        cost: 6,
      },
    ]);
    expect(p.cartLines).toEqual([expect.objectContaining({ productId: tomates.productId, quantity: 4 })]);
    expect(p.addedCost).toBe(6);
    expect(productLabels(lines).get(tomates.productId)).toEqual({ name: "AUCHAN Tomates", url: tomates.url });
  });
});

describe("pushLines", () => {
  it("classe chaque ligne : ajoutée, ajustée par Auchan ou en échec", async () => {
    const connector = new FakeConnector({});
    const [a, b, c] = ["a", "b", "c"].map((id) => ({
      productId: id,
      offerId: `o-${id}`,
      sellerId: "s",
      sellerType: "GROCERY",
      quantity: 2,
    }));
    vi.spyOn(connector, "setCartQuantities").mockImplementation(async ([l]) => {
      if (l.productId === "b") return { cart: connector.cart, revised: [{ productId: "b", requested: 2, actual: 1 }] };
      if (l.productId === "c") throw new Error("Auchan a répondu 500 pour /cart/update");
      return { cart: connector.cart, revised: [] };
    });
    const labels = new Map([
      ["a", { name: "Tomates", url: "u-a" }],
      ["b", { name: "Riz", url: "u-b" }],
      ["c", { name: "Sel", url: "u-c" }],
    ]);
    const progress: number[] = [];
    const report = await pushLines(connector, [a, b, c], labels, {
      onProgress: (done) => progress.push(done),
      now: new Date("2026-09-23T18:00:00.000Z"),
    });
    expect(report).toEqual({
      pushedAt: "2026-09-23T18:00:00.000Z",
      added: [{ productId: "a", name: "Tomates", url: "u-a", requested: 2, actual: 2, error: null }],
      adjusted: [{ productId: "b", name: "Riz", url: "u-b", requested: 2, actual: 1, error: null }],
      failed: [{ productId: "c", name: "Sel", url: "u-c", requested: 2, actual: null, error: "Auchan a répondu 500 pour /cart/update" }],
      cartTotal: 0,
    });
    expect(progress).toEqual([1, 2, 3]);
  });
});

describe("pushLines : session Auchan expirée", () => {
  it("s'arrête à la première SessionExpiredError : lignes restantes en échec, sans autre appel", async () => {
    const connector = new FakeConnector({});
    const lines = ["a", "b", "c"].map((id) => ({
      productId: id,
      offerId: `o-${id}`,
      sellerId: "s",
      sellerType: "GROCERY",
      quantity: 1,
    }));
    const set = vi.spyOn(connector, "setCartQuantities").mockImplementation(async ([l]) => {
      if (l.productId === "b") throw new SessionExpiredError();
      return { cart: connector.cart, revised: [] };
    });
    const getCart = vi.spyOn(connector, "getCart");
    const progress: number[] = [];
    const report = await pushLines(connector, lines, new Map(), { onProgress: (done) => progress.push(done) });
    expect(set).toHaveBeenCalledTimes(2);
    expect(getCart).not.toHaveBeenCalled();
    expect(report.added.map((l) => l.productId)).toEqual(["a"]);
    expect(report.failed).toEqual([
      { productId: "b", name: "b", url: "", requested: 1, actual: null, error: PUSH_SESSION_EXPIRED_LINE },
      { productId: "c", name: "c", url: "", requested: 1, actual: null, error: PUSH_SESSION_EXPIRED_LINE },
    ]);
    expect(report.cartTotal).toBeNull();
    expect(progress).toEqual([1, 3]);
    expect(stoppedBySessionExpiry(report)).toBe(true);
  });

  it("stoppedBySessionExpiry : faux pour des échecs ordinaires", async () => {
    const connector = new FakeConnector({});
    vi.spyOn(connector, "setCartQuantities").mockRejectedValue(new Error("Auchan a répondu 500 pour /cart/update"));
    const report = await pushLines(
      connector,
      [{ productId: "a", offerId: "o", sellerId: "s", sellerType: "GROCERY", quantity: 1 }],
      new Map(),
    );
    expect(stoppedBySessionExpiry(report)).toBe(false);
  });
});
