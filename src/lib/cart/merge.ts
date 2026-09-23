import type { Cart, CartLine } from "../types";

export function mergeWithCart(cart: Cart, wanted: CartLine[]): CartLine[] {
  const merged = new Map<string, CartLine>();
  for (const line of wanted) {
    const prev = merged.get(line.productId);
    merged.set(line.productId, prev ? { ...prev, quantity: prev.quantity + line.quantity } : { ...line });
  }
  for (const line of merged.values()) {
    line.quantity += cart.items.find((i) => i.productId === line.productId)?.quantity ?? 0;
  }
  return [...merged.values()];
}
