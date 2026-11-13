import { readVisualFile } from "@/lib/visuals";

/** Sert le visuel d'une recette (data/visuels) : photo Pexels ou illustration SVG. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const visual = readVisualFile(slug);
  if (!visual) return new Response("Visuel introuvable", { status: 404 });
  return new Response(new Uint8Array(visual.body), {
    headers: {
      "Content-Type": visual.type === "image/svg+xml" ? "image/svg+xml; charset=utf-8" : visual.type,
      "Cache-Control": "no-cache",
      // un SVG servi seul ne doit jamais exécuter de script
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
