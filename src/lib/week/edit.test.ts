import { describe, expect, it } from "vitest";
import { makeMatch, makeNeed, makeProduct, makeRecipe, makeWeek } from "../../../tests/helpers/factories";
import type { Week } from "../store/weeks";
import {
  candidatesOf,
  chooseProduct,
  EditError,
  effectiveMatches,
  initialOverrides,
  productRows,
  reconcileOverrides,
  setPantry,
  toggleRecipe,
  weekTotals,
} from "./edit";

const tomates = makeProduct({ name: "Tomates", price: 2, pack: { value: 500, unit: "g" } });
const tomatesBio = makeProduct({ name: "Tomates bio", price: 3, pack: { value: 500, unit: "g" }, isOrganic: true });
const pates = makeProduct({
  name: "Pâtes",
  price: 1,
  pack: { value: 500, unit: "g" },
  promo: { label: "-50% sur le 2ème", kind: "price" },
});
const sel = makeProduct({ name: "Sel", price: 0.5, pack: { value: 1000, unit: "g" } });

function week(overrides: Partial<Week> = {}): Week {
  return makeWeek({
    brief: { dinners: 2, adults: 2, children: 0, budgetEur: 5, filters: [], notes: "", preferOrganic: false },
    recipes: [makeRecipe({ id: "a" }), makeRecipe({ id: "b" }), makeRecipe({ id: "c" })],
    selectedRecipeIds: ["a", "b"],
    matches: [
      makeMatch(makeNeed({ key: "tomates|g", perRecipe: { a: 400, c: 200 } }), tomates, [tomatesBio]),
      makeMatch(makeNeed({ key: "pates|g", perRecipe: { a: 500, b: 500 } }), pates),
      makeMatch(makeNeed({ key: "sel|g", perRecipe: { a: 5 }, pantryStaple: true }), sel),
    ],
    overrides: { products: {}, pantry: ["sel|g"] },
    ...overrides,
  });
}

describe("candidatesOf", () => {
  it("le produit choisi d'abord, puis les alternatives", () => {
    const [m] = week().matches;
    expect(candidatesOf(m).map((c) => c.product)).toEqual([tomates, tomatesBio]);
    expect(candidatesOf({ chosen: null, alternatives: m.alternatives }).map((c) => c.product)).toEqual([tomatesBio]);
  });

  it("ignore les doublons d'un même produit (semaines enregistrées avant le dédoublonnage)", () => {
    const [m] = week().matches;
    const doubled = { chosen: m.chosen, alternatives: [...m.alternatives, m.chosen!, ...m.alternatives] };
    expect(candidatesOf(doubled).map((c) => c.product)).toEqual([tomates, tomatesBio]);
  });
});

describe("weekTotals", () => {
  it("total des recettes retenues, placard exclu, économies promo déduites", () => {
    const t = weekTotals(week());
    expect(t.basket.lines.map((l) => [l.key, l.packs])).toEqual([
      ["tomates|g", 1],
      ["pates|g", 2],
    ]);
    expect(t).toMatchObject({ gross: 4, promoSaved: 0.5, loyalty: 0, net: 3.5, budget: 5, remaining: 1.5, overBudget: false });
  });

  it("au-dessus du budget", () => {
    const w = week();
    const t = weekTotals({ ...w, brief: { ...w.brief, budgetEur: 3 } });
    expect(t).toMatchObject({ net: 3.5, remaining: -0.5, overBudget: true });
  });
});

describe("chooseProduct / effectiveMatches", () => {
  it("remplace le produit choisi et recalcule le total", () => {
    const w = chooseProduct(week(), "tomates|g", tomatesBio.productId);
    expect(w.overrides.products).toEqual({ "tomates|g": tomatesBio.productId });
    const [m] = effectiveMatches(w);
    expect(m.chosen?.product).toBe(tomatesBio);
    expect(m.alternatives.map((a) => a.product)).toEqual([tomates]);
    expect(weekTotals(w).gross).toBe(5);
  });

  it("revenir au produit proposé efface le choix", () => {
    const w = chooseProduct(chooseProduct(week(), "tomates|g", tomatesBio.productId), "tomates|g", tomates.productId);
    expect(w.overrides.products).toEqual({});
  });

  it("refuse un produit qui n'est pas un candidat, ou un ingrédient inconnu", () => {
    expect(() => chooseProduct(week(), "tomates|g", "p-inconnu")).toThrow(EditError);
    expect(() => chooseProduct(week(), "truffe|g", tomates.productId)).toThrow(EditError);
  });
});

describe("setPantry", () => {
  it("décocher « au placard » remet l'ingrédient dans le panier", () => {
    expect(weekTotals(setPantry(week(), "sel|g", false)).gross).toBe(4.5);
    expect(setPantry(week(), "tomates|g", true).overrides.pantry).toEqual(["sel|g", "tomates|g"]);
  });

  it("refuse un ingrédient inconnu", () => {
    expect(() => setPantry(week(), "truffe|g", true)).toThrow(EditError);
  });
});

describe("toggleRecipe", () => {
  it("au plus N recettes, dans l'ordre du menu", () => {
    expect(() => toggleRecipe(week(), "c", true)).toThrow(/déjà choisi 2 recettes/);
    const w = toggleRecipe(toggleRecipe(week(), "a", false), "c", true);
    expect(w.selectedRecipeIds).toEqual(["b", "c"]);
    expect(() => toggleRecipe(w, "a", true)).toThrow(EditError);
    expect(toggleRecipe(toggleRecipe(w, "c", false), "a", true).selectedRecipeIds).toEqual(["a", "b"]);
  });

  it("message au singulier pour une seule recette", () => {
    const one = week();
    one.brief = { ...one.brief, dinners: 1 };
    one.selectedRecipeIds = ["a"];
    expect(() => toggleRecipe(one, "b", true)).toThrow("Tu as déjà choisi 1 recette : décoches-en une d'abord.");
  });

  it("refuse une recette inconnue", () => {
    expect(() => toggleRecipe(week(), "zzz", true)).toThrow(EditError);
  });
});

describe("productRows", () => {
  it("un ingrédient par ligne pour les recettes retenues, placard compris", () => {
    const rows = productRows(week());
    expect(rows.map((r) => [r.key, r.quantity, r.inPantry, r.line?.packs ?? null])).toEqual([
      ["tomates|g", 400, false, 1],
      ["pates|g", 1000, false, 2],
      ["sel|g", 5, true, null],
    ]);
    expect(rows[0].options.map((o) => o.product)).toEqual([tomates, tomatesBio]);
  });
});

describe("initialOverrides / reconcileOverrides", () => {
  it("les basiques de placard sont cochés au départ, sauf si on les inclut", () => {
    expect(initialOverrides(week().matches)).toEqual({ products: {}, pantry: ["sel|g"] });
    expect(initialOverrides(week().matches, true)).toEqual({ products: {}, pantry: [] });
  });

  it("garde les choix encore valides, oublie ceux des ingrédients recherchés à nouveau, coche les nouveaux basiques", () => {
    const old = week().matches;
    const next = [old[0], old[1], makeMatch(makeNeed({ key: "huile|ml", pantryStaple: true }), makeProduct())];
    const r = reconcileOverrides(
      { products: { "tomates|g": tomatesBio.productId, "pates|g": "p-x" }, pantry: ["sel|g"] },
      old,
      next,
      new Set(["pates|g", "huile|ml"]),
    );
    expect(r).toEqual({ products: { "tomates|g": tomatesBio.productId }, pantry: ["huile|ml"] });
  });
});
