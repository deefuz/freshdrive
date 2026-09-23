"use client";

import { startTransition, useActionState, useState } from "react";
import { btn, card, chip, chipInput, field, fieldLabel, notice, sectionTitle } from "@/app/_components/ui";
import { saveProfileAction } from "@/app/actions";
import type { ActionResult } from "@/lib/app/action-result";
import {
  ALLERGENS,
  type Allergen,
  APPLIANCES,
  type Appliance,
  type Member,
  type Profile,
  UTENSILS,
  type Utensil,
} from "@/lib/profile/profile";

const INITIAL: ActionResult = { error: null };

const MINUTES = [20, 30, 40, 45, 60, 90] as const;

type Row = Member & { key: number };

let nextKey = 0;
const withKey = (m: Member): Row => ({ ...m, key: nextKey++ });

function withoutKey(row: Row): Member {
  const member: Partial<Row> = { ...row };
  delete member.key;
  return member as Member;
}

const NEW_MEMBER: Member = { name: "", kind: "adult", age: null, allergies: [], otherAllergies: "", dislikes: "" };

function toggle<T>(list: T[], value: T, on: boolean): T[] {
  return on ? [...list.filter((v) => v !== value), value] : list.filter((v) => v !== value);
}

function Chips<K extends string>({
  labels,
  selected,
  onChange,
  name,
}: {
  labels: Record<K, string>;
  selected: K[];
  onChange: (next: K[]) => void;
  name: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={name}>
      {(Object.keys(labels) as K[]).map((k) => (
        <label key={k} className={chip}>
          <input
            type="checkbox"
            checked={selected.includes(k)}
            onChange={(e) => onChange(toggle(selected, k, e.target.checked))}
            className={chipInput}
          />
          <span className="hidden peer-checked:inline" aria-hidden="true">
            ✓
          </span>
          {labels[k]}
        </label>
      ))}
    </div>
  );
}

export function ProfileForm({ initial }: { initial: Profile }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(saveProfileAction, INITIAL);
  const { members: initialMembers, ...initialRest } = initial;
  const [members, setMembers] = useState<Row[]>(() => initialMembers.map(withKey));
  const [rest, setRest] = useState<Omit<Profile, "members">>(initialRest);
  const [dirty, setDirty] = useState(false);

  const profile: Profile = { ...rest, members: members.map(withoutKey) };
  const set = <K extends keyof typeof rest>(key: K, value: (typeof rest)[K]) => {
    setRest((r) => ({ ...r, [key]: value }));
    setDirty(true);
  };
  const setMember = (key: number, patch: Partial<Member>) => {
    setMembers((ms) => ms.map((m) => (m.key === key ? { ...m, ...patch } : m)));
    setDirty(true);
  };
  const saved = state !== INITIAL && !state.error && !dirty && !pending;

  return (
    <form
      onSubmit={(e) => {
        // envoi manuel : une action de formulaire réinitialiserait l'affichage des champs contrôlés (React 19)
        e.preventDefault();
        const data = new FormData();
        data.set("profile", JSON.stringify(profile));
        setDirty(false);
        startTransition(() => formAction(data));
      }}
      className="space-y-10"
    >

      <section className="space-y-4">
        <div>
          <h2 className={sectionTitle}>Le foyer</h2>
          <p className="mt-1 text-sm text-graphite">
            Les allergies sont des interdits absolus pour Claude. « N&apos;aime pas » est une préférence.
          </p>
        </div>
        {members.length > 0 && (
          <ul className={`${card} divide-y divide-oat-line`}>
            {members.map((m, i) => (
              <li key={m.key} className="space-y-4 p-5">
                <div className="grid gap-4 sm:grid-cols-[1.4fr_auto_7rem_auto] sm:items-end">
                  <label className={fieldLabel}>
                    Prénom
                    <input
                      value={m.name}
                      maxLength={40}
                      required
                      onChange={(e) => setMember(m.key, { name: e.target.value })}
                      className={field}
                    />
                  </label>
                  <fieldset>
                    <legend className="mb-1.5 text-sm font-bold">Adulte ou enfant</legend>
                    <div className="flex gap-2">
                      {(["adult", "child"] as const).map((kind) => (
                        <label key={kind} className={chip}>
                          <input
                            type="radio"
                            name={`kind-${m.key}`}
                            checked={m.kind === kind}
                            onChange={() => setMember(m.key, { kind })}
                            className={chipInput}
                          />
                          {kind === "adult" ? "Adulte" : "Enfant"}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className={fieldLabel}>
                    <span>
                      Âge <span className="font-normal text-pebble">(ans)</span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={m.age ?? ""}
                      onChange={(e) => setMember(m.key, { age: e.target.value === "" ? null : Number(e.target.value) })}
                      className={field}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMembers((ms) => ms.filter((x) => x.key !== m.key));
                      setDirty(true);
                    }}
                    className={btn.danger}
                    aria-label={`Retirer ${m.name || `la personne ${i + 1}`}`}
                  >
                    Retirer
                  </button>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-bold">Allergies</p>
                  <Chips
                    name={`Allergies de ${m.name || `la personne ${i + 1}`}`}
                    labels={ALLERGENS}
                    selected={m.allergies}
                    onChange={(allergies: Allergen[]) => setMember(m.key, { allergies })}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={fieldLabel}>
                    Autres allergies ou intolérances
                    <input
                      value={m.otherAllergies}
                      maxLength={200}
                      placeholder="Ex. : kiwi, lactose"
                      onChange={(e) => setMember(m.key, { otherAllergies: e.target.value })}
                      className={field}
                    />
                  </label>
                  <label className={fieldLabel}>
                    N&apos;aime pas
                    <input
                      value={m.dislikes}
                      maxLength={200}
                      placeholder="Ex. : champignons, poivrons"
                      onChange={(e) => setMember(m.key, { dislikes: e.target.value })}
                      className={field}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => {
            setMembers((ms) => [...ms, withKey(NEW_MEMBER)]);
            setDirty(true);
          }}
          className={btn.secondary}
        >
          + Ajouter une personne
        </button>
      </section>

      <section className={`${card} space-y-6 p-5 sm:p-7`}>
        <div>
          <h2 className={sectionTitle}>La cuisine</h2>
          <p className="mt-1 text-sm text-graphite">Claude ne propose que des recettes faisables avec ce matériel.</p>
        </div>
        <div className="space-y-2.5">
          <p className="text-sm font-bold">Appareils</p>
          <Chips
            name="Appareils"
            labels={APPLIANCES}
            selected={rest.appliances}
            onChange={(v: Appliance[]) => set("appliances", v)}
          />
          <label className={`${fieldLabel} pt-1`}>
            Autres appareils
            <input
              value={rest.otherAppliances}
              maxLength={200}
              placeholder="Ex. : yaourtière, machine à pain"
              onChange={(e) => set("otherAppliances", e.target.value)}
              className={field}
            />
          </label>
        </div>
        <div className="space-y-2.5 border-t border-oat-line pt-6">
          <p className="text-sm font-bold">Ustensiles</p>
          <Chips name="Ustensiles" labels={UTENSILS} selected={rest.utensils} onChange={(v: Utensil[]) => set("utensils", v)} />
          <label className={`${fieldLabel} pt-1`}>
            Autres ustensiles
            <input
              value={rest.otherUtensils}
              maxLength={200}
              placeholder="Ex. : cercles à pâtisserie, siphon"
              onChange={(e) => set("otherUtensils", e.target.value)}
              className={field}
            />
          </label>
        </div>
      </section>

      <section className={`${card} space-y-5 p-5 sm:p-7`}>
        <h2 className={sectionTitle}>Les habitudes</h2>
        <label className={`${fieldLabel} max-w-xs`}>
          Temps par dîner en semaine
          <select
            value={rest.weeknightMaxMinutes ?? ""}
            onChange={(e) => set("weeknightMaxMinutes", e.target.value === "" ? null : Number(e.target.value))}
            className={field}
          >
            <option value="">Pas de limite</option>
            {MINUTES.map((n) => (
              <option key={n} value={n}>
                {n} min maximum
              </option>
            ))}
          </select>
        </label>
        <label className={fieldLabel}>
          Habitudes du foyer
          <textarea
            rows={3}
            maxLength={1000}
            value={rest.habits}
            placeholder="Ex. : on dîne à 19 h ; les restes servent au déjeuner du lendemain ; batch cooking le dimanche"
            onChange={(e) => set("habits", e.target.value)}
            className={`${field} leading-normal`}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={fieldLabel}>
            On aime
            <textarea
              rows={2}
              maxLength={500}
              value={rest.likes}
              placeholder="Ex. : cuisine asiatique, gratins, légumineuses"
              onChange={(e) => set("likes", e.target.value)}
              className={`${field} leading-normal`}
            />
          </label>
          <label className={fieldLabel}>
            À éviter
            <textarea
              rows={2}
              maxLength={500}
              value={rest.avoid}
              placeholder="Ex. : plats très épicés, friture"
              onChange={(e) => set("avoid", e.target.value)}
              className={`${field} leading-normal`}
            />
          </label>
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-4 bg-cream/95 px-4 py-4 sm:mx-0 sm:rounded sm:bg-oat sm:px-5 sm:shadow-card">
        <button type="submit" disabled={pending} className={btn.primary}>
          {pending ? "Enregistrement…" : "Enregistrer le profil"}
        </button>
        <p className="text-sm" aria-live="polite">
          {state.error ? (
            <span role="alert" className={notice.error}>
              {state.error}
            </span>
          ) : saved ? (
            <span className="font-medium text-basil">✓ Profil enregistré, il servira dès la prochaine semaine.</span>
          ) : dirty ? (
            <span className="text-graphite">Modifications non enregistrées.</span>
          ) : null}
        </p>
      </div>
    </form>
  );
}
