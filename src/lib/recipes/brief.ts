import { z } from "zod";

export const DIET_FILTERS = ["kids_friendly", "low_calorie", "vegan", "unprocessed"] as const;
export type DietFilter = (typeof DIET_FILTERS)[number];

export const BriefSchema = z.object({
  dinners: z.number().int().min(1).max(7),
  adults: z.number().int().min(1),
  children: z.number().int().min(0),
  budgetEur: z.number().positive(),
  filters: z.array(z.enum(DIET_FILTERS)),
  notes: z.string(),
  preferOrganic: z.boolean(),
});
export type Brief = z.infer<typeof BriefSchema>;

/** Nombre de portions : un enfant compte pour 0,6 adulte. */
export function servingsFor(brief: Brief): number {
  return Math.ceil(brief.adults + brief.children * 0.6);
}
