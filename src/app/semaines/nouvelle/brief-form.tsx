"use client";

import { useActionState } from "react";
import { createWeekAction } from "@/app/actions";
import type { ActionResult } from "@/lib/app/action-result";
import { type Brief, DIET_FILTERS } from "@/lib/recipes/brief";
import { FILTER_UI_LABELS } from "@/lib/week/brief-form";

const field = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-normal";
const label = "block text-sm font-medium";

export function BriefForm({
  initial,
  favorites,
  preselected,
}: {
  initial: Brief;
  /** favoris proposés à la reprise */
  favorites: { id: string; title: string }[];
  /** favoris cochés d'avance (lien « Réutiliser » de l'accueil) */
  preselected: string[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createWeekAction, { error: null });
  // après un refus, on réaffiche ce qui a été saisi (React réinitialise le formulaire après l'action)
  const sent = state.values;
  const text = (name: string, fallback: string | number) => sent?.[name]?.[0] ?? String(fallback);
  return (
    <form action={formAction} className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <label className={label}>
          Dîners
          <input name="dinners" type="number" min={1} max={7} required defaultValue={text("dinners", initial.dinners)} className={field} />
        </label>
        <label className={label}>
          Adultes
          <input name="adults" type="number" min={1} required defaultValue={text("adults", initial.adults)} className={field} />
        </label>
        <label className={label}>
          Enfants
          <input name="children" type="number" min={0} required defaultValue={text("children", initial.children)} className={field} />
        </label>
        <label className={label}>
          Budget (€)
          <input
            name="budgetEur"
            type="text"
            inputMode="decimal"
            required
            defaultValue={text("budgetEur", String(initial.budgetEur).replace(".", ","))}
            className={field}
          />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Contraintes</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {DIET_FILTERS.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="filters" value={f} defaultChecked={sent ? (sent.filters ?? []).includes(f) : initial.filters.includes(f)} />
              {FILTER_UI_LABELS[f]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="preferOrganic" defaultChecked={sent ? sent.preferOrganic !== undefined : initial.preferOrganic} />
        Bio de préférence
      </label>
      <label className={label}>
        Précisions
        <textarea
          name="notes"
          rows={3}
          maxLength={1000}
          defaultValue={text("notes", initial.notes)}
          placeholder="Ex. : pas de poisson, un plat sans four, Léa n'aime pas les champignons"
          className={field}
        />
      </label>
      {favorites.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium">Reprendre des favoris</legend>
          <p className="text-xs text-zinc-500">
            Ajoutés au menu et retenus d&apos;office (un par dîner au plus) ; Claude complète avec d&apos;autres recettes.
          </p>
          <div className="mt-2 flex flex-wrap gap-4">
            {favorites.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="favorites"
                  value={f.id}
                  defaultChecked={sent ? (sent.favorites ?? []).includes(f.id) : preselected.includes(f.id)}
                />
                ★ {f.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? "Lancement…" : "Préparer la semaine"}
      </button>
    </form>
  );
}
