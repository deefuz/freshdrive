const STOPWORDS = new Set(["des", "les", "aux", "avec", "pour", "sans", "une", "par", "sur"]);

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function tokens(s: string): string[] {
  return normalizeText(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .map((t) => (t.length > 3 ? t.replace(/[sx]$/, "") : t));
}

export function isRelevant(query: string, productName: string): boolean {
  const q = new Set(tokens(query));
  return tokens(productName).some((t) => q.has(t));
}
