"use client";

import { btn } from "@/app/_components/ui";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={btn.secondary}>
      Imprimer
    </button>
  );
}
