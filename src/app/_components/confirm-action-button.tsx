"use client";

import { useActionState, useState } from "react";
import type { ActionResult } from "@/lib/app/action-result";
import { btn } from "./ui";

/** Bouton d'action destructive : un premier clic demande confirmation, le second exécute. */
export function ConfirmActionButton({
  action,
  label,
  confirmLabel,
  pendingLabel,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  confirmLabel: string;
  pendingLabel: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult>(() => action(), { error: null });
  return (
    <div className="flex flex-col items-start gap-1">
      {confirming ? (
        <form action={formAction} className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className={btn.dangerSolid}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className={btn.secondary}
          >
            Annuler
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={btn.danger}
        >
          {label}
        </button>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-bordeaux">
          {state.error}
        </p>
      )}
    </div>
  );
}
