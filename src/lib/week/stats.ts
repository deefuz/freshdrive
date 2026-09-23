import type { Week } from "../store/weeks";
import type { Product } from "../types";
import { round2 } from "../units";
import { weekTotals } from "./edit";

export interface WeekSpend {
  id: string;
  dinners: number;
  budget: number;
  /** total au prix en rayon */
  gross: number;
  /** remises immédiates des promos */
  promoSaved: number;
  /** cagnotte Waaoh */
  loyalty: number;
  /** total payé estimé */
  net: number;
}

export interface ProductStat {
  productId: string;
  product: Product;
  /** nombre de semaines où il a été acheté */
  weeks: number;
  packs: number;
  /** montant au prix en rayon */
  spent: number;
}

export interface SpendingStats {
  weeks: WeekSpend[];
  totals: { net: number; gross: number; promoSaved: number; loyalty: number; budget: number };
  products: ProductStat[];
}

/** Dépenses des semaines envoyées au panier Auchan (estimées d'après le panier de chaque semaine). */
export function spendingStats(all: Week[]): SpendingStats {
  const pushed = all.filter((w) => w.status === "pushed").sort((a, b) => a.id.localeCompare(b.id));
  const products = new Map<string, ProductStat>();
  const weeks = pushed.map((w): WeekSpend => {
    const t = weekTotals(w);
    const seen = new Set<string>();
    for (const line of t.basket.lines) {
      const id = line.product.productId;
      const stat = products.get(id) ?? { productId: id, product: line.product, weeks: 0, packs: 0, spent: 0 };
      // un même produit peut servir plusieurs ingrédients d'une semaine : la semaine ne compte qu'une fois
      if (!seen.has(id)) stat.weeks += 1;
      seen.add(id);
      stat.packs += line.packs;
      stat.spent = round2(stat.spent + line.cost);
      stat.product = line.product; // dernier prix et dernière promo connus
      products.set(id, stat);
    }
    return {
      id: w.id,
      dinners: w.brief.dinners,
      budget: w.brief.budgetEur,
      gross: t.gross,
      promoSaved: t.promoSaved,
      loyalty: t.loyalty,
      net: t.net,
    };
  });
  const sum = (key: keyof Omit<WeekSpend, "id" | "dinners">) => round2(weeks.reduce((s, w) => s + w[key], 0));
  return {
    weeks,
    totals: { net: sum("net"), gross: sum("gross"), promoSaved: sum("promoSaved"), loyalty: sum("loyalty"), budget: sum("budget") },
    products: [...products.values()].sort((a, b) => b.weeks - a.weeks || b.spent - a.spent),
  };
}
