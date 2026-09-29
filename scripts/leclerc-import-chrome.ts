import { importChromeCookies } from "@/lib/chrome/cookies";
import { LECLERC_COOKIES, openLeclerc } from "@/lib/leclerc/open";
import { STATE_PATH } from "@/lib/leclerc/session";

async function main() {
  const { profile, cookies } = importChromeCookies(LECLERC_COOKIES, STATE_PATH);
  console.log(`${cookies} cookies leclercdrive.fr importés depuis Chrome (profil « ${profile} ») dans ${STATE_PATH}`);
  await openLeclerc({ importChrome: false });
  console.log("Session Leclerc valide, magasin détecté ✅");
}

main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
