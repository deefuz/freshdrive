import { z } from "zod";
import type { WeeklyContext } from "../context/build";
import type { Brief } from "./brief";
import { buildMenuPrompt, type MenuPromptOptions, SYSTEM_PROMPT } from "./prompt";
import { assertUniqueRecipeIds, MenuSchema, type Recipe } from "./schema";

/** Demande de menu à traiter dans Claude Code (abonnement) plutôt que par l'API. */
export function buildRequestDocument(
  brief: Brief,
  ctx: WeeklyContext,
  outputPath: string,
  options: MenuPromptOptions = {},
): string {
  return `# Demande de menu MyFresh

À traiter par Claude Code : génère le menu décrit ci-dessous et écris-le dans \`${outputPath}\`
au format JSON \`{ "recipes": [...] }\`, conforme au schéma en fin de document.
Ensuite, l'utilisateur lancera : \`npm run week -- --from-recipes ${outputPath}\`

## Rôle

${SYSTEM_PROMPT}

## Demande

${buildMenuPrompt(brief, ctx, options)}

## Schéma JSON attendu

\`\`\`json
${JSON.stringify(z.toJSONSchema(MenuSchema, { target: "draft-7" }), null, 2)}
\`\`\`
`;
}

export function parseRecipesFile(text: string): Recipe[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Fichier de recettes : JSON invalide (${(e as Error).message})`);
  }
  const result = MenuSchema.safeParse(Array.isArray(data) ? { recipes: data } : data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`);
    throw new Error(`Fichier de recettes non conforme :\n- ${issues.join("\n- ")}`);
  }
  return assertUniqueRecipeIds(result.data.recipes);
}
