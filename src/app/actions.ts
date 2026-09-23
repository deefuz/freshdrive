"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionResult, failure, formValues, OK } from "@/lib/app/action-result";
import { getApp } from "@/lib/app/instance";
import { ProfileSchema } from "@/lib/profile/profile";
import { ProfileStore } from "@/lib/profile/store";
import { applyHousehold, parseBriefForm, withProfile } from "@/lib/week/brief-form";
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
  // foyer de la semaine : membres du profil cochés et invités (ou nombres saisis sans profil)
  const household = applyHousehold(formData, new ProfileStore().get());
  if (!household.ok) return { error: household.error, values: formValues(formData) };
  const parsed = parseBriefForm(household.form);
  if (!parsed.ok) return { error: parsed.error, values: formValues(formData) };
  const favoriteIds = formData.getAll("favorites").map(String);
  let id: string;
  try {
    id = getApp().startCreateWeek(withProfile(parsed.brief, household.profile), favoriteIds).id;
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

/** Met la semaine à la corbeille ; depuis l'écran de la semaine, retour à l'accueil. */
export async function deleteWeekAction(weekId: string, goHome: boolean): Promise<ActionResult> {
  const result = await attempt(() => getApp().deleteWeek(String(weekId)));
  if (!result.error && goHome === true) redirect("/");
  return result;
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

/** Enregistre le profil du foyer (envoyé en JSON par le formulaire de /profil). */
export async function saveProfileAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let data: unknown;
  try {
    data = JSON.parse(String(formData.get("profile") ?? ""));
  } catch {
    return { error: "Le profil envoyé est illisible : recharge la page." };
  }
  const parsed = ProfileSchema.safeParse(data);
  if (!parsed.success) {
    const nameless = parsed.error.issues.some((i) => i.path.includes("name"));
    return { error: nameless ? "Donne un prénom à chaque personne du foyer." : "Vérifie les champs du profil." };
  }
  new ProfileStore().save(parsed.data);
  refresh();
  return OK;
}
