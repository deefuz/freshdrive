const STOPWORDS = new Set(["des", "les", "aux", "avec", "pour", "sans", "une", "par", "sur"]);

export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
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
