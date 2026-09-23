import { formatQty, formatWeekDate, productShortLabel, TAG_LABELS } from "../format";
import type { IngredientMatch } from "../matching/match";
import { needKey } from "../matching/needs";
import type { Recipe } from "../recipes/schema";
import type { Week } from "../store/weeks";
import { effectiveMatches, productRows, weekTotals } from "../week/edit";

export const PRINT_SECTIONS = ["recettes", "courses"] as const;
export type PrintSection = (typeof PRINT_SECTIONS)[number];
export const MAX_FAMILY_LENGTH = 60;
export const MAX_NOTES_LENGTH = 1000;

export interface PrintOptions {
  /** nom de la famille, affiché dans l'en-tête ; vide = pas de nom */
  family: string;
  sections: PrintSection[];
  /** notes libres imprimées en tête */
  notes: string;
}

/** Paramètres d'URL tels que Next.js les passe à une page (`searchParams`). */
export type SearchParams = Record<string, string | string[] | undefined>;

const firstValue = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const allValues = (v: string | string[] | undefined): string[] => (v === undefined ? [] : [v].flat());

/**
 * Options d'impression lues dans l'URL. Première visite (ni `o` ni `sections`) : toutes les sections.
 * Formulaire envoyé (`o=1`) : seulement les sections cochées, éventuellement aucune.
 */
export function parsePrintOptions(params: SearchParams): PrintOptions {
  const wanted = allValues(params.sections);
  const submitted = params.o !== undefined || wanted.length > 0;
  return {
    family: firstValue(params.famille).trim().slice(0, MAX_FAMILY_LENGTH),
    sections: submitted ? PRINT_SECTIONS.filter((s) => wanted.includes(s)) : [...PRINT_SECTIONS],
    notes: firstValue(params.notes).trim().slice(0, MAX_NOTES_LENGTH),
  };
}

/** Chaîne de requête qui redonne ces options (lien PDF, rendu par Playwright). */
export function printQuery(options: PrintOptions): string {
  const q = new URLSearchParams();
  if (options.family) q.set("famille", options.family);
  for (const s of options.sections) q.append("sections", s);
  if (options.notes) q.set("notes", options.notes);
  q.set("o", "1");
  return q.toString();
}

/** URLSearchParams → objet au format de `searchParams` (valeurs répétées regroupées en tableau). */
export function searchParamsRecord(params: URLSearchParams): SearchParams {
  const record: SearchParams = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    record[key] = values.length === 1 ? values[0] : values;
  }
  return record;
}

/** Indices des étapes « avec les enfants » réellement présentes (indices hors limites ou négatifs ignorés). */
export function kidStepIndexes(recipe: Pick<Recipe, "steps" | "kidSteps">): Set<number> {
  return new Set((recipe.kidSteps ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < recipe.steps.length));
}

/** Une semaine s'imprime une fois préparée, avec au moins une recette retenue. */
export function isPrintable(week: Pick<Week, "status" | "selectedRecipeIds">): boolean {
  return (week.status === "ready" || week.status === "pushed") && week.selectedRecipeIds.length > 0;
}

export interface PrintIngredient {
  name: string;
  quantity: string;
  /** produit Auchan choisi ; null si aucun produit ou si l'ingrédient est au placard */
  product: string | null;
  inPantry: boolean;
}

export interface PrintStep {
  text: string;
  kid: boolean;
}

export interface PrintRecipe {
  id: string;
  title: string;
  summary: string;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  tags: string[];
  ingredients: PrintIngredient[];
  steps: PrintStep[];
  /** estimation par portion, calculée par Claude */
  nutrition: string;
  whyThisWeek: string;
}

export interface ShoppingLine {
  key: string;
  /** ingrédient et quantité nécessaire, ex. « courgette (600 g) » */
  ingredient: string;
  product: string;
  packs: number;
  cost: number;
  promo: string | null;
  uncertain: boolean;
}

export interface PrintData {
  weekId: string;
  /** « Semaine du 23 septembre 2026 » */
  heading: string;
  family: string;
  notes: string;
  showRecipes: boolean;
  showShopping: boolean;
  recipes: PrintRecipe[];
  shopping: {
    lines: ShoppingLine[];
    /** ingrédients cochés « déjà au placard » */
    pantry: { name: string; quantity: string }[];
    /** ingrédients sans produit Auchan */
    missing: string[];
    gross: number;
    promoSaved: number;
    net: number;
    budget: number;
  };
}

function nutritionText(n: Recipe["nutritionPerServing"]): string {
  return `≈ ${Math.round(n.kcal)} kcal · protéines ${Math.round(n.proteinG)} g · glucides ${Math.round(n.carbsG)} g · lipides ${Math.round(n.fatG)} g`;
}

function recipeSheet(recipe: Recipe, matches: Map<string, IngredientMatch>, pantry: Set<string>): PrintRecipe {
  const kids = kidStepIndexes(recipe);
  return {
    id: recipe.id,
    title: recipe.title,
    summary: recipe.summary,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    servings: recipe.servings,
    tags: recipe.tags.map((t) => TAG_LABELS[t]),
    ingredients: recipe.ingredients.map((ing) => {
      const key = needKey(ing);
      const chosen = matches.get(key)?.chosen ?? null;
      const inPantry = pantry.has(key);
      return {
        name: ing.name,
        quantity: formatQty(ing.quantity, ing.unit),
        product: !inPantry && chosen ? productShortLabel(chosen.product) : null,
        inPantry,
      };
    }),
    steps: recipe.steps.map((text, i) => ({ text, kid: kids.has(i) })),
    nutrition: nutritionText(recipe.nutritionPerServing),
    whyThisWeek: recipe.whyThisWeek,
  };
}

export function buildPrintData(week: Week, options: PrintOptions): PrintData {
  const matches = new Map(effectiveMatches(week).map((m) => [m.need.key, m]));
  const pantry = new Set(week.overrides.pantry);
  const totals = weekTotals(week);
  return {
    weekId: week.id,
    heading: `Semaine du ${formatWeekDate(week.id)}`,
    family: options.family,
    notes: options.notes,
    showRecipes: options.sections.includes("recettes"),
    showShopping: options.sections.includes("courses"),
    recipes: week.recipes
      .filter((r) => week.selectedRecipeIds.includes(r.id))
      .map((r) => recipeSheet(r, matches, pantry)),
    shopping: {
      lines: totals.basket.lines.map((l) => ({
        key: l.key,
        ingredient: `${l.name} (${formatQty(l.quantityNeeded, l.unit)})`,
        product: productShortLabel(l.product),
        packs: l.packs,
        cost: l.cost,
        promo: l.product.promo?.label ?? null,
        uncertain: l.uncertainQuantity,
      })),
      pantry: productRows(week)
        .filter((r) => r.inPantry)
        .map((r) => ({ name: r.name, quantity: formatQty(r.quantity, r.unit) })),
      missing: totals.basket.missing,
      gross: totals.gross,
      promoSaved: totals.promoSaved,
      net: totals.net,
      budget: totals.budget,
    },
  };
}
