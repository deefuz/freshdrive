import { describe, expect, it } from "vitest";
import { makeProduct, makeWeek } from "../../tests/helpers/factories";
import { formatEur, formatQty, formatWeekDate, productLabel, productShortLabel, weekStatusLabel } from "./format";

describe("formatEur", () => {
  it("virgule décimale, arrondi au centime", () => {
    expect(formatEur(12.5)).toBe("12,50 €");
    expect(formatEur(0.1 + 0.2)).toBe("0,30 €");
    expect(formatEur(-3.456)).toBe("-3,46 €");
  });
});

describe("formatQty", () => {
  it("g, ml et pièces", () => {
    expect(formatQty(400, "g")).toBe("400 g");
    expect(formatQty(12.5, "ml")).toBe("12,5 ml");
    expect(formatQty(1, "pce")).toBe("1 pièce");
    expect(formatQty(3, "pce")).toBe("3 pièces");
  });
});

describe("productLabel", () => {
  it("marque, nom, conditionnement, prix, bio et promo", () => {
    const p = makeProduct({
      brand: "AUCHAN BIO",
      name: "Courgettes",
      pack: { value: 1000, unit: "g" },
      price: 3.5,
      isOrganic: true,
      promo: { label: "-30% sur le 2ème", kind: "price" },
    });
    expect(productLabel(p)).toBe("AUCHAN BIO Courgettes · 1000 g · 3,50 € · bio · -30% sur le 2ème");
    expect(productLabel(makeProduct({ name: "Riz", price: 2 }))).toBe("Riz · 2,00 €");
  });
});

describe("formatWeekDate", () => {
  it("date en toutes lettres à partir de l'identifiant", () => {
    expect(formatWeekDate("2026-09-23-2")).toBe("23 septembre 2026");
  });
});

describe("weekStatusLabel", () => {
  it("libellé du statut, ou « Envoi interrompu » si l'envoi a commencé sans aboutir", () => {
    expect(weekStatusLabel(makeWeek({ status: "ready" }))).toBe("Prête");
    expect(weekStatusLabel(makeWeek({ status: "pushed", pushStartedAt: "2026-09-23T09:00:00.000Z" }))).toBe(
      "Envoyée au panier",
    );
    expect(weekStatusLabel(makeWeek({ status: "ready", pushStartedAt: "2026-09-23T09:00:00.000Z" }))).toBe(
      "Envoi interrompu",
    );
  });

  it("pendant l'envoi : pas encore « interrompu »", () => {
    const week = makeWeek({ status: "ready", pushStartedAt: "2026-09-23T09:00:00.000Z" });
    week.job = {
      weekId: week.id,
      kind: "push",
      status: "running",
      step: "Ajout au panier Auchan",
      progress: null,
      error: null,
      startedAt: "2026-09-23T09:00:00.000Z",
      finishedAt: null,
    };
    expect(weekStatusLabel(week)).toBe("Envoi en cours");
  });
});

describe("productShortLabel", () => {
  it("marque, nom et conditionnement, sans prix", () => {
    expect(productShortLabel(makeProduct({ brand: "AUCHAN BIO", name: "Courgettes", pack: { value: 1000, unit: "g" } }))).toBe(
      "AUCHAN BIO Courgettes · 1000 g",
    );
    expect(productShortLabel(makeProduct({ name: "Citron", pack: null }))).toBe("Citron");
  });
});
