import { formatDateTime, formatEur } from "@/lib/format";
import type { PushReport } from "@/lib/store/weeks";

export function PushReportView({ report }: { report: PushReport }) {
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-emerald-50 p-3 text-emerald-900">
        Envoyé le {formatDateTime(report.pushedAt)} : {report.added.length} produit(s) ajouté(s),{" "}
        {report.adjusted.length} ajusté(s) par Auchan, {report.failed.length} en échec. Total du panier Auchan :{" "}
        {report.cartTotal !== null ? formatEur(report.cartTotal) : "total inconnu"}.
      </p>
      {report.adjusted.length > 0 && (
        <section>
          <h2 className="font-semibold">Ajustés par Auchan (stock)</h2>
          <ul className="list-disc pl-5 text-sm">
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
        <section>
          <h2 className="font-semibold text-red-800">En échec : à ajouter à la main</h2>
          <ul className="list-disc pl-5 text-sm">
            {report.failed.map((l) => (
              <li key={l.productId}>
                {l.url ? (
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-emerald-700 underline">
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
        <details>
          <summary className="cursor-pointer font-semibold">Produits ajoutés ({report.added.length})</summary>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {report.added.map((l) => (
              <li key={l.productId}>
                {l.name} : {l.actual} dans le panier
              </li>
            ))}
          </ul>
        </details>
      )}
      <a
        href="https://www.auchan.fr"
        target="_blank"
        rel="noreferrer"
        className="inline-block rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
      >
        Finaliser ma commande sur auchan.fr
      </a>
      <p className="text-sm text-zinc-500">
        MyFresh ne passe jamais commande : choisis ton créneau et paie sur le site Auchan.
      </p>
    </div>
  );
}
