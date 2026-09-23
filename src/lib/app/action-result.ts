/** Valeurs d'un formulaire : nom du champ → valeurs saisies (plusieurs pour les cases à cocher d'un même nom). */
export type FormValues = Record<string, string[]>;

/** Résultat renvoyé par les server actions appelées depuis un composant client. */
export interface ActionResult {
  error: string | null;
  /** valeurs saisies, renvoyées après un refus pour que le formulaire ne les perde pas */
  values?: FormValues;
}

export const OK: ActionResult = { error: null };

export function failure(e: unknown, values?: FormValues): ActionResult {
  const error = e instanceof Error ? e.message : String(e);
  return values ? { error, values } : { error };
}

/** Champs texte d'un formulaire soumis (sans les fichiers ni les champs internes de Next). */
export function formValues(formData: FormData): FormValues {
  const values: FormValues = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string" || name.startsWith("$ACTION")) continue;
    (values[name] ??= []).push(value);
  }
  return values;
}
