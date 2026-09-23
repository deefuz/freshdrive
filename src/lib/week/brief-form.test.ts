import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE } from "../profile/profile";
import { applyHousehold, DEFAULT_BRIEF, parseBriefForm, withProfile } from "./brief-form";

function form(entries: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

const base: [string, string][] = [
  ["dinners", "4"],
  ["adults", "2"],
  ["children", "2"],
  ["budgetEur", "60,5"],
];

describe("parseBriefForm", () => {
  it("lit un brief complet (virgule décimale, cases à cocher, précisions nettoyées)", () => {
    const r = parseBriefForm(
      form([...base, ["filters", "kids_friendly"], ["filters", "vegan"], ["notes", "  pas de poisson "], ["preferOrganic", "on"]]),
    );
    expect(r).toEqual({
      ok: true,
      brief: {
        dinners: 4,
        adults: 2,
        children: 2,
        budgetEur: 60.5,
        filters: ["kids_friendly", "vegan"],
        notes: "pas de poisson",
        preferOrganic: true,
      },
    });
  });

  it("cases décochées : aucun filtre, pas de préférence bio", () => {
    expect(parseBriefForm(form(base))).toMatchObject({ ok: true, brief: { filters: [], preferOrganic: false, notes: "" } });
  });

  it("arrondit le budget au centime", () => {
    const r = parseBriefForm(form([...base.slice(0, 3), ["budgetEur", "59,999"]]));
    expect(r).toMatchObject({ ok: true, brief: { budgetEur: 60 } });
  });

  it("refuse des valeurs invalides en nommant les champs en français", () => {
    const r = parseBriefForm(form([["dinners", "9"], ["adults", "0"], ["children", "1"], ["budgetEur", "abc"]]));
    expect(r).toEqual({
      ok: false,
      error: "Vérifie le nombre de dîners (1 à 7), le nombre d'adultes (au moins 1), le budget (un montant en euros).",
    });
  });

  it("refuse un filtre inconnu", () => {
    expect(parseBriefForm(form([...base, ["filters", "carnivore"]]))).toEqual({
      ok: false,
      error: "Vérifie les contraintes.",
    });
  });
});

describe("withProfile", () => {
  const profile = { ...EMPTY_PROFILE, appliances: ["oven" as const] };

  it("joint le profil actuel au brief, à la place d'un ancien", () => {
    const old = withProfile(DEFAULT_BRIEF, { ...EMPTY_PROFILE, habits: "ancien" });
    expect(withProfile(old, profile).profile).toEqual(profile);
  });

  it("retire le profil s'il est vide", () => {
    expect(withProfile(withProfile(DEFAULT_BRIEF, profile), EMPTY_PROFILE)).not.toHaveProperty("profile");
  });
});

describe("applyHousehold", () => {
  const member = (name: string, kind: "adult" | "child", allergies: ("peanuts" | "milk")[] = []) => ({
    name,
    kind,
    age: null,
    allergies,
    otherAllergies: "",
    dislikes: "",
  });
  const profile = {
    ...EMPTY_PROFILE,
    members: [member("Alex", "adult"), member("Sam", "adult", ["milk"]), member("Léa", "child", ["peanuts"])],
  };

  it("compte les présents et les invités, et ne garde que les présents dans le profil", () => {
    const result = applyHousehold(
      form([
        ["present", "0"],
        ["present", "2"],
        ["guestAdults", "1"],
        ["guestChildren", ""],
      ]),
      profile,
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.form.get("adults")).toBe("2");
    expect(result.form.get("children")).toBe("1");
    expect(result.profile.members.map((m) => m.name)).toEqual(["Alex", "Léa"]);
  });

  it("refuse une semaine sans adulte", () => {
    expect(applyHousehold(form([["present", "2"]]), profile)).toEqual({
      ok: false,
      error: "Coche au moins un adulte, ou ajoute un invité adulte.",
    });
  });

  it("refuse un nombre d'invités invalide", () => {
    expect(applyHousehold(form([["present", "0"], ["guestChildren", "-1"]]), profile)).toMatchObject({ ok: false });
  });

  it("sans membre dans le profil : le formulaire est gardé tel quel", () => {
    const f = form([["adults", "2"]]);
    expect(applyHousehold(f, EMPTY_PROFILE)).toEqual({ ok: true, form: f, profile: EMPTY_PROFILE });
  });
});
