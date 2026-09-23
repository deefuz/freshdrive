"use client";

import { useActionState, useState, useTransition } from "react";
import {
  chooseProductAction,
  reviseRecipeAction,
  setPantryAction,
  toggleFavoriteAction,
  toggleRecipeAction,
} from "@/app/actions";
import { btn, chip, chipInput, field, fieldLabel } from "@/app/_components/ui";
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
    <span role="alert" className="block text-xs text-tomato">
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
    <span className="flex shrink-0 flex-col items-end gap-1">
      <label className={chip} title={disabled ? "Tous les dîners sont déjà choisis : retire d'abord une recette" : undefined}>
        <input
          type="checkbox"
          checked={selected}
          disabled={pending || disabled}
          onChange={(e) => {
            const next = e.target.checked;
            run(() => toggleRecipeAction(weekId, recipeId, next));
          }}
          className={chipInput}
        />
        <span aria-hidden="true">{selected ? "✓" : "+"}</span>
        {selected ? "Retenue" : "Retenir"}
      </label>
      <ErrorText error={error} />
    </span>
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
        className={`${field} text-sm`}
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
    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-graphite">
      <input
        type="checkbox"
        checked={inPantry}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          run(() => setPantryAction(weekId, ingredientKey, next));
        }}
        className="size-4"
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
    <form action={formAction} className="space-y-2.5 border-t border-oat-line pt-4">
      <label className={fieldLabel}>
        Modifier cette recette
        <textarea
          name="instruction"
          rows={2}
          maxLength={500}
          required
          defaultValue={state.values?.instruction?.[0] ?? ""}
          placeholder="Ex. : moins épicé, sans four, remplacer le poisson par du poulet"
          className={`${field} leading-normal`}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-tomato">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={btn.secondary}
      >
        {pending ? "Envoi…" : "Demander la modification"}
      </button>
      <p className="text-pebble">Claude réécrit la recette, puis FreshDrive recherche à nouveau ses produits.</p>
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
        className={`-mt-2 -mr-2 inline-flex size-10 items-center justify-center rounded-full text-2xl leading-none transition-colors duration-150 hover:bg-oat disabled:opacity-50 ${favorite ? "text-basil" : "text-pebble hover:text-charcoal"}`}
      >
        {favorite ? "★" : "☆"}
      </button>
      <ErrorText error={error} />
    </span>
  );
}
