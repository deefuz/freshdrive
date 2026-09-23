import type { StoreConnector } from "../types";

/** La session voit-elle un drive ? (sinon aucun produit n'a de bouton d'ajout au panier) */
export async function hasStoreSession(connector: Pick<StoreConnector, "searchProducts">): Promise<boolean> {
  return (await connector.searchProducts("lait")).some((p) => p.sellerId !== null);
}
