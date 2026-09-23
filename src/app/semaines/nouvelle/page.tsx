import { connection } from "next/server";
import { getApp } from "@/lib/app/instance";
import { DEFAULT_BRIEF } from "@/lib/week/brief-form";
import { notice, pageTitle } from "@/app/_components/ui";
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
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className={pageTitle}>Nouvelle semaine</h1>
        <p className="max-w-[65ch] text-graphite">
          Pré-rempli avec ta dernière semaine. MyFresh propose deux recettes de plus que le nombre de dîners, pour que
          tu puisses choisir.
        </p>
      </div>
      {app.runner.isBusy() && (
        <p role="status" className={notice.warning}>
          Une tâche est déjà en cours : attends qu&apos;elle se termine avant d&apos;en lancer une autre.
        </p>
      )}
      <BriefForm initial={brief} favorites={favorites} preselected={preselected} />
    </div>
  );
}
