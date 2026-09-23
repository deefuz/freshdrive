import type { Recipe } from "./recipes/schema";
import type { JobKind, WeekStatus } from "./store/weeks";
import type { Product, QtyUnit } from "./types";
import { round2 } from "./units";

export function formatEur(n: number): string {
  return `${round2(n).toFixed(2).replace(".", ",")} €`;
}

export function formatQty(value: number, unit: QtyUnit): string {
  const v = String(round2(value)).replace(".", ",");
  if (unit === "pce") return `${v} pièce${value > 1 ? "s" : ""}`;
  return `${v} ${unit}`;
}

export function productLabel(p: Pick<Product, "brand" | "name" | "pack" | "price" | "isOrganic" | "promo">): string {
  const parts = [`${p.brand ? `${p.brand} ` : ""}${p.name}`];
  if (p.pack) parts.push(formatQty(p.pack.value, p.pack.unit));
  parts.push(formatEur(p.price));
  if (p.isOrganic) parts.push("bio");
  if (p.promo) parts.push(p.promo.label);
  return parts.join(" · ");
}

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « 2026-09-23-2 » → « 23 septembre 2026 » */
export function formatWeekDate(weekId: string): string {
  const [y, m, d] = weekId.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export const WEEK_STATUS_LABELS: Record<WeekStatus, string> = {
  draft: "Brouillon",
  generating: "En préparation",
  ready: "Prête",
  pushed: "Envoyée au panier",
};

export const JOB_LABELS: Record<JobKind, string> = {
  create: "Préparation de la semaine",
  "revise-recipe": "Modification d'une recette",
  push: "Envoi au panier Auchan",
};

export const TAG_LABELS: Record<Recipe["tags"][number], string> = {
  kids_friendly: "Enfants",
  low_calorie: "Léger",
  vegan: "Vegan",
  vegetarian: "Végétarien",
  unprocessed: "Brut",
  quick: "Rapide",
};
