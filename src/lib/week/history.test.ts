import { describe, expect, it } from "vitest";
import { makeRecipe, makeWeek } from "../../../tests/helpers/factories";
import { recentSelectedTitles } from "./history";

function week(id: string, createdAt: string, titles: string[], selected: number[] = titles.map((_, i) => i)) {
  const recipes = titles.map((title, i) => makeRecipe({ id: `r${i}`, title }));
  return makeWeek({ id, createdAt, recipes, selectedRecipeIds: selected.map((i) => `r${i}`) });
}

describe("recentSelectedTitles", () => {
  it("titres des recettes retenues des 4 dernières semaines, les plus récentes d'abord", () => {
    const weeks = [
      week("2026-08-26-1", "2026-08-26T10:00:00.000Z", ["Trop ancienne"]),
      week("2026-09-02-1", "2026-09-02T10:00:00.000Z", ["Curry"]),
      week("2026-09-09-1", "2026-09-09T10:00:00.000Z", ["Gratin", "Non retenue"], [0]),
      week("2026-09-16-1", "2026-09-16T10:00:00.000Z", ["Tacos"]),
      week("2026-09-23-1", "2026-09-23T10:00:00.000Z", ["Soupe"]),
    ];
    expect(recentSelectedTitles(weeks)).toEqual(["Soupe", "Tacos", "Gratin", "Curry"]);
  });

  it("exclut la semaine en cours de création et les semaines sans recette retenue", () => {
    const weeks = [
      week("2026-09-23-2", "2026-09-23T12:00:00.000Z", ["En cours"]),
      week("2026-09-23-1", "2026-09-23T10:00:00.000Z", ["Brouillon"], []),
      week("2026-09-16-1", "2026-09-16T10:00:00.000Z", ["Tacos"]),
    ];
    expect(recentSelectedTitles(weeks, "2026-09-23-2")).toEqual(["Tacos"]);
  });

  it("sans doublon (casse et accents ignorés)", () => {
    const weeks = [
      week("2026-09-23-1", "2026-09-23T10:00:00.000Z", ["Gratin dauphinois"]),
      week("2026-09-16-1", "2026-09-16T10:00:00.000Z", ["gratin Dauphinois"]),
    ];
    expect(recentSelectedTitles(weeks)).toEqual(["Gratin dauphinois"]);
  });

  it("aucune semaine : liste vide", () => {
    expect(recentSelectedTitles([])).toEqual([]);
  });
});
