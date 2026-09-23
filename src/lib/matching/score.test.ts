import { describe, expect, it } from "vitest";
import { makeProduct, makeRecipe } from "../../../tests/helpers/factories";
import { aggregateNeeds } from "./needs";
import { packsNeeded, scoreCandidate } from "./score";

const ing = (searchQuery: string, quantity: number, unit: "g" | "ml" | "pce" = "g", pantryStaple = false) => ({
  name: searchQuery,
  searchQuery,
  quantity,
  unit,
  pantryStaple,
  fromPromo: false,
});

describe("aggregateNeeds", () => {
  it("regroupe un même ingrédient entre recettes (insensible à la casse et aux accents)", () => {
    const needs = aggregateNeeds([
      makeRecipe({ id: "a", ingredients: [ing("Crème fraîche", 200, "ml"), ing("sel", 5, "g", true)] }),
      makeRecipe({ id: "b", ingredients: [ing("creme fraiche", 100, "ml")] }),
    ]);
    expect(needs).toHaveLength(2);
    expect(needs[0]).toMatchObject({ key: "creme fraiche|ml", quantity: 300, perRecipe: { a: 200, b: 100 }, pantryStaple: false });
    expect(needs[1]).toMatchObject({ key: "sel|g", pantryStaple: true });
  });
});

describe("packsNeeded", () => {
  it("arrondit au paquet supérieur", () => {
    expect(packsNeeded({ quantity: 500, unit: "g" }, makeProduct({ pack: { value: 250, unit: "g" } }))).toEqual({ packs: 2, uncertain: false });
    expect(packsNeeded({ quantity: 300, unit: "g" }, makeProduct({ pack: { value: 1000, unit: "g" } }))).toEqual({ packs: 1, uncertain: false });
  });
  it("compte les pièces pour un produit vendu à la pièce", () => {
    expect(packsNeeded({ quantity: 3, unit: "pce" }, makeProduct({ pack: null, unitPriceUnit: "pce" }))).toEqual({ packs: 3, uncertain: false });
  });
  it("marque incertain si les unités ne se comparent pas", () => {
    expect(packsNeeded({ quantity: 400, unit: "g" }, makeProduct({ pack: null, unitPriceUnit: "pce" }))).toEqual({ packs: 1, uncertain: true });
  });
  it("marque incertain pour une pièce sans conditionnement ni prix à la pièce", () => {
    expect(packsNeeded({ quantity: 3, unit: "pce" }, makeProduct({ pack: null, unitPriceUnit: "kg" }))).toEqual({ packs: 1, uncertain: true });
  });
});

describe("scoreCandidate", () => {
  const need = { quantity: 500, unit: "g" as const };
  const opts = { preferOrganic: false, unprocessed: false };

  it("calcule le coût réel et pénalise le gaspillage", () => {
    const big = scoreCandidate(need, makeProduct({ price: 7.99, pack: { value: 1000, unit: "g" } }), opts);
    const small = scoreCandidate(need, makeProduct({ price: 2.99, pack: { value: 250, unit: "g" } }), opts);
    expect(big.cost).toBe(7.99);
    expect(small.cost).toBe(5.98);
    expect(big.score).toBeCloseTo(7.99 * 1.15);
    expect(small.score).toBeLessThan(big.score);
  });

  it("le bio l'emporte à prix proche seulement si on le préfère", () => {
    const conv = makeProduct({ price: 3, pack: { value: 500, unit: "g" } });
    const bio = makeProduct({ price: 3.4, pack: { value: 500, unit: "g" }, isOrganic: true });
    const s = (p: typeof conv, preferOrganic: boolean) => scoreCandidate(need, p, { preferOrganic, unprocessed: false }).score;
    expect(s(bio, true)).toBeLessThan(s(conv, true));
    expect(s(bio, false)).toBeGreaterThan(s(conv, false));
  });

  it("favorise une vraie promo et pénalise une quantité incertaine", () => {
    const base = { price: 3, pack: { value: 500, unit: "g" as const } };
    expect(scoreCandidate(need, makeProduct({ ...base, promo: { label: "-30%", kind: "price" } }), opts).score).toBeCloseTo(2.7);
    const uncertain = scoreCandidate(need, makeProduct({ price: 3, pack: null }), opts);
    expect(uncertain.uncertainQuantity).toBe(true);
    expect(uncertain.score).toBeCloseTo(3.9);
  });

  it("applique la pénalité de pertinence quand le besoin porte un nom", () => {
    const named = { quantity: 500, unit: "g" as const, name: "courgette", searchQuery: "courgette" };
    const frozen = makeProduct({ name: "Courgettes en rondelles", price: 2, pack: { value: 500, unit: "g" } });
    expect(scoreCandidate(named, frozen, opts).score).toBeCloseTo(4);
    expect(scoreCandidate({ quantity: 500, unit: "g" }, frozen, opts).score).toBeCloseTo(2);
  });
});
