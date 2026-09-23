import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBackend } from "../../../tests/helpers/fake-backend";
import { makeProduct, makeRecipe } from "../../../tests/helpers/factories";
import { FakeConnector } from "../../../tests/helpers/fake-connector";
import type { WeeklyContext } from "../context/build";
import type { JobContext } from "../jobs/runner";
import type { LlmBackend } from "../llm/backend";
import type { Brief } from "../recipes/brief";
import { WeekStore } from "../store/weeks";
import { chooseProduct } from "./edit";
import { runCreateWeek, runReviseRecipe, type WorkflowDeps } from "./workflows";

const brief: Brief = { dinners: 1, adults: 2, children: 0, budgetEur: 30, filters: [], notes: "", preferOrganic: false };
const ctx: WeeklyContext = {
  generatedAt: "2026-09-23T08:00:00.000Z",
  season: "automne",
  seasonalProduce: [],
  events: [],
  promos: [],
  antiGaspi: [],
  themes: [],
};
const ing = (q: string, quantity: number, pantryStaple = false) => ({
  name: q,
  searchQuery: q,
  quantity,
  unit: "g" as const,
  pantryStaple,
  fromPromo: false,
});
const pack500 = { value: 500, unit: "g" as const };
const tomates = makeProduct({ name: "Tomates", price: 2, pack: pack500 });
const pates = makeProduct({ name: "Pâtes", price: 1, pack: pack500 });
const patesCompletes = makeProduct({ name: "Pâtes complètes", price: 1.5, pack: pack500 });
const riz = makeProduct({ name: "Riz", price: 3, pack: pack500 });
const rizBasmati = makeProduct({ name: "Riz basmati", price: 3.5, pack: pack500 });
const courgette = makeProduct({ name: "Courgette", price: 1, pack: { value: 300, unit: "g" } });
const sel = makeProduct({ name: "Sel", price: 0.5, pack: { value: 1000, unit: "g" } });
const menu = () => [
  makeRecipe({ id: "pates-tomate", ingredients: [ing("tomates", 400), ing("pates", 500), ing("sel", 5, true)] }),
  makeRecipe({ id: "riz-tomate", ingredients: [ing("riz", 1000), ing("tomates", 200)] }),
];

function jobRecorder(): JobContext & { steps: string[] } {
  const steps: string[] = [];
  return {
    steps,
    step: (label) => {
      steps.push(label);
    },
    progress: () => {},
  };
}

let dir: string;
let store: WeekStore;
let connector: FakeConnector;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "myfresh-wf-"));
  store = new WeekStore(dir);
  connector = new FakeConnector({
    tomates: [tomates],
    pates: [pates, patesCompletes],
    riz: [riz, rizBasmati],
    courgette: [courgette],
    sel: [sel],
  });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function deps(backend: LlmBackend, extra: Partial<WorkflowDeps> = {}): WorkflowDeps {
  return { store, backend, openStore: async () => connector, loadContext: async () => ctx, ...extra };
}

function newWeek(): string {
  const { id } = store.create(brief, new Date(2026, 8, 23, 12));
  store.update(id, (w) => {
    w.status = "generating";
  });
  return id;
}

describe("runCreateWeek", () => {
  it("génère, choisit les produits avec arbitrage et retient les recettes les moins chères", async () => {
    const backend = fakeBackend({ generateMenu: vi.fn(async () => menu()) });
    const id = newWeek();
    const job = jobRecorder();
    await runCreateWeek(id, deps(backend), job);
    const week = store.get(id)!;
    expect(week.status).toBe("ready");
    expect(week.recipes.map((r) => r.id)).toEqual(["pates-tomate", "riz-tomate"]);
    expect(week.selectedRecipeIds).toEqual(["pates-tomate"]);
    expect(week.overrides).toEqual({ products: {}, pantry: ["sel|g"] });
    expect(week.contextSummary).toBe("0 promos · 0 anti-gaspi");
    expect(backend.arbitrate).toHaveBeenCalledTimes(1);
    expect(job.steps).toEqual([
      "Connexion à Auchan",
      "Contexte de la semaine",
      "Génération des recettes (Claude (faux))",
      "Choix des produits Auchan",
      "Vérification des produits par Claude",
    ]);
  });

  it("useArbiter: false : Claude n'arbitre pas les produits", async () => {
    const backend = fakeBackend({ generateMenu: vi.fn(async () => menu()) });
    const id = newWeek();
    await runCreateWeek(id, deps(backend, { useArbiter: false }), jobRecorder());
    expect(backend.arbitrate).not.toHaveBeenCalled();
    expect(store.get(id)!.status).toBe("ready");
  });

  it("reprend sans régénérer quand les recettes sont déjà là", async () => {
    const backend = fakeBackend();
    const id = newWeek();
    store.update(id, (w) => {
      w.recipes = menu();
    });
    await runCreateWeek(id, deps(backend), jobRecorder());
    expect(backend.generateMenu).not.toHaveBeenCalled();
    expect(store.get(id)!.matches).toHaveLength(4);
  });

  it("includePantryStaples : aucun basique n'est mis au placard", async () => {
    const backend = fakeBackend({ generateMenu: vi.fn(async () => menu()) });
    const id = newWeek();
    await runCreateWeek(id, deps(backend), jobRecorder(), { includePantryStaples: true });
    expect(store.get(id)!.overrides.pantry).toEqual([]);
  });

  it("en cas d'échec, la semaine repasse en brouillon et l'erreur remonte", async () => {
    const backend = fakeBackend({
      generateMenu: vi.fn(async () => {
        throw new Error("Claude Code n'a pas répondu en 10 min.");
      }),
    });
    const id = newWeek();
    await expect(runCreateWeek(id, deps(backend), jobRecorder())).rejects.toThrow(/10 min/);
    expect(store.get(id)!.status).toBe("draft");
  });
});

describe("runReviseRecipe", () => {
  it("remplace la recette et ne recherche que ses ingrédients", async () => {
    const revised = makeRecipe({
      id: "riz-tomate",
      title: "Riz aux courgettes",
      ingredients: [ing("riz", 1000), ing("courgette", 300)],
    });
    const backend = fakeBackend({ generateMenu: vi.fn(async () => menu()), reviseRecipe: vi.fn(async () => revised) });
    const id = newWeek();
    await runCreateWeek(id, deps(backend), jobRecorder());
    const created = store.get(id)!;
    store.save(chooseProduct(chooseProduct(created, "pates|g", patesCompletes.productId), "riz|g", rizBasmati.productId));
    connector.searches = [];

    const job = jobRecorder();
    await runReviseRecipe(id, "riz-tomate", "avec des courgettes", deps(backend), job);

    const week = store.get(id)!;
    expect(connector.searches).toEqual(["riz", "courgette"]);
    expect(week.recipes.map((r) => r.title)).toEqual([created.recipes[0].title, "Riz aux courgettes"]);
    expect(week.matches.map((m) => m.need.key)).toEqual(["tomates|g", "pates|g", "sel|g", "riz|g", "courgette|g"]);
    expect(week.matches[0].need.perRecipe).toEqual({ "pates-tomate": 400 });
    expect(week.overrides.products).toEqual({ "pates|g": patesCompletes.productId });
    expect(week.selectedRecipeIds).toEqual(["pates-tomate"]);
    expect(week.status).toBe("ready");
    expect(job.steps).toContain(`Modification de « ${created.recipes[1].title} » (Claude (faux))`);
    expect(backend.reviseRecipe).toHaveBeenCalledWith(
      brief,
      ctx,
      expect.objectContaining({ id: "riz-tomate" }),
      [expect.objectContaining({ id: "pates-tomate" })],
      "avec des courgettes",
    );
  });

  it("recette inconnue : erreur, semaine inchangée", async () => {
    const backend = fakeBackend({ generateMenu: vi.fn(async () => menu()) });
    const id = newWeek();
    await runCreateWeek(id, deps(backend), jobRecorder());
    const before = store.get(id);
    await expect(runReviseRecipe(id, "zzz", "x", deps(backend), jobRecorder())).rejects.toThrow(/Recette introuvable/);
    expect(store.get(id)).toEqual(before);
  });
});
