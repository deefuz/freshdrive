import { describe, expect, it } from "vitest";
import { matchPenalty, processedMarkers } from "./relevance";

const ing = (name: string, searchQuery = name) => ({ name, searchQuery });

describe("processedMarkers", () => {
  it("repère les formes transformées, accents et pluriels compris", () => {
    expect(processedMarkers("AUCHAN Courgettes en rondelles")).toEqual(["en rondelles"]);
    expect(processedMarkers("Oignons rouges émincés")).toEqual(["émincé"]);
    expect(processedMarkers("Emmental râpé")).toEqual(["râpé"]);
    expect(processedMarkers("Purée de tomates")).toEqual(["purée"]);
    expect(processedMarkers("Carottes en dés surgelées")).toEqual(["en dés", "surgelé"]);
    expect(processedMarkers("Courgette")).toEqual([]);
  });
});

describe("matchPenalty", () => {
  it("vaut 1 pour le produit attendu", () => {
    expect(matchPenalty(ing("courgette"), "Courgettes")).toBe(1);
    expect(matchPenalty(ing("fromage frais nature", "fromage frais"), "AUCHAN BIO Fromage frais nature 400g")).toBe(1);
  });

  it("double le score d'une forme transformée que l'ingrédient ne demande pas", () => {
    expect(matchPenalty(ing("courgette"), "Courgettes en rondelles")).toBe(2);
    expect(matchPenalty(ing("oignon rouge"), "Oignons rouges émincés")).toBe(2);
    expect(matchPenalty(ing("oignon rouge émincé", "oignon rouge"), "Oignons rouges émincés")).toBe(1);
    expect(matchPenalty(ing("sauce soja"), "Sauce soja salée")).toBe(1);
  });

  it("pénalise une variété que l'ingrédient ne demande pas", () => {
    expect(matchPenalty(ing("fromage frais nature", "fromage frais"), "Fromage frais de chèvre")).toBeCloseTo(
      (1 + 0.5 / 3) * 1.6,
    );
    expect(matchPenalty(ing("fromage de chèvre"), "Fromage frais de chèvre")).toBe(1);
    expect(matchPenalty(ing("saumon"), "Saumon fumé")).toBeCloseTo(1.6);
  });

  it("pénalise un produit qui ne couvre qu'une partie des mots de l'ingrédient", () => {
    expect(matchPenalty(ing("tomates cerises"), "Tomates rondes")).toBeCloseTo(1.25);
  });
});
