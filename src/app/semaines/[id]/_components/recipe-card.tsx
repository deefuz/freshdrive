import { badge, card } from "@/app/_components/ui";
import { formatQty, TAG_LABELS } from "@/lib/format";
import type { Recipe } from "@/lib/recipes/schema";
import { FavoriteToggle, RecipeToggle, ReviseRecipeForm } from "./week-controls";

export function RecipeCard({
  weekId,
  recipe,
  selected,
  full,
  pushed,
  favorite,
  visual,
  drawing,
}: {
  weekId: string;
  recipe: Recipe;
  selected: boolean;
  full: boolean;
  /** semaine déjà envoyée au panier : la recette ne peut plus être modifiée */
  pushed: boolean;
  /** recette en favori (étoile pleine) */
  favorite: boolean;
  /** adresse de l'illustration de la recette, s'il y en a une */
  visual: string | null;
  /** illustration en train d'être dessinée */
  drawing: boolean;
}) {
  const kids = new Set(recipe.kidSteps ?? []);
  const n = recipe.nutritionPerServing;
  return (
    <article
      className={`${card} flex flex-col transition-shadow duration-200 ${selected ? "ring-3 ring-vichy" : "hover:shadow-lift"}`}
    >
      {visual ? (
        // eslint-disable-next-line @next/next/no-img-element -- SVG local servi par une route, pas d'optimisation utile
        <img src={visual} alt="" className="aspect-[16/7] w-full rounded-t object-cover" />
      ) : (
        drawing && (
          <div className="flex aspect-[16/7] w-full items-center justify-center rounded-t bg-oat">
            <p className="flex items-center gap-2 text-sm text-graphite">
              <span className="size-2 animate-pulse rounded-full bg-vichy" aria-hidden="true" />
              Illustration en cours…
            </p>
          </div>
        )
      )}
      <div className="flex flex-1 flex-col px-5 pt-4 pb-4">
        <div className="flex min-h-6 items-start justify-between gap-3">
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {selected && <span className={`${badge} bg-vichy text-paper`}>Retenue</span>}
            {kids.size > 0 && <span className={`${badge} bg-honey-wash text-honey-ink`}>Avec les enfants</span>}
          </div>
          <FavoriteToggle weekId={weekId} recipeId={recipe.id} favorite={favorite} />
        </div>
        <h3 className="mt-1 text-lg leading-snug font-medium">{recipe.title}</h3>
        <p className="mt-1 text-sm text-graphite">{recipe.summary}</p>
        {recipe.whyThisWeek && (
          <p className="mt-3 rounded bg-lime-wash px-3 py-2 text-sm text-basil-deep">
            <span className="font-bold">Cette semaine : </span>
            {recipe.whyThisWeek}
          </p>
        )}
        <details className="group mt-3">
          <summary className="inline-flex list-none items-center gap-1.5 rounded text-sm font-bold underline decoration-1 underline-offset-2 [&::-webkit-details-marker]:hidden">
            <span className="inline-block transition-transform duration-150 group-open:rotate-90" aria-hidden="true">
              ›
            </span>
            Détail de la recette
          </summary>
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <h4 className="font-bold">Ingrédients</h4>
              <ul className="mt-1.5 space-y-1">
                {recipe.ingredients.map((i, index) => (
                  <li key={index} className="flex justify-between gap-3 border-b border-dotted border-oat-line pb-1">
                    <span>
                      {i.name}
                      {i.pantryStaple && <span className="text-pebble"> (placard)</span>}
                    </span>
                    <span className="shrink-0 text-graphite tabular-nums">{formatQty(i.quantity, i.unit)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-bold">Étapes</h4>
              <ol className="mt-1.5 space-y-2">
                {recipe.steps.map((s, index) => (
                  <li
                    key={index}
                    className={`grid grid-cols-[1.5rem_1fr] gap-2 ${kids.has(index) ? "-mx-2 rounded bg-honey-wash px-2 py-1.5" : ""}`}
                  >
                    <span className="font-display font-extrabold tabular-nums">{index + 1}</span>
                    <span>
                      {s}
                      {kids.has(index) && (
                        <span className={`${badge} ml-2 bg-paper text-honey-ink`}>Avec les enfants</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <p className="text-pebble">
              Nutrition estimée par portion : {Math.round(n.kcal)} kcal · protéines {Math.round(n.proteinG)} g · glucides{" "}
              {Math.round(n.carbsG)} g · lipides {Math.round(n.fatG)} g
            </p>
            {!pushed && <ReviseRecipeForm weekId={weekId} recipeId={recipe.id} />}
          </div>
        </details>
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-oat-line px-5 py-3">
        <p className="text-sm text-graphite">
          <span className="font-bold text-charcoal">{recipe.prepMinutes + recipe.cookMinutes} min</span>
          <span className="mx-2 text-oat-line" aria-hidden="true">
            |
          </span>
          {recipe.servings} portions
          {recipe.tags.length ? ` • ${recipe.tags.map((t) => TAG_LABELS[t]).join(" • ")}` : ""}
        </p>
        <RecipeToggle weekId={weekId} recipeId={recipe.id} selected={selected} disabled={!selected && full} />
      </footer>
    </article>
  );
}
