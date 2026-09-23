import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { RECIPE_MODEL, unwrapParsed } from "../recipes/generate";

export interface ArbiterItem {
  key: string;
  ingredient: string;
  candidates: { name: string; brand: string | null; pack: string; price: number }[];
}

export type Arbiter = (items: ArbiterItem[]) => Promise<Map<string, number>>;

export const ChoicesSchema = z.object({
  choices: z.array(z.object({ key: z.string(), index: z.number().int() })),
});

export function buildArbiterPrompt(items: ArbiterItem[]): string {
  return `Pour chaque ingrédient de recette, choisis parmi les produits Auchan proposés celui qui EST cet ingrédient, à acheter pour cuisiner (pas un plat préparé, une sauce ou un dérivé, sauf si l'ingrédient en est un).
Méfie-toi des formes transformées (émincé, en rondelles, en dés, râpé, surgelé, en conserve, cuisiné…) et des variétés différentes (chèvre au lieu de vache, fumé, aromatisé…) quand l'ingrédient ne les demande pas.
Réponds avec l'index (0 = premier produit) ; -1 si aucun ne convient. Les produits sont déjà triés du meilleur rapport qualité-prix au moins bon : à pertinence égale, prends le plus petit index.

${JSON.stringify(items)}`;
}

export function toChoiceMap(choices: { key: string; index: number }[]): Map<string, number> {
  return new Map(choices.map((c) => [c.key, c.index]));
}

export function createClaudeArbiter(client: Anthropic): Arbiter {
  return async (items) => {
    const response = await client.messages.parse({
      model: RECIPE_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodOutputFormat(ChoicesSchema) },
      messages: [{ role: "user", content: buildArbiterPrompt(items) }],
    });
    return toChoiceMap(unwrapParsed(response).choices);
  };
}
