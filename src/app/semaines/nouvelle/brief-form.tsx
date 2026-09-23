"use client";

import { useActionState } from "react";
import { createWeekAction } from "@/app/actions";
import type { ActionResult } from "@/lib/app/action-result";
import { type Brief, DIET_FILTERS } from "@/lib/recipes/brief";
import { FILTER_UI_LABELS } from "@/lib/week/brief-form";

const field = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-normal";
const label = "block text-sm font-medium";

export function BriefForm({ initial }: { initial: Brief }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createWeekAction, { error: null });
  return (
    <form action={formAction} className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <label className={label}>
          Dîners
          <input name="dinners" type="number" min={1} max={7} required defaultValue={initial.dinners} className={field} />
        </label>
        <label className={label}>
          Adultes
          <input name="adults" type="number" min={1} required defaultValue={initial.adults} className={field} />
        </label>
        <label className={label}>
          Enfants
          <input name="children" type="number" min={0} required defaultValue={initial.children} className={field} />
        </label>
        <label className={label}>
          Budget (€)
          <input
            name="budgetEur"
            type="text"
            inputMode="decimal"
            required
            defaultValue={String(initial.budgetEur).replace(".", ",")}
            className={field}
          />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Contraintes</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {DIET_FILTERS.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="filters" value={f} defaultChecked={initial.filters.includes(f)} />
              {FILTER_UI_LABELS[f]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="preferOrganic" defaultChecked={initial.preferOrganic} />
        Bio de préférence
      </label>
      <label className={label}>
        Précisions
        <textarea
          name="notes"
          rows={3}
          maxLength={1000}
          defaultValue={initial.notes}
          placeholder="Ex. : pas de poisson, un plat sans four, Léa n'aime pas les champignons"
          className={field}
        />
      </label>
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
