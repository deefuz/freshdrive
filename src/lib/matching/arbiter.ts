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

const ChoicesSchema = z.object({
  choices: z.array(z.object({ key: z.string(), index: z.number().int() })),
});

export function createClaudeArbiter(client: Anthropic): Arbiter {
  return async (items) => {
    const response = await client.messages.parse({
      model: RECIPE_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodOutputFormat(ChoicesSchema) },
      messages: [
        {
          role: "user",
          content: `Pour chaque ingrédient de recette, choisis parmi les produits Auchan proposés celui qui EST cet ingrédient, à acheter pour cuisiner (pas un plat préparé, une sauce ou un dérivé, sauf si l'ingrédient en est un).
Réponds avec l'index (0 = premier produit) ; -1 si aucun ne convient. Les produits sont déjà triés du meilleur rapport qualité-prix au moins bon : à pertinence égale, prends le plus petit index.

${JSON.stringify(items)}`,
        },
      ],
    });
    const { choices } = unwrapParsed(response);
    return new Map(choices.map((c) => [c.key, c.index]));
  };
}
