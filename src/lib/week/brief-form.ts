import { EMPTY_PROFILE, type Profile, profilePromptBlock } from "../profile/profile";
import { type Brief, BriefSchema, type DietFilter } from "../recipes/brief";
import { round2 } from "../units";

export const DEFAULT_BRIEF: Brief = {
  dinners: 4,
  adults: 2,
  children: 2,
  budgetEur: 60,
  filters: ["kids_friendly", "unprocessed"],
  notes: "",
  preferOrganic: true,
};

export const FILTER_UI_LABELS: Record<DietFilter, string> = {
  kids_friendly: "Adapté aux enfants",
  low_calorie: "Peu calorique",
  vegan: "Vegan",
  unprocessed: "Sans produits transformés",
};

const FIELD_LABELS: Record<string, string> = {
  dinners: "le nombre de dîners (1 à 7)",
  adults: "le nombre d'adultes (au moins 1)",
  children: "le nombre d'enfants",
  budgetEur: "le budget (un montant en euros)",
  filters: "les contraintes",
  notes: "les précisions",
  preferOrganic: "le bio",
};

export type BriefFormResult = { ok: true; brief: Brief } | { ok: false; error: string };

function readNumber(form: FormData, key: string): number {
  const raw = String(form.get(key) ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  return raw === "" ? Number.NaN : Number(raw);
}

export function parseBriefForm(form: FormData): BriefFormResult {
  const budget = readNumber(form, "budgetEur");
  const result = BriefSchema.safeParse({
    dinners: readNumber(form, "dinners"),
    adults: readNumber(form, "adults"),
    children: readNumber(form, "children"),
    budgetEur: Number.isFinite(budget) ? round2(budget) : budget,
    filters: form.getAll("filters").map(String),
    notes: String(form.get("notes") ?? "")
      .trim()
      .slice(0, 1000),
    preferOrganic: form.get("preferOrganic") === "on",
  });
  if (result.success) return { ok: true, brief: result.data };
  const fields = [...new Set(result.error.issues.map((i) => String(i.path[0])))];
  return { ok: false, error: `Vérifie ${fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}.` };
}

/** Brief de la semaine avec le profil actuel du foyer (retiré s'il est vide). */
export function withProfile(brief: Brief, profile: Profile = EMPTY_PROFILE): Brief {
  const rest = { ...brief };
  delete rest.profile;
  return profilePromptBlock(profile) ? { ...rest, profile } : rest;
}
