import { describe, expect, it } from "vitest";
import { isRelevant, normalizeText, tokens } from "./text";

describe("normalizeText", () => {
  it("retire accents et majuscules", () => expect(normalizeText("  Crème Fraîche ")).toBe("creme fraiche"));
});

describe("tokens", () => {
  it("singularise et ignore les mots courts et vides", () => {
    expect(tokens("Soupe à l'oignons avec des tomates")).toEqual(["soupe", "oignon", "tomate"]);
  });
});

describe("isRelevant", () => {
  it("vrai si au moins un mot significatif est commun", () => {
    expect(isRelevant("tomates cerises", "AUCHAN BIO Tomates cerises rouges")).toBe(true);
  });
  it("faux sinon", () => expect(isRelevant("courgette", "Tomates rondes")).toBe(false));
});
