import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { WeeklyContext } from "../context/build";
import { type Arbiter, buildArbiterPrompt, ChoicesSchema, createClaudeArbiter, toChoiceMap } from "../matching/arbiter";
import type { Brief } from "../recipes/brief";
import { generateMenu, reviseMenu, reviseRecipe } from "../recipes/generate";
import { buildMenuPrompt, buildRevisePrompt, buildReviseRecipePrompt, SYSTEM_PROMPT } from "../recipes/prompt";
import { assertUniqueRecipeIds, MenuSchema, type Recipe, RecipeSchema } from "../recipes/schema";
import { type ExecFn, runClaudeStructured } from "./claude-cli";

export type BackendName = "claude-code" | "api";

export interface LlmBackend {
  name: BackendName;
  /** libellé affiché dans l'interface et le CLI */
  label: string;
  generateMenu(brief: Brief, ctx: WeeklyContext): Promise<Recipe[]>;
  reviseMenu(brief: Brief, ctx: WeeklyContext, recipes: Recipe[], instruction: string): Promise<Recipe[]>;
  reviseRecipe(brief: Brief, ctx: WeeklyContext, recipe: Recipe, others: Recipe[], instruction: string): Promise<Recipe>;
  arbitrate: Arbiter;
}

export function createApiBackend(client: Anthropic): LlmBackend {
  return {
    name: "api",
    label: "API Anthropic",
    generateMenu: async (brief, ctx) => assertUniqueRecipeIds(await generateMenu(client, brief, ctx)),
    reviseMenu: async (brief, ctx, recipes, instruction) =>
      assertUniqueRecipeIds(await reviseMenu(client, brief, ctx, recipes, instruction)),
    reviseRecipe: (brief, ctx, recipe, others, instruction) => reviseRecipe(client, brief, ctx, recipe, others, instruction),
    arbitrate: createClaudeArbiter(client),
  };
}

/** Claude Code n'a pas de paramètre « system » ici : le rôle est placé en tête du prompt. */
const withRole = (prompt: string) => `${SYSTEM_PROMPT}\n\n${prompt}`;

export function createClaudeCodeBackend(deps: { exec?: ExecFn; timeoutMs?: number } = {}): LlmBackend {
  const ask = <S extends z.ZodType>(schema: S, prompt: string) => runClaudeStructured(schema, prompt, deps);
  return {
    name: "claude-code",
    label: "Claude Code (abonnement)",
    generateMenu: async (brief, ctx) =>
      assertUniqueRecipeIds((await ask(MenuSchema, withRole(buildMenuPrompt(brief, ctx)))).recipes),
    reviseMenu: async (brief, ctx, recipes, instruction) =>
      assertUniqueRecipeIds(
        (await ask(MenuSchema, withRole(buildRevisePrompt(brief, ctx, recipes, instruction)))).recipes,
      ),
    reviseRecipe: async (brief, ctx, recipe, others, instruction) => ({
      ...(await ask(RecipeSchema, withRole(buildReviseRecipePrompt(brief, ctx, recipe, others, instruction)))),
      id: recipe.id,
    }),
    arbitrate: async (items) => toChoiceMap((await ask(ChoicesSchema, buildArbiterPrompt(items))).choices),
  };
}

/** Claude Code (abonnement) par défaut ; l'API Anthropic si ANTHROPIC_API_KEY est défini. */
export function selectBackend(
  env: Record<string, string | undefined> = process.env,
  deps: { exec?: ExecFn; timeoutMs?: number } = {},
): LlmBackend {
  const apiKey = env.ANTHROPIC_API_KEY;
  return apiKey ? createApiBackend(new Anthropic({ apiKey })) : createClaudeCodeBackend(deps);
}
