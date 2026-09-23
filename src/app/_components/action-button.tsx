"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/app/action-result";

export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = "secondary",
}: {
  action: () => Promise<ActionResult>;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
}) {
  const [state, formAction, pending] = useActionState<ActionResult>(() => action(), { error: null });
  const style =
    variant === "primary"
      ? "bg-emerald-600 text-white hover:bg-emerald-700"
      : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100";
  return (
    <form action={formAction} className="mt-2">
      <button
        type="submit"
        disabled={pending}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${style}`}
      >
        {pending ? pendingLabel : label}
      </button>
      {state.error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
