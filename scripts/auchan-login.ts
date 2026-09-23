import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { chromium } from "playwright";
import { STATE_PATH } from "@/lib/auchan/session";

const PROFILE_DIR = "data/chromium-profile";

async function main() {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://www.auchan.fr/");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(
    "Dans la fenêtre : connecte-toi à ton compte Auchan et choisis ton drive.\nAppuie sur Entrée ici quand c'est fait… ",
  );
  rl.close();

  await page.goto("https://www.auchan.fr/recherche?text=lait");
  const withStore = await page.locator(".qa2c-wrapper[data-seller-id]").count();
  if (withStore === 0) {
    console.error("Aucun drive détecté sur la page de recherche. Choisis ton magasin puis relance.");
    await context.close();
    process.exit(1);
  }
  await context.storageState({ path: STATE_PATH });
  await context.close();
  console.log(`Session enregistrée dans ${STATE_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
