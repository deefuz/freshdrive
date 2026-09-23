import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { STATE_PATH } from "@/lib/auchan/session";

const PROFILE_DIR = "data/chromium-profile";
const CHECK_URL = "https://www.auchan.fr/recherche?text=lait";
const POLL_MS = 3000;
const TIMEOUT_MS = 10 * 60 * 1000;

type LoginState = "not_logged_in" | "no_store" | "ready";

/** Lit l'état dans un onglet séparé pour ne pas perturber la navigation de l'utilisateur. */
async function checkState(page: Page): Promise<LoginState> {
  await page.goto(CHECK_URL);
  return page.evaluate(() => {
    const header = document.querySelector("header")?.textContent ?? "";
    if (/Me connecter/i.test(header)) return "not_logged_in";
    if (document.querySelectorAll(".qa2c-wrapper[data-seller-id]").length === 0) return "no_store";
    return "ready";
  });
}

const MESSAGES: Record<Exclude<LoginState, "ready">, string> = {
  not_logged_in: "En attente : connecte-toi à ton compte Auchan dans la fenêtre Chromium (pas dans ton Chrome habituel).",
  no_store: "Connecté ✅ En attente : choisis ton drive (« Choisir vos courses ») dans la fenêtre Chromium.",
};

async function main() {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://www.auchan.fr/");
  console.log("Une fenêtre Chromium s'est ouverte sur auchan.fr : c'est un navigateur à part, connecte-toi dedans.");

  const probe = await context.newPage();
  await page.bringToFront();
  const deadline = Date.now() + TIMEOUT_MS;
  let last: LoginState | null = null;
  while (Date.now() < deadline) {
    const state = await checkState(probe).catch(() => last ?? "not_logged_in");
    if (state === "ready") {
      await context.storageState({ path: STATE_PATH });
      await context.close();
      console.log(`Connecté et drive choisi ✅ Session enregistrée dans ${STATE_PATH}`);
      return;
    }
    if (state !== last) console.log(MESSAGES[state]);
    last = state;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  await context.close();
  console.error("Temps écoulé (10 min) sans connexion complète. Relance : npm run auchan:login");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
