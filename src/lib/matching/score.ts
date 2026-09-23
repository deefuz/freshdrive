import { promoEffect } from "../budget/promo";
import type { Product, QtyUnit } from "../types";
import { round2 } from "../units";
import { matchPenalty } from "./relevance";

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

type Need = { quantity: number; unit: QtyUnit; name?: string; searchQuery?: string };

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
  // remise immédiate et cagnotte Waaoh réellement obtenues pour ces paquets : 1 € cagnotté vaut 1 € économisé
  const effect = product.promo ? promoEffect(product.promo.label, product.price, packs) : { saved: 0, loyalty: 0 };
  let score = Math.max(0.01, cost - effect.saved - effect.loyalty);
  if (product.pack && product.pack.unit === need.unit) {
    const bought = packs * product.pack.value;
    score *= 1 + 0.3 * ((bought - need.quantity) / bought);
  }
  if (opts.preferOrganic && product.isOrganic) score *= 0.85;
  // promo au montant non calculable (« Prix Choc », « -30 % ») : petit avantage forfaitaire
  if (product.promo?.kind === "price" && promoEffect(product.promo.label, product.price, 4).saved === 0) score *= 0.9;
  if (uncertain) score *= 1.3;
  if (need.name !== undefined && need.searchQuery !== undefined) {
    score *= matchPenalty({ name: need.name, searchQuery: need.searchQuery }, product.name);
  }
  return { product, packs, cost, score, uncertainQuantity: uncertain };
}
