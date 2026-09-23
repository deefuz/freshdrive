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

export type HouseholdResult = { ok: true; form: FormData; profile: Profile } | { ok: false; error: string };

/**
 * Foyer de la semaine d'après le profil : les membres cochés (`present`, leur rang dans le profil) plus les invités.
 * Donne un formulaire avec `adults` et `children` calculés, et le profil réduit aux présents (seules leurs allergies
 * et préférences comptent). Sans membre dans le profil, le formulaire est gardé tel quel.
 */
export function applyHousehold(form: FormData, profile: Profile): HouseholdResult {
  if (!profile.members.length) return { ok: true, form, profile };
  const present = new Set(form.getAll("present").map(Number));
  const members = profile.members.filter((_, i) => present.has(i));
  const guest = (key: string) => {
    const raw = String(form.get(key) ?? "").trim();
    return raw === "" ? 0 : Number(raw);
  };
  const guestAdults = guest("guestAdults");
  const guestChildren = guest("guestChildren");
  if (![guestAdults, guestChildren].every((n) => Number.isInteger(n) && n >= 0 && n <= 20)) {
    return { ok: false, error: "Vérifie le nombre d'invités (un nombre entier, 0 si personne)." };
  }
  const adults = members.filter((m) => m.kind === "adult").length + guestAdults;
  const children = members.filter((m) => m.kind === "child").length + guestChildren;
  if (adults < 1) return { ok: false, error: "Coche au moins un adulte, ou ajoute un invité adulte." };
  const next = new FormData();
  for (const [key, value] of form.entries()) next.append(key, value);
  next.set("adults", String(adults));
  next.set("children", String(children));
  return { ok: true, form: next, profile: { ...profile, members } };
}
