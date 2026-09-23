import { describe, expect, it } from "vitest";
import { parseBriefForm } from "./brief-form";

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
