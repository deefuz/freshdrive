"use client";

import { useActionState } from "react";
import { btn, card, chip, chipInput, field, fieldLabel, notice } from "@/app/_components/ui";
import { createWeekAction } from "@/app/actions";
import type { ActionResult } from "@/lib/app/action-result";
import { type Brief, DIET_FILTERS } from "@/lib/recipes/brief";
import { FILTER_UI_LABELS } from "@/lib/week/brief-form";

const legend = "text-sm font-bold text-charcoal";

/** Coche affichée dans une pastille cochée */
function Check() {
  return (
    <span className="hidden peer-checked:inline" aria-hidden="true">
      ✓
    </span>
  );
}

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
    <form action={formAction} className={`${card} space-y-7 p-5 sm:p-7`}>
      <div className="grid gap-4 sm:grid-cols-4">
        <label className={fieldLabel}>
          Dîners
          <input name="dinners" type="number" min={1} max={7} required defaultValue={text("dinners", initial.dinners)} className={field} />
        </label>
        <label className={fieldLabel}>
          Adultes
          <input name="adults" type="number" min={1} required defaultValue={text("adults", initial.adults)} className={field} />
        </label>
        <label className={fieldLabel}>
          Enfants
          <input name="children" type="number" min={0} required defaultValue={text("children", initial.children)} className={field} />
        </label>
        <label className={fieldLabel}>
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
        <legend className={legend}>Contraintes</legend>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {DIET_FILTERS.map((f) => (
            <label key={f} className={chip}>
              <input
                type="checkbox"
                name="filters"
                value={f}
                defaultChecked={sent ? (sent.filters ?? []).includes(f) : initial.filters.includes(f)}
                className={chipInput}
              />
              <Check />
              {FILTER_UI_LABELS[f]}
            </label>
          ))}
          <label className={chip}>
            <input
              type="checkbox"
              name="preferOrganic"
              defaultChecked={sent ? sent.preferOrganic !== undefined : initial.preferOrganic}
              className={chipInput}
            />
            <Check />
            Bio de préférence
          </label>
        </div>
      </fieldset>
      <label className={fieldLabel}>
        Précisions
        <textarea
          name="notes"
          rows={3}
          maxLength={1000}
          defaultValue={text("notes", initial.notes)}
          placeholder="Ex. : pas de poisson, un plat sans four, Léa n'aime pas les champignons"
          className={`${field} leading-normal`}
        />
      </label>
      {favorites.length > 0 && (
        <fieldset>
          <legend className={legend}>Reprendre des favoris</legend>
          <p className="mt-0.5 text-sm text-pebble">
            Ajoutés au menu et retenus d&apos;office (un par dîner au plus) ; Claude complète avec d&apos;autres recettes.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {favorites.map((f) => (
              <label key={f.id} className={chip}>
                <input
                  type="checkbox"
                  name="favorites"
                  value={f.id}
                  defaultChecked={sent ? (sent.favorites ?? []).includes(f.id) : preselected.includes(f.id)}
                  className={chipInput}
                />
                <Check />
                {f.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {state.error && (
        <p role="alert" className={notice.error}>
          {state.error}
        </p>
      )}
      <div className="border-t border-oat-line pt-5">
        <button type="submit" disabled={pending} className={btn.primary}>
          {pending ? "Lancement…" : "Préparer la semaine"}
        </button>
      </div>
    </form>
  );
}
