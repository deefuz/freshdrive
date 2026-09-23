"use client";

import { useActionState, useState } from "react";
import type { ActionResult } from "@/lib/app/action-result";

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
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100"
          >
            Annuler
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
        >
          {label}
        </button>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
