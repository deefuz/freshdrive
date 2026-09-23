import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Recipe } from "./recipes/schema";
import { hasVisual, VISUALS_DIR, writeVisual } from "./visuals";

/** Réponse attendue de Claude : un SVG par recette. */
export const VisualsSchema = z.object({
  visuals: z.array(
    z.object({
      recipeId: z.string().describe("identifiant de la recette dessinée"),
      svg: z.string().describe('SVG complet, de <svg à </svg>, viewBox="0 0 640 400"'),
    }),
  ),
});
export type DrawnVisual = z.infer<typeof VisualsSchema>["visuals"][number];

const MAX_SVG_LENGTH = 60_000;
/** recettes dessinées par appel à Claude : environ 12 000 caractères de SVG chacune */
export const ILLUSTRATION_BATCH = 3;
const FORBIDDEN = [
  /<script/i,
  /<foreignObject/i,
  /<iframe/i,
  /\son[a-z]+\s*=/i, // gestionnaires d'événements
  /javascript:/i,
  /(?:xlink:)?href\s*=\s*["'](?!#)/i, // seules les références internes (#id) sont permises
  /url\(\s*["']?(?!#)/i,
];

/** SVG sûr et au bon format, ou null. Les visuels ne sont jamais que des dessins : aucun script, aucune ressource externe. */
export function sanitizeSvg(raw: string): string | null {
  const svg = raw.trim();
  if (svg.length > MAX_SVG_LENGTH) return null;
  if (!/^<svg\b[^>]*>/i.test(svg) || !/<\/svg>$/i.test(svg)) return null;
  if (!/viewBox\s*=\s*["']0 0 640 400["']/.test(svg)) return null;
  if (FORBIDDEN.some((re) => re.test(svg))) return null;
  return svg;
}

const FALLBACK_GUIDE = `Vue de dessus d'un plat sur une nappe, style illustration plate : aplats sans contour ni dégradé,
2 à 3 tons par aliment, assiette crème avec une ombre douce, serviette et couverts en accessoires, aucun texte.`;

/** Section « Illustrations de recettes » de DESIGN.md : la même règle pour les dessins faits à la main et ceux de l'app. */
export function styleGuide(designFile: string = path.join(process.cwd(), "DESIGN.md")): string {
  try {
    const design = fs.readFileSync(designFile, "utf8");
    const start = design.indexOf("### Illustrations de recettes");
    if (start < 0) return FALLBACK_GUIDE;
    const end = design.indexOf("\n### ", start + 4);
    return design.slice(start, end < 0 ? undefined : end).trim();
  } catch {
    return FALLBACK_GUIDE;
  }
}

function example(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "src/lib/illustration-example.svg"), "utf8").trim();
  } catch {
    return "";
  }
}

export function buildVisualsPrompt(recipes: Recipe[]): string {
  const list = recipes
    .map((r) => {
      const main = r.ingredients
        .filter((i) => !i.pantryStaple)
        .map((i) => i.name)
        .slice(0, 8)
        .join(", ");
      return `- ${r.id} : ${r.title}. ${r.summary}${main ? ` (ingrédients : ${main})` : ""}`;
    })
    .join("\n");
  const ref = example();
  return `Tu es l'illustrateur de FreshDrive, une app de box repas. Dessine, pour chaque recette ci-dessous, une illustration SVG du plat servi, en respectant strictement ce guide de style :

${styleGuide()}

Contraintes techniques : SVG autonome commençant par <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400">, uniquement des formes (rect, circle, ellipse, path, g, use, defs, clipPath), aucune image, aucun lien externe, aucun script, aucun texte, moins de 12 000 caractères. Les ingrédients principaux du titre doivent être reconnaissables. Varie la nappe et les accessoires d'une recette à l'autre.
${ref ? `\nExemple de référence (Dahl doux de lentilles corail, pains poêlés et raïta), pour le niveau de détail et le style :\n${ref}\n` : ""}
Recettes à dessiner (identifiant : titre) :
${list}

Réponds avec un SVG par recette, avec son identifiant.`;
}

export interface IllustrateResult {
  /** titres dessinés et enregistrés */
  drawn: string[];
  /** titres dont le dessin a été refusé (format ou sécurité) ou n'est pas revenu */
  rejected: string[];
  /** première erreur de Claude, s'il y en a eu */
  error?: string;
}

/** Dessine les recettes qui n'ont pas encore de visuel (une fois par titre) et enregistre les SVG valides. */
export async function illustrateRecipes(
  recipes: Recipe[],
  draw: (recipes: Recipe[]) => Promise<DrawnVisual[]>,
  dir: string = VISUALS_DIR,
): Promise<IllustrateResult> {
  const seen = new Set<string>();
  const missing = recipes.filter((r) => {
    if (seen.has(r.title) || hasVisual(r.title, dir)) return false;
    seen.add(r.title);
    return true;
  });
  const result: IllustrateResult = { drawn: [], rejected: [] };
  // par petits lots, enregistrés au fur et à mesure : un lot en échec ne fait pas perdre les autres
  for (let i = 0; i < missing.length; i += ILLUSTRATION_BATCH) {
    const batch = missing.slice(i, i + ILLUSTRATION_BATCH);
    let drawnById = new Map<string, string>();
    try {
      drawnById = new Map((await draw(batch)).map((v) => [v.recipeId, v.svg]));
    } catch (e) {
      result.error ??= (e as Error).message;
    }
    for (const r of batch) {
      const svg = sanitizeSvg(drawnById.get(r.id) ?? "");
      if (svg) {
        writeVisual(r.title, svg, dir);
        result.drawn.push(r.title);
      } else {
        result.rejected.push(r.title);
      }
    }
  }
  return result;
}
