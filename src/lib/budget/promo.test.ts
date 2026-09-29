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

describe("promoEffect : libellés Leclerc", () => {
  it("le Nème à -X % (remise immédiate)", () => {
    const label = "Le 2ème est à -60% (le moins cher des 2), profitez-en !";
    expect(promoEffect(label, 2, 2)).toEqual({ saved: 1.2, loyalty: 0 });
    expect(promoEffect(label, 2, 1)).toEqual({ saved: 0, loyalty: 0 });
    expect(promoEffect("Le 2ème article à -40% (le moins cher des 2), profitez-en !", 5, 4).saved).toBe(4);
  });

  it("le Nème offert", () => {
    expect(promoEffect("Le 3ème est offert (le moins cher des 3), profitez-en !", 1.5, 3)).toEqual({ saved: 1.5, loyalty: 0 });
    expect(promoEffect("Le 3ème est offert (le moins cher des 3), profitez-en !", 1.5, 2).saved).toBe(0);
  });

  it("Ticket E.Leclerc : pourcentage, montant fixe, sur le Nème et dès N produits", () => {
    const suffix = "Offre réservée aux porteurs de la Carte E.Leclerc.";
    expect(promoEffect(`Recevez 30% en Ticket E.Leclerc. ${suffix}`, 2, 2)).toEqual({ saved: 0, loyalty: 1.2 });
    expect(promoEffect(`Recevez 0.40 € en Ticket E.Leclerc. ${suffix}`, 2, 3)).toEqual({ saved: 0, loyalty: 1.2 });
    expect(promoEffect(`Le 2ème à -50% en ticket E.LECLERC (le moins cher des 2). ${suffix}`, 3, 2)).toEqual({
      saved: 0,
      loyalty: 1.5,
    });
    expect(
      promoEffect(`Recevez 80% en Ticket E.Leclerc dès 2 produits achetés (plusieurs variétés au choix). ${suffix}`, 2, 3),
    ).toEqual({ saved: 0, loyalty: 1.6 });
  });

  it("avantage immédiat : déjà déduit du prix, aucun effet en plus", () => {
    expect(promoEffect("Avantage immédiat de 34%", 6.61, 2)).toEqual({ saved: 0, loyalty: 0 });
  });

  it("avantage immédiat et ticket combinés", () => {
    expect(promoEffect("Avantage immédiat de 20% · Recevez 10% en Ticket E.Leclerc.", 4, 1)).toEqual({ saved: 0, loyalty: 0.4 });
  });
});

describe("loyaltyOffer", () => {
  it("cagnotte simple : dès le premier paquet", () => {
    expect(loyaltyOffer("Prix Choc · 10% Jour W! cagnottés", 4)).toEqual({ packs: 1, credit: 0.4 });
  });

  it("cagnotte sur le Nème : il faut N paquets", () => {
    expect(loyaltyOffer("50 % cagnottés sur le 2ème", 3)).toEqual({ packs: 2, credit: 1.5 });
  });

  it("Ticket E.Leclerc sur le Nème : il faut N paquets", () => {
    expect(loyaltyOffer("Le 2ème à -50% en ticket E.LECLERC (le moins cher des 2).", 3)).toEqual({ packs: 2, credit: 1.5 });
  });

  it("pas de cagnotte calculable", () => {
    expect(loyaltyOffer("-50% sur le 2ème", 3)).toBeNull();
    expect(loyaltyOffer("Prix Choc", 3)).toBeNull();
  });
});
