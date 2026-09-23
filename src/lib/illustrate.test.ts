import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { makeRecipe } from "../../tests/helpers/factories";
import { buildVisualsPrompt, illustrateRecipes, sanitizeSvg, styleGuide } from "./illustrate";
import { visualSlug } from "./visuals";

const svg = (body = '<rect width="640" height="400" fill="#efe9de"/>') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400">${body}</svg>`;

describe("sanitizeSvg", () => {
  it("accepte un SVG au bon format (espaces autour retirés)", () => {
    expect(sanitizeSvg(`  ${svg()}\n`)).toBe(svg());
  });

  it.each([
    ["script", svg("<script>alert(1)</script>")],
    ["gestionnaire d'événement", svg('<rect onclick="x()" width="1" height="1"/>')],
    ["lien externe", svg('<image href="https://exemple.fr/a.png"/>')],
    ["foreignObject", svg("<foreignObject><div/></foreignObject>")],
    ["mauvais cadre", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>'],
    ["pas un SVG", "<div>coucou</div>"],
    ["trop lourd", svg("x".repeat(80_000))],
  ])("refuse : %s", (_label, input) => {
    expect(sanitizeSvg(input)).toBeNull();
  });

  it("autorise les références internes (use, clipPath)", () => {
    const withUse = svg('<defs><g id="a"><circle r="3"/></g></defs><use href="#a" x="5"/>');
    expect(sanitizeSvg(withUse)).toBe(withUse);
  });
});

describe("styleGuide / buildVisualsPrompt", () => {
  it("reprend la section « Illustrations de recettes » de DESIGN.md", () => {
    expect(styleGuide()).toContain("viewBox");
    expect(styleGuide()).not.toContain("### Budget bar");
  });

  it("liste les recettes à dessiner avec leur identifiant", () => {
    const prompt = buildVisualsPrompt([makeRecipe({ id: "dahl", title: "Dahl doux", summary: "Lentilles corail" })]);
    expect(prompt).toContain("- dahl : Dahl doux. Lentilles corail");
    expect(prompt).toContain("<svg");
  });
});

describe("illustrateRecipes", () => {
  const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), "visuels-"));

  it("ne dessine que les recettes sans visuel, une seule fois par titre, et écrit les fichiers valides", async () => {
    const d = dir();
    fs.writeFileSync(path.join(d, `${visualSlug("Déjà dessinée")}.svg`), svg());
    const recipes = [
      makeRecipe({ id: "a", title: "Déjà dessinée" }),
      makeRecipe({ id: "b", title: "Pizza" }),
      makeRecipe({ id: "c", title: "Pizza" }),
      makeRecipe({ id: "d", title: "Soupe" }),
    ];
    const draw = vi.fn(async () => [
      { recipeId: "b", svg: svg() },
      { recipeId: "d", svg: svg("<script/>") },
    ]);
    const result = await illustrateRecipes(recipes, draw, d);
    expect(draw).toHaveBeenCalledWith([recipes[1], recipes[3]]);
    expect(result).toEqual({ drawn: ["Pizza"], rejected: ["Soupe"] });
    expect(fs.existsSync(path.join(d, "pizza.svg"))).toBe(true);
    expect(fs.existsSync(path.join(d, "soupe.svg"))).toBe(false);
  });

  it("dessine par lots de 3 et garde les lots réussis quand un lot échoue", async () => {
    const recipes = ["A", "B", "C", "D"].map((t) => makeRecipe({ id: t.toLowerCase(), title: t }));
    const draw = vi
      .fn()
      .mockResolvedValueOnce(recipes.slice(0, 3).map((r) => ({ recipeId: r.id, svg: svg() })))
      .mockRejectedValueOnce(new Error("Claude Code n'a pas répondu"));
    const result = await illustrateRecipes(recipes, draw, dir());
    expect(draw).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ drawn: ["A", "B", "C"], rejected: ["D"], error: "Claude Code n'a pas répondu" });
  });

  it("rien à dessiner : aucun appel", async () => {
    const draw = vi.fn();
    expect(await illustrateRecipes([], draw, dir())).toEqual({ drawn: [], rejected: [] });
    expect(draw).not.toHaveBeenCalled();
  });
});
