import Link from "next/link";
import { formatEur } from "@/lib/format";
import type { WeekTotals } from "@/lib/week/edit";

const primary = "inline-block rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700";

export function BudgetBar({
  weekId,
  totals,
  selected,
  dinners,
  pushed,
}: {
  weekId: string;
  totals: WeekTotals;
  selected: number;
  dinners: number;
  pushed: boolean;
}) {
  const pct = Math.min(100, Math.round((totals.net / totals.budget) * 100));
  return (
    <section className="sticky top-0 z-10 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg">
          <span className={`font-semibold ${totals.overBudget ? "text-red-700" : "text-emerald-700"}`}>
            {formatEur(totals.net)}
          </span>{" "}
          <span className="text-zinc-500">/ budget {formatEur(totals.budget)}</span>
        </p>
        <p className="text-sm text-zinc-600">
          {totals.overBudget
            ? `${formatEur(-totals.remaining)} au-dessus du budget`
            : `Reste ${formatEur(totals.remaining)}`}
        </p>
      </div>
      <div className="mt-2 h-2 rounded bg-zinc-200">
        <div
          className={`h-2 rounded ${totals.overBudget ? "bg-red-600" : "bg-emerald-600"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
        <span>Prix en rayon : {formatEur(totals.gross)}</span>
        {totals.promoSaved > 0 && <span className="text-emerald-700">Économies promos : {formatEur(totals.promoSaved)}</span>}
        {totals.loyalty > 0 && <span>Cagnotte Waaoh : {formatEur(totals.loyalty)}</span>}
        {totals.basket.missing.length > 0 && (
          <span className="text-amber-700">Introuvables : {totals.basket.missing.join(", ")}</span>
        )}
      </div>
      <div className="mt-3">
        {pushed ? (
          <Link href={`/semaines/${weekId}/panier`} className={primary}>
            Voir le rapport d&apos;envoi
          </Link>
        ) : selected === 0 ? (
          <p className="text-sm text-zinc-500">Retiens au moins une recette pour préparer le panier.</p>
        ) : (
          <Link href={`/semaines/${weekId}/panier`} className={primary}>
            Vérifier le panier ({selected}/{dinners} dîners) →
          </Link>
        )}
      </div>
    </section>
  );
}
