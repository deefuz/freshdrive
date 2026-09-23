import { formatEur, formatQty, productLabel } from "@/lib/format";
import type { ProductRow } from "@/lib/week/edit";
import { PantryToggle, ProductPicker } from "./week-controls";

export function ProductList({ weekId, rows }: { weekId: string; rows: ProductRow[] }) {
  if (!rows.length) return null;
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold">Produits</h2>
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
        {rows.map((row) => (
          <li
            key={row.key}
            className={`grid gap-2 p-3 sm:grid-cols-[1fr_2fr_auto] sm:items-center ${row.inPantry ? "opacity-60" : ""}`}
          >
            <div>
              <p className="font-medium">{row.name}</p>
              <p className="text-xs text-zinc-500">{formatQty(row.quantity, row.unit)} pour les recettes retenues</p>
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
                <p className="text-sm text-amber-700">Aucun produit trouvé chez Auchan</p>
              )}
              {row.chosen?.product.url && (
                <a
                  href={row.chosen.product.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-700 underline"
                >
                  Voir sur auchan.fr
                </a>
              )}
            </div>
            <div className="flex items-center gap-4 sm:justify-end">
              <PantryToggle weekId={weekId} ingredientKey={row.key} inPantry={row.inPantry} />
              <p className="w-40 text-right text-sm">
                {row.line ? `${row.line.packs} × ${formatEur(row.line.product.price)} = ${formatEur(row.line.cost)}` : "—"}
                {row.line?.uncertainQuantity && <span className="block text-xs text-amber-700">quantité à vérifier</span>}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
