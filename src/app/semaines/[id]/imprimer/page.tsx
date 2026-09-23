import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getApp } from "@/lib/app/instance";
import { formatEur } from "@/lib/format";
import {
  buildPrintData,
  isPrintable,
  MAX_FAMILY_LENGTH,
  MAX_NOTES_LENGTH,
  parsePrintOptions,
  type PrintRecipe,
  printQuery,
  type SearchParams,
} from "@/lib/print/sheet";
import { PrintButton } from "./print-button";

const field = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-normal";

function RecipeSheet({ recipe, first }: { recipe: PrintRecipe; first: boolean }) {
  return (
    <article className={`space-y-3 ${first ? "" : "print:break-before-page"}`}>
      <header className="border-b border-zinc-300 pb-2">
        <h2 className="text-2xl font-semibold">{recipe.title}</h2>
        {recipe.summary && <p className="text-zinc-700">{recipe.summary}</p>}
        <p className="mt-1 text-sm text-zinc-600">
          Préparation {recipe.prepMinutes} min · cuisson {recipe.cookMinutes} min · {recipe.servings} portions
          {recipe.tags.length ? ` · ${recipe.tags.join(", ")}` : ""}
        </p>
      </header>
      {recipe.whyThisWeek && (
        <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">
          <span className="font-medium">Pourquoi cette semaine : </span>
          {recipe.whyThisWeek}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-[2fr_3fr] print:grid-cols-[2fr_3fr]">
        <section>
          <h3 className="font-semibold">Ingrédients</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                <span className="font-medium">{ing.quantity}</span> {ing.name}
                <span className="block text-xs text-zinc-600">
                  {ing.inPantry ? "déjà au placard" : (ing.product ?? "pas de produit Auchan")}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="font-semibold">Étapes</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
            {recipe.steps.map((step, i) => (
              <li key={i} className={step.kid ? "rounded bg-amber-50 px-1" : undefined}>
                {step.text}
                {step.kid && (
                  <span className="ml-2 rounded bg-amber-200 px-1.5 text-xs font-medium text-amber-900">
                    Avec les enfants
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>
      <p className="text-xs text-zinc-600">Nutrition estimée par portion (estimation de Claude) : {recipe.nutrition}</p>
    </article>
  );
}

export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const options = parsePrintOptions(await searchParams);
  await connection();
  const week = getApp().getWeek(id);
  if (!week) notFound();

  if (!isPrintable(week)) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Impression</h1>
        <p className="text-zinc-700">Rien à imprimer : la semaine n&apos;est pas prête ou aucune recette n&apos;est retenue.</p>
        <Link href={`/semaines/${week.id}`} className="text-emerald-700 underline">
          ← Retour à la semaine
        </Link>
      </div>
    );
  }

  const data = buildPrintData(week, options);
  const { shopping } = data;
  return (
    <div className="space-y-6 print:space-y-4 print:text-[11pt]">
      <form method="get" className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 print:hidden">
        <input type="hidden" name="o" value="1" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Nom de la famille
            <input name="famille" defaultValue={options.family} maxLength={MAX_FAMILY_LENGTH} className={field} />
          </label>
          <fieldset>
            <legend className="text-sm font-medium">Sections à imprimer</legend>
            <div className="mt-2 flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="sections" value="recettes" defaultChecked={data.showRecipes} />
                Fiches recettes
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="sections" value="courses" defaultChecked={data.showShopping} />
                Liste de courses
              </label>
            </div>
          </fieldset>
        </div>
        <label className="block text-sm font-medium">
          Notes
          <textarea name="notes" rows={2} defaultValue={options.notes} maxLength={MAX_NOTES_LENGTH} className={field} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100"
          >
            Mettre à jour l&apos;aperçu
          </button>
          <PrintButton />
          <a
            href={`/semaines/${week.id}/pdf?${printQuery(options)}`}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Télécharger le PDF
          </a>
          <Link href={`/semaines/${week.id}`} className="text-sm text-emerald-700 underline">
            ← Retour à la semaine
          </Link>
        </div>
        <p className="text-xs text-zinc-500">Le PDF reprend les options de l&apos;aperçu (clique d&apos;abord sur « Mettre à jour l&apos;aperçu »).</p>
      </form>

      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">{data.family ? `Les dîners de la famille ${data.family}` : "Nos dîners"}</h1>
        <p className="text-zinc-600">
          {data.heading} · {data.recipes.map((r) => r.title).join(" · ")}
        </p>
        {data.notes && <p className="whitespace-pre-line rounded-lg border border-zinc-300 p-3 text-sm">{data.notes}</p>}
      </header>

      {!data.showRecipes && !data.showShopping && (
        <p className="text-zinc-700 print:hidden">Choisis au moins une section à imprimer.</p>
      )}

      {data.showRecipes && data.recipes.map((r, i) => <RecipeSheet key={r.id} recipe={r} first={i === 0} />)}

      {data.showShopping && (
        <section className={`space-y-3 ${data.showRecipes ? "print:break-before-page" : ""}`}>
          <h2 className="text-2xl font-semibold">Liste de courses</h2>
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-300 text-left text-zinc-600">
              <tr>
                <th className="py-1 pr-2">Produit Auchan</th>
                <th className="py-1 pr-2">Pour</th>
                <th className="py-1 pr-2 text-right">Quantité</th>
                <th className="py-1 text-right">Coût</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {shopping.lines.map((l) => (
                <tr key={l.key} className="break-inside-avoid">
                  <td className="py-1 pr-2">
                    ☐ {l.product}
                    {l.promo && <span className="ml-1 text-xs text-emerald-700">({l.promo})</span>}
                    {l.uncertain && <span className="ml-1 text-xs text-amber-700">(quantité à vérifier)</span>}
                  </td>
                  <td className="py-1 pr-2 text-zinc-600">{l.ingredient}</td>
                  <td className="py-1 pr-2 text-right">{l.packs}</td>
                  <td className="py-1 text-right">{formatEur(l.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm">
            Total estimé : <span className="font-semibold">{formatEur(shopping.net)}</span> (prix en rayon{" "}
            {formatEur(shopping.gross)}
            {shopping.promoSaved > 0 ? `, économies promos ${formatEur(shopping.promoSaved)}` : ""}) · budget{" "}
            {formatEur(shopping.budget)}
          </p>
          {shopping.missing.length > 0 && (
            <p className="text-sm text-amber-800">Introuvables chez Auchan : {shopping.missing.join(", ")}</p>
          )}
          {shopping.pantry.length > 0 && (
            <div>
              <h3 className="font-semibold">Déjà au placard</h3>
              <ul className="mt-1 columns-2 text-sm">
                {shopping.pantry.map((p) => (
                  <li key={p.name}>
                    {p.name} ({p.quantity})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
