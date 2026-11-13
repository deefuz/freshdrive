import fs from "node:fs";
import path from "node:path";
import { normalizeText } from "./text";

/** Visuels des recettes, un par titre : SVG dessinés (voir DESIGN.md) ou photos Pexels (.jpg + .json de crédit). */
export const VISUALS_DIR = "data/visuels";

/** « Galettes de sarrasin à l'œuf » → « galettes-de-sarrasin-a-l-oeuf » */
export function visualSlug(title: string): string {
  return normalizeText(title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function hasVisual(title: string, dir: string = VISUALS_DIR): boolean {
  const slug = visualSlug(title);
  return slug !== "" && (fs.existsSync(path.join(dir, `${slug}.svg`)) || fs.existsSync(path.join(dir, `${slug}.jpg`)));
}

/** Adresse du visuel d'une recette, ou null s'il n'a pas encore été créé. */
export function visualUrl(title: string, dir: string = VISUALS_DIR): string | null {
  return hasVisual(title, dir) ? `/visuels/${visualSlug(title)}` : null;
}

function writeAtomic(file: string, data: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

/** Enregistre le visuel d'une recette (écriture atomique). */
export function writeVisual(title: string, svg: string, dir: string = VISUALS_DIR): void {
  writeAtomic(path.join(dir, `${visualSlug(title)}.svg`), svg);
}

/** Enregistre une photo (jpg) et son crédit. Le crédit est écrit en dernier : sans lui la photo n'est pas « complète » pour l'affichage. */
export function writePhoto(
  title: string,
  photo: { bytes: Buffer; photographer: string; pageUrl: string },
  dir: string = VISUALS_DIR,
): void {
  const slug = visualSlug(title);
  writeAtomic(path.join(dir, `${slug}.jpg`), photo.bytes);
  writeAtomic(
    path.join(dir, `${slug}.json`),
    JSON.stringify({ source: "pexels", photographer: photo.photographer, pageUrl: photo.pageUrl }),
  );
}

export function readVisual(slug: string, dir: string = VISUALS_DIR): string | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const file = path.join(dir, `${slug}.svg`);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

/** Fichier servi pour un visuel : la photo si elle existe, sinon le SVG. */
export function readVisualFile(slug: string, dir: string = VISUALS_DIR): { body: Buffer; type: "image/jpeg" | "image/svg+xml" } | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const jpg = path.join(dir, `${slug}.jpg`);
  if (fs.existsSync(jpg)) return { body: fs.readFileSync(jpg), type: "image/jpeg" };
  const svg = readVisual(slug, dir);
  return svg === null ? null : { body: Buffer.from(svg), type: "image/svg+xml" };
}
