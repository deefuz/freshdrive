import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBackend } from "../../../tests/helpers/fake-backend";
import { makeProduct, makeRecipe, makeWeek } from "../../../tests/helpers/factories";
import { FakeConnector } from "../../../tests/helpers/fake-connector";
import { NoStoreError } from "../auchan/open";
import type { WeeklyContext } from "../context/build";
import type { LlmBackend } from "../llm/backend";
import type { Brief } from "../recipes/brief";
import { favoriteId as favoriteIdOf, FavoriteStore } from "../store/favorites";
import { WeekStore } from "../store/weeks";
import { ActionError, ADD_RECIPES_COUNT, type AppDeps, MAX_WEEK_RECIPES, FreshDriveApp } from "./service";

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
const ing = (q: string, quantity: number) => ({
  name: q,
  searchQuery: q,
  quantity,
  unit: "g" as const,
  pantryStaple: false,
  fromPromo: false,
});
const recipes = [
  makeRecipe({ id: "pates", ingredients: [ing("pates", 500)] }),
  makeRecipe({ id: "riz", ingredients: [ing("riz", 500)] }),
];

function blocker() {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  return { gate, release };
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "freshdrive-app-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function setup(backend: LlmBackend = fakeBackend({ generateMenu: vi.fn(async () => recipes) }), overrides: Partial<AppDeps> = {}) {
  const connector = new FakeConnector({
    pates: [makeProduct({ name: "Pâtes", price: 1, pack: { value: 500, unit: "g" } })],
    riz: [makeProduct({ name: "Riz", price: 2, pack: { value: 500, unit: "g" } })],
  });
  const store = new WeekStore(dir);
  const favorites = new FavoriteStore(path.join(dir, "favoris", "favorites.json"));
  const app = new FreshDriveApp({
    store,
    favorites,
    backend: () => backend,
    openAuchan: async () => ({ connector, source: "chrome", warnings: [] }),
    loadContext: async () => ctx,
    now: () => new Date("2026-09-23T10:00:00.000Z"),
    ...overrides,
  });
  return { app, store, favorites, connector };
}

describe("FreshDriveApp", () => {
  it("startCreateWeek : crée la semaine, suit la tâche et enregistre l'état final", async () => {
    const { app } = setup();
    const week = app.startCreateWeek(brief);
    expect(week.status).toBe("generating");
    expect(week.job).toMatchObject({ kind: "create", status: "running" });
    await app.runner.idle();
    const done = app.getWeek(week.id)!;
    expect(done).toMatchObject({ status: "ready", selectedRecipeIds: ["pates"] });
    expect(done.job).toMatchObject({ status: "done", step: "Terminé" });
    expect(app.session).toMatchObject({ ok: true, message: "Session reprise de Chrome, drive détecté." });
  });

  it("une seule tâche à la fois : la 2e demande échoue sans créer de semaine", async () => {
    const { gate, release } = blocker();
    const { app, store } = setup(
      fakeBackend({
        generateMenu: vi.fn(async () => {
          await gate;
          return recipes;
        }),
      }),
    );
    app.startCreateWeek(brief);
    expect(() => app.startCreateWeek(brief)).toThrow(/déjà en cours/);
    expect(store.list()).toHaveLength(1);
    release();
    await app.runner.idle();
  });

  it("startPush : envoie une fois, puis refuse un 2e envoi", async () => {
    const { app, connector } = setup();
    const { id } = app.startCreateWeek(brief);
    await app.runner.idle();
    app.startPush(id);
    await app.runner.idle();
    expect(app.getWeek(id)?.status).toBe("pushed");
    expect(connector.cart.items).toHaveLength(1);
    expect(() => app.startPush(id)).toThrow(/déjà été envoyée/);
  });

  it("startPush refuse un envoi déjà lancé mais interrompu (pushStartedAt sans statut pushed)", async () => {
    const openAuchan = vi.fn<AppDeps["openAuchan"]>(async () => {
      throw new Error("ne doit pas être appelé");
    });
    const { app, store } = setup(undefined, { openAuchan });
    store.save(makeWeek({ status: "ready", pushStartedAt: "2026-09-23T09:00:00.000Z" }));
    expect(() => app.startPush("2026-09-23-1")).toThrow(/déjà été lancé/);
    await app.runner.idle();
    expect(openAuchan).not.toHaveBeenCalled();
    expect(app.runner.current()).toBeNull();
  });

  it("identifiant de semaine inconnu ou forgé : ActionError, sans tâche lancée", () => {
    const { app } = setup();
    for (const id of ["2026-09-23-9", "../../etc/passwd", ""]) {
      expect(() => app.startPush(id)).toThrow(ActionError);
      expect(() => app.startReviseRecipe(id, "pates", "sans four")).toThrow(ActionError);
      expect(() => app.retryCreateWeek(id)).toThrow(ActionError);
      expect(() => app.edit(id, (w) => w)).toThrow(/Semaine introuvable/);
    }
    expect(app.runner.current()).toBeNull();
  });

  it("startReviseRecipe refuse une semaine déjà envoyée, mais les choix restent modifiables", async () => {
    const { app } = setup();
    const { id } = app.startCreateWeek(brief);
    await app.runner.idle();
    app.startPush(id);
    await app.runner.idle();
    expect(() => app.startReviseRecipe(id, "pates", "sans four")).toThrow(ActionError);
    expect(() => app.startReviseRecipe(id, "pates", "sans four")).toThrow(
      "Cette semaine a déjà été envoyée au panier : la recette ne peut plus être modifiée.",
    );
    expect(app.runner.current()?.kind).toBe("push");
    expect(() => app.edit(id, (w) => w)).not.toThrow();
  });

  it("getWeek : une tâche « en cours » inconnue du serveur (redémarrage) passe en erreur, et c'est enregistré", () => {
    const { app, store } = setup();
    store.save(
      makeWeek({
        status: "generating",
        job: {
          weekId: "2026-09-23-1",
          kind: "create",
          status: "running",
          step: "Génération des recettes",
          progress: null,
          error: null,
          startedAt: "2026-09-23T09:00:00.000Z",
          finishedAt: null,
        },
      }),
    );
    const week = app.getWeek("2026-09-23-1")!;
    expect(week.status).toBe("draft");
    expect(week.job?.error).toMatch(/interrompue/);
    expect(store.get("2026-09-23-1")?.status).toBe("draft");
  });

  it("retryCreateWeek relance une semaine en brouillon", async () => {
    const { app, store } = setup();
    store.save(makeWeek({ status: "draft", brief }));
    app.retryCreateWeek("2026-09-23-1");
    await app.runner.idle();
    expect(app.getWeek("2026-09-23-1")?.status).toBe("ready");
    expect(() => app.retryCreateWeek("2026-09-23-1")).toThrow(ActionError);
  });

  it("startReviseRecipe refuse une consigne vide ou une recette inconnue", async () => {
    const { app } = setup();
    const { id } = app.startCreateWeek(brief);
    await app.runner.idle();
    expect(() => app.startReviseRecipe(id, "pates", "   ")).toThrow(/Écris ce que tu veux changer/);
    expect(() => app.startReviseRecipe(id, "zzz", "sans four")).toThrow(/Recette introuvable/);
  });

  it("startAddRecipes lance une tâche de propositions supplémentaires, refusée sur une semaine envoyée", async () => {
    const generateMenu = vi.fn<LlmBackend["generateMenu"]>(async () => recipes);
    const { app } = setup(fakeBackend({ generateMenu }));
    const { id } = app.startCreateWeek(brief);
    await app.runner.idle();
    generateMenu.mockResolvedValueOnce([{ ...recipes[0], id: "nouvelle", title: "Nouvelle recette" }]);
    app.startAddRecipes(id);
    expect(app.runner.current()?.kind).toBe("add-recipes");
    await app.runner.idle();
    expect(app.getWeek(id)!.recipes.map((r) => r.id)).toContain("nouvelle");
    expect(generateMenu).toHaveBeenLastCalledWith(brief, expect.anything(), expect.objectContaining({ count: ADD_RECIPES_COUNT }));

    app.startPush(id);
    await app.runner.idle();
    expect(() => app.startAddRecipes(id)).toThrow(
      "Cette semaine a déjà été envoyée au panier : on ne peut plus y ajouter de recettes.",
    );
  });

  it("startAddRecipes refuse une semaine qui a déjà trop de recettes", async () => {
    const { app, store } = setup();
    const { id } = app.startCreateWeek(brief);
    await app.runner.idle();
    store.update(id, (w) => {
      w.recipes = Array.from({ length: MAX_WEEK_RECIPES }, (_, i) => ({ ...recipes[0], id: `r${i}` }));
    });
    expect(() => app.startAddRecipes(id)).toThrow(/au plus \d+ recettes/);
  });

  it("deleteWeek met la semaine à la corbeille, refuse une semaine inconnue ou en cours de tâche", async () => {
    const { gate, release } = blocker();
    const backend = fakeBackend({
      generateMenu: vi.fn(async () => recipes),
      reviseRecipe: vi.fn<LlmBackend["reviseRecipe"]>(async (_b, _c, recipe) => {
        await gate;
        return recipe;
      }),
    });
    const { app } = setup(backend);
    const { id } = app.startCreateWeek(brief);
    await app.runner.idle();
    app.startReviseRecipe(id, "riz", "sans four");
    expect(() => app.deleteWeek(id)).toThrow(/tâche est en cours/);
    release();
    await app.runner.idle();
    app.deleteWeek(id);
    expect(app.getWeek(id)).toBeNull();
    expect(() => app.deleteWeek(id)).toThrow("Semaine introuvable.");
  });

  it("edit est refusé pendant une tâche sur la même semaine", async () => {
    const { gate, release } = blocker();
    const backend = fakeBackend({
      generateMenu: vi.fn(async () => recipes),
      reviseRecipe: vi.fn<LlmBackend["reviseRecipe"]>(async (_b, _c, recipe) => {
        await gate;
        return recipe;
      }),
    });
    const { app } = setup(backend);
    const { id } = app.startCreateWeek(brief);
    await app.runner.idle();
    app.startReviseRecipe(id, "riz", "sans four");
    expect(() => app.edit(id, (w) => w)).toThrow(/tâche est en cours/);
    release();
    await app.runner.idle();
    expect(() => app.edit(id, (w) => w)).not.toThrow();
  });

  it("checkSession enregistre un échec avec son message", async () => {
    const { app } = setup(undefined, {
      openAuchan: async () => {
        throw new NoStoreError();
      },
    });
    const status = await app.checkSession();
    expect(status.ok).toBe(false);
    expect(status.message).toMatch(/aucun drive/);
  });

  it("setFavorite : étoile une recette de la semaine, puis la retire", async () => {
    const { app, favorites } = setup();
    const { id } = app.startCreateWeek(brief);
    await app.runner.idle();
    app.setFavorite(id, "pates", true);
    expect(favorites.list()).toMatchObject([
      { id: favoriteIdOf(recipes[0].title), sourceWeekId: id, addedAt: "2026-09-23T10:00:00.000Z" },
    ]);
    expect(favorites.has(recipes[0].title)).toBe(true);
    app.setFavorite(id, "pates", false);
    expect(favorites.list()).toEqual([]);
    expect(() => app.setFavorite(id, "inconnue", true)).toThrow(ActionError);
    expect(() => app.setFavorite("../x", "pates", true)).toThrow(/Semaine introuvable/);
  });

  it("removeFavorite : favori inconnu refusé", () => {
    const { app } = setup();
    expect(() => app.removeFavorite("inconnu")).toThrow(/Favori introuvable/);
  });

  it("startCreateWeek reprend un favori : mis à l'échelle du foyer, ajouté au menu et retenu d'office", async () => {
    const { app, favorites } = setup();
    const soupe = makeRecipe({ id: "soupe", title: "Soupe", servings: 4, ingredients: [ing("pates", 200)] });
    favorites.add(soupe, "2026-09-16-1");
    const week = app.startCreateWeek(brief, ["soupe", "soupe"]);
    expect(week.reusedRecipes).toEqual([
      { ...soupe, id: "favori-soupe", servings: 2, ingredients: [{ ...soupe.ingredients[0], quantity: 100 }] },
    ]);
    await app.runner.idle();
    const done = app.getWeek(week.id)!;
    expect(done.recipes.map((r) => r.id)).toEqual(["favori-soupe", "pates", "riz"]);
    expect(done.selectedRecipeIds).toEqual(["favori-soupe"]);
  });

  it("startCreateWeek refuse un favori disparu ou trop de favoris, sans créer de semaine", () => {
    const { app, favorites, store } = setup();
    expect(() => app.startCreateWeek(brief, ["disparu"])).toThrow(/n'existe plus/);
    favorites.add(makeRecipe({ title: "A" }), "2026-09-16-1");
    favorites.add(makeRecipe({ title: "B" }), "2026-09-16-1");
    expect(() => app.startCreateWeek(brief, ["a", "b"])).toThrow("Tu peux reprendre au plus 1 favori pour 1 dîner.");
    expect(store.list()).toEqual([]);
    expect(app.runner.current()).toBeNull();
  });
});
