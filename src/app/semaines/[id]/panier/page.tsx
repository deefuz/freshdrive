import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ActionButton } from "@/app/_components/action-button";
import { JobProgress } from "@/app/_components/job-progress";
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
      <Link href={`/semaines/${week.id}`} className="text-sm text-emerald-700 underline">
        ← Retour à la semaine
      </Link>
      <h1 className="text-2xl font-semibold">Panier Auchan · semaine du {formatWeekDate(week.id)}</h1>
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
        <p className="text-zinc-600">La semaine n&apos;est pas encore prête.</p>
      </div>
    );
  }

  // Envoi déjà lancé pour cette semaine (peut-être interrompu) : le service refuse un nouvel envoi ;
  // pas la peine de lire le panier Auchan ni de proposer un bouton de confirmation.
  if (week.pushStartedAt) {
    return (
      <div className="space-y-4">
        {header}
        <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
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
        <p className="text-zinc-600">Aucun produit à envoyer : retiens au moins une recette.</p>
      </div>
    );
  }

  // Une tâche (sur une autre semaine) est en cours : elle occupe la session Auchan, on évite de la solliciter.
  if (app.runner.isBusy()) {
    return (
      <div className="space-y-4">
        {header}
        <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Une tâche MyFresh est en cours sur une autre semaine : réessaie une fois qu&apos;elle est terminée.
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
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          Échec de l&apos;envoi : {week.job.error}
        </p>
      )}
      {!preview ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-medium">Impossible de lire ton panier Auchan.</p>
          <p className="text-sm">{error}</p>
          <p className="mt-2 text-sm">
            Vérifie que tu es connecté sur auchan.fr dans Chrome, avec ton drive choisi, puis recharge la page.
          </p>
        </div>
      ) : (
        <>
          <p className="text-zinc-600">
            Voici ce que MyFresh va mettre dans ton panier. Les quantités s&apos;ajoutent à ce qui s&apos;y trouve déjà.
            MyFresh ne passe jamais commande : tu finaliseras sur auchan.fr.
          </p>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-600">
                <tr>
                  <th className="p-3">Produit</th>
                  <th className="p-3 text-right">À ajouter</th>
                  <th className="p-3 text-right">Déjà au panier</th>
                  <th className="p-3 text-right">Total dans le panier</th>
                  <th className="p-3 text-right">Coût</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {preview.rows.map((r) => (
                  <tr key={r.productId}>
                    <td className="p-3">
                      <a href={r.url} target="_blank" rel="noreferrer" className="font-medium underline">
                        {r.productName}
                      </a>
                      <span className="block text-xs text-zinc-500">{r.ingredients.join(", ")}</span>
                    </td>
                    <td className="p-3 text-right">{r.packs}</td>
                    <td className="p-3 text-right">{r.inCart}</td>
                    <td className="p-3 text-right font-medium">{r.finalQuantity}</td>
                    <td className="p-3 text-right">{formatEur(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Coût des produits ajoutés (prix en rayon) : {formatEur(preview.addedCost)}</p>
          <ActionButton
            action={confirmPushAction.bind(null, week.id)}
            label={`Confirmer l'ajout de ${preview.cartLines.length} produits au panier`}
            pendingLabel="Envoi…"
            variant="primary"
          />
        </>
      )}
    </div>
  );
}
