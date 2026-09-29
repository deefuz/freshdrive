import type { Cart, CartLine, CartUpdateResult, Product, ProductDetails, StoreConnector, StoreContext } from "../types";
import type { LeclercHttpClient } from "./http";
import {
  type CartEvent,
  type LeclercStore,
  parseCartPage,
  parseCartUpdate,
  parseProductPage,
  parsePromotionsPage,
  parseSearchPage,
  parseThemes,
} from "./parse";

/** Actions de `panier.aspx?op=1`, comme les boutons + et − du site. */
const ADD = 1;
const REMOVE = 2;

function dedupe(products: Product[]): Product[] {
  const seen = new Set<string>();
  return products.filter((p) => (seen.has(p.productId) ? false : (seen.add(p.productId), true)));
}

export class LeclercConnector implements StoreConnector {
  private readonly searchCache = new Map<string, Product[]>();

  constructor(
    private readonly http: LeclercHttpClient,
    readonly store: LeclercStore,
  ) {}

  /** Page de la boutique du magasin (le serveur fdNN et le chemin dépendent du magasin). */
  pageUrl(page: string): string {
    return `${this.store.origin}${this.store.storePath}/${page}`;
  }

  async searchProducts(query: string): Promise<Product[]> {
    const q = query.trim();
    const key = q.toLowerCase();
    const cached = this.searchCache.get(key);
    if (cached) return cached;
    const html = await this.http.getText(this.pageUrl(`recherche.aspx?TexteRecherche=${encodeURIComponent(q)}`));
    const products = dedupe(parseSearchPage(html, this.store));
    this.searchCache.set(key, products);
    return products;
  }

  async getProductDetails(url: string): Promise<ProductDetails> {
    return parseProductPage(await this.http.getText(url));
  }

  async getStoreContext(): Promise<StoreContext> {
    const { promos, antiGaspi } = parsePromotionsPage(await this.http.getText(this.pageUrl("promotions.aspx")), this.store);
    const themes = parseThemes(await this.http.getText(this.pageUrl("home.aspx")));
    return { promos: dedupe(promos), antiGaspi: dedupe(antiGaspi), themes };
  }

  async getCart(): Promise<Cart> {
    return parseCartPage(await this.http.getText(this.pageUrl("detail-panier.aspx")), this.store);
  }

  /** Quantités absolues, une ligne par requête (c'est ce que fait le site) ; `revised` : quantités ajustées par le Drive. */
  async setCartQuantities(lines: CartLine[]): Promise<CartUpdateResult> {
    let cart = await this.getCart();
    const revised: CartUpdateResult["revised"] = [];
    for (const line of lines) {
      const before = cart.items.find((i) => i.productId === line.productId)?.quantity ?? 0;
      if (before === line.quantity) continue;
      const d = JSON.stringify({
        eTypeAction: line.quantity >= before ? ADD : REMOVE,
        iIdProduit: line.productId,
        iQuantite: line.quantity,
        sNoPointLivraison: this.store.noPL,
      });
      const events = await this.http.postForm<CartEvent[]>(
        `${this.store.origin}/magasin-${this.store.noPL}/panier.aspx?op=1`,
        { d },
      );
      cart = parseCartUpdate(events, this.store);
      const actual = cart.items.find((i) => i.productId === line.productId)?.quantity ?? 0;
      if (actual !== line.quantity) revised.push({ productId: line.productId, requested: line.quantity, actual });
    }
    return { cart, revised };
  }
}
