"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionResult, failure, formValues, OK } from "@/lib/app/action-result";
import { getApp } from "@/lib/app/instance";
import { parseBriefForm } from "@/lib/week/brief-form";
import { chooseProduct, setPantry, toggleRecipe } from "@/lib/week/edit";

/** Exécute une opération du service ; en cas de succès, la page courante est rendue à nouveau. */
async function attempt(operation: () => unknown): Promise<ActionResult> {
  try {
    operation();
  } catch (e) {
    return failure(e);
  }
  refresh();
  return OK;
}

export async function checkSessionAction(): Promise<ActionResult> {
  await getApp().checkSession();
  refresh();
  return OK;
}

export async function createWeekAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseBriefForm(formData);
  if (!parsed.ok) return { error: parsed.error, values: formValues(formData) };
  const favoriteIds = formData.getAll("favorites").map(String);
  let id: string;
  try {
    id = getApp().startCreateWeek(parsed.brief, favoriteIds).id;
  } catch (e) {
    return failure(e, formValues(formData));
  }
  redirect(`/semaines/${id}`);
}

export async function retryCreateAction(weekId: string): Promise<ActionResult> {
  return attempt(() => getApp().retryCreateWeek(String(weekId)));
}

export async function toggleRecipeAction(weekId: string, recipeId: string, selected: boolean): Promise<ActionResult> {
  return attempt(() => getApp().edit(String(weekId), (w) => toggleRecipe(w, String(recipeId), selected === true)));
}

export async function chooseProductAction(weekId: string, ingredientKey: string, productId: string): Promise<ActionResult> {
  return attempt(() => getApp().edit(String(weekId), (w) => chooseProduct(w, String(ingredientKey), String(productId))));
}

export async function setPantryAction(weekId: string, ingredientKey: string, inPantry: boolean): Promise<ActionResult> {
  return attempt(() => getApp().edit(String(weekId), (w) => setPantry(w, String(ingredientKey), inPantry === true)));
}

export async function reviseRecipeAction(
  weekId: string,
  recipeId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const result = await attempt(() =>
    getApp().startReviseRecipe(String(weekId), String(recipeId), String(formData.get("instruction") ?? "")),
  );
  return result.error ? { ...result, values: formValues(formData) } : result;
}

export async function addRecipesAction(weekId: string): Promise<ActionResult> {
  return attempt(() => getApp().startAddRecipes(String(weekId)));
}

export async function confirmPushAction(weekId: string): Promise<ActionResult> {
  return attempt(() => getApp().startPush(String(weekId)));
}

export async function toggleFavoriteAction(weekId: string, recipeId: string, favorite: boolean): Promise<ActionResult> {
  return attempt(() => getApp().setFavorite(String(weekId), String(recipeId), favorite === true));
}

export async function removeFavoriteAction(favoriteId: string): Promise<ActionResult> {
  return attempt(() => getApp().removeFavorite(String(favoriteId)));
}
