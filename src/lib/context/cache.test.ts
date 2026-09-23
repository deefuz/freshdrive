import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeProduct } from "../../../tests/helpers/factories";
import { FakeConnector } from "../../../tests/helpers/fake-connector";
import { loadWeeklyContext, readCachedContext } from "./cache";

let dir: string;
let cachePath: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "myfresh-ctx-"));
  cachePath = path.join(dir, "cache", "context.json");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const now = new Date("2026-10-20T08:00:00.000Z");
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);
const withPromos = () =>
  new FakeConnector({}, { promos: [makeProduct({ name: "Potimarron" })], antiGaspi: [], themes: ["Asie"] });

describe("loadWeeklyContext", () => {
  it("construit le contexte et l'écrit en cache", async () => {
    const ctx = await loadWeeklyContext(withPromos(), { cachePath, now });
    expect(ctx.promos).toHaveLength(1);
    expect(ctx.themes).toEqual(["Asie"]);
    expect(JSON.parse(fs.readFileSync(cachePath, "utf8")).generatedAt).toBe(now.toISOString());
  });

  it("réutilise un cache de moins de 24 h sans appeler Auchan", async () => {
    await loadWeeklyContext(withPromos(), { cachePath, now });
    const connector = withPromos();
    const spy = vi.spyOn(connector, "getStoreContext");
    const ctx = await loadWeeklyContext(connector, { cachePath, now: hours(2) });
    expect(spy).not.toHaveBeenCalled();
    expect(ctx.generatedAt).toBe(now.toISOString());
  });

  it("reconstruit un cache de plus de 24 h ou illisible", async () => {
    await loadWeeklyContext(withPromos(), { cachePath, now });
    const connector = withPromos();
    const spy = vi.spyOn(connector, "getStoreContext");
    await loadWeeklyContext(connector, { cachePath, now: hours(25) });
    fs.writeFileSync(cachePath, "{oups");
    await loadWeeklyContext(connector, { cachePath, now: hours(26) });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("ne met pas en cache un contexte sans promo (session probablement expirée)", async () => {
    await loadWeeklyContext(new FakeConnector({}), { cachePath, now });
    expect(fs.existsSync(cachePath)).toBe(false);
  });
});

describe("readCachedContext", () => {
  it("null sans fichier", () => {
    expect(readCachedContext(cachePath, now.getTime())).toBeNull();
  });
});
