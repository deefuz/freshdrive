import type { Cart, CartLine, CartUpdateResult, Product, ProductDetails, StoreConnector, StoreContext } from "@/lib/types";

export class FakeConnector implements StoreConnector {
  public cart: Cart = { id: "cart-fake", items: [], totalPrice: 0 };
  public searches: string[] = [];
  public details: Record<string, ProductDetails> = {};

  constructor(
    private readonly catalog: Record<string, Product[]>,
    private readonly context: StoreContext = { promos: [], antiGaspi: [], themes: [] },
  ) {}

  async searchProducts(query: string): Promise<Product[]> {
    this.searches.push(query);
    return this.catalog[query.trim().toLowerCase()] ?? [];
  }

  async getProductDetails(url: string): Promise<ProductDetails> {
    return this.details[url] ?? { ean: null, ingredients: null };
  }

  async getStoreContext(): Promise<StoreContext> {
    return this.context;
  }

  async getCart(): Promise<Cart> {
    return this.cart;
  }

  async setCartQuantities(lines: CartLine[]): Promise<CartUpdateResult> {
    for (const l of lines) {
      this.cart.items = this.cart.items.filter((i) => i.productId !== l.productId);
      if (l.quantity > 0) this.cart.items.push({ productId: l.productId, offerId: l.offerId, quantity: l.quantity });
    }
    return { cart: this.cart, revised: [] };
  }
}
