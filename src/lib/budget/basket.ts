import type { IngredientMatch } from "../matching/match";
import { packsNeeded } from "../matching/score";
import type { CartLine, Product, QtyUnit } from "../types";
import { round2 } from "../units";

export interface BasketLine {
  key: string;
  name: string;
  product: Product;
  quantityNeeded: number;
  unit: QtyUnit;
  packs: number;
  cost: number;
  uncertainQuantity: boolean;
}

export interface Basket {
  lines: BasketLine[];
  total: number;
  missing: string[];
}

export function computeBasket(
  matches: IngredientMatch[],
  selectedRecipeIds: string[],
  excludeKeys: Set<string> = new Set(),
): Basket {
  const lines: BasketLine[] = [];
  const missing: string[] = [];
  for (const m of matches) {
    if (excludeKeys.has(m.need.key)) continue;
    const quantity = selectedRecipeIds.reduce((sum, id) => sum + (m.need.perRecipe[id] ?? 0), 0);
    if (quantity === 0) continue;
    if (!m.chosen) {
      missing.push(m.need.name);
      continue;
    }
    const { packs, uncertain } = packsNeeded({ quantity, unit: m.need.unit }, m.chosen.product);
    lines.push({
      key: m.need.key,
      name: m.need.name,
      product: m.chosen.product,
      quantityNeeded: quantity,
      unit: m.need.unit,
      packs,
      cost: round2(packs * m.chosen.product.price),
      uncertainQuantity: uncertain,
    });
  }
  return { lines, total: round2(lines.reduce((s, l) => s + l.cost, 0)), missing };
}

export function chooseSelection(
  recipeIds: string[],
  matches: IngredientMatch[],
  dinners: number,
  excludeKeys: Set<string> = new Set(),
): string[] {
  const cost = new Map(recipeIds.map((id) => [id, computeBasket(matches, [id], excludeKeys).total]));
  const keep = new Set([...recipeIds].sort((a, b) => cost.get(a)! - cost.get(b)!).slice(0, dinners));
  return recipeIds.filter((id) => keep.has(id));
}

export function basketToCartLines(lines: BasketLine[]): CartLine[] {
  return lines.map((l) => {
    if (!l.product.sellerId) throw new Error(`Magasin inconnu pour ${l.product.name} : relance la recherche.`);
    return {
      productId: l.product.productId,
      offerId: l.product.offerId,
      sellerId: l.product.sellerId,
      sellerType: l.product.sellerType,
      quantity: l.packs,
    };
  });
}
