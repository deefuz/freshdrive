import { btn, card, notice } from "@/app/_components/ui";
import { formatDateTime, formatEur } from "@/lib/format";
import type { PushReport } from "@/lib/store/weeks";

export function PushReportView({ report }: { report: PushReport }) {
  return (
    <div className="space-y-6">
      <p className={`${notice.success} text-base`}>
        Envoyé le {formatDateTime(report.pushedAt)} : {report.added.length} produit(s) ajouté(s),{" "}
        {report.adjusted.length} ajusté(s) par Auchan, {report.failed.length} en échec. Total du panier Auchan :{" "}
        {report.cartTotal !== null ? formatEur(report.cartTotal) : "total inconnu"}.
      </p>
      {report.adjusted.length > 0 && (
        <section className={`${card} p-5`}>
          <h2 className="font-sans text-base font-bold tracking-normal">Ajustés par Auchan (stock)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {report.adjusted.map((l) => (
              <li key={l.productId}>
                {l.name} :{" "}
                {l.actual === 0 ? "retiré par Auchan (rupture)" : `${l.actual} dans le panier au lieu de ${l.requested}`}
              </li>
            ))}
          </ul>
        </section>
      )}
      {report.failed.length > 0 && (
        <section className="rounded bg-tomato-wash p-5 text-tomato">
          <h2 className="font-sans text-base font-bold tracking-normal">En échec : à ajouter à la main</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {report.failed.map((l) => (
              <li key={l.productId}>
                {l.url ? (
                  <a href={l.url} target="_blank" rel="noreferrer" className="font-medium underline decoration-1 underline-offset-2">
                    {l.name}
                  </a>
                ) : (
                  l.name
                )}{" "}
                ({l.error})
              </li>
            ))}
          </ul>
        </section>
      )}
      {report.added.length > 0 && (
        <details className={`${card} px-5 py-4`}>
          <summary className="font-bold">Produits ajoutés ({report.added.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {report.added.map((l) => (
              <li key={l.productId}>
                {l.name} : {l.actual} dans le panier
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="space-y-2">
        <a href="https://www.auchan.fr" target="_blank" rel="noreferrer" className={btn.primary}>
          Finaliser ma commande sur auchan.fr
        </a>
        <p className="text-sm text-pebble">
          MyFresh ne passe jamais commande : choisis ton créneau et paie sur le site Auchan.
        </p>
      </div>
    </div>
  );
}
