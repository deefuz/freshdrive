/**
 * Les pages Leclerc Drive portent leurs données en JSON dans des appels
 * `Utilitaires.widget.initOptions('<idWidget>', { … });` : on repère l'appel, puis on isole l'objet
 * en comptant les accolades (hors chaînes) avant de le passer à JSON.parse.
 */

const INIT_CALL = /Utilitaires\.widget\.initOptions\('([^']+)',\s*/g;

/** Fin de l'objet JSON qui commence à `start` (index de la dernière accolade), ou -1. */
function objectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}

/** Options du premier widget dont l'identifiant correspond ; null s'il est absent ou illisible. */
export function findWidget<T>(html: string, id: RegExp): T | null {
  for (const m of html.matchAll(INIT_CALL)) {
    if (!id.test(m[1])) continue;
    const start = m.index + m[0].length;
    if (html[start] !== "{") continue;
    const end = objectEnd(html, start);
    if (end < 0) return null;
    try {
      return JSON.parse(html.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
  return null;
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Décode les entités HTML que Leclerc laisse dans ses libellés (`&#233;`, `&#39;`, `&amp;`…). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}

/** Vrai si la page a été servie à un client connecté. */
export function isLoggedIn(html: string): boolean {
  return /"fClientConnecte"\s*:\s*true/.test(html);
}
