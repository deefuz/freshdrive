import fs from "node:fs";
import path from "node:path";
import { normalizeText } from "./text";

/** Illustrations des recettes (SVG dessinés à la main, voir DESIGN.md), une par titre. */
export const VISUALS_DIR = "data/visuels";

/** « Galettes de sarrasin à l'œuf » → « galettes-de-sarrasin-a-l-oeuf » */
export function visualSlug(title: string): string {
  return normalizeText(title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Adresse du visuel d'une recette, ou null s'il n'a pas encore été dessiné. */
export function visualUrl(title: string, dir: string = VISUALS_DIR): string | null {
  const slug = visualSlug(title);
  return slug && fs.existsSync(path.join(dir, `${slug}.svg`)) ? `/visuels/${slug}` : null;
}

export function readVisual(slug: string, dir: string = VISUALS_DIR): string | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const file = path.join(dir, `${slug}.svg`);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}
