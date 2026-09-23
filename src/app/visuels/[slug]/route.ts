import { readVisual } from "@/lib/visuals";

/** Sert l'illustration SVG d'une recette (data/visuels). */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const svg = readVisual(slug);
  if (!svg) return new Response("Visuel introuvable", { status: 404 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-cache",
      // un SVG servi seul ne doit jamais exécuter de script
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
