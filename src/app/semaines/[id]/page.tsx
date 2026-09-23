import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ActionButton } from "@/app/_components/action-button";
import { ConfirmActionButton } from "@/app/_components/confirm-action-button";
import { JobProgress } from "@/app/_components/job-progress";
import { btn, notice, pageTitle, sectionTitle } from "@/app/_components/ui";
import { addRecipesAction, deleteWeekAction, retryCreateAction } from "@/app/actions";
import { getApp } from "@/lib/app/instance";
import { ADD_RECIPES_COUNT, MAX_WEEK_RECIPES } from "@/lib/app/service";
import { formatWeekDate, JOB_LABELS } from "@/lib/format";
import { isPrintable } from "@/lib/print/sheet";
import { productRows, weekTotals } from "@/lib/week/edit";
import { visualUrl } from "@/lib/visuals";
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
  const heading = <h1 className={pageTitle}>Semaine du {formatWeekDate(week.id)}</h1>;

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
        <div className="rounded bg-bordeaux-wash p-5 text-bordeaux">
          <p className="font-bold">La préparation de la semaine n&apos;a pas abouti.</p>
          {week.job?.error && <p className="mt-1 text-sm">{week.job.error}</p>}
          <ActionButton
            className="mt-4"
            action={retryCreateAction.bind(null, week.id)}
            label="Relancer"
            pendingLabel="Relance…"
            variant="primary"
          />
        </div>
        <ConfirmActionButton
          action={deleteWeekAction.bind(null, week.id, true)}
          label="Supprimer cette semaine"
          confirmLabel="Confirmer la suppression"
          pendingLabel="Suppression…"
        />
      </div>
    );
  }

  const totals = weekTotals(week);
  const full = week.selectedRecipeIds.length >= week.brief.dinners;
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {heading}
        {isPrintable(week) && (
          <Link href={`/semaines/${week.id}/imprimer`} prefetch={false} className={btn.secondary}>
            Imprimer / PDF
          </Link>
        )}
      </div>
      {week.contextSummary && (
        <p className="-mt-3 max-w-[75ch] text-sm text-graphite">Contexte Auchan : {week.contextSummary}</p>
      )}
      {week.job?.status === "error" && (
        <p role="alert" className={notice.error}>
          {JOB_LABELS[week.job.kind]} : échec. {week.job.error}
        </p>
      )}
      {week.warnings?.map((w) => (
        <p key={w} role="status" className={notice.warning}>
          {w}
        </p>
      ))}
      {week.status === "pushed" && (
        <p role="status" className={notice.info}>
          Panier déjà envoyé : ces modifications ne changent plus ton panier Auchan.
        </p>
      )}
      {week.pushStartedAt && week.status !== "pushed" && (
        <p role="alert" className={notice.warning}>
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
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={sectionTitle}>Recettes</h2>
          <p className="text-sm text-graphite">
            <span className="font-bold text-charcoal tabular-nums">
              {week.selectedRecipeIds.length}/{week.brief.dinners}
            </span>{" "}
            dîners retenus
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {week.recipes.map((r) => (
            <RecipeCard
              key={r.id}
              weekId={week.id}
              recipe={r}
              selected={week.selectedRecipeIds.includes(r.id)}
              full={full}
              pushed={week.status === "pushed"}
              favorite={app.favorites.has(r.title)}
              visual={visualUrl(r.title)}
            />
          ))}
        </div>
        {week.status !== "pushed" && week.recipes.length < MAX_WEEK_RECIPES && (
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <ActionButton
              action={addRecipesAction.bind(null, week.id)}
              label={`Proposer ${ADD_RECIPES_COUNT} autres recettes`}
              pendingLabel="Demande envoyée…"
            />
            <p className="max-w-[60ch] text-sm text-pebble">
              Claude ajoute de nouvelles idées sans toucher à tes recettes retenues, à tes produits ni au placard.
            </p>
          </div>
        )}
      </section>
      <ProductList weekId={week.id} rows={productRows(week)} />
      <section className="space-y-2 border-t border-oat-line pt-6">
        <ConfirmActionButton
          action={deleteWeekAction.bind(null, week.id, true)}
          label="Supprimer cette semaine"
          confirmLabel="Confirmer la suppression"
          pendingLabel="Suppression…"
        />
        <p className="text-sm text-pebble">
          La semaine est déplacée dans data/weeks/corbeille (récupérable). Ton panier Auchan n&apos;est pas modifié.
        </p>
      </section>
    </div>
  );
}
