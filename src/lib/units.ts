import type { Quantity, QtyUnit } from "./types";

const UNITS: Record<string, { unit: QtyUnit; factor: number }> = {
  kg: { unit: "g", factor: 1000 },
  g: { unit: "g", factor: 1 },
  l: { unit: "ml", factor: 1000 },
  cl: { unit: "ml", factor: 10 },
  ml: { unit: "ml", factor: 1 },
};

export function parseFrNumber(s: string): number {
  return Number(s.replace(/\s/g, "").replace(",", "."));
}

export function round2(n: number): number {
  return Number(`${Math.round(Number(`${n}e2`))}e-2`);
}

export function parsePack(text: string): Quantity | null {
  const t = text.toLowerCase();
  const multi = t.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|cl|ml)\b/);
  if (multi) {
    const u = UNITS[multi[3]];
    const value = round2(Number(multi[1]) * parseFrNumber(multi[2]) * u.factor);
    return value === 0 ? null : { value, unit: u.unit };
  }
  const single = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|cl|ml)\b/);
  if (single) {
    const u = UNITS[single[2]];
    const value = round2(parseFrNumber(single[1]) * u.factor);
    return value === 0 ? null : { value, unit: u.unit };
  }
  const environ = t.match(/environ\s+(\d+)(?:\s*-\s*\d+)?\s*(?:fruits?|pieces?|pièces?|legumes?|légumes?)(?![a-zà-ÿ])/);
  if (environ) {
    const value = Number(environ[1]);
    return value === 0 ? null : { value, unit: "pce" };
  }
  const pieces = t.match(/(\d+)\s*(?:pièces?|pieces?|pces?|oeufs|œufs)\b/);
  if (pieces) {
    const value = Number(pieces[1]);
    return value === 0 ? null : { value, unit: "pce" };
  }
  const xOnly = t.match(/x\s*(\d+)\b(?!\s*(?:kg|g|l|cl|ml)\b)/);
  if (xOnly) {
    const value = Number(xOnly[1]);
    return value === 0 ? null : { value, unit: "pce" };
  }
  return null;
}

export function parseUnitPrice(text: string): { value: number; unit: "kg" | "l" | "pce" } | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*€\s*\/\s*(kg|l|pce)\b/i);
  if (!m) return null;
  return { value: parseFrNumber(m[1]), unit: m[2].toLowerCase() as "kg" | "l" | "pce" };
}
