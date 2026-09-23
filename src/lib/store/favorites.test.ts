import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeRecipe } from "../../../tests/helpers/factories";
import { favoriteId, FavoriteStore } from "./favorites";

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "myfresh-fav-"));
  file = path.join(dir, "sous-dossier", "favorites.json");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("favoriteId", () => {
  it("dérive un identifiant du titre (minuscules, sans accents ni ponctuation)", () => {
    expect(favoriteId("Curry de légumes & riz")).toBe("curry-de-legumes-riz");
    expect(favoriteId("  Œufs cocotte !  ")).toBe("oeufs-cocotte");
    expect(favoriteId("!!!")).toBe("recette");
  });
});

describe("FavoriteStore", () => {
  it("fichier absent : aucun favori", () => {
    const store = new FavoriteStore(file);
    expect(store.list()).toEqual([]);
    expect(store.has("Curry")).toBe(false);
  });

  it("ajoute, liste (plus récents d'abord), retrouve et retire", () => {
    const store = new FavoriteStore(file);
    const curry = makeRecipe({ title: "Curry de légumes" });
    const gratin = makeRecipe({ title: "Gratin" });
    store.add(curry, "2026-09-16-1", new Date("2026-09-16T10:00:00.000Z"));
    store.add(gratin, "2026-09-23-1", new Date("2026-09-23T10:00:00.000Z"));
    expect(store.list().map((f) => f.id)).toEqual(["gratin", "curry-de-legumes"]);
    expect(store.get("curry-de-legumes")).toEqual({
      id: "curry-de-legumes",
      recipe: curry,
      sourceWeekId: "2026-09-16-1",
      addedAt: "2026-09-16T10:00:00.000Z",
    });
    expect(store.has("curry de legumes")).toBe(true);
    expect(store.remove("gratin")).toBe(true);
    expect(store.remove("gratin")).toBe(false);
    expect(new FavoriteStore(file).list().map((f) => f.id)).toEqual(["curry-de-legumes"]);
  });

  it("une recette de même titre remplace l'ancienne version", () => {
    const store = new FavoriteStore(file);
    store.add(makeRecipe({ title: "Curry", summary: "v1" }), "2026-09-16-1");
    store.add(makeRecipe({ title: "curry", summary: "v2" }), "2026-09-23-1");
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].recipe.summary).toBe("v2");
  });

  it("écriture atomique : aucun fichier temporaire ne reste", () => {
    new FavoriteStore(file).add(makeRecipe({ title: "Curry" }), "2026-09-23-1");
    expect(fs.readdirSync(path.dirname(file))).toEqual(["favorites.json"]);
  });

  it("fichier illisible ou entrées abîmées : ignorés sans planter", () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ pas du json");
    expect(new FavoriteStore(file).list()).toEqual([]);
    fs.writeFileSync(file, JSON.stringify({ favorites: "non" }));
    expect(new FavoriteStore(file).list()).toEqual([]);
    const ok = { id: "curry", recipe: makeRecipe({ title: "Curry" }), sourceWeekId: "2026-09-23-1", addedAt: "2026-09-23T10:00:00.000Z" };
    fs.writeFileSync(file, JSON.stringify({ favorites: [ok, { id: "abime", recipe: { title: 3 } }, null] }));
    expect(new FavoriteStore(file).list()).toEqual([ok]);
  });
});
