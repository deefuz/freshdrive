import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  descriptionFrom,
  type CartEvent,
  type LeclercStore,
  parseCartPage,
  parseCartUpdate,
  parseProductPage,
  parsePromotionsPage,
  parseSearchPage,
  parseThemes,
} from "./parse";

const fixture = (name: string) => fs.readFileSync(`tests/fixtures/leclerc/${name}`, "utf8");
const store: LeclercStore = {
  noPL: "274401",
  origin: "https://fd16-courses.leclercdrive.fr",
  storePath: "/magasin-274401-Orvault-Grand-Val",
};

describe("parseSearchPage", () => {
  const products = parseSearchPage(fixture("search.html"), store);
  const byId = (id: string) => products.find((p) => p.productId === id)!;

  it("lit tous les produits de la recherche", () => {
    expect(products.map((p) => p.productId)).toEqual(["2613", "314653", "105399", "189069", "12"]);
  });

  it("produit standard : nom décodé, prix, prix au litre, contenance, stock, magasin", () => {
    expect(byId("2613")).toEqual({
      productId: "2613",
      offerId: "2613",
      sellerId: "274401",
      sellerType: "DRIVE",
      name: "Lait demi-écrémé UHT Délisse",
      brand: null,
      price: 6.3,
      unitPrice: 1.05,
      unitPriceUnit: "l",
      pack: { value: 6000, unit: "ml" },
      isOrganic: false,
      isSeasonal: false,
      promo: null,
      stock: 28,
      url: "https://fd16-courses.leclercdrive.fr/magasin-274401-Orvault-Grand-Val/fiche-produits-2613-Lait-demi-ecreme-UHT-Delisse.aspx",
    });
  });

  it("avantage immédiat : prix payé, prix unitaire ajusté, promo de prix, description dans le nom", () => {
    expect(byId("314653")).toMatchObject({
      name: "Lait sans lactose 1% Stérilisé Candia+",
      brand: null,
      price: 6.61,
      unitPrice: 1.1,
      promo: { label: "Avantage immédiat de 34%", kind: "price" },
    });
  });

  it("produit indisponible : stock 0", () => {
    expect(byId("105399").stock).toBe(0);
  });

  it("vrac au kilo et petites contenances en kg", () => {
    expect(byId("189069")).toMatchObject({ pack: { value: 2000, unit: "g" }, unitPrice: 1.25, unitPriceUnit: "kg" });
    expect(byId("12").pack).toEqual({ value: 265, unit: "g" });
  });

  it("page sans widget produit : aucun produit", () => {
    expect(parseSearchPage("<html></html>", store)).toEqual([]);
  });
});

describe("descriptionFrom", () => {
  it.each([
    ["Candia+ - 6x1L", "Candia+"],
    ["Elle & Vire – 225 g", "Elle & Vire"],
    ["Notre Jardin -Extra fins - 530g", "Notre Jardin Extra fins"],
    ["UHT Bouteille - 3L", "UHT Bouteille"],
    ["Bouteille - 6x1L", null],
    ["Sachet de 2kg", null],
    ["8 tranches 150g", null],
  ])("%s → %s", (line2, description) => expect(descriptionFrom(line2)).toBe(description));
});

describe("parseProductPage", () => {
  it("EAN et composition du produit de la fiche", () => {
    expect(parseProductPage(fixture("product.html"))).toEqual({
      ean: "3564700005644",
      ingredients: "PAYS DE FABRICATION : France \nLAIT ORIGINE : FRANCE",
    });
  });

  it("fiche illisible : rien", () => {
    expect(parseProductPage("<html></html>")).toEqual({ ean: null, ingredients: null });
  });
});

describe("parsePromotionsPage", () => {
  const { promos, antiGaspi } = parsePromotionsPage(fixture("promotions.html"), store);

  it("garde les promos des rayons alimentaires seulement", () => {
    expect(promos.map((p) => p.name)).toEqual([
      "Fromage cremeux Coeur de Lion",
      "L'Extra Tendre Demi-Sel Elle & Vire",
      "Creme dessert Viennois Caramel",
      "Mozzarella Maxi Les Croisés",
    ]);
    expect(antiGaspi).toEqual([]);
  });

  it("distingue promo immédiate et Ticket E.Leclerc, prix payé déduit de l'avantage immédiat", () => {
    const [fromage, beurre, , mozzarella] = promos;
    expect(fromage).toMatchObject({ price: 1.7, promo: { label: "Avantage immédiat de 34%", kind: "price" } });
    expect(beurre).toMatchObject({ price: 2.53, promo: { kind: "price" } });
    expect(mozzarella.promo).toEqual({
      label: "Recevez 20% en Ticket E.Leclerc. Offre réservée aux porteurs de la Carte E.Leclerc.",
      kind: "loyalty",
    });
    expect(mozzarella).toMatchObject({ sellerId: "274401", pack: { value: 250, unit: "g" } });
  });
});

describe("parseThemes", () => {
  it("noms des opérations de l'accueil, sans la page promotions générale", () => {
    expect(parseThemes(fixture("home.html"))).toEqual([
      "Dejeuner Bio Village Bebe",
      "Le Grand Jeu",
      "Eco",
      "Produits partenaires Brabantia",
      "Vignettage Brabantia",
      "Chocolats",
      "ANIMALERIE",
    ]);
  });
});

describe("panier", () => {
  it("parseCartPage : produits de l'arbre du détail panier", () => {
    expect(parseCartPage(fixture("cart.html"), store)).toEqual({
      id: "274401",
      items: [{ productId: "2613", offerId: "2613", quantity: 1 }],
      totalPrice: 6.3,
    });
  });

  it("parseCartPage : panier vide", () => {
    expect(parseCartPage("<html></html>", store)).toEqual({ id: "274401", items: [], totalPrice: 0 });
  });

  it("parseCartUpdate : panier de la réponse à panier.aspx?op=1", () => {
    const events = JSON.parse(fixture("cart-update.json")) as CartEvent[];
    expect(parseCartUpdate(events, store)).toEqual({
      id: "274401",
      items: [{ productId: "2613", offerId: "2613", quantity: 1 }],
      totalPrice: 6.3,
    });
  });

  it("parseCartUpdate : réponse sans panier", () => {
    expect(() => parseCartUpdate([{ eTypeEvenement: 103 }], store)).toThrow(/inattendue/);
  });
});
