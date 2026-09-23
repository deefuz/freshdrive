import type { Product } from "@/lib/types";

let seq = 0;

export function makeProduct(overrides: Partial<Product> = {}): Product {
  seq += 1;
  return {
    productId: `p-${seq}`,
    offerId: `o-${seq}`,
    sellerId: "seller-1",
    sellerType: "GROCERY",
    name: `Produit ${seq}`,
    brand: null,
    price: 1,
    unitPrice: null,
    unitPriceUnit: null,
    pack: null,
    isOrganic: false,
    isSeasonal: false,
    promo: null,
    stock: 10,
    url: `https://www.auchan.fr/produit-${seq}/pr-C${seq}`,
    ...overrides,
  };
}
