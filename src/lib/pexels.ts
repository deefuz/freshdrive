import { normalizeText } from "./text";

/** Photo d'un plat trouvée sur Pexels (https://www.pexels.com/api/). */
export interface PexelsPhoto {
  bytes: Buffer;
  /** crédit à afficher : « Photo : <auteur> / Pexels » */
  photographer: string;
  /** page de la photo sur pexels.com */
  pageUrl: string;
}

type Fetch = typeof fetch;

interface PexelsSearch {
  photos?: {
    url: string;
    alt?: string;
    photographer: string;
    src: { large: string };
  }[];
}

/** Mots du titre qui n'aident pas la recherche (articles, prépositions). */
const STOP = new Set(["a", "au", "aux", "de", "des", "du", "d", "en", "et", "la", "le", "les", "l", "ou", "sur", "avec"]);

/** « Galettes de sarrasin à l'œuf, champignons » → « galettes sarrasin oeuf champignons » (4 mots au plus) */
export function photoQuery(title: string): string {
  return normalizeText(title)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .slice(0, 4)
    .join(" ");
}

/**
 * Cherche une photo paysage du plat. Renvoie null si la clé manque, si rien ne correspond
 * ou si Pexels est injoignable : l'appelant retombe alors sur l'illustration dessinée.
 */
export async function fetchPexelsPhoto(
  title: string,
  apiKey: string | undefined = process.env.PEXELS_API_KEY,
  doFetch: Fetch = fetch,
): Promise<PexelsPhoto | null> {
  const query = photoQuery(title);
  if (!apiKey || !query) return null;
  try {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", `${query} plat`);
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("locale", "fr-FR");
    url.searchParams.set("per_page", "1");
    const res = await doFetch(url, { headers: { Authorization: apiKey } });
    if (!res.ok) return null;
    const photo = ((await res.json()) as PexelsSearch).photos?.[0];
    if (!photo) return null;
    const img = await doFetch(photo.src.large);
    if (!img.ok) return null;
    return { bytes: Buffer.from(await img.arrayBuffer()), photographer: photo.photographer, pageUrl: photo.url };
  } catch {
    return null;
  }
}
