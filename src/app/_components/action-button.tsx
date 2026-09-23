"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/app/action-result";
import { btn } from "./ui";

export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = "secondary",
  className,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
  /** marge ou placement du formulaire dans son conteneur */
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult>(() => action(), { error: null });
  return (
    <form action={formAction} className={className}>
      <button
        type="submit"
        disabled={pending}
        className={variant === "primary" ? btn.primary : btn.secondary}
      >
        {pending ? pendingLabel : label}
      </button>
      {state.error && (
        <p role="alert" className="mt-1.5 text-sm text-bordeaux">
          {state.error}
        </p>
      )}
    </form>
  );
}
