import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeWeek } from "../../../tests/helpers/factories";
import type { Brief } from "../recipes/brief";
import { isWeekId, newWeekId, WeekNotFoundError, WeekStore } from "./weeks";

const brief: Brief = {
  dinners: 4,
  adults: 2,
  children: 2,
  budgetEur: 60,
  filters: ["kids_friendly"],
  notes: "",
  preferOrganic: true,
};

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "myfresh-weeks-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("newWeekId", () => {
  it("date locale + premier suffixe libre", () => {
    const now = new Date(2026, 8, 23, 12, 0);
    expect(newWeekId(now, [])).toBe("2026-09-23-1");
    expect(newWeekId(now, ["2026-09-23-1", "2026-09-23-2", "2026-09-22-3"])).toBe("2026-09-23-3");
  });
});

describe("isWeekId", () => {
  it("refuse les chemins et l'ancien format du CLI", () => {
    expect(isWeekId("2026-09-23-1")).toBe(true);
    expect(isWeekId("2026-09-23")).toBe(false);
    expect(isWeekId("../../etc/passwd")).toBe(false);
    expect(isWeekId("2026-09-23-1/../x")).toBe(false);
  });
});

describe("WeekStore", () => {
  it("crée une semaine brouillon et la relit", () => {
    const store = new WeekStore(dir);
    const week = store.create(brief, new Date(2026, 8, 23, 12));
    expect(week).toMatchObject({
      id: "2026-09-23-1",
      status: "draft",
      brief,
      recipes: [],
      selectedRecipeIds: [],
      matches: [],
      overrides: { products: {}, pantry: [] },
      contextSummary: null,
      job: null,
      pushReport: null,
    });
    expect(store.get(week.id)).toEqual(week);
    expect(store.create(brief, new Date(2026, 8, 23, 13)).id).toBe("2026-09-23-2");
  });

  it("update modifie et enregistre ; lève WeekNotFoundError si la semaine n'existe pas", () => {
    const store = new WeekStore(dir);
    const { id } = store.create(brief);
    store.update(id, (w) => {
      w.status = "ready";
    });
    expect(store.get(id)?.status).toBe("ready");
    expect(() => store.update("2020-01-01-1", () => {})).toThrow(WeekNotFoundError);
  });

  it("list : la plus récente d'abord, ignore les fichiers illisibles ou d'un autre format", () => {
    const store = new WeekStore(dir);
    store.save(makeWeek({ id: "2026-09-16-1", createdAt: "2026-09-16T10:00:00.000Z" }));
    store.save(makeWeek({ id: "2026-09-23-1", createdAt: "2026-09-23T10:00:00.000Z" }));
    fs.writeFileSync(path.join(dir, "2026-09-23.json"), JSON.stringify({ brief, recipes: [], selected: [] }));
    fs.writeFileSync(path.join(dir, "2026-09-22-1.json"), "{oups");
    fs.writeFileSync(path.join(dir, "2026-09-21-1.json"), JSON.stringify({ id: "2026-09-21-1" }));
    fs.writeFileSync(path.join(dir, "2026-09-20-1.json"), JSON.stringify(makeWeek({ id: "2026-09-19-1" })));
    expect(store.list().map((w) => w.id)).toEqual(["2026-09-23-1", "2026-09-16-1"]);
    expect(store.get("2026-09-22-1")).toBeNull();
    expect(store.get("2026-09-20-1")).toBeNull();
    expect(store.get("../2026-09-23-1")).toBeNull();
  });

  it("latestBrief : le brief de la semaine la plus récente, null sans semaine", () => {
    const store = new WeekStore(dir);
    expect(store.latestBrief()).toBeNull();
    store.save(makeWeek({ id: "2026-09-16-1", createdAt: "2026-09-16T10:00:00.000Z" }));
    store.save(makeWeek({ id: "2026-09-23-1", createdAt: "2026-09-23T10:00:00.000Z", brief }));
    expect(store.latestBrief()).toEqual(brief);
  });

  it("écrit de façon atomique (aucun fichier temporaire laissé)", () => {
    const store = new WeekStore(dir);
    store.save(makeWeek());
    expect(fs.readdirSync(dir)).toEqual(["2026-09-23-1.json"]);
  });

  it("save refuse un identifiant invalide", () => {
    expect(() => new WeekStore(dir).save(makeWeek({ id: "../x" }))).toThrow(/invalide/);
  });
});
