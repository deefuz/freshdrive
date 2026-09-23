import { describe, expect, it } from "vitest";
import { makeProduct } from "../../../tests/helpers/factories";
import { FakeConnector } from "../../../tests/helpers/fake-connector";
import { hasStoreSession } from "./check";

describe("hasStoreSession", () => {
  it("vrai si la recherche renvoie des produits achetables (drive choisi)", async () => {
    await expect(hasStoreSession(new FakeConnector({ lait: [makeProduct()] }))).resolves.toBe(true);
  });
  it("faux si aucun produit n'a de magasin (pas connecté ou pas de drive)", async () => {
    await expect(hasStoreSession(new FakeConnector({ lait: [makeProduct({ sellerId: null })] }))).resolves.toBe(false);
  });
});
