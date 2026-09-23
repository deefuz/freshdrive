import Link from "next/link";
import { connection } from "next/server";
import { ActionButton } from "@/app/_components/action-button";
import { ConfirmActionButton } from "@/app/_components/confirm-action-button";
import { checkSessionAction, deleteWeekAction, removeFavoriteAction } from "@/app/actions";
import { getApp } from "@/lib/app/instance";
import { summarizeContext } from "@/lib/context/build";
import { readCachedContext } from "@/lib/context/cache";
import { formatDateTime, formatEur, formatWeekDate, JOB_LABELS, TAG_LABELS, weekStatusLabel } from "@/lib/format";
import { isPrintable } from "@/lib/print/sheet";
import { weekTotals } from "@/lib/week/edit";

const card = "rounded-xl border border-zinc-200 bg-white p-4";

export default async function HomePage() {
  await connection();
  const app = getApp();
  const weeks = app.listWeeks();
  const job = app.runner.current();
  const context = readCachedContext();
  const session = app.session;
  const favorites = app.favorites.list();

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className={card}>
          <h2 className="text-sm font-semibold text-zinc-500">Session Auchan</h2>
          {session ? (
            <p className={`mt-1 ${session.ok ? "text-emerald-700" : "text-red-700"}`}>
              {session.ok ? "✓ " : "✗ "}
              {session.message}
            </p>
          ) : (
            <p className="mt-1 text-zinc-600">Pas encore vérifiée.</p>
          )}
          {session && <p className="text-xs text-zinc-500">Vérifiée le {formatDateTime(session.checkedAt)}</p>}
          <ActionButton action={checkSessionAction} label="Vérifier la session" pendingLabel="Vérification…" />
        </div>
        <div className={card}>
          <h2 className="text-sm font-semibold text-zinc-500">Contexte de la semaine</h2>
          <p className="mt-1 text-zinc-700">
            {context ? summarizeContext(context) : "Pas encore chargé : il le sera à la création d'une semaine."}
          </p>
        </div>
        <div className={card}>
          <h2 className="text-sm font-semibold text-zinc-500">Claude</h2>
          <p className="mt-1 text-zinc-700">{app.backendLabel()}</p>
        </div>
      </section>

      {job?.status === "running" && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p>
            {JOB_LABELS[job.kind]} en cours : {job.step}…
          </p>
          <Link href={`/semaines/${job.weekId}`} className="font-medium underline">
            Voir la progression
          </Link>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Mes semaines</h1>
          <Link
            href="/semaines/nouvelle"
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Nouvelle semaine
          </Link>
        </div>
        {weeks.length === 0 ? (
          <p className="text-zinc-600">Aucune semaine pour l&apos;instant. Crée la première !</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
            {weeks.map((w) => {
              const titles = w.recipes.filter((r) => w.selectedRecipeIds.includes(r.id)).map((r) => r.title);
              const total = w.matches.length ? weekTotals(w).net : null;
              return (
                <li key={w.id} className="hover:bg-zinc-50">
                  <Link
                    href={`/semaines/${w.id}`}
                    className="flex flex-col gap-1 px-4 pt-4 pb-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">Semaine du {formatWeekDate(w.id)}</p>
                      <p className="text-sm text-zinc-600">
                        {titles.length
                          ? titles.join(" · ")
                          : `${w.brief.dinners} dîners, ${w.brief.adults} adulte(s), ${w.brief.children} enfant(s)`}
                      </p>
                    </div>
                    <p className="text-sm text-zinc-600">
                      {weekStatusLabel(w)}
                      {total !== null && ` · ${formatEur(total)}`}
                    </p>
                  </Link>
                  <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
                    {isPrintable(w) && (
                      <a
                        href={`/semaines/${w.id}/pdf?affichage=1`}
                        target="_blank"
                        rel="noopener"
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100"
                      >
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
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Mes favoris</h2>
        {favorites.length === 0 ? (
          <p className="text-zinc-600">
            Aucun favori pour l&apos;instant : touche l&apos;étoile d&apos;une recette pour la retrouver ici.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
            {favorites.map((f) => (
              <li key={f.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">★ {f.recipe.title}</p>
                  <p className="text-sm text-zinc-600">
                    {f.recipe.prepMinutes + f.recipe.cookMinutes} min
                    {f.recipe.tags.length ? ` · ${f.recipe.tags.map((t) => TAG_LABELS[t]).join(", ")}` : ""}
                    {` · semaine du ${formatWeekDate(f.sourceWeekId)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={{ pathname: "/semaines/nouvelle", query: { favori: f.id } }}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Réutiliser
                  </Link>
                  <ActionButton action={removeFavoriteAction.bind(null, f.id)} label="Retirer" pendingLabel="Retrait…" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
