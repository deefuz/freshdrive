/** Résultat renvoyé par les server actions appelées depuis un composant client. */
export interface ActionResult {
  error: string | null;
}

export const OK: ActionResult = { error: null };

export function failure(e: unknown): ActionResult {
  return { error: e instanceof Error ? e.message : String(e) };
}
