import { describe, expect, it } from "vitest";
import { promoEffect } from "./promo";

describe("promoEffect", () => {
  it("-X% sur le Nème : remise sur chaque Nème paquet", () => {
    expect(promoEffect("-60% sur le 2ème", 2, 3)).toEqual({ saved: 1.2, loyalty: 0 });
    expect(promoEffect("-60% sur le 2ème", 2, 1)).toEqual({ saved: 0, loyalty: 0 });
  });

  it("-X € sur le Nème", () => {
    expect(promoEffect("-0,87 € sur le 3ème", 1.5, 3)).toEqual({ saved: 0.87, loyalty: 0 });
  });

  it("N achetés = M payés", () => {
    expect(promoEffect("3 achetés = 2 payés", 1.5, 3)).toEqual({ saved: 1.5, loyalty: 0 });
    expect(promoEffect("3 achetés = 2 payés", 1.5, 2).saved).toBe(0);
  });

  it("cagnotte sur le Nème, cagnotte simple et libellés combinés", () => {
    expect(promoEffect("40 % cagnottés sur le 2ème", 3, 2)).toEqual({ saved: 0, loyalty: 1.2 });
    expect(promoEffect("Prix Choc · 10% Jour W! cagnottés", 4, 2)).toEqual({ saved: 0, loyalty: 0.8 });
  });

  it("libellé sans montant calculable : aucun effet", () => {
    expect(promoEffect("Prix Choc", 3, 2)).toEqual({ saved: 0, loyalty: 0 });
  });
});
