export type QtyUnit = "g" | "ml" | "pce";

export interface Quantity {
  value: number;
  unit: QtyUnit;
}

export interface Promo {
  label: string;
  /** "price" = vraie baisse de prix ; "loyalty" = cagnotte carte Waaoh */
  kind: "price" | "loyalty";
}

export interface Product {
  productId: string;
  offerId: string;
  sellerId: string | null;
  sellerType: string;
  name: string;
  brand: string | null;
  /** prix de vente d'une unité (paquet, pièce…) en € */
  price: number;
  unitPrice: number | null;
  unitPriceUnit: "kg" | "l" | "pce" | null;
  /** contenu d'un paquet, normalisé en g / ml / pce */
  pack: Quantity | null;
  isOrganic: boolean;
  isSeasonal: boolean;
  promo: Promo | null;
  /** stock magasin (data-stock) ; null si inconnu */
  stock: number | null;
  url: string;
}

export interface ProductDetails {
  ean: string | null;
  ingredients: string | null;
}

export interface StoreContext {
  promos: Product[];
  antiGaspi: Product[];
  themes: string[];
}

export interface CartItem {
  productId: string;
  offerId: string;
  quantity: number;
}

export interface Cart {
  id: string;
  items: CartItem[];
  /** total en € */
  totalPrice: number;
}

export interface CartLine {
  productId: string;
  offerId: string;
  sellerId: string;
  sellerType: string;
  /** quantité absolue voulue dans le panier */
  quantity: number;
}

export interface CartUpdateResult {
  cart: Cart;
  revised: { productId: string; requested: number; actual: number }[];
}

export interface StoreConnector {
  searchProducts(query: string): Promise<Product[]>;
  getProductDetails(url: string): Promise<ProductDetails>;
  getStoreContext(): Promise<StoreContext>;
  getCart(): Promise<Cart>;
  setCartQuantities(lines: CartLine[]): Promise<CartUpdateResult>;
}
