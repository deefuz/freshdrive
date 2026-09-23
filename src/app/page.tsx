import Link from "next/link";
import { connection } from "next/server";
import { ActionButton } from "@/app/_components/action-button";
import { ConfirmActionButton } from "@/app/_components/confirm-action-button";
import { StatusPanel } from "@/app/_components/status-panel";
import { badge, btn, card, pageTitle, sectionTitle } from "@/app/_components/ui";
import { deleteWeekAction, removeFavoriteAction } from "@/app/actions";
import { getApp } from "@/lib/app/instance";
import { readCachedContext } from "@/lib/context/cache";
import { formatEur, formatWeekDate, JOB_LABELS, TAG_LABELS, weekStatusLabel } from "@/lib/format";
import { isPrintable } from "@/lib/print/sheet";
import type { Week } from "@/lib/store/weeks";
import { visualUrl } from "@/lib/visuals";
import { weekTotals } from "@/lib/week/edit";

/** Couleur du badge de statut : bleu envoyée, basilic prête, bordeaux envoi interrompu, miel sinon. */
function statusBadge(week: Week): string {
  if (week.pushStartedAt && week.status !== "pushed") return "bg-bordeaux text-paper";
  if (week.status === "pushed") return "bg-blueberry text-paper";
  if (week.status === "ready") return "bg-basil text-paper";
  return "bg-honey-wash text-honey-ink";
}

export default async function HomePage() {
  await connection();
  const app = getApp();
  const weeks = app.listWeeks();
  const job = app.runner.current();
  const context = readCachedContext();
  const session = app.session;
  const favorites = app.favorites.list();

  return (
    <div className="space-y-14">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className={pageTitle}>Mes semaines</h1>
          <Link href="/semaines/nouvelle" className={btn.primary}>
            Préparer une semaine
          </Link>
        </div>

        <StatusPanel session={session} context={context} backend={app.backendLabel()} />

        {job?.status === "running" && (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded bg-lime-wash px-5 py-4" aria-live="polite">
            <p className="flex items-center gap-3 text-basil-deep">
              <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-vichy" aria-hidden="true" />
              {JOB_LABELS[job.kind]} en cours : {job.step}…
            </p>
            <Link href={`/semaines/${job.weekId}`} className={btn.secondary}>
              Voir la progression
            </Link>
          </section>
        )}
      </div>

      <section className="space-y-4">
        {weeks.length === 0 ? (
          <div className={`${card} px-6 py-10 text-center`}>
            <p className="font-display text-2xl font-extrabold tracking-[-0.02em]">Aucune semaine pour l&apos;instant</p>
            <p className="mx-auto mt-2 max-w-[48ch] text-graphite">
              Dis combien de dîners tu veux et ton budget : Claude propose les recettes avec les promos Auchan du moment.
            </p>
            <Link href="/semaines/nouvelle" className={`${btn.primary} mt-5`}>
              Préparer ma première semaine
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {weeks.map((w) => {
              const titles = w.recipes.filter((r) => w.selectedRecipeIds.includes(r.id)).map((r) => r.title);
              const total = w.matches.length ? weekTotals(w).net : null;
              return (
                <li key={w.id} className={`${card} group transition-shadow duration-200 hover:shadow-lift`}>
                  <Link href={`/semaines/${w.id}`} className="block rounded px-5 pt-4 pb-3">
                    <span className={`${badge} ${statusBadge(w)}`}>{weekStatusLabel(w)}</span>
                    <p className="mt-2 text-lg font-medium group-hover:underline">Semaine du {formatWeekDate(w.id)}</p>
                    <p className="mt-0.5 text-sm text-graphite">
                      {titles.length
                        ? titles.join(" · ")
                        : `${w.brief.adults} adulte(s), ${w.brief.children} enfant(s)`}
                    </p>
                  </Link>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-oat-line px-5 py-3">
                    <p className="text-sm text-graphite">
                      <span className="font-bold text-charcoal">{w.brief.dinners} dîners</span>
                      {total !== null && (
                        <>
                          <span className="mx-2 text-oat-line" aria-hidden="true">
                            |
                          </span>
                          {formatEur(total)} sur {formatEur(w.brief.budgetEur)}
                        </>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {isPrintable(w) && (
                        <a href={`/semaines/${w.id}/pdf?affichage=1`} target="_blank" rel="noopener" className={btn.secondary}>
                          Voir le PDF des recettes
                        </a>
                      )}
                      <ConfirmActionButton
                        action={deleteWeekAction.bind(null, w.id, false)}
                        label="Supprimer"
                        confirmLabel="Confirmer la suppression"
                        pendingLabel="Suppression…"
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className={sectionTitle}>Mes favoris</h2>
        {favorites.length === 0 ? (
          <p className="max-w-[65ch] text-graphite">
            Aucun favori pour l&apos;instant : touche l&apos;étoile d&apos;une recette pour la retrouver ici et la
            reprendre une autre semaine.
          </p>
        ) : (
          <ul className={`${card} divide-y divide-oat-line`}>
            {favorites.map((f) => {
              const visual = visualUrl(f.recipe.title);
              return (
                <li key={f.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    {visual && (
                      // eslint-disable-next-line @next/next/no-img-element -- SVG local servi par une route
                      <img src={visual} alt="" className="aspect-[16/10] w-20 shrink-0 rounded object-cover" />
                    )}
                    <div>
                      <p className="font-medium">
                        <span className="mr-1.5 text-basil" aria-hidden="true">
                          ★
                        </span>
                        {f.recipe.title}
                      </p>
                      <p className="mt-0.5 text-sm text-graphite">
                        <span className="font-bold text-charcoal">{f.recipe.prepMinutes + f.recipe.cookMinutes} min</span>
                        {f.recipe.tags.length ? ` · ${f.recipe.tags.map((t) => TAG_LABELS[t]).join(" • ")}` : ""}
                        {` · semaine du ${formatWeekDate(f.sourceWeekId)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={{ pathname: "/semaines/nouvelle", query: { favori: f.id } }} className={btn.secondary}>
                      Réutiliser
                    </Link>
                    <ActionButton action={removeFavoriteAction.bind(null, f.id)} label="Retirer" pendingLabel="Retrait…" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
