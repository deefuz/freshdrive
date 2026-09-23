"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionResult, failure, OK } from "@/lib/app/action-result";
import { getApp } from "@/lib/app/instance";
import { parseBriefForm } from "@/lib/week/brief-form";

export async function checkSessionAction(): Promise<ActionResult> {
  await getApp().checkSession();
  refresh();
  return OK;
}

export async function createWeekAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseBriefForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  let id: string;
  try {
    id = getApp().startCreateWeek(parsed.brief).id;
  } catch (e) {
    return failure(e);
  }
  redirect(`/semaines/${id}`);
}
