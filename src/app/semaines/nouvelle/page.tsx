import { connection } from "next/server";
import { getApp } from "@/lib/app/instance";
import { DEFAULT_BRIEF } from "@/lib/week/brief-form";
import { BriefForm } from "./brief-form";

export default async function NewWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { favori } = await searchParams;
  await connection();
  const app = getApp();
  const brief = app.store.latestBrief() ?? DEFAULT_BRIEF;
  const favorites = app.favorites.list().map((f) => ({ id: f.id, title: f.recipe.title }));
  const preselected = [favori ?? []].flat().filter((id) => favorites.some((f) => f.id === id));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nouvelle semaine</h1>
      <p className="text-zinc-600">
        Pré-rempli avec ta dernière semaine. MyFresh propose deux recettes de plus que le nombre de dîners, pour que tu
        puisses choisir.
      </p>
      {app.runner.isBusy() && (
        <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
          Une tâche est déjà en cours : attends qu&apos;elle se termine avant d&apos;en lancer une autre.
        </p>
      )}
      <BriefForm initial={brief} favorites={favorites} preselected={preselected} />
    </div>
  );
}
