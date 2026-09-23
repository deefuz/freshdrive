import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ActionButton } from "@/app/_components/action-button";
import { JobProgress } from "@/app/_components/job-progress";
import { retryCreateAction } from "@/app/actions";
import { getApp } from "@/lib/app/instance";
import { formatWeekDate, JOB_LABELS } from "@/lib/format";
import { productRows, weekTotals } from "@/lib/week/edit";
import { weekView } from "@/lib/week/view";
import { BudgetBar } from "./_components/budget-bar";
import { ProductList } from "./_components/product-list";
import { RecipeCard } from "./_components/recipe-card";

export default async function WeekPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const app = getApp();
  const week = app.getWeek(id);
  if (!week) notFound();

  const view = weekView(week);
  const heading = <h1 className="text-2xl font-semibold">Semaine du {formatWeekDate(week.id)}</h1>;

  if (view === "progress" && week.job) {
    return (
      <div className="space-y-4">
        {heading}
        <JobProgress job={week.job} />
      </div>
    );
  }

  if (view === "retry") {
    return (
      <div className="space-y-4">
        {heading}
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-medium">La préparation de la semaine n&apos;a pas abouti.</p>
          {week.job?.error && <p className="mt-1 text-sm">{week.job.error}</p>}
          <ActionButton
            action={retryCreateAction.bind(null, week.id)}
            label="Relancer"
            pendingLabel="Relance…"
            variant="primary"
          />
        </div>
      </div>
    );
  }

  const totals = weekTotals(week);
  const full = week.selectedRecipeIds.length >= week.brief.dinners;
  return (
    <div className="space-y-6">
      {heading}
      {week.contextSummary && <p className="text-sm text-zinc-600">Contexte Auchan : {week.contextSummary}</p>}
      {week.job?.status === "error" && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {JOB_LABELS[week.job.kind]} : échec. {week.job.error}
        </p>
      )}
      {week.warnings?.map((w) => (
        <p key={w} role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {w}
        </p>
      ))}
      {week.status === "pushed" && (
        <p role="status" className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
          Panier déjà envoyé : ces modifications ne changent plus ton panier Auchan.
        </p>
      )}
      {week.pushStartedAt && week.status !== "pushed" && (
        <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Un envoi au panier a déjà été lancé pour cette semaine (peut-être interrompu) : vérifie ton panier sur
          auchan.fr avant toute action.
        </p>
      )}
      <BudgetBar
        weekId={week.id}
        totals={totals}
        selected={week.selectedRecipeIds.length}
        dinners={week.brief.dinners}
        pushed={week.status === "pushed"}
      />
      <section>
        <h2 className="mb-3 text-xl font-semibold">
          Recettes ({week.selectedRecipeIds.length}/{week.brief.dinners} retenues)
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {week.recipes.map((r) => (
            <RecipeCard
              key={r.id}
              weekId={week.id}
              recipe={r}
              selected={week.selectedRecipeIds.includes(r.id)}
              full={full}
              pushed={week.status === "pushed"}
              favorite={app.favorites.has(r.title)}
            />
          ))}
        </div>
      </section>
      <ProductList weekId={week.id} rows={productRows(week)} />
    </div>
  );
}
