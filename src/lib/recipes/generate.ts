import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { WeeklyContext } from "../context/build";
import { buildVisualsPrompt, type DrawnVisual, VisualsSchema } from "../illustrate";
import type { Brief } from "./brief";
import {
  buildMenuPrompt,
  buildRevisePrompt,
  buildReviseRecipePrompt,
  type MenuPromptOptions,
  SYSTEM_PROMPT,
} from "./prompt";
import { MenuSchema, type Recipe, RecipeSchema } from "./schema";

export const RECIPE_MODEL = "claude-opus-5-5";

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

export function unwrapParsed<T>(r: { stop_reason: string | null; parsed_output: T | null }): T {
  if (r.stop_reason === "refusal") throw new LlmError("Claude a refusé la demande.");
  if (r.stop_reason === "max_tokens") throw new LlmError("Réponse de Claude tronquée (max_tokens atteint).");
  if (!r.parsed_output) throw new LlmError("Réponse de Claude illisible.");
  return r.parsed_output;
}

async function askMenu(client: Anthropic, prompt: string): Promise<Recipe[]> {
  const response = await client.messages.parse({
    model: RECIPE_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(MenuSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });
  return unwrapParsed(response).recipes;
}

export function generateMenu(
  client: Anthropic,
  brief: Brief,
  ctx: WeeklyContext,
  options: MenuPromptOptions = {},
): Promise<Recipe[]> {
  return askMenu(client, buildMenuPrompt(brief, ctx, options));
}

export function reviseMenu(
  client: Anthropic,
  brief: Brief,
  ctx: WeeklyContext,
  recipes: Recipe[],
  instruction: string,
): Promise<Recipe[]> {
  return askMenu(client, buildRevisePrompt(brief, ctx, recipes, instruction));
}

export async function reviseRecipe(
  client: Anthropic,
  brief: Brief,
  ctx: WeeklyContext,
  recipe: Recipe,
  others: Recipe[],
  instruction: string,
): Promise<Recipe> {
  const response = await client.messages.parse({
    model: RECIPE_MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(RecipeSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildReviseRecipePrompt(brief, ctx, recipe, others, instruction) }],
  });
  return { ...unwrapParsed(response), id: recipe.id };
}

/** Illustrations SVG d'un petit lot de recettes (voir ILLUSTRATION_BATCH : la réponse tient sous 16 000 jetons). */
export async function drawVisuals(client: Anthropic, recipes: Recipe[]): Promise<DrawnVisual[]> {
  const response = await client.messages.parse({
    model: RECIPE_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(VisualsSchema) },
    messages: [{ role: "user", content: buildVisualsPrompt(recipes) }],
  });
  return unwrapParsed(response).visuals;
}
