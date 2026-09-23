/** Vocabulaire visuel partagé (voir DESIGN.md) : un bouton, un champ, une carte ont le même aspect partout. */

const control =
  "inline-flex items-center justify-center gap-2 rounded-lg font-sans transition-colors duration-150 ease-out-quart disabled:cursor-not-allowed disabled:opacity-50";

export const btn = {
  primary: `${control} min-h-11 bg-charcoal px-5 py-2.5 font-bold text-cream hover:bg-charcoal-hover`,
  secondary: `${control} min-h-10 border-[1.5px] border-charcoal bg-paper px-4 py-2 text-sm font-bold text-charcoal hover:bg-oat`,
  danger: `${control} min-h-10 border-[1.5px] border-bordeaux bg-paper px-4 py-2 text-sm font-bold text-bordeaux hover:bg-bordeaux-wash`,
  dangerSolid: `${control} min-h-10 border-[1.5px] border-bordeaux bg-bordeaux px-4 py-2 text-sm font-bold text-paper hover:bg-bordeaux-hover`,
};

export const link = "font-medium text-basil underline decoration-1 underline-offset-2 hover:text-basil-deep";

export const card = "rounded bg-paper shadow-card";

export const field =
  "block min-h-11 w-full rounded-lg border border-steel-line bg-paper px-3 py-2.5 font-normal text-charcoal transition-colors duration-150 placeholder:text-pebble hover:border-charcoal focus:border-charcoal focus:outline-2 focus:outline-offset-0 focus:outline-charcoal";

export const fieldLabel = "flex flex-col gap-1.5 text-sm font-bold text-charcoal";

/** Pastille à cocher : le libellé porte le style, la case (masquée) garde le clavier et le formulaire. */
export const chip =
  "relative inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] border-charcoal bg-paper px-4 py-1.5 text-sm font-medium text-charcoal transition-colors duration-150 select-none hover:not-has-checked:bg-oat has-checked:bg-charcoal has-checked:text-cream has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-charcoal has-disabled:cursor-not-allowed has-disabled:opacity-50";

export const chipInput = "peer sr-only";

export const badge = "inline-block rounded-[3px] px-1.5 py-0.5 text-[0.6875rem] leading-tight font-bold tracking-[0.04em] uppercase";

export const notice = {
  info: "rounded-lg bg-mint-wash p-3 text-sm text-charcoal",
  success: "rounded-lg bg-lime-wash p-3 text-sm text-basil-deep",
  warning: "rounded-lg bg-honey-wash p-3 text-sm text-honey-ink",
  error: "rounded-lg bg-bordeaux-wash p-3 text-sm text-bordeaux",
};

export const sectionTitle = "text-2xl font-bold tracking-[-0.02em]";

export const pageTitle = "text-4xl leading-[1.05] tracking-[-0.03em] sm:text-[2.5rem]";
