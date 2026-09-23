import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { makeProduct, makeRecipe } from "../../../tests/helpers/factories";
import type { WeeklyContext } from "../context/build";
import { type Brief, servingsFor } from "./brief";
import { generateMenu, LlmError, RECIPE_MODEL, reviseMenu } from "./generate";
import { buildMenuPrompt } from "./prompt";

const brief: Brief = {
  dinners: 4,
  adults: 2,
  children: 2,
  budgetEur: 60,
  filters: ["kids_friendly", "unprocessed"],
  notes: "pas de poisson",
  preferOrganic: true,
};

const ctx: WeeklyContext = {
  generatedAt: "2026-10-20T08:00:00.000Z",
  season: "automne",
  seasonalProduce: ["potiron", "poireau"],
  events: [{ name: "Halloween", date: "2026-10-31" }],
  promos: [makeProduct({ name: "Potimarron", brand: null, price: 1.99, promo: { label: "-30%", kind: "price" } })],
  antiGaspi: [makeProduct({ name: "Yaourts nature" })],
  themes: ["saveurs d asie"],
};

function fakeClient(result: object) {
  const parse = vi.fn().mockResolvedValue(result);
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
}

describe("servingsFor", () => {
  it("2 adultes + 2 enfants = 4 portions", () => expect(servingsFor(brief)).toBe(4));
});

describe("buildMenuPrompt", () => {
  it("contient le contexte, les filtres et le nombre de recettes", () => {
    const p = buildMenuPrompt(brief, ctx);
    expect(p).toContain("6 recettes");
    expect(p).toContain("4 portions");
    expect(p).toContain("Potimarron");
    expect(p).toContain("-30%");
    expect(p).toContain("Halloween");
    expect(p).toContain("potiron");
    expect(p).toContain("adapté aux enfants");
    expect(p).toContain("sans produits ultra-transformés");
    expect(p).toContain("pas de poisson");
    expect(p).toContain("60 €");
  });
});

describe("generateMenu", () => {
  it("appelle Claude avec le bon modèle et un format structuré", async () => {
    const recipes = [makeRecipe()];
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: { recipes } });
    await expect(generateMenu(client, brief, ctx)).resolves.toEqual(recipes);
    const args = parse.mock.calls[0][0];
    expect(args.model).toBe(RECIPE_MODEL);
    expect(args.thinking).toEqual({ type: "adaptive" });
    expect(args.output_config.effort).toBe("high");
    expect(args.output_config.format).toBeDefined();
  });

  it("lève LlmError sur un refus", async () => {
    const { client } = fakeClient({ stop_reason: "refusal", parsed_output: null });
    await expect(generateMenu(client, brief, ctx)).rejects.toBeInstanceOf(LlmError);
  });

  it("lève LlmError si la réponse est tronquée", async () => {
    const { client } = fakeClient({ stop_reason: "max_tokens", parsed_output: null });
    await expect(generateMenu(client, brief, ctx)).rejects.toThrow(/tronquée/);
  });
});

describe("reviseMenu", () => {
  it("transmet les recettes actuelles et la consigne", async () => {
    const current = [makeRecipe({ title: "Lasagnes" })];
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: { recipes: current } });
    await reviseMenu(client, brief, ctx, current, "moins cher");
    const content = parse.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain("Lasagnes");
    expect(content).toContain("moins cher");
  });
});
