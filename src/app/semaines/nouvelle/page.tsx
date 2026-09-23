import Link from "next/link";
import { connection } from "next/server";
import { link, notice, pageTitle } from "@/app/_components/ui";
import { getApp } from "@/lib/app/instance";
import { ALLERGENS } from "@/lib/profile/profile";
import { ProfileStore } from "@/lib/profile/store";
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
  // membres du profil à cocher : qui dîne cette semaine, avec leurs allergies
  const household = new ProfileStore().get().members.map((m) => ({
    name: m.name,
    kind: m.kind,
    allergies: [
      ...m.allergies.map((a) => ALLERGENS[a]),
      ...m.otherAllergies
        .split(/[,;\n]/)
        .map((a) => a.trim())
        .filter(Boolean),
    ],
  }));
  const favorites = app.favorites.list().map((f) => ({ id: f.id, title: f.recipe.title }));
  const preselected = [favori ?? []].flat().filter((id) => favorites.some((f) => f.id === id));
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className={pageTitle}>Nouvelle semaine</h1>
        <p className="max-w-[65ch] text-graphite">
          Pré-rempli avec ta dernière semaine. FreshDrive propose deux recettes de plus que le nombre de dîners, pour que
          tu puisses choisir. Le foyer, les allergies, le matériel et les habitudes viennent de{" "}
          <Link href="/profil" className={link}>
            ton profil
          </Link>
          .
        </p>
      </div>
      {app.runner.isBusy() && (
        <p role="status" className={notice.warning}>
          Une tâche est déjà en cours : attends qu&apos;elle se termine avant d&apos;en lancer une autre.
        </p>
      )}
      <BriefForm initial={brief} household={household} favorites={favorites} preselected={preselected} />
    </div>
  );
}
