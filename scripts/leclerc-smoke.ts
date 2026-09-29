import type { LeclercConnector } from "@/lib/leclerc/connector";
import { openLeclerc } from "@/lib/leclerc/open";

/** Vérification en lecture seule de la session Leclerc Drive : rien n'est ajouté au panier. */
async function main() {
  const opened = await openLeclerc({ importChrome: !process.argv.includes("--no-chrome") });
  const c = opened.connector as LeclercConnector;
  console.log(`Magasin ${c.store.noPL} : ${c.store.origin}${c.store.storePath} (session ${opened.source})`);
  for (const w of opened.warnings) console.log(`⚠ ${w}`);

  for (const query of ["lait", "tomates"]) {
    const products = await c.searchProducts(query);
    console.log(`\nRecherche "${query}" : ${products.length} produits`);
    console.table(
      products.slice(0, 6).map((p) => ({
        nom: p.name,
        marque: p.brand ?? "",
        prix: p.price,
        paquet: p.pack ? `${p.pack.value}${p.pack.unit}` : "?",
        unitaire: p.unitPrice ? `${p.unitPrice}€/${p.unitPriceUnit}` : "?",
        bio: p.isOrganic,
        promo: p.promo?.label ?? "",
        stock: p.stock,
      })),
    );
  }

  const [lait] = await c.searchProducts("lait");
  if (lait) console.log("Fiche :", lait.name, await c.getProductDetails(lait.url));

  const ctx = await c.getStoreContext();
  console.log(`\nContexte : ${ctx.promos.length} promos, ${ctx.antiGaspi.length} anti-gaspi`);
  console.log(`Thèmes : ${ctx.themes.join(", ") || "(aucun)"}`);

  const cart = await c.getCart();
  console.log(`Panier : ${cart.items.length} lignes, ${cart.totalPrice} €`);
}

main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
