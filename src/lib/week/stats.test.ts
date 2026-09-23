import { describe, expect, it } from "vitest";
import { makeMatch, makeNeed, makeProduct, makeWeek } from "../../../tests/helpers/factories";
import { spendingStats } from "./stats";

const riz = makeProduct({ productId: "riz", name: "Riz basmati", price: 2, unitPriceUnit: "pce", promo: { label: "10% Jour W! cagnottés", kind: "loyalty" } });
const poulet = makeProduct({ productId: "poulet", name: "Filets de poulet", price: 6, unitPriceUnit: "pce", promo: { label: "-50% sur le 2ème", kind: "price" } });

function week(id: string, status: "ready" | "pushed", products: { p: typeof riz; qty: number }[]) {
  return makeWeek({
    id,
    status,
    brief: { dinners: 2, adults: 2, children: 0, budgetEur: 30, filters: [], notes: "", preferOrganic: false },
    selectedRecipeIds: ["r"],
    matches: products.map(({ p, qty }) => makeMatch(makeNeed({ key: `${p.productId}|pce`, perRecipe: { r: qty } }), p)),
  });
}

describe("spendingStats", () => {
  const weeks = [
    week("2026-09-30", "pushed", [{ p: riz, qty: 1 }]),
    week("2026-09-23", "pushed", [
      { p: riz, qty: 1 },
      { p: poulet, qty: 2 },
    ]),
    week("2026-10-07", "ready", [{ p: poulet, qty: 1 }]),
  ];
  const stats = spendingStats(weeks);

  it("ne compte que les semaines envoyées au panier, de la plus ancienne à la plus récente", () => {
    expect(stats.weeks.map((w) => w.id)).toEqual(["2026-09-23", "2026-09-30"]);
    expect(stats.weeks[0]).toMatchObject({ gross: 14, promoSaved: 3, loyalty: 0.2, net: 11, budget: 30 });
    expect(stats.weeks[1]).toMatchObject({ gross: 2, promoSaved: 0, loyalty: 0.2, net: 2 });
  });

  it("cumule dépenses, économies et cagnotte", () => {
    expect(stats.totals).toEqual({ net: 13, gross: 16, promoSaved: 3, loyalty: 0.4, budget: 60 });
  });

  it("classe les produits les plus achetés (nombre de semaines, puis montant)", () => {
    expect(stats.products.map((p) => [p.productId, p.weeks, p.packs, p.spent])).toEqual([
      ["riz", 2, 2, 4],
      ["poulet", 1, 2, 12],
    ]);
  });

  it("sans semaine envoyée : rien à montrer", () => {
    expect(spendingStats([week("2026-10-07", "ready", [])])).toEqual({
      weeks: [],
      totals: { net: 0, gross: 0, promoSaved: 0, loyalty: 0, budget: 0 },
      products: [],
    });
  });
});
