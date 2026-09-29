import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { LeclercConnector } from "./connector";
import type { LeclercHttpClient } from "./http";
import type { CartEvent, LeclercStore } from "./parse";

const fixture = (name: string) => fs.readFileSync(`tests/fixtures/leclerc/${name}`, "utf8");
const store: LeclercStore = {
  noPL: "274401",
  origin: "https://fd16-courses.leclercdrive.fr",
  storePath: "/magasin-274401-Orvault-Grand-Val",
};
const BASE = "https://fd16-courses.leclercdrive.fr/magasin-274401-Orvault-Grand-Val";

/** Faux client : pages servies depuis les fixtures, panier tenu en mémoire. */
class FakeHttp implements LeclercHttpClient {
  readonly gets: string[] = [];
  readonly posts: { url: string; d: Record<string, unknown> }[] = [];
  cart = new Map<string, number>();
  /** plafond de quantité du Drive (stock) */
  maxQty = Infinity;

  async getText(url: string): Promise<string> {
    this.gets.push(url);
    if (url.startsWith(`${BASE}/recherche.aspx`)) return fixture("search.html");
    if (url === `${BASE}/promotions.aspx`) return fixture("promotions.html");
    if (url === `${BASE}/home.aspx`) return fixture("home.html");
    if (url === `${BASE}/detail-panier.aspx`) return this.cart.size ? fixture("cart.html") : "<html></html>";
    if (url.includes("/fiche-produits-")) return fixture("product.html");
    throw new Error(`URL inattendue : ${url}`);
  }

  async getRedirect(): Promise<string | null> {
    return null;
  }

  async postForm<T>(url: string, fields: Record<string, string>): Promise<T> {
    const d = JSON.parse(fields.d) as { iIdProduit: string; iQuantite: number };
    this.posts.push({ url, d });
    const qty = Math.min(d.iQuantite, this.maxQty);
    if (qty > 0) this.cart.set(d.iIdProduit, qty);
    else this.cart.delete(d.iIdProduit);
    const events: CartEvent[] = [
      {
        eTypeEvenement: 1,
        objElement: {
          sType: "Panier",
          sTotalAPayer: "12,60 €",
          lstProduitsLight: [...this.cart].map(([id, q]) => ({ iIdProduit: Number(id), iQtePanier: q })),
        },
      },
    ];
    return events as T;
  }
}

const line = (productId: string, quantity: number) => ({
  productId,
  offerId: productId,
  sellerId: "274401",
  sellerType: "DRIVE",
  quantity,
});

describe("LeclercConnector", () => {
  it("recherche dans la boutique du magasin, avec cache par requête", async () => {
    const http = new FakeHttp();
    const connector = new LeclercConnector(http, store);
    const products = await connector.searchProducts(" Lait ");
    expect(products).toHaveLength(5);
    await connector.searchProducts("lait");
    expect(http.gets).toEqual([`${BASE}/recherche.aspx?TexteRecherche=Lait`]);
  });

  it("fiche produit : EAN", async () => {
    const connector = new LeclercConnector(new FakeHttp(), store);
    const [lait] = await connector.searchProducts("lait");
    expect((await connector.getProductDetails(lait.url)).ean).toBe("3564700005644");
  });

  it("contexte : promos alimentaires et thèmes de l'accueil", async () => {
    const ctx = await new LeclercConnector(new FakeHttp(), store).getStoreContext();
    expect(ctx.promos).toHaveLength(4);
    expect(ctx.antiGaspi).toEqual([]);
    expect(ctx.themes).toContain("Chocolats");
  });

  it("panier : lecture de la page détail", async () => {
    const http = new FakeHttp();
    http.cart.set("2613", 1);
    expect((await new LeclercConnector(http, store).getCart()).items).toEqual([
      { productId: "2613", offerId: "2613", quantity: 1 },
    ]);
  });

  it("setCartQuantities : une requête par ligne à changer, quantité absolue, action selon le sens", async () => {
    const http = new FakeHttp();
    http.cart.set("2613", 1);
    http.cart.set("314653", 2);
    const connector = new LeclercConnector(http, store);
    vi.spyOn(connector, "getCart").mockResolvedValue({
      id: "274401",
      items: [
        { productId: "2613", offerId: "2613", quantity: 1 },
        { productId: "314653", offerId: "314653", quantity: 2 },
      ],
      totalPrice: 0,
    });
    const { cart, revised } = await connector.setCartQuantities([line("2613", 3), line("314653", 0), line("12", 0)]);
    expect(http.posts).toEqual([
      {
        url: "https://fd16-courses.leclercdrive.fr/magasin-274401/panier.aspx?op=1",
        d: { eTypeAction: 1, iIdProduit: "2613", iQuantite: 3, sNoPointLivraison: "274401" },
      },
      {
        url: "https://fd16-courses.leclercdrive.fr/magasin-274401/panier.aspx?op=1",
        d: { eTypeAction: 2, iIdProduit: "314653", iQuantite: 0, sNoPointLivraison: "274401" },
      },
    ]);
    expect(cart.items).toEqual([{ productId: "2613", offerId: "2613", quantity: 3 }]);
    expect(cart.totalPrice).toBe(12.6);
    expect(revised).toEqual([]);
  });

  it("setCartQuantities : quantité plafonnée par le Drive signalée dans revised", async () => {
    const http = new FakeHttp();
    http.maxQty = 2;
    const { revised } = await new LeclercConnector(http, store).setCartQuantities([line("2613", 5)]);
    expect(revised).toEqual([{ productId: "2613", requested: 5, actual: 2 }]);
  });
});
