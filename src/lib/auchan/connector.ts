import type { Cart, CartLine, CartUpdateResult, Product, ProductDetails, StoreConnector, StoreContext } from "../types";
import type { HttpClient } from "./http";
import {
  BASE_URL,
  parseCart,
  parseProductCards,
  parseProductPage,
  parseThemes,
  type RawCartResponse,
  themeText,
} from "./parse";
import type { AuchanSession } from "./session";

export const FOOD_PROMO_AISLES = [
  "fruits-legumes/ca-n03",
  "boucherie-volaille-poissonnerie/ca-n02",
  "oeufs-produits-laitiers/ca-n01",
  "charcuterie-traiteur-pain/ca-n12",
  "epicerie-salee/ca-n06",
  "surgeles/ca-n04",
];

function dedupe(products: Product[]): Product[] {
  const seen = new Set<string>();
  return products.filter((p) => (seen.has(p.productId) ? false : (seen.add(p.productId), true)));
}

export class AuchanConnector implements StoreConnector {
  private readonly searchCache = new Map<string, Product[]>();

  constructor(
    private readonly http: HttpClient,
    private readonly session: Pick<AuchanSession, "consentId">,
  ) {}

  async searchProducts(query: string): Promise<Product[]> {
    const q = query.trim();
    const key = q.toLowerCase();
    const cached = this.searchCache.get(key);
    if (cached) return cached;
    const products = parseProductCards(await this.http.getText(`/recherche?text=${encodeURIComponent(q)}`));
    this.searchCache.set(key, products);
    return products;
  }

  async getProductDetails(url: string): Promise<ProductDetails> {
    return parseProductPage(await this.http.getText(url.replace(BASE_URL, "")));
  }

  async getStoreContext(): Promise<StoreContext> {
    const promos: Product[] = [];
    for (const aisle of FOOD_PROMO_AISLES) {
      promos.push(...parseProductCards(await this.http.getText(`/boutique/promos/${aisle}`)));
    }
    const antiGaspi = parseProductCards(await this.http.getText("/boutique/anti-gaspi"));
    const themes = parseThemes(await this.http.getText("/")).map(themeText);
    return { promos: dedupe(promos), antiGaspi: dedupe(antiGaspi), themes };
  }

  async getCart(): Promise<Cart> {
    return parseCart(await this.http.getJson<RawCartResponse>("/cart"));
  }

  async setCartQuantities(lines: CartLine[]): Promise<CartUpdateResult> {
    const current = await this.getCart();
    const raw = await this.http.postJson<RawCartResponse>("/cart/update", {
      cartId: current.id,
      items: lines.map((l) => ({
        productId: l.productId,
        offerId: l.offerId,
        sellerType: l.sellerType,
        desiredQuantity: l.quantity,
        desiredType: "DEFAULT",
        sellerId: l.sellerId,
      })),
      consentId: this.session.consentId,
      reservationId: null,
      mbaAvailabilityNeeded: true,
    });
    const cart = parseCart(raw);
    const revised = lines
      .map((l) => ({
        productId: l.productId,
        requested: l.quantity,
        actual: cart.items.find((i) => i.productId === l.productId)?.quantity ?? 0,
      }))
      .filter((r) => r.actual !== r.requested);
    return { cart, revised };
  }
}
