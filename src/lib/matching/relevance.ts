import { normalizeText, tokens } from "../text";

/** Formes transformées : on les évite quand l'ingrédient ne les demande pas. Regex sur le texte normalisé (sans accents). */
const PROCESSED: [label: string, pattern: RegExp][] = [
  ["émincé", /\bemince(e|s|es)?\b/],
  ["en rondelles", /\ben rondelles?\b/],
  ["en dés", /\ben des\b/],
  ["râpé", /\brape(e|s|es)?\b/],
  ["surgelé", /\bsurgele(e|s|es)?\b/],
  ["en conserve", /\bconserves?\b/],
  ["cuisiné", /\bcuisine(e|s|es)?\b/],
  ["poêlée", /\bpoelee?s?\b/],
  ["purée", /\bpurees?\b/],
  ["soupe", /\b(soupe|veloute)s?\b/],
  ["sauce", /\bsauces?\b/],
  ["pané", /\bpane(e|s|es)?\b/],
];

/** Variétés ou aromatisations (tokens tels que produits par tokens()) qui changent le produit. */
const VARIETIES = new Set([
  "chevre",
  "brebi",
  "bufflonne",
  "fume",
  "fumee",
  "epice",
  "epicee",
  "aromatise",
  "aromatisee",
  "herbe",
  "piment",
  "vanille",
  "chocolat",
  "ail",
]);

const PROCESSED_FACTOR = 1;
const VARIETY_FACTOR = 1.6;
const COVERAGE_WEIGHT = 0.5;

export function processedMarkers(text: string): string[] {
  const t = normalizeText(text);
  return PROCESSED.filter(([, re]) => re.test(t)).map(([label]) => label);
}

/**
 * Multiplicateur de score (≥ 1, plus haut = moins pertinent) :
 * couverture partielle des mots de l'ingrédient, forme transformée non demandée (×2 chacune),
 * variété non demandée (×1,6 chacune).
 */
export function matchPenalty(ingredient: { name: string; searchQuery: string }, productName: string): number {
  const ingredientText = `${ingredient.name} ${ingredient.searchQuery}`;
  const wanted = new Set(tokens(ingredientText));
  const offered = new Set(tokens(productName));
  const shared = [...wanted].filter((t) => offered.has(t)).length;
  const coverage = wanted.size ? shared / wanted.size : 1;

  const askedForms = new Set(processedMarkers(ingredientText));
  const extraForms = processedMarkers(productName).filter((m) => !askedForms.has(m)).length;
  const extraVarieties = [...offered].filter((t) => VARIETIES.has(t) && !wanted.has(t)).length;

  return (1 + COVERAGE_WEIGHT * (1 - coverage)) * (1 + PROCESSED_FACTOR * extraForms) * VARIETY_FACTOR ** extraVarieties;
}
