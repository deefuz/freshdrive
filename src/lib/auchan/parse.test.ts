import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanText, parseCart, parseProductCards, parseProductPage, parseThemes } from "./parse";

const fx = (f: string) => fs.readFileSync(path.join(__dirname, "../../../tests/fixtures/auchan", f), "utf8");

describe("cleanText", () => {
  it("retire les marqueurs Pipe et compresse les espaces", () => {
    expect(cleanText(" a Pipe.start(12)\n  b Pipe.end(12) ")).toBe("a b");
  });
});

describe("parseProductCards", () => {
  const products = parseProductCards(fx("search.html"));

  it("ignore les cartes sans prix", () => {
    expect(products.map((p) => p.productId)).toEqual(["p-bio-cerise", "p-mutti", "p-grappe"]);
  });

  it("extrait une carte complète", () => {
    expect(products[0]).toEqual({
      productId: "p-bio-cerise",
      offerId: "o-bio-cerise",
      sellerId: "seller-1",
      sellerType: "GROCERY",
      name: "Tomates cerises rouges",
      brand: "AUCHAN BIO",
      price: 2.99,
      unitPrice: 11.96,
      unitPriceUnit: "kg",
      pack: { value: 250, unit: "g" },
      isOrganic: true,
      isSeasonal: true,
      promo: { label: "10% Jour W! cagnottés", kind: "loyalty" },
      stock: 12,
      url: "https://www.auchan.fr/tomates-cerises-rouges/pr-C1000001",
    });
  });

  it("classe les promos prix et lit le stock à 0", () => {
    expect(products[1].promo).toEqual({ label: "-60% sur le 2ème", kind: "price" });
    expect(products[1].stock).toBe(0);
    expect(products[1].isOrganic).toBe(false);
  });

  it("gère un produit frais sans marque ni conditionnement", () => {
    expect(products[2]).toMatchObject({
      name: "Tomates rondes en grappe",
      brand: null,
      pack: null,
      unitPrice: 3.29,
      unitPriceUnit: "pce",
      sellerId: null,
      stock: null,
      promo: null,
    });
  });
});

describe("parseProductPage", () => {
  it("lit l'EAN et les ingrédients", () => {
    expect(parseProductPage(fx("product-packaged.html"))).toEqual({
      ean: "8005110170300",
      ingredients: "Tomates 99.8% sel.",
    });
  });
  it("renvoie null pour un produit frais", () => {
    expect(parseProductPage(fx("product-fresh.html"))).toEqual({ ean: null, ingredients: null });
  });
});

describe("parseThemes", () => {
  it("liste les boutiques thématiques hors navigation, dédupliquées", () => {
    expect(parseThemes(fx("home.html"))).toEqual(["saveurs d asie", "foire a la biere"]);
  });
});

describe("parseCart", () => {
  it("convertit le panier et les centimes", () => {
    expect(parseCart(JSON.parse(fx("cart.json")))).toEqual({
      id: "cart-1",
      items: [
        { productId: "p-a", offerId: "o-a", quantity: 1 },
        { productId: "p-b", offerId: "o-b", quantity: 2 },
      ],
      totalPrice: 3.91,
    });
  });
});
