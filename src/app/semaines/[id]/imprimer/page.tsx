import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { badge, btn, card, field, fieldLabel, link, pageTitle } from "@/app/_components/ui";
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

function RecipeSheet({ recipe, first }: { recipe: PrintRecipe; first: boolean }) {
  return (
    <article className={`space-y-3 ${first ? "" : "print:break-before-page"}`}>
      <header className="border-b-2 border-charcoal pb-3">
        <h2 className="text-[2rem] leading-[1.1] tracking-[-0.025em]">{recipe.title}</h2>
        {recipe.summary && <p className="mt-1 text-graphite">{recipe.summary}</p>}
        <p className="mt-2 text-sm text-graphite">
          Préparation {recipe.prepMinutes} min · cuisson {recipe.cookMinutes} min · {recipe.servings} portions
          {recipe.tags.length ? ` · ${recipe.tags.join(", ")}` : ""}
        </p>
      </header>
      {recipe.whyThisWeek && (
        <p className="rounded bg-lime-wash px-3 py-2 text-sm text-basil-deep">
          <span className="font-bold">Pourquoi cette semaine : </span>
          {recipe.whyThisWeek}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-[2fr_3fr] print:grid-cols-[2fr_3fr]">
        <section>
          <h3 className="text-xs font-bold tracking-[0.04em] uppercase">Ingrédients</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                <span className="font-bold">{ing.quantity}</span> {ing.name}
                <span className="block text-xs text-pebble">
                  {ing.inPantry ? "déjà au placard" : (ing.product ?? "pas de produit Auchan")}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="text-xs font-bold tracking-[0.04em] uppercase">Étapes</h3>
          <ol className="mt-2 space-y-2 text-sm">
            {recipe.steps.map((step, i) => (
              <li
                key={i}
                className={`grid grid-cols-[1.5rem_1fr] gap-2 ${step.kid ? "-mx-2 rounded bg-honey-wash px-2 py-1" : ""}`}
              >
                <span className="font-display font-extrabold tabular-nums">{i + 1}</span>
                <span>
                  {step.text}
                  {step.kid && (
                    <span className={`${badge} ml-2 border border-honey-ink/40 bg-paper text-honey-ink`}>
                      Avec les enfants
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <p className="text-xs text-pebble">Nutrition estimée par portion (estimation de Claude) : {recipe.nutrition}</p>
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
        <h1 className={pageTitle}>Impression</h1>
        <p className="text-graphite">Rien à imprimer : la semaine n&apos;est pas prête ou aucune recette n&apos;est retenue.</p>
        <Link href={`/semaines/${week.id}`} className={link}>
          ← Retour à la semaine
        </Link>
      </div>
    );
  }

  const data = buildPrintData(week, options);
  const { shopping } = data;
  return (
    <div className="space-y-6 print:space-y-4 print:text-[11pt]">
      <form method="get" className={`${card} space-y-4 p-5 print:hidden`}>
        <input type="hidden" name="o" value="1" />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={fieldLabel}>
            Nom de la famille
            <input name="famille" defaultValue={options.family} maxLength={MAX_FAMILY_LENGTH} className={field} />
          </label>
          <fieldset>
            <legend className="text-sm font-bold">Sections à imprimer</legend>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
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
        <label className={fieldLabel}>
          Notes
          <textarea name="notes" rows={2} defaultValue={options.notes} maxLength={MAX_NOTES_LENGTH} className={field} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={btn.secondary}>
            Mettre à jour l&apos;aperçu
          </button>
          <PrintButton />
          <a href={`/semaines/${week.id}/pdf?${printQuery(options)}`} className={btn.primary}>
            Télécharger le PDF
          </a>
          <Link href={`/semaines/${week.id}`} className={`${link} text-sm`}>
            ← Retour à la semaine
          </Link>
        </div>
        <p className="text-xs text-pebble">Le PDF reprend les options de l&apos;aperçu (clique d&apos;abord sur « Mettre à jour l&apos;aperçu »).</p>
      </form>

      <header className="space-y-2">
        <h1 className={pageTitle}>{data.family ? `Les dîners de la famille ${data.family}` : "Nos dîners"}</h1>
        <p className="text-graphite">
          {data.heading} · {data.recipes.map((r) => r.title).join(" · ")}
        </p>
        {data.notes && <p className="rounded border border-oat-line bg-paper p-3 text-sm whitespace-pre-line">{data.notes}</p>}
      </header>

      {!data.showRecipes && !data.showShopping && (
        <p className="text-graphite print:hidden">Choisis au moins une section à imprimer.</p>
      )}

      {data.showRecipes && data.recipes.map((r, i) => <RecipeSheet key={r.id} recipe={r} first={i === 0} />)}

      {data.showShopping && (
        <section className={`space-y-3 ${data.showRecipes ? "print:break-before-page" : ""}`}>
          <h2 className="text-[2rem] leading-[1.1] tracking-[-0.025em]">Liste de courses</h2>
          <table className="w-full text-sm">
            <thead className="border-b-2 border-charcoal text-left text-xs font-bold tracking-[0.04em] uppercase">
              <tr>
                <th className="py-1 pr-2">Produit Auchan</th>
                <th className="py-1 pr-2">Pour</th>
                <th className="py-1 pr-2 text-right">Quantité</th>
                <th className="py-1 text-right">Coût</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-oat-line tabular-nums">
              {shopping.lines.map((l) => (
                <tr key={l.key} className="break-inside-avoid">
                  <td className="py-1 pr-2">
                    ☐ {l.product}
                    {l.promo && <span className="ml-1 text-xs font-medium text-basil">({l.promo})</span>}
                    {l.uncertain && <span className="ml-1 text-xs text-honey-ink">(quantité à vérifier)</span>}
                  </td>
                  <td className="py-1 pr-2 text-graphite">{l.ingredient}</td>
                  <td className="py-1 pr-2 text-right">{l.packs}</td>
                  <td className="py-1 text-right">{formatEur(l.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm">
            Total estimé : <span className="font-bold">{formatEur(shopping.net)}</span> (prix en rayon{" "}
            {formatEur(shopping.gross)}
            {shopping.promoSaved > 0 ? `, économies promos ${formatEur(shopping.promoSaved)}` : ""}) · budget{" "}
            {formatEur(shopping.budget)}
          </p>
          {shopping.missing.length > 0 && (
            <p className="text-sm text-honey-ink">Introuvables chez Auchan : {shopping.missing.join(", ")}</p>
          )}
          {shopping.pantry.length > 0 && (
            <div>
              <h3 className="text-xs font-bold tracking-[0.04em] uppercase">Déjà au placard</h3>
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
