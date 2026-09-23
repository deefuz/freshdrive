import { hasStoreSession } from "@/lib/auchan/check";
import { importChromeSession } from "@/lib/auchan/chrome-cookies";
import { AuchanConnector } from "@/lib/auchan/connector";
import { AuchanHttp } from "@/lib/auchan/http";
import { loadSession, STATE_PATH } from "@/lib/auchan/session";

async function main() {
  const { profile, cookies } = importChromeSession();
  console.log(`${cookies} cookies auchan.fr importés depuis Chrome (profil « ${profile} ») dans ${STATE_PATH}`);
  const session = loadSession();
  if (await hasStoreSession(new AuchanConnector(new AuchanHttp(session), session))) {
    console.log("Session Auchan valide, drive détecté ✅");
  } else {
    console.error("Aucun drive détecté : dans Chrome, connecte-toi sur auchan.fr et choisis ton drive, puis relance.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
