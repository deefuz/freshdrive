import { type Basket, type BasketLine, computeBasket } from "../budget/basket";
import { promoEffect } from "../budget/promo";
import type { IngredientMatch } from "../matching/match";
import type { MatchCandidate } from "../matching/score";
import type { Week, WeekOverrides } from "../store/weeks";
import type { QtyUnit } from "../types";
import { round2 } from "../units";

export class EditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditError";
  }
}

/** Candidats d'une correspondance : le produit choisi (s'il y en a un) puis les alternatives. */
export function candidatesOf(match: Pick<IngredientMatch, "chosen" | "alternatives">): MatchCandidate[] {
  return [...(match.chosen ? [match.chosen] : []), ...match.alternatives];
}

/** Correspondances avec les produits choisis par l'utilisateur à la place des produits proposés. */
export function effectiveMatches(week: Pick<Week, "matches" | "overrides">): IngredientMatch[] {
  return week.matches.map((m) => {
    const wanted = week.overrides.products[m.need.key];
    if (!wanted || m.chosen?.product.productId === wanted) return m;
    const alt = m.alternatives.find((a) => a.product.productId === wanted);
    if (!alt) return m;
    return {
      need: m.need,
      chosen: alt,
      alternatives: candidatesOf(m).filter((a) => a !== alt),
    };
  });
}

export interface WeekTotals {
  basket: Basket;
  /** total au prix en rayon */
  gross: number;
  /** remises immédiates des promos */
  promoSaved: number;
  /** montant cagnotté (carte Waaoh), non déduit */
  loyalty: number;
  /** total estimé, comparé au budget */
  net: number;
  budget: number;
  remaining: number;
  overBudget: boolean;
}

export function weekTotals(week: Week): WeekTotals {
  const basket = computeBasket(effectiveMatches(week), week.selectedRecipeIds, new Set(week.overrides.pantry));
  let saved = 0;
  let loyalty = 0;
  for (const line of basket.lines) {
    if (!line.product.promo) continue;
    const effect = promoEffect(line.product.promo.label, line.product.price, line.packs);
    saved += effect.saved;
    loyalty += effect.loyalty;
  }
  const net = round2(basket.total - saved);
  const budget = week.brief.budgetEur;
  return {
    basket,
    gross: basket.total,
    promoSaved: round2(saved),
    loyalty: round2(loyalty),
    net,
    budget,
    remaining: round2(budget - net),
    overBudget: net > budget,
  };
}

export function toggleRecipe(week: Week, recipeId: string, selected: boolean): Week {
  if (!week.recipes.some((r) => r.id === recipeId)) throw new EditError("Recette inconnue.");
  const ids = new Set(week.selectedRecipeIds.filter((id) => id !== recipeId));
  if (selected) {
    if (ids.size >= week.brief.dinners) {
      throw new EditError(`Tu as déjà choisi ${week.brief.dinners} recettes : décoches-en une d'abord.`);
    }
    ids.add(recipeId);
  }
  return { ...week, selectedRecipeIds: week.recipes.map((r) => r.id).filter((id) => ids.has(id)) };
}

function findMatch(week: Week, key: string): IngredientMatch {
  const m = week.matches.find((x) => x.need.key === key);
  if (!m) throw new EditError("Ingrédient inconnu.");
  return m;
}

export function chooseProduct(week: Week, key: string, productId: string): Week {
  const m = findMatch(week, key);
  const candidates = candidatesOf(m);
  if (!candidates.some((c) => c.product.productId === productId)) {
    throw new EditError("Ce produit ne fait pas partie des choix possibles pour cet ingrédient.");
  }
  const products = { ...week.overrides.products };
  if (m.chosen?.product.productId === productId) delete products[key];
  else products[key] = productId;
  return { ...week, overrides: { ...week.overrides, products } };
}

export function setPantry(week: Week, key: string, inPantry: boolean): Week {
  findMatch(week, key);
  const pantry = week.overrides.pantry.filter((k) => k !== key);
  if (inPantry) pantry.push(key);
  return { ...week, overrides: { ...week.overrides, pantry } };
}

export interface ProductRow {
  key: string;
  name: string;
  quantity: number;
  unit: QtyUnit;
  inPantry: boolean;
  pantryStaple: boolean;
  chosen: MatchCandidate | null;
  /** produit choisi d'abord, puis les autres choix possibles */
  options: MatchCandidate[];
  /** ligne du panier ; null si au placard ou sans produit */
  line: BasketLine | null;
}

export function productRows(week: Week): ProductRow[] {
  const pantry = new Set(week.overrides.pantry);
  const lines = new Map(weekTotals(week).basket.lines.map((l) => [l.key, l]));
  return effectiveMatches(week).flatMap((m) => {
    const quantity = week.selectedRecipeIds.reduce((sum, id) => sum + (m.need.perRecipe[id] ?? 0), 0);
    if (quantity === 0) return [];
    return [
      {
        key: m.need.key,
        name: m.need.name,
        quantity,
        unit: m.need.unit,
        inPantry: pantry.has(m.need.key),
        pantryStaple: m.need.pantryStaple,
        chosen: m.chosen,
        options: candidatesOf(m),
        line: lines.get(m.need.key) ?? null,
      },
    ];
  });
}

export function initialOverrides(matches: IngredientMatch[], includePantryStaples = false): WeekOverrides {
  return {
    products: {},
    pantry: includePantryStaples ? [] : matches.filter((m) => m.need.pantryStaple).map((m) => m.need.key),
  };
}

/** Après une modification de recette : garde ce qui reste valable dans les choix de l'utilisateur. */
export function reconcileOverrides(
  overrides: WeekOverrides,
  oldMatches: IngredientMatch[],
  newMatches: IngredientMatch[],
  rematchedKeys: Set<string>,
): WeekOverrides {
  const newKeys = new Set(newMatches.map((m) => m.need.key));
  const oldKeys = new Set(oldMatches.map((m) => m.need.key));
  const products = Object.fromEntries(
    Object.entries(overrides.products).filter(([key]) => newKeys.has(key) && !rematchedKeys.has(key)),
  );
  const pantry = overrides.pantry.filter((key) => newKeys.has(key));
  for (const m of newMatches) {
    if (!oldKeys.has(m.need.key) && m.need.pantryStaple && !pantry.includes(m.need.key)) pantry.push(m.need.key);
  }
  return { products, pantry };
}
