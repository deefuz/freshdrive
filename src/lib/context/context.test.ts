import { describe, expect, it } from "vitest";
import { makeProduct } from "../../../tests/helpers/factories";
import { FakeConnector } from "../../../tests/helpers/fake-connector";
import { buildWeeklyContext, isCacheableContext, summarizeContext, type WeeklyContext } from "./build";
import { easterSunday, upcomingEvents } from "./events";
import { getSeason, seasonalProduceFor } from "./season";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe("season", () => {
  it("septembre = automne", () => expect(getSeason(new Date(2026, 8, 23))).toBe("automne"));
  it("janvier = hiver", () => expect(getSeason(new Date(2026, 0, 10))).toBe("hiver"));
  it("liste des produits de saison en octobre", () => expect(seasonalProduceFor(new Date(2026, 9, 1))).toContain("potiron"));
});

describe("events", () => {
  it("calcule Pâques 2026", () => expect(ymd(easterSunday(2026))).toBe("2026-04-05"));
  it("Halloween dans les 14 jours", () => {
    expect(upcomingEvents(new Date(2026, 9, 20)).map((e) => e.name)).toEqual(["Halloween"]);
  });
  it("Mardi gras 2026 = 17 février", () => {
    expect(upcomingEvents(new Date(2026, 1, 10))).toContainEqual({ name: "Mardi gras", date: "2026-02-17" });
  });
  it("fête des mères 2026 = 31 mai", () => {
    expect(upcomingEvents(new Date(2026, 4, 25))).toContainEqual({ name: "Fête des mères", date: "2026-05-31" });
  });
  it("rentrée scolaire en début septembre", () => {
    expect(upcomingEvents(new Date(2026, 8, 5)).map((e) => e.name)).toContain("Rentrée scolaire");
  });
  it("passe l'année (depuis le 25 décembre)", () => {
    expect(upcomingEvents(new Date(2026, 11, 25)).map((e) => e.name)).toEqual([
      "Noël",
      "Réveillon du Nouvel an",
      "Nouvel an",
      "Épiphanie",
    ]);
  });
});

describe("buildWeeklyContext", () => {
  it("combine magasin, saison et événements", async () => {
    const promo = makeProduct({ name: "Potimarron", isSeasonal: true, promo: { label: "-30%", kind: "price" } });
    const connector = new FakeConnector({}, { promos: [promo], antiGaspi: [], themes: ["saveurs d asie"] });
    const ctx = await buildWeeklyContext(connector, new Date(2026, 9, 20));
    expect(ctx.season).toBe("automne");
    expect(ctx.events.map((e) => e.name)).toEqual(["Halloween"]);
    expect(ctx.promos).toEqual([promo]);
    expect(summarizeContext(ctx)).toBe("1 promos · 0 anti-gaspi · thèmes : saveurs d asie · événements : Halloween");
  });
});

describe("isCacheableContext", () => {
  const base: Omit<WeeklyContext, "promos"> = {
    generatedAt: new Date(2026, 9, 20).toISOString(),
    season: "automne",
    seasonalProduce: [],
    events: [],
    antiGaspi: [],
    themes: [],
  };

  it("faux si aucune promo (session probablement expirée, ne pas écrire/réutiliser le cache)", () => {
    expect(isCacheableContext({ ...base, promos: [] })).toBe(false);
  });

  it("vrai si au moins une promo", () => {
    expect(isCacheableContext({ ...base, promos: [makeProduct({ name: "Potimarron" })] })).toBe(true);
  });
});
