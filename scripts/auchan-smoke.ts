import { AuchanConnector } from "@/lib/auchan/connector";
import { AuchanHttp } from "@/lib/auchan/http";
import { loadSession } from "@/lib/auchan/session";

async function main() {
  const session = loadSession();
  const c = new AuchanConnector(new AuchanHttp(session), session);

  const products = await c.searchProducts("tomates");
  console.log(`Recherche "tomates" : ${products.length} produits`);
  console.table(
    products.slice(0, 6).map((p) => ({
      nom: p.name,
      marque: p.brand ?? "",
      prix: p.price,
      paquet: p.pack ? `${p.pack.value}${p.pack.unit}` : "?",
      unitaire: p.unitPrice ? `${p.unitPrice}€/${p.unitPriceUnit}` : "?",
      bio: p.isOrganic,
      saison: p.isSeasonal,
      promo: p.promo?.label ?? "",
      stock: p.stock,
      vendeur: p.sellerId ? "ok" : "absent",
    })),
  );

  const packaged = (await c.searchProducts("pulpe de tomates")).find((p) => p.brand);
  if (packaged) console.log("Fiche :", packaged.name, await c.getProductDetails(packaged.url));

  const ctx = await c.getStoreContext();
  console.log(`Contexte : ${ctx.promos.length} promos, ${ctx.antiGaspi.length} anti-gaspi`);
  console.log(`Thèmes : ${ctx.themes.join(", ") || "(aucun)"}`);

  const cart = await c.getCart();
  console.log(`Panier : ${cart.items.length} lignes, ${cart.totalPrice} €`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
