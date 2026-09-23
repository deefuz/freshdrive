import { describe, expect, it, vi } from "vitest";
import { makeProduct } from "../../../tests/helpers/factories";
import { FakeConnector } from "../../../tests/helpers/fake-connector";
import { fetchOffInfo } from "./off";
import { matchNeeds } from "./match";
import type { IngredientNeed } from "./needs";

const need = (searchQuery: string, quantity: number, unit: "g" | "ml" | "pce" = "g"): IngredientNeed => ({
  key: `${searchQuery}|${unit}`,
  name: searchQuery,
  searchQuery,
  unit,
  quantity,
  perRecipe: { r1: quantity },
  pantryStaple: false,
});
const opts = { preferOrganic: false, unprocessed: false };

describe("matchNeeds", () => {
  const cheap = makeProduct({ name: "Tomates cerises", price: 2.99, pack: { value: 250, unit: "g" } });
  const pricey = makeProduct({ name: "Tomates cerises allongées", price: 7.99, pack: { value: 1000, unit: "g" } });
  const offTopic = makeProduct({ name: "Ketchup", price: 1, pack: { value: 500, unit: "g" } });
  const outOfStock = makeProduct({ name: "Tomates cerises bio", price: 1, pack: { value: 500, unit: "g" }, stock: 0 });

  it("sans arbitre : garde les produits pertinents en stock, triés par score", async () => {
    const connector = new FakeConnector({ "tomates cerises": [pricey, offTopic, cheap, outOfStock] });
    const [m] = await matchNeeds([need("tomates cerises", 500)], opts, { connector });
    expect(m.chosen?.product).toBe(cheap);
    expect(m.alternatives.map((a) => a.product)).toEqual([pricey]);
  });

  it("suit le choix de l'arbitre, et -1 = aucun produit", async () => {
    const connector = new FakeConnector({ "tomates cerises": [cheap, pricey], courgette: [makeProduct({ name: "Courgette" }), makeProduct({ name: "Courgettes bio" })] });
    const arbiter = vi.fn(async () => new Map([["tomates cerises|g", 1], ["courgette|pce", -1]]));
    const [tomates, courgette] = await matchNeeds([need("tomates cerises", 500), need("courgette", 2, "pce")], opts, { connector, arbiter });
    expect(arbiter).toHaveBeenCalledTimes(1);
    expect(tomates.chosen?.product).toBe(pricey);
    expect(courgette.chosen).toBeNull();
  });

  it("aucun candidat : chosen null", async () => {
    const [m] = await matchNeeds([need("truffe", 10)], opts, { connector: new FakeConnector({}) });
    expect(m).toMatchObject({ chosen: null, alternatives: [] });
  });

  it("écarte un produit sans vendeur (pas de bouton panier)", async () => {
    const noSeller = makeProduct({ name: "Tomates cerises pas chères", price: 0.5, pack: { value: 250, unit: "g" }, sellerId: null });
    const connector = new FakeConnector({ "tomates cerises": [cheap, noSeller] });
    const [m] = await matchNeeds([need("tomates cerises", 500)], opts, { connector });
    expect(m.chosen?.product).toBe(cheap);
    expect(m.alternatives.map((a) => a.product)).not.toContain(noSeller);
  });

  it("filtre sans produits transformés : écarte un NOVA 4", async () => {
    const ultra = makeProduct({ name: "Sauce tomate", price: 1, pack: { value: 500, unit: "g" } });
    const raw = makeProduct({ name: "Pulpe de tomate", price: 2, pack: { value: 500, unit: "g" } });
    const connector = new FakeConnector({ "sauce tomate": [ultra, raw] });
    const novaLookup = vi.fn(async (p) => (p === ultra ? 4 : 1));
    const [m] = await matchNeeds([need("sauce tomate", 500)], { preferOrganic: false, unprocessed: true }, { connector, novaLookup });
    expect(m.chosen?.product).toBe(raw);
  });

  it("une erreur du lookup NOVA n'interrompt pas le matching (NOVA inconnu = accepté)", async () => {
    const a = makeProduct({ name: "Sauce tomate maison", price: 1, pack: { value: 500, unit: "g" } });
    const connector = new FakeConnector({ "sauce tomate": [a] });
    const novaLookup = vi.fn(async () => {
      throw new Error("OFF indisponible");
    });
    const [m] = await matchNeeds(
      [need("sauce tomate", 500)],
      { preferOrganic: false, unprocessed: true },
      { connector, novaLookup },
    );
    expect(m.chosen?.product).toBe(a);
  });

  it("préfère le produit brut à une forme transformée ou une autre variété moins chère", async () => {
    const frozen = makeProduct({ name: "Courgettes en rondelles", price: 1.29, pack: { value: 500, unit: "g" } });
    const fresh = makeProduct({ name: "Courgettes", price: 2.2, pack: { value: 1000, unit: "g" } });
    const chevre = makeProduct({ name: "Fromage frais de chèvre", price: 1.5, pack: { value: 200, unit: "g" } });
    const nature = makeProduct({ name: "Fromage frais nature", price: 1.9, pack: { value: 200, unit: "g" } });
    const connector = new FakeConnector({ courgette: [frozen, fresh], "fromage frais": [chevre, nature] });
    const fromage: IngredientNeed = { ...need("fromage frais", 200), name: "fromage frais nature" };
    const [c, f] = await matchNeeds([need("courgette", 400), fromage], opts, { connector });
    expect(c.chosen?.product).toBe(fresh);
    expect(f.chosen?.product).toBe(nature);
  });
});

describe("fetchOffInfo", () => {
  it("lit nova_group et nutriscore_grade", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ status: 1, product: { nova_group: 1, nutriscore_grade: "a" } }));
    await expect(fetchOffInfo("8005110170300", fetchFn)).resolves.toEqual({ nova: 1, nutriscore: "a" });
    expect(String(fetchFn.mock.calls[0][0])).toContain("/api/v2/product/8005110170300.json");
  });
  it("renvoie des null si le produit est inconnu", async () => {
    const fetchFn = vi.fn(async () => Response.json({ status: 0 }));
    await expect(fetchOffInfo("0", fetchFn)).resolves.toEqual({ nova: null, nutriscore: null });
  });
});
