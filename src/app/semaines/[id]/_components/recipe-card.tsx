import { formatQty, TAG_LABELS } from "@/lib/format";
import type { Recipe } from "@/lib/recipes/schema";
import { RecipeToggle, ReviseRecipeForm } from "./week-controls";

export function RecipeCard({
  weekId,
  recipe,
  selected,
  full,
}: {
  weekId: string;
  recipe: Recipe;
  selected: boolean;
  full: boolean;
}) {
  const kids = new Set(recipe.kidSteps ?? []);
  const n = recipe.nutritionPerServing;
  return (
    <article
      className={`rounded-xl border bg-white p-4 ${selected ? "border-emerald-500 ring-1 ring-emerald-500" : "border-zinc-200"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{recipe.title}</h3>
          <p className="text-sm text-zinc-600">{recipe.summary}</p>
        </div>
        <RecipeToggle weekId={weekId} recipeId={recipe.id} selected={selected} disabled={!selected && full} />
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {recipe.prepMinutes + recipe.cookMinutes} min · {recipe.servings} portions
        {recipe.tags.length ? ` · ${recipe.tags.map((t) => TAG_LABELS[t]).join(", ")}` : ""}
      </p>
      {recipe.whyThisWeek && <p className="mt-2 text-sm text-emerald-800">{recipe.whyThisWeek}</p>}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-zinc-700">Détail de la recette</summary>
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <h4 className="font-medium">Ingrédients</h4>
            <ul className="list-disc pl-5">
              {recipe.ingredients.map((i, index) => (
                <li key={index}>
                  {i.name} : {formatQty(i.quantity, i.unit)}
                  {i.pantryStaple ? " (placard)" : ""}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-medium">Étapes</h4>
            <ol className="list-decimal space-y-1 pl-5">
              {recipe.steps.map((s, index) => (
                <li key={index} className={kids.has(index) ? "rounded bg-amber-50 px-1" : undefined}>
                  {s}
                  {kids.has(index) && (
                    <span className="ml-2 rounded bg-amber-200 px-1.5 text-xs font-medium text-amber-900">
                      Avec les enfants
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <p className="text-zinc-600">
            Nutrition estimée par portion : {Math.round(n.kcal)} kcal · protéines {Math.round(n.proteinG)} g · glucides{" "}
            {Math.round(n.carbsG)} g · lipides {Math.round(n.fatG)} g
          </p>
          <ReviseRecipeForm weekId={weekId} recipeId={recipe.id} />
        </div>
      </details>
    </article>
  );
}
