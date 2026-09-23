import Link from "next/link";
import { btn } from "@/app/_components/ui";
import { formatEur } from "@/lib/format";
import type { WeekTotals } from "@/lib/week/edit";

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
    <section
      aria-label="Budget de la semaine"
      className="sticky top-0 z-10 rounded bg-oat px-5 py-4 shadow-card print:static"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-56 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={`font-display text-3xl font-extrabold tracking-[-0.03em] tabular-nums ${totals.overBudget ? "text-tomato" : "text-basil"}`}
            >
              {formatEur(totals.net)}
            </span>
            <span className="text-graphite">sur {formatEur(totals.budget)}</span>
            <span className={`ml-auto text-sm font-bold ${totals.overBudget ? "text-tomato" : "text-charcoal"}`}>
              {totals.overBudget
                ? `${formatEur(-totals.remaining)} au-dessus du budget`
                : `Reste ${formatEur(totals.remaining)}`}
            </span>
          </p>
          <div
            className="mt-2 h-2.5 overflow-hidden rounded-full bg-paper"
            role="meter"
            aria-label="Part du budget utilisée"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div
              className={`h-full origin-left rounded-full transition-transform duration-300 ease-out-quart ${totals.overBudget ? "bg-tomato" : "bg-lime"}`}
              style={{ transform: `scaleX(${pct / 100})` }}
            />
          </div>
        </div>
        <div className="shrink-0">
          {pushed ? (
            <Link href={`/semaines/${weekId}/panier`} prefetch={false} className={btn.primary}>
              Voir le rapport d&apos;envoi
            </Link>
          ) : selected === 0 ? (
            <p className="max-w-60 text-sm text-graphite">Retiens au moins une recette pour préparer le panier.</p>
          ) : (
            <Link href={`/semaines/${weekId}/panier`} prefetch={false} className={btn.primary}>
              Vérifier le panier ({selected}/{dinners} dîners) →
            </Link>
          )}
        </div>
      </div>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-graphite">
        <span>Prix en rayon : {formatEur(totals.gross)}</span>
        {totals.promoSaved > 0 && (
          <span className="font-bold text-basil">Économies promos : {formatEur(totals.promoSaved)}</span>
        )}
        {totals.loyalty > 0 && <span>Cagnotte Waaoh : {formatEur(totals.loyalty)}</span>}
        {totals.basket.missing.length > 0 && (
          <span className="text-honey-ink">Introuvables : {totals.basket.missing.join(", ")}</span>
        )}
      </p>
    </section>
  );
}
