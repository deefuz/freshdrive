import { describe, expect, it, vi } from "vitest";
import { makeRecipe } from "../../../tests/helpers/factories";
import type { WeeklyContext } from "../context/build";
import type { ArbiterItem } from "../matching/arbiter";
import type { Brief } from "../recipes/brief";
import { createClaudeCodeBackend, selectBackend } from "./backend";
import type { ExecFn } from "./claude-cli";

const brief: Brief = { dinners: 4, adults: 2, children: 2, budgetEur: 60, filters: [], notes: "", preferOrganic: false };
const ctx: WeeklyContext = {
  generatedAt: "2026-10-20T08:00:00.000Z",
  season: "automne",
  seasonalProduce: ["potiron"],
  events: [],
  promos: [],
  antiGaspi: [],
  themes: [],
};

function fakeExec(output: unknown) {
  return vi.fn<ExecFn>(async () => ({
    stdout: JSON.stringify([{ type: "result", subtype: "success", is_error: false, structured_output: output }]),
    stderr: "",
    code: 0,
    timedOut: false,
    notFound: false,
  }));
}
const argsOf = (exec: ReturnType<typeof fakeExec>) => exec.mock.calls[0][1];
const promptOf = (exec: ReturnType<typeof fakeExec>) => argsOf(exec)[1];
const schemaOf = (exec: ReturnType<typeof fakeExec>) => {
  const args = argsOf(exec);
  return JSON.parse(args[args.indexOf("--json-schema") + 1]);
};

describe("createClaudeCodeBackend", () => {
  it("generateMenu : rôle + demande dans le prompt, schéma du menu", async () => {
    const recipes = [makeRecipe({ id: "a" }), makeRecipe({ id: "b" })];
    const exec = fakeExec({ recipes });
    const backend = createClaudeCodeBackend({ exec });
    expect(backend).toMatchObject({ name: "claude-code", label: "Claude Code (abonnement)" });
    await expect(backend.generateMenu(brief, ctx)).resolves.toEqual(recipes);
    expect(promptOf(exec)).toMatch(/^Tu es le chef/);
    expect(promptOf(exec)).toContain("6 recettes");
    expect(schemaOf(exec).properties.recipes).toBeDefined();
  });

  it("generateMenu transmet les recettes à éviter (même prompt que l'API)", async () => {
    const exec = fakeExec({ recipes: [] });
    await createClaudeCodeBackend({ exec }).generateMenu(brief, ctx, { avoidTitles: ["Curry de lentilles", "Tacos"] });
    expect(promptOf(exec)).toContain(
      "à éviter (ni la même recette, ni une variante très proche) : Curry de lentilles ; Tacos.",
    );
  });

  it("generateMenu refuse des identifiants de recette en double", async () => {
    const exec = fakeExec({ recipes: [makeRecipe({ id: "a" }), makeRecipe({ id: "a" })] });
    await expect(createClaudeCodeBackend({ exec }).generateMenu(brief, ctx)).rejects.toThrow(/en double/);
  });

  it("reviseMenu transmet le menu actuel et la consigne", async () => {
    const current = [makeRecipe({ id: "a", title: "Lasagnes" })];
    const exec = fakeExec({ recipes: current });
    await createClaudeCodeBackend({ exec }).reviseMenu(brief, ctx, current, "moins cher");
    expect(promptOf(exec)).toContain("Lasagnes");
    expect(promptOf(exec)).toContain("moins cher");
  });

  it("reviseRecipe renvoie une seule recette avec l'identifiant d'origine", async () => {
    const original = makeRecipe({ id: "curry", title: "Curry" });
    const exec = fakeExec({ ...original, id: "nouveau", title: "Curry doux" });
    const revised = await createClaudeCodeBackend({ exec }).reviseRecipe(brief, ctx, original, [], "moins épicé");
    expect(revised).toMatchObject({ id: "curry", title: "Curry doux" });
    expect(schemaOf(exec).properties.steps).toBeDefined();
    expect(promptOf(exec)).toContain("moins épicé");
  });

  it("arbitrate : un seul appel groupé, avec le prompt d'arbitrage, renvoie une Map", async () => {
    const items: ArbiterItem[] = [
      { key: "courgette|g", ingredient: "courgette", candidates: [{ name: "Courgettes", brand: null, pack: "?", price: 2 }] },
      { key: "oignon|g", ingredient: "oignon", candidates: [{ name: "Oignons", brand: null, pack: "1000g", price: 1 }] },
    ];
    const exec = fakeExec({ choices: [{ key: "courgette|g", index: 1 }, { key: "oignon|g", index: -1 }] });
    const map = await createClaudeCodeBackend({ exec }).arbitrate(items);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(map).toEqual(new Map([["courgette|g", 1], ["oignon|g", -1]]));
    expect(promptOf(exec)).toContain("formes transformées");
    expect(schemaOf(exec).properties.choices).toBeDefined();
  });
});

describe("selectBackend", () => {
  it("Claude Code par défaut, l'API si ANTHROPIC_API_KEY est défini", () => {
    expect(selectBackend({}).name).toBe("claude-code");
    expect(selectBackend({ ANTHROPIC_API_KEY: "" }).name).toBe("claude-code");
    expect(selectBackend({ ANTHROPIC_API_KEY: "sk-test" })).toMatchObject({ name: "api", label: "API Anthropic" });
  });
});
