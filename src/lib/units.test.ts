import { describe, expect, it } from "vitest";
import { parseFrNumber, parsePack, parseUnitPrice, round2 } from "./units";

describe("parseFrNumber", () => {
  it("gère la virgule décimale", () => expect(parseFrNumber("11,96")).toBe(11.96));
});

describe("round2", () => {
  it("arrondit au centime", () => expect(round2(5.985)).toBe(5.99));
});

describe("parsePack", () => {
  it.each([
    ["France 250g 11,96€ / kg", { value: 250, unit: "g" }],
    ["Mélange de tomates anciennes France 1,5kg 5,99€ / kg", { value: 1500, unit: "g" }],
    ["Lait demi-écrémé 6x1L 1,70€ / l", { value: 6000, unit: "ml" }],
    ["Crème 20cl", { value: 200, unit: "ml" }],
    ["Oeufs plein air 6 pièces 0,35€ / pce", { value: 6, unit: "pce" }],
  ])("%s", (text, expected) => expect(parsePack(text)).toEqual(expected));

  it("renvoie null sans conditionnement lisible", () => {
    expect(parsePack("Tomates rondes en grappe France environ 3-4 fruits 3,29€ / pce")).toBeNull();
  });

  it("ne prend pas un multipack sans unité (8x2 barres)", () => {
    expect(parsePack("KINDER Bueno 340g 8x2 barres")).toEqual({ value: 340, unit: "g" });
  });
});

describe("parseUnitPrice", () => {
  it("lit le prix au kilo", () => expect(parseUnitPrice("250g 11,96€ / kg")).toEqual({ value: 11.96, unit: "kg" }));
  it("lit le prix à la pièce", () => expect(parseUnitPrice("3,29€ / pce")).toEqual({ value: 3.29, unit: "pce" }));
  it("renvoie null sinon", () => expect(parseUnitPrice("3,29€")).toBeNull());
});
