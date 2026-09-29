import { normalizeText } from "../text";
import type { Product } from "../types";
import { parseFrNumber, round2 } from "../units";

export interface PromoEffect {
  /** remise immédiate en € */
  saved: number;
  /** montant crédité sur la carte de fidélité (Waaoh, E.Leclerc), en € */
  loyalty: number;
}

const NUM = "(\\d+(?:[.,]\\d+)?)";
const NTH = "sur le (\\d+)\\s*e(?:me)?\\b";
const PERCENT_ON_NTH = new RegExp(`^-\\s*${NUM}\\s*%\\s*${NTH}`);
const EUROS_ON_NTH = new RegExp(`^-\\s*${NUM}\\s*€\\s*${NTH}`);
const BUY_N_PAY_M = /(\d+)\s*achetes?\s*=\s*(\d+)\s*payes?/;
const LOYALTY_ON_NTH = new RegExp(`${NUM}\\s*%.*cagnott\\w*\\s*${NTH}`);
const LOYALTY = new RegExp(`${NUM}\\s*%.*cagnott`);
// Leclerc : « le 2eme est a -60% », « le 2eme article a -40% », « le 3eme est offert », « … en ticket e.leclerc »
const LE_NTH = "le (\\d+)\\s*e(?:me)?\\s+(?:article\\s+)?(?:est\\s+)?";
const TICKET_ON_NTH = new RegExp(`${LE_NTH}a\\s*-\\s*${NUM}\\s*%\\s*en ticket`);
const PERCENT_ON_LE_NTH = new RegExp(`${LE_NTH}a\\s*-\\s*${NUM}\\s*%`);
const NTH_FREE = new RegExp(`${LE_NTH}offert`);
const TICKET_FROM_N = new RegExp(`recevez ${NUM}\\s*%\\s*en ticket.*\\bdes (\\d+) produits`);
const TICKET_PERCENT = new RegExp(`recevez ${NUM}\\s*%\\s*en ticket`);
const TICKET_EUROS = new RegExp(`recevez ${NUM}\\s*€\\s*en ticket`);

/** Effet d'un libellé promo (Auchan ou Leclerc) pour `packs` paquets au prix unitaire `unitPrice`. */
export function promoEffect(label: string, unitPrice: number, packs: number): PromoEffect {
  let saved = 0;
  let loyalty = 0;
  for (const part of label.split("·").map((p) => normalizeText(p))) {
    let m: RegExpMatchArray | null;
    if ((m = part.match(PERCENT_ON_NTH))) {
      saved += Math.floor(packs / Number(m[2])) * unitPrice * (parseFrNumber(m[1]) / 100);
    } else if ((m = part.match(EUROS_ON_NTH))) {
      saved += Math.floor(packs / Number(m[2])) * parseFrNumber(m[1]);
    } else if ((m = part.match(BUY_N_PAY_M))) {
      const bought = Number(m[1]);
      const paid = Number(m[2]);
      if (bought > paid) saved += Math.floor(packs / bought) * (bought - paid) * unitPrice;
    } else if ((m = part.match(LOYALTY_ON_NTH))) {
      loyalty += Math.floor(packs / Number(m[2])) * unitPrice * (parseFrNumber(m[1]) / 100);
    } else if ((m = part.match(LOYALTY))) {
      loyalty += packs * unitPrice * (parseFrNumber(m[1]) / 100);
    } else if ((m = part.match(TICKET_ON_NTH))) {
      loyalty += Math.floor(packs / Number(m[1])) * unitPrice * (parseFrNumber(m[2]) / 100);
    } else if ((m = part.match(PERCENT_ON_LE_NTH))) {
      saved += Math.floor(packs / Number(m[1])) * unitPrice * (parseFrNumber(m[2]) / 100);
    } else if ((m = part.match(NTH_FREE))) {
      saved += Math.floor(packs / Number(m[1])) * unitPrice;
    } else if ((m = part.match(TICKET_FROM_N))) {
      loyalty += Math.floor(packs / Number(m[2])) * unitPrice * (parseFrNumber(m[1]) / 100);
    } else if ((m = part.match(TICKET_PERCENT))) {
      loyalty += packs * unitPrice * (parseFrNumber(m[1]) / 100);
    } else if ((m = part.match(TICKET_EUROS))) {
      loyalty += packs * parseFrNumber(m[1]);
    }
  }
  return { saved: round2(saved), loyalty: round2(loyalty) };
}

/** Crédit fidélité d'une offre : nombre de paquets à acheter pour la déclencher et montant crédité ; null sans cagnotte. */
export function loyaltyOffer(label: string, unitPrice: number): { packs: number; credit: number } | null {
  for (let packs = 1; packs <= 4; packs++) {
    const { loyalty } = promoEffect(label, unitPrice, packs);
    if (loyalty > 0) return { packs, credit: loyalty };
  }
  return null;
}

export interface LoyaltyOffer {
  product: Product;
  /** paquets à acheter pour déclencher le crédit */
  packs: number;
  /** montant crédité pour ces paquets, en € */
  credit: number;
}

/** Produits qui créditent la carte de fidélité, du plus au moins rémunérateur. */
export function rankLoyaltyOffers(products: Product[]): LoyaltyOffer[] {
  return products
    .flatMap((product) => {
      const offer = product.promo ? loyaltyOffer(product.promo.label, product.price) : null;
      return offer ? [{ product, ...offer }] : [];
    })
    .sort((a, b) => b.credit - a.credit);
}
