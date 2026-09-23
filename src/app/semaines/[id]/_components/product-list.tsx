import { card, link, sectionTitle } from "@/app/_components/ui";
import { formatEur, formatQty, productLabel } from "@/lib/format";
import type { ProductRow } from "@/lib/week/edit";
import { PantryToggle, ProductPicker } from "./week-controls";

export function ProductList({ weekId, rows }: { weekId: string; rows: ProductRow[] }) {
  if (!rows.length) return null;
  return (
    <section>
      <h2 className={`${sectionTitle} mb-4`}>Produits</h2>
      <ul className={`${card} divide-y divide-oat-line`}>
        {rows.map((row) => (
          <li
            key={row.key}
            className={`grid gap-3 px-5 py-4 sm:grid-cols-[1fr_2fr_auto] sm:items-center ${row.inPantry ? "bg-cream" : ""}`}
          >
            <div>
              <p className={`font-medium ${row.inPantry ? "text-pebble line-through decoration-1" : ""}`}>{row.name}</p>
              <p className="text-xs text-pebble">{formatQty(row.quantity, row.unit)} pour les recettes retenues</p>
            </div>
            <div>
              {row.options.length ? (
                <ProductPicker
                  weekId={weekId}
                  ingredientKey={row.key}
                  value={row.chosen?.product.productId ?? ""}
                  options={row.options.map((c) => ({ productId: c.product.productId, label: productLabel(c.product) }))}
                />
              ) : (
                <p className="text-sm font-medium text-honey-ink">Aucun produit trouvé chez Auchan</p>
              )}
              {row.chosen?.product.url && (
                <a
                  href={row.chosen.product.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`${link} mt-1 inline-block text-xs`}
                >
                  Voir sur auchan.fr
                </a>
              )}
            </div>
            <div className="flex items-center gap-4 sm:justify-end">
              <PantryToggle weekId={weekId} ingredientKey={row.key} inPantry={row.inPantry} />
              <p className="w-40 text-right text-sm tabular-nums">
                {row.line ? `${row.line.packs} × ${formatEur(row.line.product.price)} = ${formatEur(row.line.cost)}` : "—"}
                {row.line?.uncertainQuantity && <span className="block text-xs font-medium text-honey-ink">quantité à vérifier</span>}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
