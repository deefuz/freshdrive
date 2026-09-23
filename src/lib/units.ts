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
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function parsePack(text: string): Quantity | null {
  const t = text.toLowerCase();
  const multi = t.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|cl|ml)\b/);
  if (multi) {
    const u = UNITS[multi[3]];
    return { value: round2(Number(multi[1]) * parseFrNumber(multi[2]) * u.factor), unit: u.unit };
  }
  const single = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|cl|ml)\b/);
  if (single) {
    const u = UNITS[single[2]];
    return { value: round2(parseFrNumber(single[1]) * u.factor), unit: u.unit };
  }
  const pieces = t.match(/(\d+)\s*(?:pièces?|pieces?|pces?|oeufs|œufs)\b/);
  if (pieces) return { value: Number(pieces[1]), unit: "pce" };
  return null;
}

export function parseUnitPrice(text: string): { value: number; unit: "kg" | "l" | "pce" } | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*€\s*\/\s*(kg|l|pce)\b/i);
  if (!m) return null;
  return { value: parseFrNumber(m[1]), unit: m[2].toLowerCase() as "kg" | "l" | "pce" };
}
