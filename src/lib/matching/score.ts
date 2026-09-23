import type { Product, QtyUnit } from "../types";
import { round2 } from "../units";

export interface ScoreOptions {
  preferOrganic: boolean;
  unprocessed: boolean;
}

export interface MatchCandidate {
  product: Product;
  packs: number;
  cost: number;
  /** plus bas = meilleur */
  score: number;
  uncertainQuantity: boolean;
}

type Need = { quantity: number; unit: QtyUnit };

export function packsNeeded(need: Need, product: Product): { packs: number; uncertain: boolean } {
  if (product.pack && product.pack.unit === need.unit) {
    return { packs: Math.max(1, Math.ceil(need.quantity / product.pack.value - 1e-9)), uncertain: false };
  }
  if (need.unit === "pce" && !product.pack) {
    if (product.unitPriceUnit === "pce") return { packs: Math.max(1, Math.ceil(need.quantity)), uncertain: false };
    return { packs: 1, uncertain: true };
  }
  return { packs: 1, uncertain: true };
}

export function scoreCandidate(need: Need, product: Product, opts: ScoreOptions): MatchCandidate {
  const { packs, uncertain } = packsNeeded(need, product);
  const cost = round2(packs * product.price);
  let score = cost;
  if (product.pack && product.pack.unit === need.unit) {
    const bought = packs * product.pack.value;
    score *= 1 + 0.3 * ((bought - need.quantity) / bought);
  }
  if (opts.preferOrganic && product.isOrganic) score *= 0.85;
  if (product.promo?.kind === "price") score *= 0.9;
  if (product.promo?.kind === "loyalty") score *= 0.97;
  if (uncertain) score *= 1.3;
  return { product, packs, cost, score, uncertainQuantity: uncertain };
}
