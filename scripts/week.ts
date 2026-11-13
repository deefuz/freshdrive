import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { previewPush } from "@/lib/cart/push";
import { summarizeContext } from "@/lib/context/build";
import { contextCachePath, loadWeeklyContext } from "@/lib/context/cache";
import { DRIVE_IDS, DRIVES, driveOf, isDriveId } from "@/lib/drives/drive";
import { openDrive } from "@/lib/drives/open";
import type { JobContext } from "@/lib/jobs/runner";
import { formatEur } from "@/lib/format";
import { illustrateRecipes } from "@/lib/illustrate";
import { fetchPexelsPhoto } from "@/lib/pexels";
import { selectBackend } from "@/lib/llm/backend";
import { ProfileStore } from "@/lib/profile/store";
import { type Brief, BriefSchema } from "@/lib/recipes/brief";
import { buildRequestDocument, parseRecipesFile } from "@/lib/recipes/handoff";
import { type Week, WeekStore } from "@/lib/store/weeks";
import { type WeekTotals, weekTotals } from "@/lib/week/edit";
import { withProfile } from "@/lib/week/brief-form";
import { recentSelectedTitles } from "@/lib/week/history";
import { runCreateWeek, runPush, type WorkflowDeps } from "@/lib/week/workflows";

const argValue = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (flag: string) => process.argv.includes(flag);
const step = (label: string) => console.log(`\n▶ ${label}`);
const cliJob: JobContext = {
  step,
  progress: (done, total) => process.stdout.write(`\r  ${done}/${total}`),
};

function loadBrief(briefPath: string): Brief {
  if (!fs.existsSync(briefPath)) {
    fs.mkdirSync(path.dirname(briefPath), { recursive: true });
    fs.copyFileSync("brief.example.json", briefPath);
    console.log(`Brief créé à partir de l'exemple : ${briefPath} (modifie-le si besoin)`);
  }
  return BriefSchema.parse(JSON.parse(fs.readFileSync(briefPath, "utf8")));
}

function printWeek(week: Week): WeekTotals {
  for (const r of week.recipes) {
    const mark = week.selectedRecipeIds.includes(r.id) ? "✅" : "  ";
    console.log(`${mark} ${r.title} (${r.prepMinutes + r.cookMinutes} min) : ${r.whyThisWeek}`);
  }
  const totals = weekTotals(week);
  console.table(
    totals.basket.lines.map((l) => ({
      ingrédient: `${l.name} (${l.quantityNeeded}${l.unit})`,
      produit: `${l.product.brand ? `${l.product.brand} ` : ""}${l.product.name}`,
      paquets: l.packs,
      coût: formatEur(l.cost),
      infos: [l.product.isOrganic && "bio", l.product.promo?.label, l.uncertainQuantity && "⚠ quantité à vérifier"]
        .filter(Boolean)
        .join(" · "),
    })),
  );
  if (totals.basket.missing.length) console.log(`Introuvables : ${totals.basket.missing.join(", ")}`);
  for (const w of week.warnings ?? []) console.log(`⚠ ${w}`);
  const promo = totals.promoSaved ? ` (dont ${formatEur(totals.promoSaved)} d'économies promo)` : "";
  const status = totals.overBudget ? "⚠ au-dessus du budget" : "✅";
  console.log(`Total estimé : ${formatEur(totals.net)} / budget ${formatEur(totals.budget)}${promo} ${status}`);
  return totals;
}

async function main() {
  console.log("⚠ Ne lance pas le CLI et l'app web en même temps sur la même semaine.");

  const driveArg = argValue("--drive");
  if (driveArg !== undefined && !isDriveId(driveArg)) {
    throw new Error(`--drive : ${driveArg} inconnu (choix : ${DRIVE_IDS.join(", ")})`);
  }
  const fromFile = withProfile(loadBrief(argValue("--brief") ?? "data/brief.json"), new ProfileStore().get());
  const brief: Brief = driveArg ? { ...fromFile, drive: driveArg } : fromFile;
  const drive = driveOf(brief);
  const { label, siteUrl } = DRIVES[drive];
  const recipesFile = argValue("--from-recipes");
  const today = new Date().toISOString().slice(0, 10);

  const opened = await openDrive(drive, { importChrome: !has("--no-chrome") });
  console.log(opened.source === "chrome" ? `Session ${label} reprise de Chrome` : `Session ${label} enregistrée utilisée`);
  for (const w of opened.warnings) console.log(`⚠ ${w}`);
  const connector = opened.connector;

  step("Contexte de la semaine");
  const ctx = await loadWeeklyContext(connector, { cachePath: contextCachePath(drive) });
  console.log(summarizeContext(ctx));

  if (has("--prepare")) {
    const requestFile = `data/requests/${today}.md`;
    const outputFile = `data/recipes/${today}.json`;
    fs.mkdirSync(path.dirname(requestFile), { recursive: true });
    const avoidTitles = recentSelectedTitles(new WeekStore().list());
    fs.writeFileSync(requestFile, buildRequestDocument(brief, ctx, outputFile, { avoidTitles }));
    console.log(`\nDemande écrite : ${requestFile}`);
    console.log(`Dans Claude Code, dis : « génère les recettes de ${requestFile} »`);
    console.log(`Puis lance : npm run week -- --from-recipes ${outputFile}${driveArg ? ` --drive ${drive}` : ""}`);
    return;
  }

  const backend = selectBackend();
  console.log(`Claude : ${backend.label}${has("--no-arbiter") ? " (sans arbitrage des produits)" : ""}`);
  const store = new WeekStore();
  const deps: WorkflowDeps = {
    store,
    backend,
    openStore: async () => connector,
    loadContext: async () => ctx,
    useArbiter: !has("--no-arbiter"),
  };
  const opts = { includePantryStaples: has("--with-pantry") };

  const created = store.create(brief);
  store.update(created.id, (w) => {
    w.status = "generating";
    if (recipesFile) w.recipes = parseRecipesFile(fs.readFileSync(recipesFile, "utf8"));
  });
  if (recipesFile) step(`Recettes lues depuis ${recipesFile}`);
  await runCreateWeek(created.id, deps, cliJob, opts);
  if (!has("--no-visuels")) {
    step("Illustrations des recettes");
    const drawn = await illustrateRecipes(
      store.get(created.id)!.recipes,
      (batch) => backend.drawVisuals(batch),
      undefined,
      fetchPexelsPhoto,
    );
    console.log(`${drawn.drawn.length} dessinée(s)${drawn.rejected.length ? `, ${drawn.rejected.length} sans dessin${drawn.error ? ` (${drawn.error})` : ""}` : ""}`);
  }
  console.log();
  let week = store.get(created.id)!;
  let totals = printWeek(week);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string) => (await rl.question(`${q} (o/N) `)).trim().toLowerCase() === "o";

  if (totals.overBudget && recipesFile) {
    console.log("⚠ Au-dessus du budget : demande à Claude Code des recettes moins chères, puis relance avec --from-recipes.");
  } else if (totals.overBudget && (await ask("Demander à Claude des recettes moins chères ?"))) {
    const chosen = week.recipes.filter((r) => week.selectedRecipeIds.includes(r.id)).map((r) => r.title);
    step(`Révision du menu (${backend.label})`);
    const recipes = await backend.reviseMenu(
      brief,
      ctx,
      week.recipes,
      `Le panier des recettes retenues (${chosen.join(", ")}) coûte ${totals.net} € pour un budget de ${brief.budgetEur} €. Remplace ou simplifie les recettes les plus chères pour passer sous le budget.`,
    );
    store.update(week.id, (w) => {
      w.recipes = recipes;
      w.matches = [];
      w.selectedRecipeIds = [];
      w.overrides = { products: {}, pantry: [] };
      w.status = "generating";
    });
    await runCreateWeek(week.id, deps, cliJob, opts);
    console.log();
    week = store.get(week.id)!;
    totals = printWeek(week);
  }
  console.log(`\nSemaine enregistrée : data/weeks/${week.id}.json (visible dans l'app : npm run dev)`);

  if (has("--push")) {
    const { cartLines } = previewPush(await connector.getCart(), totals.basket.lines);
    if (await ask(`Ajouter ${cartLines.length} produits à ton panier ${label} ?`)) {
      await runPush(week.id, { store, openStore: async () => connector }, cliJob);
      const report = store.get(week.id)!.pushReport!;
      console.log();
      for (const a of report.adjusted) console.log(`⚠ ${a.name} : ${a.actual} au lieu de ${a.requested} (stock)`);
      if (report.cartTotal !== null) console.log(`Panier : ${formatEur(report.cartTotal)}`);
      if (report.failed.length) console.log(`❌ Échecs : ${report.failed.map((f) => `${f.name} (${f.error})`).join(", ")}`);
      console.log(`Finalise ta commande (créneau et paiement) sur ${siteUrl}`);
    }
  }
  rl.close();
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}`);
  process.exit(1);
});
