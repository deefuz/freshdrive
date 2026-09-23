import { connection } from "next/server";
import { pageTitle } from "@/app/_components/ui";
import { ProfileStore } from "@/lib/profile/store";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  await connection();
  const profile = new ProfileStore().get();
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className={pageTitle}>Mon profil</h1>
        <p className="max-w-[70ch] text-graphite">
          Qui mange, ce que la cuisine permet et vos habitudes. Claude en tient compte pour chaque nouvelle semaine ; les
          semaines déjà préparées gardent le profil de leur création.
        </p>
      </div>
      <ProfileForm initial={profile} />
    </div>
  );
}
