import Link from "next/link";
import { connection } from "next/server";
import { badge, btn, card, link, pageTitle, sectionTitle } from "@/app/_components/ui";
import { getApp } from "@/lib/app/instance";
import { rankWaaohOffers } from "@/lib/budget/promo";
import { readCachedContext } from "@/lib/context/cache";
import { formatEur, formatWeekDate } from "@/lib/format";
import { spendingStats, type WeekSpend } from "@/lib/week/stats";

/** « 2026-09-23-1 » → « 23 sept. » */
function shortWeek(id: string): string {
  const [y, m, d] = id.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function Figure({ value, label, tone = "text-charcoal" }: { value: string; label: string; tone?: string }) {
  return (
    <div>
      <p className={`font-display text-3xl leading-none font-extrabold tracking-[-0.03em] tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1.5 text-sm text-graphite">{label}</p>
    </div>
  );
}

/** Colonnes empilées : payé (basilic) + économies promos (citron) = prix en rayon ; trait anthracite = budget. */
function SpendChart({ weeks }: { weeks: WeekSpend[] }) {
  // 12 % de marge au-dessus de la plus haute valeur pour que le trait de budget reste lisible
  const max = Math.max(...weeks.map((w) => Math.max(w.gross, w.budget))) * 1.12;
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <figure className="space-y-4">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-graphite">
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-[3px] bg-basil" aria-hidden="true" /> Payé
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-[3px] bg-lime" aria-hidden="true" /> Économies promos
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 bg-charcoal" aria-hidden="true" /> Budget
        </span>
      </div>
      <div className="relative h-56 border-b border-oat-line" role="img" aria-label="Dépenses par semaine, détail dans le tableau ci-dessous">
        <div className="absolute inset-0 flex items-end justify-around gap-2 px-1">
          {weeks.map((w) => (
            <div
              key={w.id}
              tabIndex={0}
              className="group relative flex h-full max-w-28 min-w-12 flex-1 items-end justify-center rounded focus-visible:bg-oat/60 hover:bg-oat/60"
            >
              <div className="flex w-full max-w-6 flex-col-reverse gap-0.5" style={{ height: pct(w.gross) }}>
                <div className={`bg-basil ${w.promoSaved > 0 ? "" : "rounded-t"}`} style={{ flex: `${w.net} 1 0` }} />
                {w.promoSaved > 0 && <div className="rounded-t bg-lime" style={{ flex: `${w.promoSaved} 1 0` }} />}
              </div>
              <div className="absolute inset-x-1 h-0.5 bg-charcoal" style={{ bottom: pct(w.budget) }} aria-hidden="true" />
              <div className="pointer-events-none absolute top-0 left-1/2 z-10 hidden w-52 -translate-x-1/2 rounded bg-charcoal p-3 text-xs text-cream shadow-lift group-hover:block group-focus-visible:block">
                <p className="font-bold">Semaine du {formatWeekDate(w.id)}</p>
                <p className="mt-1 flex justify-between">
                  <span>Payé</span> <span className="tabular-nums">{formatEur(w.net)}</span>
                </p>
                <p className="flex justify-between">
                  <span>Économies promos</span> <span className="tabular-nums">{formatEur(w.promoSaved)}</span>
                </p>
                <p className="flex justify-between">
                  <span>Cagnotte Waaoh</span> <span className="tabular-nums">{formatEur(w.loyalty)}</span>
                </p>
                <p className="flex justify-between">
                  <span>Budget</span> <span className="tabular-nums">{formatEur(w.budget)}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-around gap-2 px-1 text-xs text-pebble">
        {weeks.map((w) => (
          <span key={w.id} className="max-w-28 min-w-12 flex-1 text-center">
            {shortWeek(w.id)}
          </span>
        ))}
      </div>
      <details>
        <summary className="text-sm font-bold underline decoration-1 underline-offset-2">Voir le tableau</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-oat text-left text-xs font-bold tracking-[0.04em] text-graphite uppercase">
              <tr>
                <th className="px-3 py-2">Semaine</th>
                <th className="px-3 py-2 text-right">Payé</th>
                <th className="px-3 py-2 text-right">Promos</th>
                <th className="px-3 py-2 text-right">Waaoh</th>
                <th className="px-3 py-2 text-right">Budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-oat-line">
              {weeks.map((w) => (
                <tr key={w.id}>
                  <td className="px-3 py-2">
                    <Link href={`/semaines/${w.id}`} className={link}>
                      {formatWeekDate(w.id)}
                    </Link>
                  </td>
                  <td className={`px-3 py-2 text-right font-bold ${w.net > w.budget ? "text-tomato" : ""}`}>{formatEur(w.net)}</td>
                  <td className="px-3 py-2 text-right">{formatEur(w.promoSaved)}</td>
                  <td className="px-3 py-2 text-right">{formatEur(w.loyalty)}</td>
                  <td className="px-3 py-2 text-right">{formatEur(w.budget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export default async function SpendingPage() {
  await connection();
  const stats = spendingStats(getApp().listWeeks());
  const context = readCachedContext();
  const offers = context ? rankWaaohOffers(context.promos).slice(0, 8) : [];
  const withinBudget = stats.weeks.filter((w) => w.net <= w.budget).length;

  return (
    <div className="space-y-12">
      <div className="space-y-2">
        <h1 className={pageTitle}>Mes dépenses</h1>
        <p className="max-w-[70ch] text-graphite">
          {stats.weeks.length
            ? `${stats.weeks.length} semaine${stats.weeks.length > 1 ? "s" : ""} envoyée${stats.weeks.length > 1 ? "s" : ""} au panier depuis le ${formatWeekDate(stats.weeks[0].id)}. Montants estimés d'après le panier de chaque semaine.`
            : "Les dépenses apparaîtront ici dès qu'une semaine aura été envoyée au panier Auchan."}
        </p>
      </div>

      {stats.weeks.length > 0 ? (
        <>
          <section aria-label="Cumul" className="grid grid-cols-2 gap-6 rounded bg-oat px-6 py-5 md:grid-cols-4">
            <Figure value={formatEur(stats.totals.net)} label={`payés sur ${formatEur(stats.totals.budget)} de budget`} />
            <Figure value={formatEur(stats.totals.promoSaved)} label="économisés grâce aux promos" tone="text-basil" />
            <Figure value={formatEur(stats.totals.loyalty)} label="cagnottés sur la carte Waaoh" tone="text-basil" />
            <Figure value={`${withinBudget}/${stats.weeks.length}`} label="semaines dans le budget" />
          </section>

          <section className={`${card} space-y-4 p-6`}>
            <h2 className={sectionTitle}>Semaine après semaine</h2>
            <SpendChart weeks={stats.weeks} />
          </section>
        </>
      ) : (
        <div className={`${card} px-6 py-10 text-center`}>
          <p className="mx-auto max-w-[48ch] text-graphite">
            Prépare une semaine, vérifie le panier puis envoie-le : FreshDrive gardera la trace de ce que tu as dépensé et
            économisé.
          </p>
          <Link href="/semaines/nouvelle" className={`${btn.primary} mt-5`}>
            Préparer une semaine
          </Link>
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4">
          <h2 className={sectionTitle}>Mes produits Auchan préférés</h2>
          {stats.products.length ? (
            <ol className={`${card} divide-y divide-oat-line`}>
              {stats.products.slice(0, 12).map((p, i) => (
                <li key={p.productId} className="grid grid-cols-[1.75rem_1fr_auto] items-baseline gap-3 px-5 py-3">
                  <span className="font-display font-extrabold text-pebble tabular-nums">{i + 1}</span>
                  <div className="min-w-0">
                    <a href={p.product.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                      {p.product.brand ? `${p.product.brand} ` : ""}
                      {p.product.name}
                    </a>
                    <p className="text-sm text-graphite">
                      {p.weeks} semaine{p.weeks > 1 ? "s" : ""} · {p.packs} acheté{p.packs > 1 ? "s" : ""}
                      {p.product.promo && (
                        <span
                          className={`${badge} ml-2 ${p.product.promo.kind === "loyalty" ? "bg-lime text-charcoal" : "bg-beet text-paper"}`}
                        >
                          {p.product.promo.kind === "loyalty" ? "Waaoh" : "Promo"}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-sm font-bold tabular-nums">{formatEur(p.spent)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-graphite">Rien pour l&apos;instant.</p>
          )}
        </section>

        <section className="space-y-4">
          <h2 className={sectionTitle}>Cagnotter cette semaine</h2>
          <p className="text-sm text-graphite">
            Les offres Waaoh du moment qui rapportent le plus. FreshDrive les propose à Claude pour les recettes et les
            préfère à prix égal quand il choisit les produits.
          </p>
          {offers.length ? (
            <ul className={`${card} divide-y divide-oat-line`}>
              {offers.map((o) => (
                <li key={o.product.productId} className="flex items-baseline justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <a href={o.product.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline">
                      {o.product.brand ? `${o.product.brand} ` : ""}
                      {o.product.name}
                    </a>
                    <p className="text-xs text-pebble">
                      {formatEur(o.product.price)} · {o.product.promo?.label}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-sm">
                    <span className="font-bold text-basil tabular-nums">+{formatEur(o.credit)}</span>
                    <span className="block text-xs text-pebble">
                      pour {o.packs} acheté{o.packs > 1 ? "s" : ""}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-graphite">
              Les offres Waaoh seront chargées avec le contexte de la prochaine semaine.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
