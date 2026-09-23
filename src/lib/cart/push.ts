import { SessionExpiredError } from "../auchan/http";
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

/** Erreur des lignes non envoyées parce que la session Auchan a expiré en cours d'envoi. */
export const PUSH_SESSION_EXPIRED_LINE = "Session Auchan expirée : ligne non envoyée.";

/** L'envoi s'est arrêté sur une session Auchan expirée. */
export function stoppedBySessionExpiry(report: PushReport): boolean {
  return report.failed.some((l) => l.error === PUSH_SESSION_EXPIRED_LINE);
}

/**
 * Envoie les lignes une par une et dresse le rapport. Une erreur n'arrête pas les suivantes, sauf une session
 * expirée : les lignes restantes échoueraient toutes, elles sont marquées « non envoyées ».
 */
export async function pushLines(
  connector: Pick<StoreConnector, "setCartQuantities" | "getCart">,
  lines: CartLine[],
  labels: Map<string, { name: string; url: string }>,
  opts: { onProgress?: (done: number, total: number) => void; now?: Date } = {},
): Promise<PushReport> {
  const added: PushLineReport[] = [];
  const adjusted: PushLineReport[] = [];
  const failed: PushLineReport[] = [];
  const base = (line: CartLine) => {
    const label = labels.get(line.productId) ?? { name: line.productId, url: "" };
    return { productId: line.productId, name: label.name, url: label.url, requested: line.quantity };
  };
  let sessionExpired = false;
  for (const [i, line] of lines.entries()) {
    try {
      const { revised } = await connector.setCartQuantities([line]);
      const r = revised.find((x) => x.productId === line.productId);
      if (r) adjusted.push({ ...base(line), actual: r.actual, error: null });
      else added.push({ ...base(line), actual: line.quantity, error: null });
    } catch (e) {
      if (e instanceof SessionExpiredError) {
        for (const rest of lines.slice(i)) failed.push({ ...base(rest), actual: null, error: PUSH_SESSION_EXPIRED_LINE });
        sessionExpired = true;
        opts.onProgress?.(lines.length, lines.length);
        break;
      }
      failed.push({ ...base(line), actual: null, error: e instanceof Error ? e.message : String(e) });
    }
    opts.onProgress?.(i + 1, lines.length);
  }
  let cartTotal: number | null = null;
  if (!sessionExpired) {
    try {
      cartTotal = (await connector.getCart()).totalPrice;
    } catch {
      cartTotal = null;
    }
  }
  return { pushedAt: (opts.now ?? new Date()).toISOString(), added, adjusted, failed, cartTotal };
}
