import { rankWaaohOffers } from "../budget/promo";
import type { WeeklyContext } from "../context/build";
import { formatEur } from "../format";
import { profilePromptBlock } from "../profile/profile";
import type { Product } from "../types";
import { type Brief, type DietFilter, servingsFor } from "./brief";
import type { Recipe } from "./schema";

const FILTER_LABELS: Record<DietFilter, string> = {
  kids_friendly: "adapté aux enfants (saveurs douces, pas trop épicé, textures simples)",
  low_calorie: "peu calorique (environ 500 kcal max par portion adulte)",
  vegan: "100 % végétal (aucun produit animal)",
  unprocessed: "sans produits ultra-transformés (ingrédients bruts, pas de plats préparés, sauces toutes faites ou additifs)",
};

export const SYSTEM_PROMPT = `Tu es le chef d'un service de box repas familiales, en France.
Les allergies du foyer sont des interdits absolus et tu n'utilises que le matériel de cuisine indiqué quand il est précisé.
Tu composes des dîners faisables en semaine avec des produits d'un supermarché Auchan Drive.
Tu privilégies les produits en promotion et de saison fournis, ainsi que ceux qui créditent la carte fidélité Waaoh (cagnotte), en priorité ceux qui rapportent le plus ; pour une offre « sur le 2ème », prévois une quantité qui justifie deux paquets quand c'est raisonnable. Tu réutilises un même produit dans plusieurs recettes pour limiter le gaspillage et tu respectes strictement les contraintes alimentaires.
Les quantités d'ingrédients sont des totaux pour la recette, en g, ml ou pièces (pce), cohérents avec le nombre de portions.
Indique dans kidSteps les indices des étapes que des enfants peuvent réaliser (laver, mélanger, garnir, dresser).`;

function productLine(p: Product): string {
  const pack = p.pack ? ` ${p.pack.value}${p.pack.unit}` : "";
  const promo = p.promo ? ` [${p.promo.label}]` : "";
  return `- ${p.brand ? `${p.brand} ` : ""}${p.name}${pack} : ${p.price.toFixed(2)} €${promo}`;
}

function contextBlock(ctx: WeeklyContext): string {
  const promos = ctx.promos.filter((p) => p.promo?.kind === "price").slice(0, 80);
  const waaoh = rankWaaohOffers(ctx.promos)
    .slice(0, 40)
    .map(
      ({ product, packs, credit }) =>
        `${productLine(product)} → ${formatEur(credit)} cagnottés pour ${packs} acheté${packs > 1 ? "s" : ""}`,
    );
  return [
    `Saison : ${ctx.season}. Produits de saison : ${ctx.seasonalProduce.join(", ")}.`,
    ctx.events.length ? `Événements à venir : ${ctx.events.map((e) => `${e.name} (${e.date})`).join(", ")}.` : "",
    ctx.themes.length
      ? `Thèmes mis en avant par le magasin cette semaine (ignore ceux qui ne concernent pas les dîners) :\n${ctx.themes.map((t) => `- ${t}`).join("\n")}`
      : "",
    `Promos alimentaires de la semaine :\n${promos.map(productLine).join("\n")}`,
    waaoh.length
      ? `Produits qui créditent la carte Waaoh (du plus au moins rémunérateur) :\n${waaoh.join("\n")}`
      : "",
    ctx.antiGaspi.length ? `Produits anti-gaspi :\n${ctx.antiGaspi.slice(0, 20).map(productLine).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function briefBlock(brief: Brief): string {
  const constraints = brief.filters.map((f) => `- ${FILTER_LABELS[f]}`).join("\n") || "- aucune";
  return [
    `Foyer : ${brief.adults} adulte(s) et ${brief.children} enfant(s), soit ${servingsFor(brief)} portions par dîner.`,
    `Budget courses total : ${brief.budgetEur} € pour tous les dîners retenus.`,
    `Contraintes :\n${constraints}`,
    brief.preferOrganic ? "Préférence pour le bio quand c'est raisonnable." : "",
    brief.notes ? `Précisions : ${brief.notes}` : "",
    brief.profile ? profilePromptBlock(brief.profile) : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface MenuPromptOptions {
  /** titres des recettes retenues ces dernières semaines, à ne pas reproposer */
  avoidTitles?: string[];
  /** titres des recettes favorites déjà ajoutées au menu de la semaine */
  plannedTitles?: string[];
  /** titres des recettes déjà proposées pour cette semaine (demande de propositions supplémentaires) */
  existingTitles?: string[];
  /** nombre de nouvelles recettes demandées ; par défaut, le menu complet (dîners + 2) */
  count?: number;
}

function menuOptionsBlock(options: MenuPromptOptions): string {
  const avoid = options.avoidTitles ?? [];
  const planned = options.plannedTitles ?? [];
  const existing = options.existingTitles ?? [];
  return [
    avoid.length
      ? `Recettes servies ces dernières semaines, à éviter (ni la même recette, ni une variante très proche) : ${avoid.join(" ; ")}.`
      : "",
    planned.length
      ? `Déjà au menu cette semaine (recettes favorites reprises : ne les propose pas, mais tu peux partager des ingrédients avec elles) : ${planned.join(" ; ")}.`
      : "",
    existing.length
      ? `Déjà proposées cette semaine (ne les propose pas à nouveau, ni une variante très proche ; tu peux partager des ingrédients avec elles) : ${existing.join(" ; ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildMenuPrompt(brief: Brief, ctx: WeeklyContext, options: MenuPromptOptions = {}): string {
  const extra = menuOptionsBlock(options);
  const request = options.count
    ? `Propose ${options.count} nouvelles recettes de dîner, différentes de celles déjà proposées, chacune pour ${servingsFor(brief)} portions.`
    : `Propose ${brief.dinners + 2} recettes de dîner variées (${brief.dinners} seront retenues, les autres servent d'alternatives), chacune pour ${servingsFor(brief)} portions.`;
  return `${contextBlock(ctx)}

${briefBlock(brief)}
${extra ? `\n${extra}\n` : ""}
${request}`;
}

export function buildRevisePrompt(brief: Brief, ctx: WeeklyContext, recipes: Recipe[], instruction: string): string {
  return `${contextBlock(ctx)}

${briefBlock(brief)}

Voici le menu actuel (JSON) :
${JSON.stringify(recipes)}

Consigne : ${instruction}
Renvoie le menu complet mis à jour (même nombre de recettes ; garde les identifiants des recettes inchangées).`;
}

export function buildReviseRecipePrompt(
  brief: Brief,
  ctx: WeeklyContext,
  recipe: Recipe,
  others: Recipe[],
  instruction: string,
): string {
  const titles = others.map((r) => r.title).join(", ") || "aucune";
  return `${contextBlock(ctx)}

${briefBlock(brief)}

Autres recettes du menu (garde de la variété et partage des ingrédients avec elles) : ${titles}.

Recette à modifier (JSON) :
${JSON.stringify(recipe)}

Consigne : ${instruction}
Renvoie uniquement cette recette mise à jour, pour ${servingsFor(brief)} portions, avec le même identifiant « ${recipe.id} ».`;
}
