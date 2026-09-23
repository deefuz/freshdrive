import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import Anthropic from "@anthropic-ai/sdk";
import { AuchanConnector } from "@/lib/auchan/connector";
import { AuchanHttp } from "@/lib/auchan/http";
import { loadSession } from "@/lib/auchan/session";
import { chooseSelection, computeBasket, mergeBasketIntoCart, type Basket } from "@/lib/budget/basket";
import { buildWeeklyContext, isCacheableContext, summarizeContext, type WeeklyContext } from "@/lib/context/build";
import { createClaudeArbiter } from "@/lib/matching/arbiter";
import { type IngredientMatch, matchNeeds } from "@/lib/matching/match";
import { aggregateNeeds } from "@/lib/matching/needs";
import { fetchOffInfo } from "@/lib/matching/off";
import { type Brief, BriefSchema } from "@/lib/recipes/brief";
import { generateMenu, reviseMenu } from "@/lib/recipes/generate";
import type { Recipe } from "@/lib/recipes/schema";

const CONTEXT_CACHE = "data/cache/context.json";
const DAY_MS = 86_400_000;

const argValue = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const step = (label: string) => console.log(`\n▶ ${label}`);

function loadBrief(briefPath: string): Brief {
  if (!fs.existsSync(briefPath)) {
    fs.mkdirSync(path.dirname(briefPath), { recursive: true });
    fs.copyFileSync("brief.example.json", briefPath);
    console.log(`Brief créé à partir de l'exemple : ${briefPath} (modifie-le si besoin)`);
  }
  return BriefSchema.parse(JSON.parse(fs.readFileSync(briefPath, "utf8")));
}

async function loadContext(connector: AuchanConnector): Promise<WeeklyContext> {
  if (fs.existsSync(CONTEXT_CACHE)) {
    const cached = JSON.parse(fs.readFileSync(CONTEXT_CACHE, "utf8")) as WeeklyContext;
    if (Date.now() - Date.parse(cached.generatedAt) < DAY_MS && isCacheableContext(cached)) return cached;
  }
  const ctx = await buildWeeklyContext(connector);
  if (isCacheableContext(ctx)) {
    fs.mkdirSync(path.dirname(CONTEXT_CACHE), { recursive: true });
    fs.writeFileSync(CONTEXT_CACHE, JSON.stringify(ctx));
  }
  return ctx;
}

function printMenu(recipes: Recipe[], selected: string[]) {
  for (const r of recipes) {
    const mark = selected.includes(r.id) ? "✅" : "  ";
    console.log(`${mark} ${r.title} (${r.prepMinutes + r.cookMinutes} min) : ${r.whyThisWeek}`);
  }
}

function printBasket(basket: Basket, budget: number) {
  console.table(
    basket.lines.map((l) => ({
      ingrédient: `${l.name} (${l.quantityNeeded}${l.unit})`,
      produit: `${l.product.brand ? `${l.product.brand} ` : ""}${l.product.name}`,
      paquets: l.packs,
      coût: l.cost,
      infos: [l.product.isOrganic && "bio", l.product.promo?.label, l.uncertainQuantity && "⚠ quantité à vérifier"]
        .filter(Boolean)
        .join(" · "),
    })),
  );
  if (basket.missing.length) console.log(`Introuvables : ${basket.missing.join(", ")}`);
  const status = basket.total <= budget ? "✅" : "⚠ au-dessus du budget";
  console.log(`Total : ${basket.total} € / budget ${budget} € ${status}`);
}

async function main() {
  const brief = loadBrief(argValue("--brief") ?? "data/brief.json");
  const withPantry = process.argv.includes("--with-pantry");
  const session = loadSession();
  const connector = new AuchanConnector(new AuchanHttp(session), session);
  const client = new Anthropic();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string) => (await rl.question(`${q} (o/N) `)).trim().toLowerCase() === "o";

  step("Contexte de la semaine");
  const ctx = await loadContext(connector);
  console.log(summarizeContext(ctx));

  step("Génération des recettes (Claude)");
  let recipes = await generateMenu(client, brief, ctx);

  const scoreOpts = { preferOrganic: brief.preferOrganic, unprocessed: brief.filters.includes("unprocessed") };
  const deps = {
    connector,
    arbiter: createClaudeArbiter(client),
    novaLookup: async (p: { url: string }) => {
      const { ean } = await connector.getProductDetails(p.url);
      return ean ? (await fetchOffInfo(ean)).nova : null;
    },
    onProgress: (done: number, total: number) => process.stdout.write(`\r  produits : ${done}/${total}`),
  };

  const run = async () => {
    step("Recherche des produits Auchan");
    const needs = aggregateNeeds(recipes);
    const matches: IngredientMatch[] = await matchNeeds(needs, scoreOpts, deps);
    const exclude = withPantry ? new Set<string>() : new Set(needs.filter((n) => n.pantryStaple).map((n) => n.key));
    const selected = chooseSelection(recipes.map((r) => r.id), matches, brief.dinners, exclude);
    return { matches, selected, basket: computeBasket(matches, selected, exclude) };
  };

  let { matches, selected, basket } = await run();
  console.log();
  printMenu(recipes, selected);
  printBasket(basket, brief.budgetEur);

  if (basket.total > brief.budgetEur && (await ask("Demander à Claude des recettes moins chères ?"))) {
    const chosen = recipes.filter((r) => selected.includes(r.id)).map((r) => r.title);
    recipes = await reviseMenu(
      client,
      brief,
      ctx,
      recipes,
      `Le panier des recettes retenues (${chosen.join(", ")}) coûte ${basket.total} € pour un budget de ${brief.budgetEur} €. Remplace ou simplifie les recettes les plus chères pour passer sous le budget.`,
    );
    ({ matches, selected, basket } = await run());
    console.log();
    printMenu(recipes, selected);
    printBasket(basket, brief.budgetEur);
  }

  const weekFile = `data/weeks/${new Date().toISOString().slice(0, 10)}.json`;
  fs.mkdirSync(path.dirname(weekFile), { recursive: true });
  fs.writeFileSync(weekFile, JSON.stringify({ brief, context: summarizeContext(ctx), recipes, selected, matches, basket }, null, 2));
  console.log(`\nSemaine enregistrée : ${weekFile}`);

  if (process.argv.includes("--push")) {
    const lines = mergeBasketIntoCart(await connector.getCart(), basket.lines);
    if (await ask(`Ajouter ${lines.length} produits à ton panier Auchan ?`)) {
      step("Ajout au panier Auchan");
      const failed: string[] = [];
      for (const line of lines) {
        const label = basket.lines.find((l) => l.product.productId === line.productId)?.product.name ?? line.productId;
        try {
          const { revised } = await connector.setCartQuantities([line]);
          for (const r of revised) console.log(`⚠ ${label} : ${r.actual} au lieu de ${r.requested} (stock)`);
        } catch (e) {
          failed.push(`${label} (${(e as Error).message})`);
        }
      }
      const cart = await connector.getCart();
      console.log(`Panier : ${cart.items.length} lignes, ${cart.totalPrice} €`);
      if (failed.length) console.log(`❌ Échecs : ${failed.join(", ")}`);
      console.log("Finalise ta commande (créneau et paiement) sur https://www.auchan.fr");
    }
  }
  rl.close();
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}`);
  process.exit(1);
});
