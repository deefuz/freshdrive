"use client";

import { useActionState, useState, useTransition } from "react";
import {
  chooseProductAction,
  reviseRecipeAction,
  setPantryAction,
  toggleFavoriteAction,
  toggleRecipeAction,
} from "@/app/actions";
import type { ActionResult } from "@/lib/app/action-result";

function useServerAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (call: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await call();
      setError(result.error);
    });
  return { pending, error, run };
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <span role="alert" className="block text-xs text-red-700">
      {error}
    </span>
  ) : null;
}

export function RecipeToggle({
  weekId,
  recipeId,
  selected,
  disabled,
}: {
  weekId: string;
  recipeId: string;
  selected: boolean;
  disabled: boolean;
}) {
  const { pending, error, run } = useServerAction();
  return (
    <label className="flex shrink-0 flex-col items-end gap-1 text-sm">
      <span className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={selected}
          disabled={pending || disabled}
          onChange={(e) => {
            const next = e.target.checked;
            run(() => toggleRecipeAction(weekId, recipeId, next));
          }}
          className="h-5 w-5 accent-emerald-600"
        />
        {selected ? "Retenue" : "Retenir"}
      </span>
      <ErrorText error={error} />
    </label>
  );
}

export function ProductPicker({
  weekId,
  ingredientKey,
  value,
  options,
}: {
  weekId: string;
  ingredientKey: string;
  value: string;
  options: { productId: string; label: string }[];
}) {
  const { pending, error, run } = useServerAction();
  return (
    <div>
      <select
        aria-label="Produit Auchan"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const productId = e.target.value;
          run(() => chooseProductAction(weekId, ingredientKey, productId));
        }}
        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
      >
        {value === "" && <option value="">Aucun produit retenu</option>}
        {options.map((o) => (
          <option key={o.productId} value={o.productId}>
            {o.label}
          </option>
        ))}
      </select>
      <ErrorText error={error} />
    </div>
  );
}

export function PantryToggle({ weekId, ingredientKey, inPantry }: { weekId: string; ingredientKey: string; inPantry: boolean }) {
  const { pending, error, run } = useServerAction();
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-700">
      <input
        type="checkbox"
        checked={inPantry}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          run(() => setPantryAction(weekId, ingredientKey, next));
        }}
      />
      Déjà au placard
      <ErrorText error={error} />
    </label>
  );
}

export function ReviseRecipeForm({ weekId, recipeId }: { weekId: string; recipeId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    reviseRecipeAction.bind(null, weekId, recipeId),
    { error: null },
  );
  return (
    <form action={formAction} className="space-y-2 border-t border-zinc-200 pt-3">
      <label className="block font-medium">
        Modifier cette recette
        <textarea
          name="instruction"
          rows={2}
          maxLength={500}
          required
          defaultValue={state.values?.instruction?.[0] ?? ""}
          placeholder="Ex. : moins épicé, sans four, remplacer le poisson par du poulet"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1 font-normal"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50"
      >
        {pending ? "Envoi…" : "Demander la modification"}
      </button>
      <p className="text-xs text-zinc-500">Claude réécrit la recette, puis MyFresh recherche à nouveau ses produits.</p>
    </form>
  );
}

export function FavoriteToggle({ weekId, recipeId, favorite }: { weekId: string; recipeId: string; favorite: boolean }) {
  const { pending, error, run } = useServerAction();
  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        aria-pressed={favorite}
        aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        title={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        disabled={pending}
        onClick={() => run(() => toggleFavoriteAction(weekId, recipeId, !favorite))}
        className={`text-xl leading-none disabled:opacity-50 ${favorite ? "text-amber-500" : "text-zinc-300 hover:text-amber-400"}`}
      >
        {favorite ? "★" : "☆"}
      </button>
      <ErrorText error={error} />
    </span>
  );
}
