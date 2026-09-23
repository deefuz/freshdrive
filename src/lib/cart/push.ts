import { type BasketLine, mergeBasketIntoCart } from "../budget/basket";
import type { PushLineReport, PushReport } from "../store/weeks";
import type { Cart, CartLine, StoreConnector } from "../types";
import { round2 } from "../units";

export interface PushPreviewRow {
  productId: string;
  productName: string;
  ingredients: string[];
  url: string;
  /** paquets ajoutés par MyFresh */
  packs: number;
  /** quantité déjà dans le panier Auchan */
  inCart: number;
  /** quantité absolue envoyée à Auchan */
  finalQuantity: number;
  cost: number;
}

export interface PushPreview {
  rows: PushPreviewRow[];
  cartLines: CartLine[];
  addedCost: number;
}

const displayName = (l: BasketLine) => `${l.product.brand ? `${l.product.brand} ` : ""}${l.product.name}`;

export function productLabels(lines: BasketLine[]): Map<string, { name: string; url: string }> {
  return new Map(lines.map((l) => [l.product.productId, { name: displayName(l), url: l.product.url }]));
}

export function previewPush(cart: Cart, lines: BasketLine[]): PushPreview {
  const cartLines = mergeBasketIntoCart(cart, lines);
  const rows = cartLines.map((cl) => {
    const own = lines.filter((l) => l.product.productId === cl.productId);
    const packs = own.reduce((sum, l) => sum + l.packs, 0);
    return {
      productId: cl.productId,
      productName: displayName(own[0]),
      ingredients: own.map((l) => l.name),
      url: own[0].product.url,
      packs,
      inCart: cl.quantity - packs,
      finalQuantity: cl.quantity,
      cost: round2(own.reduce((sum, l) => sum + l.cost, 0)),
    };
  });
  return { rows, cartLines, addedCost: round2(rows.reduce((sum, r) => sum + r.cost, 0)) };
}

/** Envoie les lignes une par une (une erreur n'arrête pas les suivantes) et dresse le rapport. */
export async function pushLines(
  connector: Pick<StoreConnector, "setCartQuantities" | "getCart">,
  lines: CartLine[],
  labels: Map<string, { name: string; url: string }>,
  opts: { onProgress?: (done: number, total: number) => void; now?: Date } = {},
): Promise<PushReport> {
  const added: PushLineReport[] = [];
  const adjusted: PushLineReport[] = [];
  const failed: PushLineReport[] = [];
  for (const [i, line] of lines.entries()) {
    const label = labels.get(line.productId) ?? { name: line.productId, url: "" };
    const base = { productId: line.productId, name: label.name, url: label.url, requested: line.quantity };
    try {
      const { revised } = await connector.setCartQuantities([line]);
      const r = revised.find((x) => x.productId === line.productId);
      if (r) adjusted.push({ ...base, actual: r.actual, error: null });
      else added.push({ ...base, actual: line.quantity, error: null });
    } catch (e) {
      failed.push({ ...base, actual: null, error: (e as Error).message });
    }
    opts.onProgress?.(i + 1, lines.length);
  }
  let cartTotal: number | null = null;
  try {
    cartTotal = (await connector.getCart()).totalPrice;
  } catch {
    cartTotal = null;
  }
  return { pushedAt: (opts.now ?? new Date()).toISOString(), added, adjusted, failed, cartTotal };
}
