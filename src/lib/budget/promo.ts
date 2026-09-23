import { normalizeText } from "../text";
import type { Product } from "../types";
import { parseFrNumber, round2 } from "../units";

export interface PromoEffect {
  /** remise immédiate en € */
  saved: number;
  /** montant cagnotté sur la carte Waaoh, en € */
  loyalty: number;
}

const NUM = "(\\d+(?:[.,]\\d+)?)";
const NTH = "sur le (\\d+)\\s*e(?:me)?\\b";
const PERCENT_ON_NTH = new RegExp(`^-\\s*${NUM}\\s*%\\s*${NTH}`);
const EUROS_ON_NTH = new RegExp(`^-\\s*${NUM}\\s*€\\s*${NTH}`);
const BUY_N_PAY_M = /(\d+)\s*achetes?\s*=\s*(\d+)\s*payes?/;
const LOYALTY_ON_NTH = new RegExp(`${NUM}\\s*%.*cagnott\\w*\\s*${NTH}`);
const LOYALTY = new RegExp(`${NUM}\\s*%.*cagnott`);

/** Effet d'un libellé promo Auchan pour `packs` paquets au prix unitaire `unitPrice`. */
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
    }
  }
  return { saved: round2(saved), loyalty: round2(loyalty) };
}

/** Cagnotte Waaoh d'une offre : nombre de paquets à acheter pour la déclencher et montant crédité ; null sans cagnotte. */
export function loyaltyOffer(label: string, unitPrice: number): { packs: number; credit: number } | null {
  for (let packs = 1; packs <= 4; packs++) {
    const { loyalty } = promoEffect(label, unitPrice, packs);
    if (loyalty > 0) return { packs, credit: loyalty };
  }
  return null;
}

export interface WaaohOffer {
  product: Product;
  /** paquets à acheter pour déclencher la cagnotte */
  packs: number;
  /** montant cagnotté pour ces paquets, en € */
  credit: number;
}

/** Produits qui créditent la carte Waaoh, du plus au moins rémunérateur. */
export function rankWaaohOffers(products: Product[]): WaaohOffer[] {
  return products
    .flatMap((product) => {
      const offer = product.promo ? loyaltyOffer(product.promo.label, product.price) : null;
      return offer ? [{ product, ...offer }] : [];
    })
    .sort((a, b) => b.credit - a.credit);
}
