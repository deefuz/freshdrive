import Link from "next/link";
import { connection } from "next/server";
import { ActionButton } from "@/app/_components/action-button";
import { checkSessionAction } from "@/app/actions";
import { getApp } from "@/lib/app/instance";
import { summarizeContext } from "@/lib/context/build";
import { readCachedContext } from "@/lib/context/cache";
import { formatDateTime, formatEur, formatWeekDate, JOB_LABELS, weekStatusLabel } from "@/lib/format";
import { weekTotals } from "@/lib/week/edit";

const card = "rounded-xl border border-zinc-200 bg-white p-4";

export default async function HomePage() {
  await connection();
  const app = getApp();
  const weeks = app.listWeeks();
  const job = app.runner.current();
  const context = readCachedContext();
  const session = app.session;

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
                <li key={w.id}>
                  <Link
                    href={`/semaines/${w.id}`}
                    className="flex flex-col gap-1 p-4 hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between"
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
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
