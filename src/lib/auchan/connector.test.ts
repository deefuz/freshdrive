import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AuchanConnector, FOOD_PROMO_AISLES } from "./connector";
import type { HttpClient } from "./http";

const fx = (f: string) => fs.readFileSync(path.join(__dirname, "../../../tests/fixtures/auchan", f), "utf8");

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    getText: vi.fn(async (p: string) => (p === "/" ? fx("home.html") : fx("search.html"))),
    getJson: vi.fn(async () => JSON.parse(fx("cart.json"))) as HttpClient["getJson"],
    postJson: vi.fn(async () => JSON.parse(fx("cart.json"))) as HttpClient["postJson"],
    ...overrides,
  };
}

describe("AuchanConnector", () => {
  it("cherche des produits et met le résultat en cache", async () => {
    const http = fakeHttp();
    const c = new AuchanConnector(http, { consentId: "c" });
    const a = await c.searchProducts("Tomates ");
    await c.searchProducts("tomates");
    expect(a).toHaveLength(3);
    expect(http.getText).toHaveBeenCalledTimes(1);
    expect(http.getText).toHaveBeenCalledWith("/recherche?text=Tomates");
  });

  it("construit le contexte magasin sans doublons", async () => {
    const http = fakeHttp();
    const ctx = await new AuchanConnector(http, { consentId: "c" }).getStoreContext();
    expect(http.getText).toHaveBeenCalledWith(`/boutique/promos/${FOOD_PROMO_AISLES[0]}`);
    expect(http.getText).toHaveBeenCalledWith("/boutique/anti-gaspi");
    expect(ctx.promos).toHaveLength(3);
    expect(ctx.antiGaspi).toHaveLength(3);
    expect(ctx.themes).toEqual(["saveurs d asie", "foire a la biere"]);
  });

  it("envoie une mise à jour panier au format Auchan et détecte les révisions", async () => {
    const http = fakeHttp();
    const c = new AuchanConnector(http, { consentId: "consent-1" });
    const res = await c.setCartQuantities([
      { productId: "p-b", offerId: "o-b", sellerId: "s1", sellerType: "GROCERY", quantity: 3 },
    ]);
    expect(http.postJson).toHaveBeenCalledWith("/cart/update", {
      cartId: "cart-1",
      items: [
        { productId: "p-b", offerId: "o-b", sellerType: "GROCERY", desiredQuantity: 3, desiredType: "DEFAULT", sellerId: "s1" },
      ],
      consentId: "consent-1",
      reservationId: null,
      mbaAvailabilityNeeded: true,
    });
    // la réponse (fixture) contient p-b en quantité 2 : Auchan a révisé
    expect(res.revised).toEqual([{ productId: "p-b", requested: 3, actual: 2 }]);
  });

  it("getProductDetails passe l'URL en chemin relatif", async () => {
    const http = fakeHttp({ getText: vi.fn(async () => fx("product-packaged.html")) });
    const d = await new AuchanConnector(http, { consentId: null }).getProductDetails(
      "https://www.auchan.fr/mutti/pr-C1236828",
    );
    expect(http.getText).toHaveBeenCalledWith("/mutti/pr-C1236828");
    expect(d.ean).toBe("8005110170300");
  });
});
