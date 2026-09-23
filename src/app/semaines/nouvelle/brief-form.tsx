"use client";

import { useActionState, useState } from "react";
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

export interface HouseholdMember {
  name: string;
  kind: "adult" | "child";
  /** libellés des allergies et intolérances */
  allergies: string[];
}

export function BriefForm({
  initial,
  household,
  favorites,
  preselected,
}: {
  initial: Brief;
  /** membres du profil : si la liste n'est pas vide, on coche qui dîne au lieu de saisir des nombres */
  household: HouseholdMember[];
  /** favoris proposés à la reprise */
  favorites: { id: string; title: string }[];
  /** favoris cochés d'avance (lien « Réutiliser » de l'accueil) */
  preselected: string[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createWeekAction, { error: null });
  // après un refus, on réaffiche ce qui a été saisi (React réinitialise le formulaire après l'action)
  const sent = state.values;
  const text = (name: string, fallback: string | number) => sent?.[name]?.[0] ?? String(fallback);
  const [present, setPresent] = useState<Set<number>>(
    () => new Set(sent ? (sent.present ?? []).map(Number) : household.map((_, i) => i)),
  );
  const allergies = household.flatMap((m, i) => (present.has(i) ? m.allergies.map((a) => `${a} (${m.name})`) : []));
  return (
    <form action={formAction} className={`${card} space-y-7 p-5 sm:p-7`}>
      <div className={`grid gap-4 ${household.length ? "sm:grid-cols-2" : "sm:grid-cols-4"}`}>
        <label className={fieldLabel}>
          Dîners
          <input name="dinners" type="number" min={1} max={7} required defaultValue={text("dinners", initial.dinners)} className={field} />
        </label>
        {household.length === 0 && (
          <>
            <label className={fieldLabel}>
              Adultes
              <input name="adults" type="number" min={1} required defaultValue={text("adults", initial.adults)} className={field} />
            </label>
            <label className={fieldLabel}>
              Enfants
              <input name="children" type="number" min={0} required defaultValue={text("children", initial.children)} className={field} />
            </label>
          </>
        )}
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
      {household.length > 0 && (
        <fieldset className="space-y-3">
          <legend className={legend}>Qui dîne cette semaine ?</legend>
          <div className="flex flex-wrap gap-2">
            {household.map((m, i) => (
              <label key={i} className={chip}>
                <input
                  type="checkbox"
                  name="present"
                  value={i}
                  checked={present.has(i)}
                  onChange={(e) =>
                    setPresent((p) => {
                      const next = new Set(p);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      return next;
                    })
                  }
                  className={chipInput}
                />
                <Check />
                {m.name}
                <span className="font-normal opacity-70">{m.kind === "adult" ? "adulte" : "enfant"}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className={`${fieldLabel} w-36`}>
              Invités adultes
              <input name="guestAdults" type="number" min={0} max={20} defaultValue={text("guestAdults", 0)} className={field} />
            </label>
            <label className={`${fieldLabel} w-36`}>
              Invités enfants
              <input name="guestChildren" type="number" min={0} max={20} defaultValue={text("guestChildren", 0)} className={field} />
            </label>
          </div>
          <p className="text-sm text-graphite">
            {allergies.length ? (
              <>
                <span className="font-bold text-charcoal">Allergies exclues des recettes :</span> {allergies.join(", ")}.
              </>
            ) : (
              "Aucune allergie parmi les personnes cochées."
            )}{" "}
            Pense à signaler celles des invités dans les précisions.
          </p>
        </fieldset>
      )}
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
