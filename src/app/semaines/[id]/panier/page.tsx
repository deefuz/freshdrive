import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ActionButton } from "@/app/_components/action-button";
import { JobProgress } from "@/app/_components/job-progress";
import { card, link, notice, pageTitle } from "@/app/_components/ui";
import { confirmPushAction } from "@/app/actions";
import { getApp } from "@/lib/app/instance";
import { type PushPreview, previewPush } from "@/lib/cart/push";
import { formatEur, formatWeekDate } from "@/lib/format";
import { weekTotals } from "@/lib/week/edit";
import { cartView } from "@/lib/week/view";
import { PushReportView } from "./push-report";

export default async function CartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const app = getApp();
  const week = app.getWeek(id);
  if (!week) notFound();

  const view = cartView(week);
  const header = (
    <>
      <Link href={`/semaines/${week.id}`} className={`${link} text-sm`}>
        ← Retour à la semaine
      </Link>
      <h1 className={pageTitle}>Panier Auchan</h1>
      <p className="-mt-3 text-graphite">Semaine du {formatWeekDate(week.id)}</p>
    </>
  );

  if (view === "progress" && week.job) {
    return (
      <div className="space-y-4">
        {header}
        <JobProgress job={week.job} />
      </div>
    );
  }
  if (view === "report" && week.pushReport) {
    return (
      <div className="space-y-4">
        {header}
        <PushReportView report={week.pushReport} />
      </div>
    );
  }
  if (view === "not-ready") {
    return (
      <div className="space-y-4">
        {header}
        <p className="text-graphite">La semaine n&apos;est pas encore prête.</p>
      </div>
    );
  }

  // Envoi déjà lancé pour cette semaine (peut-être interrompu) : le service refuse un nouvel envoi ;
  // pas la peine de lire le panier Auchan ni de proposer un bouton de confirmation.
  if (week.pushStartedAt) {
    return (
      <div className="space-y-4">
        {header}
        <p role="alert" className={notice.warning}>
          Un envoi au panier a déjà été lancé pour cette semaine (peut-être interrompu). Vérifie ton panier sur
          auchan.fr avant toute action.
        </p>
      </div>
    );
  }

  const { basket } = weekTotals(week);
  if (!basket.lines.length) {
    return (
      <div className="space-y-4">
        {header}
        <p className="text-graphite">Aucun produit à envoyer : retiens au moins une recette.</p>
      </div>
    );
  }

  // Une tâche (sur une autre semaine) est en cours : elle occupe la session Auchan, on évite de la solliciter.
  if (app.runner.isBusy()) {
    return (
      <div className="space-y-4">
        {header}
        <p role="alert" className={notice.warning}>
          Une tâche FreshDrive est en cours sur une autre semaine : réessaie une fois qu&apos;elle est terminée.
        </p>
      </div>
    );
  }

  let preview: PushPreview | null = null;
  let error: string | null = null;
  try {
    const connector = await app.openStore();
    preview = previewPush(await connector.getCart(), basket.lines);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="space-y-4">
      {header}
      {week.job?.kind === "push" && week.job.status === "error" && (
        <p role="alert" className={notice.error}>
          Échec de l&apos;envoi : {week.job.error}
        </p>
      )}
      {!preview ? (
        <div className="rounded bg-tomato-wash p-5 text-tomato">
          <p className="font-bold">Impossible de lire ton panier Auchan.</p>
          <p className="text-sm">{error}</p>
          <p className="mt-2 text-sm">
            Vérifie que tu es connecté sur auchan.fr dans Chrome, avec ton drive choisi, puis recharge la page.
          </p>
        </div>
      ) : (
        <>
          <p className="max-w-[70ch] text-graphite">
            Voici ce que FreshDrive va mettre dans ton panier. Les quantités s&apos;ajoutent à ce qui s&apos;y trouve déjà.
            FreshDrive ne passe jamais commande : tu finaliseras sur auchan.fr.
          </p>
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className="bg-oat text-left text-xs font-bold tracking-[0.04em] text-graphite uppercase">
                <tr>
                  <th className="px-4 py-3">Produit</th>
                  <th className="p-3 text-right">À ajouter</th>
                  <th className="p-3 text-right">Déjà au panier</th>
                  <th className="p-3 text-right">Total dans le panier</th>
                  <th className="p-3 text-right">Coût</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-oat-line tabular-nums">
                {preview.rows.map((r) => (
                  <tr key={r.productId}>
                    <td className="px-4 py-3">
                      <a href={r.url} target="_blank" rel="noreferrer" className="font-medium underline decoration-1 underline-offset-2 hover:text-basil">
                        {r.productName}
                      </a>
                      <span className="block text-xs text-pebble">{r.ingredients.join(", ")}</span>
                    </td>
                    <td className="p-3 text-right">{r.packs}</td>
                    <td className="p-3 text-right">{r.inCart}</td>
                    <td className="p-3 text-right font-bold">{r.finalQuantity}</td>
                    <td className="p-3 text-right">{formatEur(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded bg-oat px-5 py-4">
            <p className="text-graphite">
              Coût des produits ajoutés (prix en rayon) :{" "}
              <span className="font-display text-2xl font-extrabold tracking-[-0.03em] text-charcoal tabular-nums">
                {formatEur(preview.addedCost)}
              </span>
            </p>
            <ActionButton
            action={confirmPushAction.bind(null, week.id)}
            label={`Confirmer l'ajout de ${preview.cartLines.length} produits au panier`}
            pendingLabel="Envoi…"
              variant="primary"
            />
          </div>
        </>
      )}
    </div>
  );
}
