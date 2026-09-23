import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { makeProduct, makeRecipe } from "../../../tests/helpers/factories";
import type { WeeklyContext } from "../context/build";
import { type Brief, servingsFor } from "./brief";
import { generateMenu, LlmError, RECIPE_MODEL, reviseMenu, reviseRecipe } from "./generate";
import { buildMenuPrompt, buildReviseRecipePrompt, SYSTEM_PROMPT } from "./prompt";

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

  it("liste les thèmes du magasin, un par ligne (les libellés contiennent des virgules)", () => {
    const p = buildMenuPrompt(brief, {
      ...ctx,
      themes: ["Asie, faites voyager vos papilles (jusqu'au 05/10/2026)", "Foire à la bière (jusqu'au 28/09/2026)"],
    });
    expect(p).toContain(
      "Thèmes mis en avant par le magasin cette semaine (ignore ceux qui ne concernent pas les dîners) :\n- Asie, faites voyager vos papilles (jusqu'au 05/10/2026)\n- Foire à la bière (jusqu'au 28/09/2026)",
    );
  });
});

describe("buildMenuPrompt : carte Waaoh", () => {
  it("liste les produits qui créditent la carte Waaoh, du plus au moins rémunérateur", () => {
    const p = buildMenuPrompt(brief, {
      ...ctx,
      promos: [
        makeProduct({ name: "Riz basmati", price: 2, promo: { label: "10% Jour W! cagnottés", kind: "loyalty" } }),
        makeProduct({ name: "Filets de poulet", price: 6, promo: { label: "50 % cagnottés sur le 2ème", kind: "loyalty" } }),
        makeProduct({ name: "Potimarron", price: 1.99, promo: { label: "-30%", kind: "price" } }),
      ],
    });
    expect(p).toContain("Potimarron");
    const waaoh = p.slice(p.indexOf("carte Waaoh"));
    expect(waaoh).toContain("- Filets de poulet : 6.00 € [50 % cagnottés sur le 2ème] → 3,00 € cagnottés pour 2 achetés");
    expect(waaoh).toContain("- Riz basmati : 2.00 € [10% Jour W! cagnottés] → 0,20 € cagnottés pour 1 acheté");
    expect(waaoh.indexOf("Filets de poulet")).toBeLessThan(waaoh.indexOf("Riz basmati"));
    expect(SYSTEM_PROMPT).toContain("Waaoh");
  });

  it("n'ajoute pas de section Waaoh sans offre de cagnotte", () => {
    expect(buildMenuPrompt(brief, ctx)).not.toContain("carte Waaoh");
  });
});

describe("buildMenuPrompt : propositions supplémentaires", () => {
  it("demande N nouvelles recettes, différentes de celles déjà proposées", () => {
    const p = buildMenuPrompt(brief, ctx, { count: 3, existingTitles: ["Dahl doux", "Riz sauté"] });
    expect(p).toContain(
      "Déjà proposées cette semaine (ne les propose pas à nouveau, ni une variante très proche ; tu peux partager des ingrédients avec elles) : Dahl doux ; Riz sauté.",
    );
    expect(p).toContain("Propose 3 nouvelles recettes de dîner, différentes de celles déjà proposées, chacune pour 4 portions.");
    expect(p).not.toContain("seront retenues");
  });
});

describe("buildMenuPrompt : recettes à éviter", () => {
  it("liste les recettes des dernières semaines à ne pas reproposer", () => {
    const p = buildMenuPrompt(brief, ctx, { avoidTitles: ["Curry de lentilles", "Gratin, version douce"] });
    expect(p).toContain(
      "Recettes servies ces dernières semaines, à éviter (ni la même recette, ni une variante très proche) : Curry de lentilles ; Gratin, version douce.",
    );
  });

  it("annonce les favoris déjà au menu", () => {
    const p = buildMenuPrompt(brief, ctx, { plannedTitles: ["Riz cantonais"] });
    expect(p).toContain(
      "Déjà au menu cette semaine (recettes favorites reprises : ne les propose pas, mais tu peux partager des ingrédients avec elles) : Riz cantonais.",
    );
  });

  it("rien à éviter : pas de ligne", () => {
    expect(buildMenuPrompt(brief, ctx, { avoidTitles: [] })).not.toContain("à éviter");
    expect(buildMenuPrompt(brief, ctx)).not.toContain("à éviter");
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

  it("transmet les recettes à éviter dans le prompt (API)", async () => {
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: { recipes: [] } });
    await generateMenu(client, brief, ctx, { avoidTitles: ["Curry de lentilles"] });
    expect(parse.mock.calls[0][0].messages[0].content).toContain("à éviter (ni la même recette, ni une variante très proche) : Curry de lentilles.");
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

describe("SYSTEM_PROMPT", () => {
  it("demande les étapes réalisables par les enfants", () => {
    expect(SYSTEM_PROMPT).toContain("kidSteps");
  });
});

describe("buildReviseRecipePrompt", () => {
  it("contient la recette, la consigne, les autres titres et l'identifiant à garder", () => {
    const recipe = makeRecipe({ id: "curry", title: "Curry de légumes" });
    const p = buildReviseRecipePrompt(brief, ctx, recipe, [makeRecipe({ title: "Gratin" })], "sans four");
    expect(p).toContain("Curry de légumes");
    expect(p).toContain("sans four");
    expect(p).toContain("Gratin");
    expect(p).toContain("« curry »");
    expect(p).toContain("4 portions");
    expect(p).toContain("Potimarron");
  });
});

describe("reviseRecipe", () => {
  it("renvoie une seule recette et garde son identifiant", async () => {
    const original = makeRecipe({ id: "curry", title: "Curry" });
    const { client, parse } = fakeClient({
      stop_reason: "end_turn",
      parsed_output: { ...original, id: "autre-id", title: "Curry doux" },
    });
    const revised = await reviseRecipe(client, brief, ctx, original, [], "moins épicé");
    expect(revised).toMatchObject({ id: "curry", title: "Curry doux" });
    const args = parse.mock.calls[0][0];
    expect(args.model).toBe(RECIPE_MODEL);
    expect(args.output_config.format).toBeDefined();
    expect(args.messages[0].content).toContain("moins épicé");
  });

  it("lève LlmError sur un refus", async () => {
    const { client } = fakeClient({ stop_reason: "refusal", parsed_output: null });
    await expect(reviseRecipe(client, brief, ctx, makeRecipe(), [], "x")).rejects.toBeInstanceOf(LlmError);
  });
});
