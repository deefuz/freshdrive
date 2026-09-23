import { describe, expect, it } from "vitest";
import { loyaltyOffer, promoEffect } from "./promo";

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

describe("loyaltyOffer", () => {
  it("cagnotte simple : dès le premier paquet", () => {
    expect(loyaltyOffer("Prix Choc · 10% Jour W! cagnottés", 4)).toEqual({ packs: 1, credit: 0.4 });
  });

  it("cagnotte sur le Nème : il faut N paquets", () => {
    expect(loyaltyOffer("50 % cagnottés sur le 2ème", 3)).toEqual({ packs: 2, credit: 1.5 });
  });

  it("pas de cagnotte calculable", () => {
    expect(loyaltyOffer("-50% sur le 2ème", 3)).toBeNull();
    expect(loyaltyOffer("Prix Choc", 3)).toBeNull();
  });
});
