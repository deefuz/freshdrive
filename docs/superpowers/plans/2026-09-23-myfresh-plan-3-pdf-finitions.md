# MyFresh : plan 3, PDF et finitions, implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Imprimer la semaine (une fiche A4 par recette retenue et la liste de courses, avec export PDF), mettre des recettes en favori et les reprendre dans une nouvelle semaine, éviter de reproposer les plats des 4 dernières semaines, et lire les vrais thèmes de la page d'accueil Auchan.

**Architecture:** Comme au plan 2, la logique vit dans `src/lib/` (modules purs testés avec Vitest) et les pages Next.js restent minces. `src/lib/print/sheet.ts` construit les données d'impression d'une semaine ; la page `/semaines/[id]/imprimer` les affiche avec du CSS print (A4). La route `/semaines/[id]/pdf` ouvre cette page dans Chromium sans fenêtre (Playwright) à l'adresse locale `http://127.0.0.1:3141` et renvoie `page.pdf()` en téléchargement ; le moteur de rendu est injecté, les tests ne lancent pas de navigateur. Les favoris sont dans `data/favorites.json` (module unique `src/lib/store/favorites.ts`, écritures atomiques). La reprise d'un favori se fait à la création d'une semaine : la recette est ajoutée au menu généré et retenue d'office. Les titres des recettes retenues des 4 dernières semaines passent dans le prompt partagé (`buildMenuPrompt`), donc dans les deux backends.

**Tech Stack:** Node 20, Next.js 16.3.6 (App Router, React 19.2, Turbopack), TypeScript, Tailwind 4 (variante `print:`), Vitest 4, zod 4, cheerio, Playwright 1.63 (Chromium, déjà installé pour `auchan:login`).

**Spec:** `docs/superpowers/specs/2026-09-23-myfresh-plans-2-3-design.md` (section « Plan 3 » : c'est le périmètre), avec `docs/superpowers/specs/2026-09-23-myfresh-design.md` (§ PDF, § Déroulé d'une semaine, étape 7). Le code de `src/lib/**` fait foi quand il diffère des plans 1 et 2.

## Global Constraints

- **Accès** : l'app n'écoute que sur `127.0.0.1:3141` (`next dev -H 127.0.0.1 -p 3141`), sans authentification. `src/proxy.ts` refuse tout en-tête Host autre que `127.0.0.1:3141` / `localhost:3141` (`isAllowedHost`, `APP_PORT` dans `src/lib/app/host-guard.ts`) : tout appel HTTP de l'app vers elle-même passe par `http://127.0.0.1:${APP_PORT}`.
- **L'app ne passe jamais commande.** Rien dans ce plan n'écrit dans le panier Auchan.
- **Au plus une requête toutes les 350 ms vers auchan.fr** ; aucun secret journalisé ni écrit en dehors de `data/`.
- **Stockage** : un fichier JSON par semaine (`data/weeks/<id>.json`, module unique `src/lib/store/weeks.ts`) ; les favoris dans `data/favorites.json` (module unique `src/lib/store/favorites.ts`), écrits de façon atomique (fichier temporaire puis `rename`). Pas de SQLite.
- **PDF** : rendu HTML avec CSS print, puis `page.pdf({ format: "A4", printBackground: true })` de Playwright (Chromium, `headless: true`). Réponse en téléchargement : `Content-Disposition: attachment; filename="myfresh-<id>.pdf"`.
- **Pas de répétition** : les titres des recettes **retenues** des **4 dernières semaines** (par `createdAt`) sont transmis au prompt du menu (« à éviter »), pour les deux backends, via le constructeur de prompt partagé.
- **Tests** : ne lancent jamais le vrai `claude`, n'appellent jamais auchan.fr ni Open Food Facts, **ne lancent jamais de navigateur** (moteur PDF injecté ; un seul test de fumée, sauté sauf si `MYFRESH_PDF_SMOKE=1`). `npm test` reste vert à chaque commit (234 tests au départ).
- **Next.js 16.3.6** : `params` et `searchParams` sont des `Promise` ; chaque page qui lit des données appelle `await connection()` ; les server actions rafraîchissent la page avec `refresh()` de `next/cache` ; lire le guide concerné dans `node_modules/next/dist/docs/01-app/` avant d'écrire du code Next (voir `AGENTS.md`).
- Textes visibles en **français** ; identifiants de code en anglais. Montants avec `formatEur` (`12,50 €`). Les valeurs nutritionnelles sont affichées comme des **estimations**.
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Les étapes marquées **(vérification manuelle)** utilisent le vrai Auchan, le vrai `claude` ou un vrai PDF d'une vraie semaine : c'est le contrôleur qui les fait, avec l'utilisateur. Un sous-agent les saute et le signale dans son rapport.

## Review Focus

1. **Échec du rendu PDF** (Chromium absent après une mise à jour de Playwright, page trop lente, serveur arrêté) : attendu, une réponse 500 avec « Impossible de créer le PDF : … » en français, jamais une page blanche ni un processus Chromium orphelin (`browser.close()` dans `finally`). Tests : Task 8.
2. **`data/favorites.json` absent, abîmé ou d'un ancien format** (JSON invalide, `favorites` qui n'est pas un tableau, entrée sans recette valide) : attendu, l'accueil s'affiche avec les favoris lisibles seulement, sans planter. Tests : Task 3.
3. **Options d'impression forgées dans l'URL** (nom de famille ou notes énormes, section inconnue, aucune case cochée, valeurs répétées) : attendu, textes bornés (60 / 1000 caractères), sections inconnues ignorées, « Choisis au moins une section à imprimer. » (400 pour le PDF). Tests : Task 6, Task 8.
4. **`kidSteps` incohérents renvoyés par Claude** (indice hors limites, négatif, décimal, en double) : attendu, ignorés sur la fiche, jamais une étape fantôme ni un plantage. Tests : Task 6.
5. **Favori repris dans une nouvelle semaine** alors qu'il a été retiré entre-temps, en trop grand nombre, ou écrit pour un autre nombre de portions : attendu, refus clair sans semaine créée, ou quantités remises à l'échelle du foyer. Tests : Task 3 (`scaleRecipe`), Task 4.

## File Structure

```
src/lib/auchan/parse.ts                   (modifié) parseThemes lit les bannières réelles, StoreTheme, themeText
src/lib/auchan/connector.ts               (modifié) thèmes → textes « <thème> (jusqu'au JJ/MM/AAAA) »
src/lib/recipes/prompt.ts                 (modifié) thèmes un par ligne ; MenuPromptOptions (avoidTitles, plannedTitles)
src/lib/context/build.ts                  (modifié) résumé : thèmes séparés par « ; »
src/lib/week/history.ts                   recentSelectedTitles : recettes retenues des 4 dernières semaines
src/lib/recipes/generate.ts               (modifié) generateMenu(…, options)
src/lib/llm/backend.ts                    (modifié) LlmBackend.generateMenu(brief, ctx, options?)
src/lib/recipes/handoff.ts                (modifié) buildRequestDocument(…, options)
scripts/week.ts                           (modifié) --prepare transmet les recettes à éviter
src/lib/recipes/scale.ts                  scaleRecipe : recette ramenée à N portions
src/lib/store/favorites.ts                Favorite, favoriteId, FavoriteStore (data/favorites.json)
src/lib/store/weeks.ts                    (modifié) Week.reusedRecipes
src/lib/week/workflows.ts                 (modifié) favoris repris ajoutés au menu et retenus d'office ; recettes à éviter
src/lib/app/service.ts                    (modifié) favorites, setFavorite, removeFavorite, startCreateWeek(brief, favoriteIds)
src/lib/app/instance.ts                   (modifié) FavoriteStore
src/app/actions.ts                        (modifié) toggleFavoriteAction, removeFavoriteAction, favoris du brief
src/app/page.tsx                          (modifié) section « Mes favoris »
src/app/semaines/nouvelle/*               (modifiés) « Reprendre des favoris », ?favori=<id>
src/app/semaines/[id]/_components/*       (modifiés) étoile FavoriteToggle sur les cartes recette
src/lib/matching/needs.ts                 (modifié) needKey exporté
src/lib/format.ts                         (modifié) productShortLabel
src/lib/print/sheet.ts                    options d'impression, données des fiches et de la liste de courses
src/app/semaines/[id]/imprimer/*          page d'impression (CSS print A4) et bouton « Imprimer »
src/app/layout.tsx, globals.css           (modifiés) en-tête masqué à l'impression, @page A4
src/app/semaines/[id]/page.tsx            (modifié) lien « Imprimer / PDF », étoiles
src/lib/print/pdf.ts                      PdfRenderer, createPlaywrightPdfRenderer, pdfResponse
src/app/semaines/[id]/pdf/route.ts        GET → PDF en téléchargement
CLAUDE.md                                 (modifié) une ligne sur le PDF
```

---

### Task 1 : Thèmes de la semaine lus sur la vraie page d'accueil Auchan

La fixture réelle `tests/fixtures/auchan/home-real.html` (déjà commitée) montre la structure : chaque thème est un lien `a.hp-banner__link` dont l'`aria-label` vaut « Jusqu&apos;au 05/10/2026, Asie, faites voyager vos papilles ». cheerio décode les entités HTML des attributs (`&apos;` → `'`, `&#xE0;` → `à`). Les libellés contiennent des virgules : le prompt les liste donc un par ligne et le résumé les sépare par « ; ». `WeeklyContext.themes` reste un `string[]` (le cache `data/cache/context.json` garde le même format).

**Files:**
- Modify: `src/lib/auchan/parse.ts`, `src/lib/auchan/parse.test.ts`, `src/lib/auchan/connector.ts`, `src/lib/auchan/connector.test.ts`, `src/lib/recipes/prompt.ts`, `src/lib/recipes/recipes.test.ts`, `src/lib/context/build.ts`, `src/lib/context/context.test.ts`

**Interfaces:**
- Consumes : `cleanText` (`src/lib/auchan/parse.ts`), `WeeklyContext` (`src/lib/context/build.ts`).
- Produces :
  - `interface StoreTheme { label: string; path: string; until: string | null }` ;
  - `parseThemes(html: string): StoreTheme[]` (remplace l'ancienne version qui renvoyait `string[]`) ;
  - `themeText(theme: StoreTheme): string` → `"Asie, faites voyager vos papilles (jusqu'au 05/10/2026)"` ;
  - `AuchanConnector.getStoreContext()` renvoie toujours `themes: string[]`, désormais les `themeText` des bannières.

- [ ] **Step 1 : Écrire les tests**

Dans `src/lib/auchan/parse.test.ts`, remplacer l'import par :

```ts
import { cleanText, parseCart, parseProductCards, parseProductPage, parseThemes, themeText } from "./parse";
```

et remplacer tout le bloc `describe("parseThemes", …)` par :

```ts
describe("parseThemes", () => {
  it("lit les bannières thématiques réelles : thème, date de fin et catégorie, entités décodées, astérisques retirés", () => {
    expect(parseThemes(fx("home-real.html"))).toEqual([
      {
        label: "Asie, faites voyager vos papilles",
        path: "/produits-de-nos-regions-et-du-monde/asie/ca-b0801",
        until: "05/10/2026",
      },
      { label: "cuisine gourmande", path: "/cuisine-gourmande/ca-888031000", until: "05/10/2026" },
      { label: "Foire à la bière", path: "/vins-bieres-alcool/bieres-futs-cidres/ca-n071201", until: "28/09/2026" },
    ]);
  });

  it("les liens de navigation /boutique/ ne sont pas des thèmes", () => {
    expect(parseThemes(fx("home.html"))).toEqual([]);
  });

  it("bannière sans date : thème gardé, sans date de fin ; doublons et libellés vides écartés", () => {
    const html = `<a class="hp-banner__link" href="/rentree/ca-1?cmp=home" aria-label="Rentrée gourmande *"></a>
      <a class="hp-banner__link" href="/rentree/ca-2" aria-label="rentrée gourmande"></a>
      <a class="hp-banner__link" href="/vide" aria-label="Jusqu&apos;au 01/10/2026, **"></a>
      <a class="hp-banner__link" href="/sans-label"></a>`;
    expect(parseThemes(html)).toEqual([{ label: "Rentrée gourmande", path: "/rentree/ca-1", until: null }]);
  });
});

describe("themeText", () => {
  it("ajoute la date de fin quand elle est connue", () => {
    expect(themeText({ label: "Asie", path: "/asie", until: "05/10/2026" })).toBe("Asie (jusqu'au 05/10/2026)");
    expect(themeText({ label: "Asie", path: "/asie", until: null })).toBe("Asie");
  });
});
```

Dans `src/lib/auchan/connector.test.ts`, faire servir la page d'accueil réelle par le faux client HTTP :

```ts
    getText: vi.fn(async (p: string) => (p === "/" ? fx("home-real.html") : fx("search.html"))),
```

et, dans le test « construit le contexte magasin sans doublons », remplacer `expect(ctx.themes).toEqual(["saveurs d asie", "foire a la biere"]);` par :

```ts
    expect(ctx.themes).toEqual([
      "Asie, faites voyager vos papilles (jusqu'au 05/10/2026)",
      "cuisine gourmande (jusqu'au 05/10/2026)",
      "Foire à la bière (jusqu'au 28/09/2026)",
    ]);
```

Dans `src/lib/recipes/recipes.test.ts`, à la fin du `describe("buildMenuPrompt", …)` (après le test « contient le contexte, les filtres et le nombre de recettes »), ajouter :

```ts
  it("liste les thèmes du magasin, un par ligne (les libellés contiennent des virgules)", () => {
    const p = buildMenuPrompt(brief, {
      ...ctx,
      themes: ["Asie, faites voyager vos papilles (jusqu'au 05/10/2026)", "Foire à la bière (jusqu'au 28/09/2026)"],
    });
    expect(p).toContain(
      "Thèmes mis en avant par le magasin cette semaine (ignore ceux qui ne concernent pas les dîners) :\n- Asie, faites voyager vos papilles (jusqu'au 05/10/2026)\n- Foire à la bière (jusqu'au 28/09/2026)",
    );
  });
```

Dans `src/lib/context/context.test.ts`, dans `describe("buildWeeklyContext", …)`, après le test « combine magasin, saison et événements », ajouter :

```ts
  it("résumé : thèmes séparés par des points-virgules", async () => {
    const connector = new FakeConnector({}, { promos: [], antiGaspi: [], themes: ["Asie, faites voyager vos papilles", "Foire à la bière"] });
    const ctx = await buildWeeklyContext(connector, new Date(2026, 8, 23));
    expect(summarizeContext(ctx)).toBe("0 promos · 0 anti-gaspi · thèmes : Asie, faites voyager vos papilles ; Foire à la bière");
  });
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/auchan src/lib/recipes/recipes.test.ts src/lib/context/context.test.ts`
Expected : FAIL — `themeText` n'est pas exporté ; `parseThemes` renvoie encore `["saveurs d asie", …]` ; le prompt et le résumé utilisent encore « , ».

- [ ] **Step 3 : Implémenter**

Dans `src/lib/auchan/parse.ts`, supprimer la constante `NAV_SHOPS` (ligne `const NAV_SHOPS = new Set([...]);`, devenue inutile) et remplacer toute la fonction `parseThemes` par :

```ts
/** Bannière thématique de la page d'accueil Auchan (ex. « Asie, faites voyager vos papilles »). */
export interface StoreTheme {
  label: string;
  /** chemin de la catégorie Auchan mise en avant, ex. « /produits-de-nos-regions-et-du-monde/asie/ca-b0801 » */
  path: string;
  /** date de fin affichée par Auchan (« 05/10/2026 ») ; null si absente */
  until: string | null;
}

const UNTIL_PREFIX = /^jusqu['’]au (\d{2}\/\d{2}\/\d{4}),\s*/i;

/** Thèmes de la semaine : bannières `a.hp-banner__link` dont l'aria-label vaut « Jusqu'au JJ/MM/AAAA, <thème> ». */
export function parseThemes(html: string): StoreTheme[] {
  const $ = cheerio.load(html);
  const themes: StoreTheme[] = [];
  $("a.hp-banner__link").each((_, el) => {
    const aria = cleanText($(el).attr("aria-label") ?? "");
    const until = UNTIL_PREFIX.exec(aria);
    const label = aria
      .slice(until ? until[0].length : 0)
      .replace(/\s*\*+$/, "")
      .trim();
    if (!label || themes.some((t) => t.label.toLowerCase() === label.toLowerCase())) return;
    themes.push({ label, path: ($(el).attr("href") ?? "").split("?")[0], until: until ? until[1] : null });
  });
  return themes;
}

/** Texte d'un thème pour le prompt et l'accueil : « Asie, faites voyager vos papilles (jusqu'au 05/10/2026) ». */
export function themeText(theme: StoreTheme): string {
  return theme.until ? `${theme.label} (jusqu'au ${theme.until})` : theme.label;
}
```

Dans `src/lib/auchan/connector.ts`, remplacer l'import de `./parse` par :

```ts
import {
  BASE_URL,
  parseCart,
  parseProductCards,
  parseProductPage,
  parseThemes,
  type RawCartResponse,
  themeText,
} from "./parse";
```

et, dans `getStoreContext`, la ligne des thèmes par :

```ts
    const themes = parseThemes(await this.http.getText("/")).map(themeText);
```

Dans `src/lib/recipes/prompt.ts` (`contextBlock`), remplacer la ligne des thèmes :

```ts
    ctx.themes.length ? `Thèmes mis en avant par le magasin : ${ctx.themes.join(", ")}.` : "",
```

par :

```ts
    ctx.themes.length
      ? `Thèmes mis en avant par le magasin cette semaine (ignore ceux qui ne concernent pas les dîners) :\n${ctx.themes.map((t) => `- ${t}`).join("\n")}`
      : "",
```

Dans `src/lib/context/build.ts` (`summarizeContext`), remplacer :

```ts
  if (ctx.themes.length) parts.push(`thèmes : ${ctx.themes.join(", ")}`);
```

par :

```ts
  if (ctx.themes.length) parts.push(`thèmes : ${ctx.themes.join(" ; ")}`);
```

- [ ] **Step 4 : Vérifier**

Run : `npm test && npx tsc --noEmit && npm run lint`
Expected : PASS, 239 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/auchan src/lib/recipes/prompt.ts src/lib/recipes/recipes.test.ts src/lib/context
git commit -m "fix(auchan): thèmes de la semaine lus sur les bannières réelles de la page d'accueil" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6 : (vérification manuelle) Thèmes réels**

Chrome connecté à auchan.fr : `npm run auchan:smoke` affiche « Thèmes : Asie, faites voyager vos papilles (jusqu'au …), … » (au moins un thème). Si la ligne affiche « (aucun) », capturer de nouveau la page d'accueil et comparer avec `tests/fixtures/auchan/home-real.html`.

---

### Task 2 : Pas de répétition — recettes des 4 dernières semaines à éviter

**Files:**
- Create: `src/lib/week/history.ts`, `src/lib/week/history.test.ts`
- Modify: `src/lib/recipes/prompt.ts`, `src/lib/recipes/generate.ts`, `src/lib/llm/backend.ts`, `src/lib/recipes/handoff.ts`, `src/lib/week/workflows.ts`, `scripts/week.ts`, `src/lib/recipes/recipes.test.ts`, `src/lib/llm/backend.test.ts`, `src/lib/recipes/handoff.test.ts`, `src/lib/week/workflows.test.ts`

**Interfaces:**
- Consumes : `Week` (`src/lib/store/weeks.ts`), `WeekStore.list()` (trié par `createdAt` décroissant), `normalizeText` (`src/lib/text.ts`), `buildMenuPrompt`, `LlmBackend`.
- Produces :
  - `AVOID_WEEKS = 4`, `recentSelectedTitles(weeks: Week[], excludeId?: string, limit?: number): string[]` ;
  - `interface MenuPromptOptions { avoidTitles?: string[] }` (Task 4 y ajoute `plannedTitles`) ;
  - `buildMenuPrompt(brief, ctx, options?: MenuPromptOptions)`, `generateMenu(client, brief, ctx, options?)`, `LlmBackend.generateMenu(brief, ctx, options?)`, `buildRequestDocument(brief, ctx, outputPath, options?)` ;
  - `runCreateWeek` appelle `generateMenu(brief, ctx, { avoidTitles: recentSelectedTitles(store.list(), weekId) })`.

- [ ] **Step 1 : Écrire les tests**

`src/lib/week/history.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { makeRecipe, makeWeek } from "../../../tests/helpers/factories";
import { recentSelectedTitles } from "./history";

function week(id: string, createdAt: string, titles: string[], selected: number[] = titles.map((_, i) => i)) {
  const recipes = titles.map((title, i) => makeRecipe({ id: `r${i}`, title }));
  return makeWeek({ id, createdAt, recipes, selectedRecipeIds: selected.map((i) => `r${i}`) });
}

describe("recentSelectedTitles", () => {
  it("titres des recettes retenues des 4 dernières semaines, les plus récentes d'abord", () => {
    const weeks = [
      week("2026-08-26-1", "2026-08-26T10:00:00.000Z", ["Trop ancienne"]),
      week("2026-09-02-1", "2026-09-02T10:00:00.000Z", ["Curry"]),
      week("2026-09-09-1", "2026-09-09T10:00:00.000Z", ["Gratin", "Non retenue"], [0]),
      week("2026-09-16-1", "2026-09-16T10:00:00.000Z", ["Tacos"]),
      week("2026-09-23-1", "2026-09-23T10:00:00.000Z", ["Soupe"]),
    ];
    expect(recentSelectedTitles(weeks)).toEqual(["Soupe", "Tacos", "Gratin", "Curry"]);
  });

  it("exclut la semaine en cours de création et les semaines sans recette retenue", () => {
    const weeks = [
      week("2026-09-23-2", "2026-09-23T12:00:00.000Z", ["En cours"]),
      week("2026-09-23-1", "2026-09-23T10:00:00.000Z", ["Brouillon"], []),
      week("2026-09-16-1", "2026-09-16T10:00:00.000Z", ["Tacos"]),
    ];
    expect(recentSelectedTitles(weeks, "2026-09-23-2")).toEqual(["Tacos"]);
  });

  it("sans doublon (casse et accents ignorés)", () => {
    const weeks = [
      week("2026-09-23-1", "2026-09-23T10:00:00.000Z", ["Gratin dauphinois"]),
      week("2026-09-16-1", "2026-09-16T10:00:00.000Z", ["gratin Dauphinois"]),
    ];
    expect(recentSelectedTitles(weeks)).toEqual(["Gratin dauphinois"]);
  });

  it("aucune semaine : liste vide", () => {
    expect(recentSelectedTitles([])).toEqual([]);
  });
});
```

Dans `src/lib/recipes/recipes.test.ts`, juste avant `describe("generateMenu", …)`, ajouter :

```ts
describe("buildMenuPrompt : recettes à éviter", () => {
  it("liste les recettes des dernières semaines à ne pas reproposer", () => {
    const p = buildMenuPrompt(brief, ctx, { avoidTitles: ["Curry de lentilles", "Gratin, version douce"] });
    expect(p).toContain(
      "Recettes servies ces dernières semaines, à éviter (ni la même recette, ni une variante très proche) : Curry de lentilles ; Gratin, version douce.",
    );
  });

  it("rien à éviter : pas de ligne", () => {
    expect(buildMenuPrompt(brief, ctx, { avoidTitles: [] })).not.toContain("à éviter");
    expect(buildMenuPrompt(brief, ctx)).not.toContain("à éviter");
  });
});
```

et, dans `describe("generateMenu", …)`, avant le test « lève LlmError sur un refus », ajouter :

```ts
  it("transmet les recettes à éviter dans le prompt (API)", async () => {
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: { recipes: [] } });
    await generateMenu(client, brief, ctx, { avoidTitles: ["Curry de lentilles"] });
    expect(parse.mock.calls[0][0].messages[0].content).toContain("à éviter (ni la même recette, ni une variante très proche) : Curry de lentilles.");
  });
```

Dans `src/lib/llm/backend.test.ts`, avant le test « generateMenu refuse des identifiants de recette en double », ajouter :

```ts
  it("generateMenu transmet les recettes à éviter (même prompt que l'API)", async () => {
    const exec = fakeExec({ recipes: [] });
    await createClaudeCodeBackend({ exec }).generateMenu(brief, ctx, { avoidTitles: ["Curry de lentilles", "Tacos"] });
    expect(promptOf(exec)).toContain(
      "à éviter (ni la même recette, ni une variante très proche) : Curry de lentilles ; Tacos.",
    );
  });
```

Dans `src/lib/recipes/handoff.test.ts`, à la fin de `describe("buildRequestDocument", …)`, ajouter :

```ts
  it("transmet les recettes à éviter", () => {
    const doc = buildRequestDocument(brief, ctx, "data/recipes/2026-10-20.json", { avoidTitles: ["Tacos"] });
    expect(doc).toContain("à éviter (ni la même recette, ni une variante très proche) : Tacos.");
  });
```

Dans `src/lib/week/workflows.test.ts` (`describe("runCreateWeek", …)`), avant le test « useArbiter: false : Claude n'arbitre pas les produits », ajouter :

```ts
  it("demande à Claude d'éviter les recettes retenues des semaines précédentes", async () => {
    const past = store.create(brief, new Date(2026, 8, 16, 12));
    store.update(past.id, (w) => {
      w.recipes = [makeRecipe({ id: "a", title: "Tacos" }), makeRecipe({ id: "b", title: "Non retenue" })];
      w.selectedRecipeIds = ["a"];
      w.status = "ready";
    });
    const backend = fakeBackend({ generateMenu: vi.fn(async () => menu()) });
    const id = newWeek();
    await runCreateWeek(id, deps(backend), jobRecorder());
    expect(backend.generateMenu).toHaveBeenCalledWith(brief, ctx, expect.objectContaining({ avoidTitles: ["Tacos"] }));
  });
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/week src/lib/recipes src/lib/llm`
Expected : FAIL — `./history` introuvable ; `buildMenuPrompt` ignore son 3e argument ; `generateMenu` est appelé avec `(brief, ctx)` seulement.

- [ ] **Step 3 : Implémenter**

`src/lib/week/history.ts` :

```ts
import type { Week } from "../store/weeks";
import { normalizeText } from "../text";

/** Nombre de semaines passées dont les recettes retenues sont à éviter. */
export const AVOID_WEEKS = 4;

/**
 * Titres des recettes retenues sur les `limit` dernières semaines (par date de création), sans doublons.
 * Les semaines sans recette retenue (préparation échouée, brouillon) ne comptent pas dans la fenêtre.
 */
export function recentSelectedTitles(weeks: Week[], excludeId?: string, limit: number = AVOID_WEEKS): string[] {
  const recent = weeks
    .filter((w) => w.id !== excludeId && w.selectedRecipeIds.length > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, limit);
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const week of recent) {
    for (const recipe of week.recipes) {
      const key = normalizeText(recipe.title);
      if (!week.selectedRecipeIds.includes(recipe.id) || seen.has(key)) continue;
      seen.add(key);
      titles.push(recipe.title);
    }
  }
  return titles;
}
```

Dans `src/lib/recipes/prompt.ts`, remplacer le début de `buildMenuPrompt` :

```ts
export function buildMenuPrompt(brief: Brief, ctx: WeeklyContext): string {
  const count = brief.dinners + 2;
  return `${contextBlock(ctx)}

${briefBlock(brief)}

Propose ${count} recettes
```

par (le reste de la ligne `Propose …` est inchangé) :

```ts
export interface MenuPromptOptions {
  /** titres des recettes retenues ces dernières semaines, à ne pas reproposer */
  avoidTitles?: string[];
}

function menuOptionsBlock(options: MenuPromptOptions): string {
  const avoid = options.avoidTitles ?? [];
  return avoid.length
    ? `Recettes servies ces dernières semaines, à éviter (ni la même recette, ni une variante très proche) : ${avoid.join(" ; ")}.`
    : "";
}

export function buildMenuPrompt(brief: Brief, ctx: WeeklyContext, options: MenuPromptOptions = {}): string {
  const count = brief.dinners + 2;
  const extra = menuOptionsBlock(options);
  return `${contextBlock(ctx)}

${briefBlock(brief)}
${extra ? `\n${extra}\n` : ""}
Propose ${count} recettes
```

(Sans recette à éviter, le prompt est identique à l'actuel : `extra` vide redonne la ligne vide d'origine.)

Dans `src/lib/recipes/generate.ts`, remplacer l'import de `./prompt` par :

```ts
import {
  buildMenuPrompt,
  buildRevisePrompt,
  buildReviseRecipePrompt,
  type MenuPromptOptions,
  SYSTEM_PROMPT,
} from "./prompt";
```

et `generateMenu` par :

```ts
export function generateMenu(
  client: Anthropic,
  brief: Brief,
  ctx: WeeklyContext,
  options: MenuPromptOptions = {},
): Promise<Recipe[]> {
  return askMenu(client, buildMenuPrompt(brief, ctx, options));
}
```

Dans `src/lib/llm/backend.ts`, remplacer l'import de `../recipes/prompt` par :

```ts
import {
  buildMenuPrompt,
  buildRevisePrompt,
  buildReviseRecipePrompt,
  type MenuPromptOptions,
  SYSTEM_PROMPT,
} from "../recipes/prompt";
```

puis, dans `interface LlmBackend` :

```ts
  generateMenu(brief: Brief, ctx: WeeklyContext, options?: MenuPromptOptions): Promise<Recipe[]>;
```

dans `createApiBackend` :

```ts
    generateMenu: async (brief, ctx, options) => assertUniqueRecipeIds(await generateMenu(client, brief, ctx, options)),
```

et dans `createClaudeCodeBackend` :

```ts
    generateMenu: async (brief, ctx, options) =>
      assertUniqueRecipeIds((await ask(MenuSchema, withRole(buildMenuPrompt(brief, ctx, options)))).recipes),
```

Dans `src/lib/recipes/handoff.ts`, remplacer l'import de `./prompt` par :

```ts
import { buildMenuPrompt, type MenuPromptOptions, SYSTEM_PROMPT } from "./prompt";
```

la signature par :

```ts
export function buildRequestDocument(
  brief: Brief,
  ctx: WeeklyContext,
  outputPath: string,
  options: MenuPromptOptions = {},
): string {
```

et, dans le gabarit, `${buildMenuPrompt(brief, ctx)}` par `${buildMenuPrompt(brief, ctx, options)}`.

Dans `src/lib/week/workflows.ts`, ajouter après l'import de `./edit` :

```ts
import { recentSelectedTitles } from "./history";
```

et, dans `runCreateWeek`, remplacer :

```ts
      recipes = await deps.backend.generateMenu(week.brief, ctx);
```

par :

```ts
      recipes = await deps.backend.generateMenu(week.brief, ctx, {
        avoidTitles: recentSelectedTitles(deps.store.list(), weekId),
      });
```

Dans `scripts/week.ts`, ajouter après l'import de `@/lib/week/edit` :

```ts
import { recentSelectedTitles } from "@/lib/week/history";
```

et, dans le bloc `--prepare`, remplacer :

```ts
    fs.writeFileSync(requestFile, buildRequestDocument(brief, ctx, outputFile));
```

par :

```ts
    const avoidTitles = recentSelectedTitles(new WeekStore().list());
    fs.writeFileSync(requestFile, buildRequestDocument(brief, ctx, outputFile, { avoidTitles }));
```

- [ ] **Step 4 : Vérifier**

Run : `npm test && npx tsc --noEmit && npm run lint`
Expected : PASS, 249 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/week src/lib/recipes src/lib/llm scripts/week.ts
git commit -m "feat(recettes): les plats retenus des 4 dernières semaines sont à éviter" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 : Stockage des favoris et mise à l'échelle d'une recette

Un favori est identifié par son **titre** (`favoriteId` = titre en minuscules, sans accents ni ponctuation) : l'étoile d'une recette d'une autre semaine portant le même titre apparaît pleine, et remettre en favori une version modifiée remplace l'ancienne. Chaque favori garde une copie de la recette (la semaine d'origine peut changer ensuite).

**Files:**
- Create: `src/lib/recipes/scale.ts`, `src/lib/recipes/scale.test.ts`, `src/lib/store/favorites.ts`, `src/lib/store/favorites.test.ts`

**Interfaces:**
- Consumes : `Recipe`, `RecipeSchema` (`src/lib/recipes/schema.ts`), `normalizeText` (`src/lib/text.ts`).
- Produces :
  - `scaleRecipe(recipe: Recipe, servings: number): Recipe` ;
  - `FAVORITES_FILE = "data/favorites.json"`, `interface Favorite { id: string; recipe: Recipe; sourceWeekId: string; addedAt: string }`, `favoriteId(title: string): string` ;
  - `class FavoriteStore { constructor(file?: string); list(): Favorite[]; get(id: string): Favorite | null; has(title: string): boolean; add(recipe: Recipe, sourceWeekId: string, now?: Date): Favorite; remove(id: string): boolean }`.

- [ ] **Step 1 : Écrire les tests**

`src/lib/recipes/scale.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { makeRecipe } from "../../../tests/helpers/factories";
import { scaleRecipe } from "./scale";

const ing = (name: string, quantity: number, unit: "g" | "ml" | "pce") => ({
  name,
  searchQuery: name,
  quantity,
  unit,
  pantryStaple: false,
  fromPromo: false,
});

describe("scaleRecipe", () => {
  it("met les quantités à l'échelle du nombre de portions", () => {
    const recipe = makeRecipe({
      servings: 4,
      ingredients: [ing("riz", 300, "g"), ing("lait de coco", 250, "ml"), ing("oignon", 1, "pce"), ing("sel", 1, "g")],
    });
    const scaled = scaleRecipe(recipe, 6);
    expect(scaled.servings).toBe(6);
    expect(scaled.ingredients.map((i) => i.quantity)).toEqual([450, 375, 1.5, 2]);
  });

  it("jamais moins d'une demi-pièce ou d'1 g", () => {
    const recipe = makeRecipe({ servings: 6, ingredients: [ing("citron", 0.5, "pce"), ing("sel", 1, "g")] });
    expect(scaleRecipe(recipe, 2).ingredients.map((i) => i.quantity)).toEqual([0.5, 1]);
  });

  it("même nombre de portions : recette inchangée", () => {
    const recipe = makeRecipe({ servings: 4, ingredients: [ing("riz", 300, "g")] });
    expect(scaleRecipe(recipe, 4)).toBe(recipe);
  });
});
```

`src/lib/store/favorites.test.ts` :

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeRecipe } from "../../../tests/helpers/factories";
import { favoriteId, FavoriteStore } from "./favorites";

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "myfresh-fav-"));
  file = path.join(dir, "sous-dossier", "favorites.json");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("favoriteId", () => {
  it("dérive un identifiant du titre (minuscules, sans accents ni ponctuation)", () => {
    expect(favoriteId("Curry de légumes & riz")).toBe("curry-de-legumes-riz");
    expect(favoriteId("  Œufs cocotte !  ")).toBe("oeufs-cocotte");
    expect(favoriteId("!!!")).toBe("recette");
  });
});

describe("FavoriteStore", () => {
  it("fichier absent : aucun favori", () => {
    const store = new FavoriteStore(file);
    expect(store.list()).toEqual([]);
    expect(store.has("Curry")).toBe(false);
  });

  it("ajoute, liste (plus récents d'abord), retrouve et retire", () => {
    const store = new FavoriteStore(file);
    const curry = makeRecipe({ title: "Curry de légumes" });
    const gratin = makeRecipe({ title: "Gratin" });
    store.add(curry, "2026-09-16-1", new Date("2026-09-16T10:00:00.000Z"));
    store.add(gratin, "2026-09-23-1", new Date("2026-09-23T10:00:00.000Z"));
    expect(store.list().map((f) => f.id)).toEqual(["gratin", "curry-de-legumes"]);
    expect(store.get("curry-de-legumes")).toEqual({
      id: "curry-de-legumes",
      recipe: curry,
      sourceWeekId: "2026-09-16-1",
      addedAt: "2026-09-16T10:00:00.000Z",
    });
    expect(store.has("curry de legumes")).toBe(true);
    expect(store.remove("gratin")).toBe(true);
    expect(store.remove("gratin")).toBe(false);
    expect(new FavoriteStore(file).list().map((f) => f.id)).toEqual(["curry-de-legumes"]);
  });

  it("une recette de même titre remplace l'ancienne version", () => {
    const store = new FavoriteStore(file);
    store.add(makeRecipe({ title: "Curry", summary: "v1" }), "2026-09-16-1");
    store.add(makeRecipe({ title: "curry", summary: "v2" }), "2026-09-23-1");
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].recipe.summary).toBe("v2");
  });

  it("écriture atomique : aucun fichier temporaire ne reste", () => {
    new FavoriteStore(file).add(makeRecipe({ title: "Curry" }), "2026-09-23-1");
    expect(fs.readdirSync(path.dirname(file))).toEqual(["favorites.json"]);
  });

  it("fichier illisible ou entrées abîmées : ignorés sans planter", () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ pas du json");
    expect(new FavoriteStore(file).list()).toEqual([]);
    fs.writeFileSync(file, JSON.stringify({ favorites: "non" }));
    expect(new FavoriteStore(file).list()).toEqual([]);
    const ok = { id: "curry", recipe: makeRecipe({ title: "Curry" }), sourceWeekId: "2026-09-23-1", addedAt: "2026-09-23T10:00:00.000Z" };
    fs.writeFileSync(file, JSON.stringify({ favorites: [ok, { id: "abime", recipe: { title: 3 } }, null] }));
    expect(new FavoriteStore(file).list()).toEqual([ok]);
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/recipes/scale.test.ts src/lib/store/favorites.test.ts`
Expected : FAIL — `./scale` et `./favorites` introuvables.

- [ ] **Step 3 : Implémenter**

`src/lib/recipes/scale.ts` :

```ts
import type { Recipe } from "./schema";

/** Recette ramenée à `servings` portions : quantités proportionnelles (g et ml arrondis à l'unité, pièces à la demie). */
export function scaleRecipe(recipe: Recipe, servings: number): Recipe {
  if (recipe.servings === servings || recipe.servings <= 0) return recipe;
  const ratio = servings / recipe.servings;
  return {
    ...recipe,
    servings,
    ingredients: recipe.ingredients.map((ing) => {
      const scaled = ing.quantity * ratio;
      const quantity = ing.unit === "pce" ? Math.max(0.5, Math.round(scaled * 2) / 2) : Math.max(1, Math.round(scaled));
      return { ...ing, quantity };
    }),
  };
}
```

`src/lib/store/favorites.ts` :

```ts
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { type Recipe, RecipeSchema } from "../recipes/schema";
import { normalizeText } from "../text";

export const FAVORITES_FILE = "data/favorites.json";

export interface Favorite {
  /** dérivé du titre : une même recette (même titre) n'est enregistrée qu'une fois */
  id: string;
  recipe: Recipe;
  /** semaine d'où vient la recette */
  sourceWeekId: string;
  addedAt: string;
}

const FavoriteSchema = z.object({
  id: z.string(),
  recipe: RecipeSchema,
  sourceWeekId: z.string(),
  addedAt: z.string(),
});

/** « Curry de légumes & riz » → « curry-de-legumes-riz » */
export function favoriteId(title: string): string {
  return (
    normalizeText(title)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "recette"
  );
}

/** Seul module qui lit et écrit data/favorites.json. */
export class FavoriteStore {
  constructor(private readonly file: string = FAVORITES_FILE) {}

  /** Favoris, les plus récents d'abord. Un fichier absent ou illisible donne une liste vide ; une entrée abîmée est ignorée. */
  list(): Favorite[] {
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      return [];
    }
    const entries = (data as { favorites?: unknown } | null)?.favorites;
    if (!Array.isArray(entries)) return [];
    return entries
      .flatMap((entry) => {
        const parsed = FavoriteSchema.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      })
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }

  get(id: string): Favorite | null {
    return this.list().find((f) => f.id === id) ?? null;
  }

  /** Vrai si une recette de ce titre est en favori. */
  has(title: string): boolean {
    return this.get(favoriteId(title)) !== null;
  }

  /** Ajoute la recette (ou remplace celle de même titre par cette version). */
  add(recipe: Recipe, sourceWeekId: string, now: Date = new Date()): Favorite {
    const favorite: Favorite = { id: favoriteId(recipe.title), recipe, sourceWeekId, addedAt: now.toISOString() };
    this.write([favorite, ...this.list().filter((f) => f.id !== favorite.id)]);
    return favorite;
  }

  /** Retire un favori ; faux s'il n'existait pas. */
  remove(id: string): boolean {
    const favorites = this.list();
    const kept = favorites.filter((f) => f.id !== id);
    if (kept.length === favorites.length) return false;
    this.write(kept);
    return true;
  }

  private write(favorites: Favorite[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ favorites }, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
```

- [ ] **Step 4 : Vérifier**

Run : `npm test && npx tsc --noEmit && npm run lint`
Expected : PASS, 258 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/recipes/scale.ts src/lib/recipes/scale.test.ts src/lib/store/favorites.ts src/lib/store/favorites.test.ts
git commit -m "feat(favoris): stockage data/favorites.json et mise à l'échelle d'une recette" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 : Favoris dans le service — étoile, retrait, reprise dans une nouvelle semaine

Reprise d'un favori (variante la plus simple que permet la spec) : au moment de **créer** une semaine, l'utilisateur coche des favoris. Ils sont copiés dans `week.reusedRecipes` (mis à l'échelle du foyer, identifiant `favori-<id>`). `runCreateWeek` demande toujours N+2 recettes à Claude en lui annonçant les favoris déjà au menu, place les favoris en tête, cherche les produits de tout le menu en une seule passe, puis retient d'office les favoris et complète avec les recettes les moins chères. Pas d'ajout dans une semaine déjà préparée (il faudrait une tâche Auchan de plus).

**Files:**
- Modify: `src/lib/store/weeks.ts`, `src/lib/recipes/prompt.ts`, `src/lib/week/workflows.ts`, `src/lib/app/service.ts`, `src/lib/app/instance.ts`, `src/lib/app/service.test.ts`, `src/lib/week/workflows.test.ts`, `src/lib/recipes/recipes.test.ts`

**Interfaces:**
- Consumes : `FavoriteStore`, `favoriteId` (Task 3), `scaleRecipe` (Task 3), `servingsFor` (`src/lib/recipes/brief.ts`), `MenuPromptOptions`, `recentSelectedTitles` (Task 2), `chooseSelection` (`src/lib/budget/basket.ts`).
- Produces :
  - `Week.reusedRecipes?: Recipe[]` ;
  - `MenuPromptOptions.plannedTitles?: string[]` ;
  - `AppDeps.favorites: FavoriteStore` (obligatoire), `MyFreshApp.favorites: FavoriteStore` ;
  - `MyFreshApp.startCreateWeek(brief: Brief, favoriteIds?: string[]): Week`, `setFavorite(weekId: string, recipeId: string, favorite: boolean): void`, `removeFavorite(id: string): void` (erreurs : `ActionError`).

- [ ] **Step 1 : Écrire les tests**

Dans `src/lib/recipes/recipes.test.ts`, dans `describe("buildMenuPrompt : recettes à éviter", …)`, avant le test « rien à éviter : pas de ligne », ajouter :

```ts
  it("annonce les favoris déjà au menu", () => {
    const p = buildMenuPrompt(brief, ctx, { plannedTitles: ["Riz cantonais"] });
    expect(p).toContain(
      "Déjà au menu cette semaine (recettes favorites reprises : ne les propose pas, mais tu peux partager des ingrédients avec elles) : Riz cantonais.",
    );
  });
```

Dans `src/lib/week/workflows.test.ts` (`describe("runCreateWeek", …)`), avant le test « useArbiter: false … », ajouter :

```ts
  it("favoris repris : placés en tête, annoncés à Claude et retenus d'office", async () => {
    const favori = makeRecipe({ id: "favori-riz", title: "Riz cantonais", ingredients: [ing("riz", 500)] });
    const generated = [...menu(), makeRecipe({ id: "favori-riz", title: "Homonyme", ingredients: [ing("courgette", 300)] })];
    const backend = fakeBackend({ generateMenu: vi.fn(async () => generated) });
    const id = newWeek();
    store.update(id, (w) => {
      w.reusedRecipes = [favori];
    });
    await runCreateWeek(id, deps(backend), jobRecorder());
    const week = store.get(id)!;
    expect(backend.generateMenu).toHaveBeenCalledWith(brief, ctx, { avoidTitles: [], plannedTitles: ["Riz cantonais"] });
    expect(week.recipes.map((r) => r.id)).toEqual(["favori-riz", "pates-tomate", "riz-tomate", "favori-riz-2"]);
    // 1 dîner : seul le favori est retenu, quel que soit le coût des recettes générées
    expect(week.selectedRecipeIds).toEqual(["favori-riz"]);
  });
```

Dans `src/lib/app/service.test.ts` :
- remplacer l'import `import { WeekStore } from "../store/weeks";` par :

```ts
import { favoriteId as favoriteIdOf, FavoriteStore } from "../store/favorites";
import { WeekStore } from "../store/weeks";
```

- dans `setup`, remplacer :

```ts
  const store = new WeekStore(dir);
  const app = new MyFreshApp({
    store,
```

par :

```ts
  const store = new WeekStore(dir);
  const favorites = new FavoriteStore(path.join(dir, "favoris", "favorites.json"));
  const app = new MyFreshApp({
    store,
    favorites,
```

et `return { app, store, connector };` par `return { app, store, favorites, connector };` ;
- à la fin de `describe("MyFreshApp", …)` (avant la dernière ligne `});`), ajouter :

```ts
  it("setFavorite : étoile une recette de la semaine, puis la retire", async () => {
    const { app, favorites } = setup();
    const { id } = app.startCreateWeek(brief);
    await app.runner.idle();
    app.setFavorite(id, "pates", true);
    expect(favorites.list()).toMatchObject([
      { id: favoriteIdOf(recipes[0].title), sourceWeekId: id, addedAt: "2026-09-23T10:00:00.000Z" },
    ]);
    expect(favorites.has(recipes[0].title)).toBe(true);
    app.setFavorite(id, "pates", false);
    expect(favorites.list()).toEqual([]);
    expect(() => app.setFavorite(id, "inconnue", true)).toThrow(ActionError);
    expect(() => app.setFavorite("../x", "pates", true)).toThrow(/Semaine introuvable/);
  });

  it("removeFavorite : favori inconnu refusé", () => {
    const { app } = setup();
    expect(() => app.removeFavorite("inconnu")).toThrow(/Favori introuvable/);
  });

  it("startCreateWeek reprend un favori : mis à l'échelle du foyer, ajouté au menu et retenu d'office", async () => {
    const { app, favorites } = setup();
    const soupe = makeRecipe({ id: "soupe", title: "Soupe", servings: 4, ingredients: [ing("pates", 200)] });
    favorites.add(soupe, "2026-09-16-1");
    const week = app.startCreateWeek(brief, ["soupe", "soupe"]);
    expect(week.reusedRecipes).toEqual([
      { ...soupe, id: "favori-soupe", servings: 2, ingredients: [{ ...soupe.ingredients[0], quantity: 100 }] },
    ]);
    await app.runner.idle();
    const done = app.getWeek(week.id)!;
    expect(done.recipes.map((r) => r.id)).toEqual(["favori-soupe", "pates", "riz"]);
    expect(done.selectedRecipeIds).toEqual(["favori-soupe"]);
  });

  it("startCreateWeek refuse un favori disparu ou trop de favoris, sans créer de semaine", () => {
    const { app, favorites, store } = setup();
    expect(() => app.startCreateWeek(brief, ["disparu"])).toThrow(/n'existe plus/);
    favorites.add(makeRecipe({ title: "A" }), "2026-09-16-1");
    favorites.add(makeRecipe({ title: "B" }), "2026-09-16-1");
    expect(() => app.startCreateWeek(brief, ["a", "b"])).toThrow("Tu peux reprendre au plus 1 favori pour 1 dîner.");
    expect(store.list()).toEqual([]);
    expect(app.runner.current()).toBeNull();
  });
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/app src/lib/week src/lib/recipes`
Expected : FAIL — `AppDeps` n'a pas de `favorites` (erreur de type ignorée par Vitest, mais `app.setFavorite` n'existe pas) ; `plannedTitles` absent du prompt ; `reusedRecipes` ignoré.

- [ ] **Step 3 : Implémenter**

Dans `src/lib/store/weeks.ts`, à la fin de `interface Week` (après `warnings?: string[];`), ajouter :

```ts
  /** recettes favorites reprises à la création : ajoutées au menu généré et retenues d'office */
  reusedRecipes?: Recipe[];
```

Dans `src/lib/recipes/prompt.ts`, remplacer `MenuPromptOptions` et `menuOptionsBlock` (Task 2) par :

```ts
export interface MenuPromptOptions {
  /** titres des recettes retenues ces dernières semaines, à ne pas reproposer */
  avoidTitles?: string[];
  /** titres des recettes favorites déjà ajoutées au menu de la semaine */
  plannedTitles?: string[];
}

function menuOptionsBlock(options: MenuPromptOptions): string {
  const avoid = options.avoidTitles ?? [];
  const planned = options.plannedTitles ?? [];
  return [
    avoid.length
      ? `Recettes servies ces dernières semaines, à éviter (ni la même recette, ni une variante très proche) : ${avoid.join(" ; ")}.`
      : "",
    planned.length
      ? `Déjà au menu cette semaine (recettes favorites reprises : ne les propose pas, mais tu peux partager des ingrédients avec elles) : ${planned.join(" ; ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
```

Dans `src/lib/week/workflows.ts` (`runCreateWeek`), remplacer :

```ts
    let recipes = week.recipes;
    if (!recipes.length) {
      job.step(`Génération des recettes (${deps.backend.label})`);
      recipes = await deps.backend.generateMenu(week.brief, ctx, {
        avoidTitles: recentSelectedTitles(deps.store.list(), weekId),
      });
```

par :

```ts
    const reused = week.reusedRecipes ?? [];
    const reusedIds = new Set(reused.map((r) => r.id));
    let recipes = week.recipes;
    if (!recipes.length) {
      job.step(`Génération des recettes (${deps.backend.label})`);
      const generated = await deps.backend.generateMenu(week.brief, ctx, {
        avoidTitles: recentSelectedTitles(deps.store.list(), weekId),
        plannedTitles: reused.map((r) => r.title),
      });
      // favoris d'abord ; un identifiant généré identique à celui d'un favori est renommé
      recipes = [...reused, ...generated.map((r) => (reusedIds.has(r.id) ? { ...r, id: `${r.id}-2` } : r))];
```

(les lignes suivantes, `// enregistrées tout de suite …` et `deps.store.update(… w.recipes = recipes …)`, restent), puis remplacer :

```ts
    const selected = chooseSelection(
      recipes.map((r) => r.id),
      matches,
      week.brief.dinners,
      new Set(overrides.pantry),
    );
```

par :

```ts
    // favoris repris retenus d'office, puis les recettes les moins chères jusqu'au nombre de dîners
    const ids = recipes.map((r) => r.id);
    const forced = ids.filter((id) => reusedIds.has(id)).slice(0, week.brief.dinners);
    const cheapest = chooseSelection(
      ids.filter((id) => !forced.includes(id)),
      matches,
      week.brief.dinners - forced.length,
      new Set(overrides.pantry),
    );
    const selected = ids.filter((id) => forced.includes(id) || cheapest.includes(id));
```

Dans `src/lib/app/service.ts` :
- remplacer les imports :

```ts
import type { Brief } from "../recipes/brief";
import type { Week, WeekStore } from "../store/weeks";
```

par :

```ts
import { type Brief, servingsFor } from "../recipes/brief";
import { scaleRecipe } from "../recipes/scale";
import type { Recipe } from "../recipes/schema";
import { favoriteId, type FavoriteStore } from "../store/favorites";
import type { Week, WeekStore } from "../store/weeks";
```

- dans `interface AppDeps`, après `store: WeekStore;`, ajouter `favorites: FavoriteStore;` ;
- dans la classe, après `readonly store: WeekStore;`, ajouter `readonly favorites: FavoriteStore;`, et dans le constructeur, après `this.store = deps.store;`, ajouter `this.favorites = deps.favorites;` ;
- remplacer `startCreateWeek` :

```ts
  startCreateWeek(brief: Brief): Week {
    this.assertIdle();
    const week = this.store.create(brief, this.now());
    return this.launchCreate(week.id);
  }
```

par :

```ts
  /** Favoris à reprendre dans une nouvelle semaine, mis à l'échelle du foyer. */
  private reusableFavorites(brief: Brief, favoriteIds: string[]): Recipe[] {
    const ids = [...new Set(favoriteIds)];
    if (ids.length > brief.dinners) {
      const n = brief.dinners;
      throw new ActionError(`Tu peux reprendre au plus ${n} favori${n > 1 ? "s" : ""} pour ${n} dîner${n > 1 ? "s" : ""}.`);
    }
    return ids.map((id) => {
      const favorite = this.favorites.get(id);
      if (!favorite) throw new ActionError("Un des favoris choisis n'existe plus : recharge la page.");
      return { ...scaleRecipe(favorite.recipe, servingsFor(brief)), id: `favori-${favorite.id}` };
    });
  }

  startCreateWeek(brief: Brief, favoriteIds: string[] = []): Week {
    this.assertIdle();
    const reused = this.reusableFavorites(brief, favoriteIds);
    const week = this.store.create(brief, this.now());
    if (reused.length) {
      this.store.update(week.id, (w) => {
        w.reusedRecipes = reused;
      });
    }
    return this.launchCreate(week.id);
  }

  /** Met une recette de la semaine en favori, ou l'en retire. */
  setFavorite(weekId: string, recipeId: string, favorite: boolean): void {
    const week = this.requireWeek(weekId);
    const recipe = week.recipes.find((r) => r.id === recipeId);
    if (!recipe) throw new ActionError("Recette introuvable.");
    if (favorite) this.favorites.add(recipe, weekId, this.now());
    else this.favorites.remove(favoriteId(recipe.title));
  }

  removeFavorite(id: string): void {
    if (!this.favorites.remove(id)) throw new ActionError("Favori introuvable.");
  }
```

Dans `src/lib/app/instance.ts`, ajouter l'import `import { FavoriteStore } from "../store/favorites";` (avant celui de `../store/weeks`) et, dans `new MyFreshApp({ … })`, après `store: new WeekStore(),`, la ligne :

```ts
    favorites: new FavoriteStore(),
```

- [ ] **Step 4 : Vérifier**

Run : `npm test && npx tsc --noEmit && npm run lint`
Expected : PASS, 264 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/lib
git commit -m "feat(favoris): étoile, retrait et reprise d'un favori dans une nouvelle semaine" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5 : Favoris dans l'interface — étoile, « Mes favoris », reprise au brief

Avant d'écrire du code Next.js, relire : `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, `…/02-guides/forms.md`, `…/03-api-reference/03-file-conventions/page.md` (`searchParams` est une `Promise`).

**Files:**
- Modify: `src/app/actions.ts`, `src/app/semaines/[id]/_components/week-controls.tsx`, `src/app/semaines/[id]/_components/recipe-card.tsx`, `src/app/semaines/[id]/page.tsx`, `src/app/page.tsx`, `src/app/semaines/nouvelle/page.tsx`, `src/app/semaines/nouvelle/brief-form.tsx`

**Interfaces:**
- Consumes : `MyFreshApp.setFavorite`, `removeFavorite`, `startCreateWeek(brief, favoriteIds)`, `favorites` (Task 4) ; `ActionResult`, `attempt` (dans `actions.ts`) ; `TAG_LABELS`, `formatWeekDate` (`src/lib/format.ts`) ; `ActionButton`.
- Produces :
  - server actions `toggleFavoriteAction(weekId: string, recipeId: string, favorite: boolean): Promise<ActionResult>`, `removeFavoriteAction(favoriteId: string): Promise<ActionResult>` ; `createWeekAction` lit les cases `favorites` ;
  - composant client `FavoriteToggle({ weekId, recipeId, favorite })` ;
  - `RecipeCard` prend une prop `favorite: boolean` ;
  - `BriefForm({ initial, favorites: { id: string; title: string }[], preselected: string[] })` ;
  - `/semaines/nouvelle?favori=<id>` coche ce favori d'avance.

- [ ] **Step 1 : Server actions**

Dans `src/app/actions.ts`, dans `createWeekAction`, remplacer :

```ts
  let id: string;
  try {
    id = getApp().startCreateWeek(parsed.brief).id;
```

par :

```ts
  const favoriteIds = formData.getAll("favorites").map(String);
  let id: string;
  try {
    id = getApp().startCreateWeek(parsed.brief, favoriteIds).id;
```

et ajouter à la fin du fichier :

```ts
export async function toggleFavoriteAction(weekId: string, recipeId: string, favorite: boolean): Promise<ActionResult> {
  return attempt(() => getApp().setFavorite(String(weekId), String(recipeId), favorite === true));
}

export async function removeFavoriteAction(favoriteId: string): Promise<ActionResult> {
  return attempt(() => getApp().removeFavorite(String(favoriteId)));
}
```

- [ ] **Step 2 : Étoile sur les cartes recette**

Dans `src/app/semaines/[id]/_components/week-controls.tsx`, remplacer l'import des actions par :

```ts
import {
  chooseProductAction,
  reviseRecipeAction,
  setPantryAction,
  toggleFavoriteAction,
  toggleRecipeAction,
} from "@/app/actions";
```

et ajouter à la fin du fichier :

```tsx
export function FavoriteToggle({ weekId, recipeId, favorite }: { weekId: string; recipeId: string; favorite: boolean }) {
  const { pending, error, run } = useServerAction();
  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        aria-pressed={favorite}
        aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        title={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        disabled={pending}
        onClick={() => run(() => toggleFavoriteAction(weekId, recipeId, !favorite))}
        className={`text-xl leading-none disabled:opacity-50 ${favorite ? "text-amber-500" : "text-zinc-300 hover:text-amber-400"}`}
      >
        {favorite ? "★" : "☆"}
      </button>
      <ErrorText error={error} />
    </span>
  );
}
```

Dans `src/app/semaines/[id]/_components/recipe-card.tsx` :
- import : `import { FavoriteToggle, RecipeToggle, ReviseRecipeForm } from "./week-controls";` ;
- ajouter `favorite,` à la déstructuration des props (après `pushed,`) et, dans leur type, après `pushed: boolean;` :

```ts
  /** recette en favori (étoile pleine) */
  favorite: boolean;
```

- remplacer :

```tsx
        <RecipeToggle weekId={weekId} recipeId={recipe.id} selected={selected} disabled={!selected && full} />
```

par :

```tsx
        <div className="flex shrink-0 items-start gap-3">
          <FavoriteToggle weekId={weekId} recipeId={recipe.id} favorite={favorite} />
          <RecipeToggle weekId={weekId} recipeId={recipe.id} selected={selected} disabled={!selected && full} />
        </div>
```

Dans `src/app/semaines/[id]/page.tsx`, remplacer `const week = getApp().getWeek(id);` par :

```ts
  const app = getApp();
  const week = app.getWeek(id);
```

et, dans `<RecipeCard … />`, après `pushed={week.status === "pushed"}`, ajouter :

```tsx
              favorite={app.favorites.has(r.title)}
```

- [ ] **Step 3 : « Mes favoris » sur l'accueil**

Dans `src/app/page.tsx` :
- `import { checkSessionAction, removeFavoriteAction } from "@/app/actions";`
- `import { formatDateTime, formatEur, formatWeekDate, JOB_LABELS, TAG_LABELS, weekStatusLabel } from "@/lib/format";`
- après `const session = app.session;`, ajouter `const favorites = app.favorites.list();` ;
- après la `</section>` de « Mes semaines » (juste avant le `</div>` final), ajouter :

```tsx
      <section>
        <h2 className="mb-3 text-xl font-semibold">Mes favoris</h2>
        {favorites.length === 0 ? (
          <p className="text-zinc-600">
            Aucun favori pour l&apos;instant : touche l&apos;étoile d&apos;une recette pour la retrouver ici.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
            {favorites.map((f) => (
              <li key={f.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">★ {f.recipe.title}</p>
                  <p className="text-sm text-zinc-600">
                    {f.recipe.prepMinutes + f.recipe.cookMinutes} min
                    {f.recipe.tags.length ? ` · ${f.recipe.tags.map((t) => TAG_LABELS[t]).join(", ")}` : ""}
                    {` · semaine du ${formatWeekDate(f.sourceWeekId)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={{ pathname: "/semaines/nouvelle", query: { favori: f.id } }}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Réutiliser
                  </Link>
                  <ActionButton action={removeFavoriteAction.bind(null, f.id)} label="Retirer" pendingLabel="Retrait…" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
```

- [ ] **Step 4 : « Reprendre des favoris » dans le brief**

Remplacer `src/app/semaines/nouvelle/page.tsx` par :

```tsx
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
```

Dans `src/app/semaines/nouvelle/brief-form.tsx`, remplacer la signature `export function BriefForm({ initial }: { initial: Brief }) {` par :

```tsx
export function BriefForm({
  initial,
  favorites,
  preselected,
}: {
  initial: Brief;
  /** favoris proposés à la reprise */
  favorites: { id: string; title: string }[];
  /** favoris cochés d'avance (lien « Réutiliser » de l'accueil) */
  preselected: string[];
}) {
```

et, juste avant le bloc `{state.error && (`, ajouter :

```tsx
      {favorites.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium">Reprendre des favoris</legend>
          <p className="text-xs text-zinc-500">
            Ajoutés au menu et retenus d&apos;office (un par dîner au plus) ; Claude complète avec d&apos;autres recettes.
          </p>
          <div className="mt-2 flex flex-wrap gap-4">
            {favorites.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="favorites"
                  value={f.id}
                  defaultChecked={sent ? (sent.favorites ?? []).includes(f.id) : preselected.includes(f.id)}
                />
                ★ {f.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}
```

- [ ] **Step 5 : Vérifier types, lint, tests et build**

Run : `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected : aucune erreur, 264 tests ; `/`, `/semaines/nouvelle`, `/semaines/[id]` dynamiques (ƒ).

- [ ] **Step 6 : Commit**

```bash
git add src/app
git commit -m "feat(app): étoile favori sur les recettes, « Mes favoris » et reprise au brief" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 : Données d'impression — options, fiches recettes, liste de courses

**Files:**
- Create: `src/lib/print/sheet.ts`, `src/lib/print/sheet.test.ts`
- Modify: `src/lib/matching/needs.ts`, `src/lib/format.ts`, `src/lib/format.test.ts`

**Interfaces:**
- Consumes : `effectiveMatches`, `weekTotals`, `productRows` (`src/lib/week/edit.ts`), `formatQty`, `formatWeekDate`, `TAG_LABELS` (`src/lib/format.ts`), `IngredientMatch`, `Recipe`, `Week`.
- Produces :
  - `needKey(ing: Pick<Ingredient, "searchQuery" | "unit">): string` (`src/lib/matching/needs.ts`, même clé que `aggregateNeeds`) ;
  - `productShortLabel(p: Pick<Product, "brand" | "name" | "pack">): string` → `"AUCHAN BIO Courgettes · 1000 g"` ;
  - dans `src/lib/print/sheet.ts` : `PRINT_SECTIONS = ["recettes", "courses"]`, `type PrintSection`, `MAX_FAMILY_LENGTH = 60`, `MAX_NOTES_LENGTH = 1000`, `interface PrintOptions { family: string; sections: PrintSection[]; notes: string }`, `type SearchParams = Record<string, string | string[] | undefined>`, `parsePrintOptions(params: SearchParams): PrintOptions`, `printQuery(options: PrintOptions): string`, `searchParamsRecord(params: URLSearchParams): SearchParams`, `kidStepIndexes(recipe: Pick<Recipe, "steps" | "kidSteps">): Set<number>`, `isPrintable(week: Pick<Week, "status" | "selectedRecipeIds">): boolean`, types `PrintIngredient`, `PrintStep`, `PrintRecipe`, `ShoppingLine`, `PrintData`, et `buildPrintData(week: Week, options: PrintOptions): PrintData`.

- [ ] **Step 1 : Écrire les tests**

`src/lib/print/sheet.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { makeMatch, makeNeed, makeProduct, makeRecipe, makeWeek } from "../../../tests/helpers/factories";
import {
  buildPrintData,
  isPrintable,
  kidStepIndexes,
  parsePrintOptions,
  printQuery,
  searchParamsRecord,
} from "./sheet";

const ing = (name: string, quantity: number, pantryStaple = false) => ({
  name,
  searchQuery: name,
  quantity,
  unit: "g" as const,
  pantryStaple,
  fromPromo: false,
});

describe("parsePrintOptions", () => {
  it("première visite : toutes les sections, sans nom ni notes", () => {
    expect(parsePrintOptions({})).toEqual({ family: "", sections: ["recettes", "courses"], notes: "" });
  });

  it("formulaire envoyé : sections cochées seulement (inconnues ignorées), textes nettoyés et bornés", () => {
    expect(
      parsePrintOptions({ o: "1", sections: ["courses", "pirate"], famille: ["  Martin ", "Autre"], notes: " Bon appétit " }),
    ).toEqual({ family: "Martin", sections: ["courses"], notes: "Bon appétit" });
    const long = parsePrintOptions({ famille: "x".repeat(200), notes: "y".repeat(5000) });
    expect(long.family).toHaveLength(60);
    expect(long.notes).toHaveLength(1000);
  });

  it("formulaire envoyé sans aucune case cochée : aucune section", () => {
    expect(parsePrintOptions({ o: "1" }).sections).toEqual([]);
  });

  it("aller-retour avec printQuery et searchParamsRecord", () => {
    const options = { family: "Martin & fils", sections: ["recettes" as const], notes: "Pas de sel" };
    const query = printQuery(options);
    expect(query).toBe("famille=Martin+%26+fils&sections=recettes&notes=Pas+de+sel&o=1");
    expect(parsePrintOptions(searchParamsRecord(new URLSearchParams(query)))).toEqual(options);
    expect(searchParamsRecord(new URLSearchParams("sections=recettes&sections=courses&o=1"))).toEqual({
      sections: ["recettes", "courses"],
      o: "1",
    });
  });
});

describe("kidStepIndexes", () => {
  it("ignore les indices hors limites, négatifs ou non entiers", () => {
    expect(kidStepIndexes({ steps: ["a", "b", "c"], kidSteps: [1, 3, -1, 1.5, 2, 1] })).toEqual(new Set([1, 2]));
    expect(kidStepIndexes({ steps: ["a"] })).toEqual(new Set());
  });
});

describe("isPrintable", () => {
  it("semaine prête ou envoyée avec au moins une recette retenue", () => {
    expect(isPrintable({ status: "ready", selectedRecipeIds: ["a"] })).toBe(true);
    expect(isPrintable({ status: "pushed", selectedRecipeIds: ["a"] })).toBe(true);
    expect(isPrintable({ status: "ready", selectedRecipeIds: [] })).toBe(false);
    expect(isPrintable({ status: "generating", selectedRecipeIds: ["a"] })).toBe(false);
  });
});

describe("buildPrintData", () => {
  const courgette = makeProduct({ brand: "AUCHAN BIO", name: "Courgettes", price: 2, pack: { value: 500, unit: "g" } });
  const courgetteBis = makeProduct({
    name: "Courgettes vrac",
    price: 1.5,
    pack: { value: 1000, unit: "g" },
    promo: { label: "-20%", kind: "price" },
  });
  const huile = makeProduct({ name: "Huile d'olive", price: 6, pack: { value: 500, unit: "ml" } });
  const recipe = makeRecipe({
    id: "tian",
    title: "Tian de courgettes",
    summary: "Fondant",
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 40,
    tags: ["kids_friendly", "vegan"],
    ingredients: [ing("courgette", 600), ing("huile", 20, true), ing("safran", 1)],
    steps: ["Laver les courgettes.", "Couper.", "Enfourner."],
    kidSteps: [0, 7],
    nutritionPerServing: { kcal: 321.6, proteinG: 8.2, carbsG: 30.5, fatG: 12.4 },
    whyThisWeek: "Courgettes en promo",
  });
  const other = makeRecipe({ id: "autre", title: "Non retenue", ingredients: [ing("courgette", 300)] });
  const week = makeWeek({
    id: "2026-09-23-1",
    status: "ready",
    brief: { dinners: 1, adults: 2, children: 2, budgetEur: 30, filters: [], notes: "", preferOrganic: false },
    recipes: [recipe, other],
    selectedRecipeIds: ["tian"],
    matches: [
      makeMatch(makeNeed({ key: "courgette|g", name: "courgette", quantity: 900, perRecipe: { tian: 600, autre: 300 } }), courgette, [
        courgetteBis,
      ]),
      makeMatch(makeNeed({ key: "huile|g", name: "huile", quantity: 20, perRecipe: { tian: 20 }, pantryStaple: true }), huile),
      makeMatch(makeNeed({ key: "safran|g", name: "safran", quantity: 1, perRecipe: { tian: 1 } }), null),
    ],
    overrides: { products: { "courgette|g": courgetteBis.productId }, pantry: ["huile|g"] },
  });

  it("fiches des seules recettes retenues : produits choisis (choix de l'utilisateur compris), placard, étapes enfants", () => {
    const data = buildPrintData(week, { family: "Martin", sections: ["recettes", "courses"], notes: "Bon appétit" });
    expect(data).toMatchObject({
      weekId: "2026-09-23-1",
      heading: "Semaine du 23 septembre 2026",
      family: "Martin",
      notes: "Bon appétit",
      showRecipes: true,
      showShopping: true,
    });
    expect(data.recipes).toEqual([
      {
        id: "tian",
        title: "Tian de courgettes",
        summary: "Fondant",
        prepMinutes: 15,
        cookMinutes: 40,
        servings: 4,
        tags: ["Enfants", "Vegan"],
        ingredients: [
          { name: "courgette", quantity: "600 g", product: "Courgettes vrac · 1000 g", inPantry: false },
          { name: "huile", quantity: "20 g", product: null, inPantry: true },
          { name: "safran", quantity: "1 g", product: null, inPantry: false },
        ],
        steps: [
          { text: "Laver les courgettes.", kid: true },
          { text: "Couper.", kid: false },
          { text: "Enfourner.", kid: false },
        ],
        nutrition: "≈ 322 kcal · protéines 8 g · glucides 31 g · lipides 12 g",
        whyThisWeek: "Courgettes en promo",
      },
    ]);
  });

  it("liste de courses : lignes du panier, placard à part, introuvables et totaux", () => {
    const { shopping } = buildPrintData(week, { family: "", sections: ["courses"], notes: "" });
    expect(shopping).toEqual({
      lines: [
        {
          key: "courgette|g",
          ingredient: "courgette (600 g)",
          product: "Courgettes vrac · 1000 g",
          packs: 1,
          cost: 1.5,
          promo: "-20%",
          uncertain: false,
        },
      ],
      pantry: [{ name: "huile", quantity: "20 g" }],
      missing: ["safran"],
      gross: 1.5,
      promoSaved: 0,
      net: 1.5,
      budget: 30,
    });
  });

  it("sections choisies", () => {
    expect(buildPrintData(week, { family: "", sections: ["courses"], notes: "" })).toMatchObject({
      showRecipes: false,
      showShopping: true,
    });
  });
});
```

Dans `src/lib/format.test.ts`, ajouter `productShortLabel` à l'import de `./format` et, à la fin du fichier :

```ts
describe("productShortLabel", () => {
  it("marque, nom et conditionnement, sans prix", () => {
    expect(productShortLabel(makeProduct({ brand: "AUCHAN BIO", name: "Courgettes", pack: { value: 1000, unit: "g" } }))).toBe(
      "AUCHAN BIO Courgettes · 1000 g",
    );
    expect(productShortLabel(makeProduct({ name: "Citron", pack: null }))).toBe("Citron");
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/print src/lib/format.test.ts`
Expected : FAIL — `./sheet` introuvable, `productShortLabel` non exporté.

- [ ] **Step 3 : Implémenter**

Dans `src/lib/matching/needs.ts`, remplacer `import type { Recipe } from "../recipes/schema";` par `import type { Ingredient, Recipe } from "../recipes/schema";`, ajouter avant `aggregateNeeds` :

```ts
/** Clé d'un ingrédient : même requête (casse et accents ignorés) et même unité = même besoin. */
export function needKey(ing: Pick<Ingredient, "searchQuery" | "unit">): string {
  return `${normalizeText(ing.searchQuery)}|${ing.unit}`;
}
```

et, dans `aggregateNeeds`, remplacer ``const key = `${normalizeText(ing.searchQuery)}|${ing.unit}`;`` par `const key = needKey(ing);`.

Dans `src/lib/format.ts`, ajouter après `productLabel` :

```ts
/** Produit sans prix ni promo : « AUCHAN BIO Courgettes · 1000 g » (fiches recettes imprimées). */
export function productShortLabel(p: Pick<Product, "brand" | "name" | "pack">): string {
  const name = `${p.brand ? `${p.brand} ` : ""}${p.name}`;
  return p.pack ? `${name} · ${formatQty(p.pack.value, p.pack.unit)}` : name;
}
```

`src/lib/print/sheet.ts` :

```ts
import { formatQty, formatWeekDate, productShortLabel, TAG_LABELS } from "../format";
import type { IngredientMatch } from "../matching/match";
import { needKey } from "../matching/needs";
import type { Recipe } from "../recipes/schema";
import type { Week } from "../store/weeks";
import { effectiveMatches, productRows, weekTotals } from "../week/edit";

export const PRINT_SECTIONS = ["recettes", "courses"] as const;
export type PrintSection = (typeof PRINT_SECTIONS)[number];
export const MAX_FAMILY_LENGTH = 60;
export const MAX_NOTES_LENGTH = 1000;

export interface PrintOptions {
  /** nom de la famille, affiché dans l'en-tête ; vide = pas de nom */
  family: string;
  sections: PrintSection[];
  /** notes libres imprimées en tête */
  notes: string;
}

/** Paramètres d'URL tels que Next.js les passe à une page (`searchParams`). */
export type SearchParams = Record<string, string | string[] | undefined>;

const firstValue = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const allValues = (v: string | string[] | undefined): string[] => (v === undefined ? [] : [v].flat());

/**
 * Options d'impression lues dans l'URL. Première visite (ni `o` ni `sections`) : toutes les sections.
 * Formulaire envoyé (`o=1`) : seulement les sections cochées, éventuellement aucune.
 */
export function parsePrintOptions(params: SearchParams): PrintOptions {
  const wanted = allValues(params.sections);
  const submitted = params.o !== undefined || wanted.length > 0;
  return {
    family: firstValue(params.famille).trim().slice(0, MAX_FAMILY_LENGTH),
    sections: submitted ? PRINT_SECTIONS.filter((s) => wanted.includes(s)) : [...PRINT_SECTIONS],
    notes: firstValue(params.notes).trim().slice(0, MAX_NOTES_LENGTH),
  };
}

/** Chaîne de requête qui redonne ces options (lien PDF, rendu par Playwright). */
export function printQuery(options: PrintOptions): string {
  const q = new URLSearchParams();
  if (options.family) q.set("famille", options.family);
  for (const s of options.sections) q.append("sections", s);
  if (options.notes) q.set("notes", options.notes);
  q.set("o", "1");
  return q.toString();
}

/** URLSearchParams → objet au format de `searchParams` (valeurs répétées regroupées en tableau). */
export function searchParamsRecord(params: URLSearchParams): SearchParams {
  const record: SearchParams = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    record[key] = values.length === 1 ? values[0] : values;
  }
  return record;
}

/** Indices des étapes « avec les enfants » réellement présentes (indices hors limites ou négatifs ignorés). */
export function kidStepIndexes(recipe: Pick<Recipe, "steps" | "kidSteps">): Set<number> {
  return new Set((recipe.kidSteps ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < recipe.steps.length));
}

/** Une semaine s'imprime une fois préparée, avec au moins une recette retenue. */
export function isPrintable(week: Pick<Week, "status" | "selectedRecipeIds">): boolean {
  return (week.status === "ready" || week.status === "pushed") && week.selectedRecipeIds.length > 0;
}

export interface PrintIngredient {
  name: string;
  quantity: string;
  /** produit Auchan choisi ; null si aucun produit ou si l'ingrédient est au placard */
  product: string | null;
  inPantry: boolean;
}

export interface PrintStep {
  text: string;
  kid: boolean;
}

export interface PrintRecipe {
  id: string;
  title: string;
  summary: string;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  tags: string[];
  ingredients: PrintIngredient[];
  steps: PrintStep[];
  /** estimation par portion, calculée par Claude */
  nutrition: string;
  whyThisWeek: string;
}

export interface ShoppingLine {
  key: string;
  /** ingrédient et quantité nécessaire, ex. « courgette (600 g) » */
  ingredient: string;
  product: string;
  packs: number;
  cost: number;
  promo: string | null;
  uncertain: boolean;
}

export interface PrintData {
  weekId: string;
  /** « Semaine du 23 septembre 2026 » */
  heading: string;
  family: string;
  notes: string;
  showRecipes: boolean;
  showShopping: boolean;
  recipes: PrintRecipe[];
  shopping: {
    lines: ShoppingLine[];
    /** ingrédients cochés « déjà au placard » */
    pantry: { name: string; quantity: string }[];
    /** ingrédients sans produit Auchan */
    missing: string[];
    gross: number;
    promoSaved: number;
    net: number;
    budget: number;
  };
}

function nutritionText(n: Recipe["nutritionPerServing"]): string {
  return `≈ ${Math.round(n.kcal)} kcal · protéines ${Math.round(n.proteinG)} g · glucides ${Math.round(n.carbsG)} g · lipides ${Math.round(n.fatG)} g`;
}

function recipeSheet(recipe: Recipe, matches: Map<string, IngredientMatch>, pantry: Set<string>): PrintRecipe {
  const kids = kidStepIndexes(recipe);
  return {
    id: recipe.id,
    title: recipe.title,
    summary: recipe.summary,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    servings: recipe.servings,
    tags: recipe.tags.map((t) => TAG_LABELS[t]),
    ingredients: recipe.ingredients.map((ing) => {
      const key = needKey(ing);
      const chosen = matches.get(key)?.chosen ?? null;
      const inPantry = pantry.has(key);
      return {
        name: ing.name,
        quantity: formatQty(ing.quantity, ing.unit),
        product: !inPantry && chosen ? productShortLabel(chosen.product) : null,
        inPantry,
      };
    }),
    steps: recipe.steps.map((text, i) => ({ text, kid: kids.has(i) })),
    nutrition: nutritionText(recipe.nutritionPerServing),
    whyThisWeek: recipe.whyThisWeek,
  };
}

export function buildPrintData(week: Week, options: PrintOptions): PrintData {
  const matches = new Map(effectiveMatches(week).map((m) => [m.need.key, m]));
  const pantry = new Set(week.overrides.pantry);
  const totals = weekTotals(week);
  return {
    weekId: week.id,
    heading: `Semaine du ${formatWeekDate(week.id)}`,
    family: options.family,
    notes: options.notes,
    showRecipes: options.sections.includes("recettes"),
    showShopping: options.sections.includes("courses"),
    recipes: week.recipes
      .filter((r) => week.selectedRecipeIds.includes(r.id))
      .map((r) => recipeSheet(r, matches, pantry)),
    shopping: {
      lines: totals.basket.lines.map((l) => ({
        key: l.key,
        ingredient: `${l.name} (${formatQty(l.quantityNeeded, l.unit)})`,
        product: productShortLabel(l.product),
        packs: l.packs,
        cost: l.cost,
        promo: l.product.promo?.label ?? null,
        uncertain: l.uncertainQuantity,
      })),
      pantry: productRows(week)
        .filter((r) => r.inPantry)
        .map((r) => ({ name: r.name, quantity: formatQty(r.quantity, r.unit) })),
      missing: totals.basket.missing,
      gross: totals.gross,
      promoSaved: totals.promoSaved,
      net: totals.net,
      budget: totals.budget,
    },
  };
}
```

- [ ] **Step 4 : Vérifier**

Run : `npm test && npx tsc --noEmit && npm run lint`
Expected : PASS, 274 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/print src/lib/matching/needs.ts src/lib/format.ts src/lib/format.test.ts
git commit -m "feat(impression): options, fiches recettes et liste de courses d'une semaine" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7 : Page d'impression `/semaines/[id]/imprimer` (CSS print A4)

Avant d'écrire du code Next.js, relire : `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` (`searchParams`), `…/04-functions/connection.md`. Tailwind 4 fournit la variante `print:` et les utilitaires `break-before-page` / `break-inside-avoid`.

Le formulaire d'options est un simple formulaire `GET` (pas de server action) : les options vivent dans l'URL, que la route PDF reprend telle quelle. Il est masqué à l'impression, comme l'en-tête du site.

**Files:**
- Create: `src/app/semaines/[id]/imprimer/page.tsx`, `src/app/semaines/[id]/imprimer/print-button.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/semaines/[id]/page.tsx`

**Interfaces:**
- Consumes : `getApp()`, `buildPrintData`, `isPrintable`, `parsePrintOptions`, `printQuery`, `PrintRecipe`, `SearchParams`, `MAX_FAMILY_LENGTH`, `MAX_NOTES_LENGTH` (Task 6), `formatEur`.
- Produces : la page `/semaines/<id>/imprimer?famille=…&sections=recettes&sections=courses&notes=…&o=1` que la route PDF (Task 8) rend ; le lien « Télécharger le PDF » vers `/semaines/<id>/pdf?<mêmes options>` ; le composant client `PrintButton`.

- [ ] **Step 1 : Bouton « Imprimer »**

`src/app/semaines/[id]/imprimer/print-button.tsx` :

```tsx
"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100"
    >
      Imprimer
    </button>
  );
}
```

- [ ] **Step 2 : Page d'impression**

`src/app/semaines/[id]/imprimer/page.tsx` :

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getApp } from "@/lib/app/instance";
import { formatEur } from "@/lib/format";
import {
  buildPrintData,
  isPrintable,
  MAX_FAMILY_LENGTH,
  MAX_NOTES_LENGTH,
  parsePrintOptions,
  type PrintRecipe,
  printQuery,
  type SearchParams,
} from "@/lib/print/sheet";
import { PrintButton } from "./print-button";

const field = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-normal";

function RecipeSheet({ recipe, first }: { recipe: PrintRecipe; first: boolean }) {
  return (
    <article className={`space-y-3 ${first ? "" : "print:break-before-page"}`}>
      <header className="border-b border-zinc-300 pb-2">
        <h2 className="text-2xl font-semibold">{recipe.title}</h2>
        {recipe.summary && <p className="text-zinc-700">{recipe.summary}</p>}
        <p className="mt-1 text-sm text-zinc-600">
          Préparation {recipe.prepMinutes} min · cuisson {recipe.cookMinutes} min · {recipe.servings} portions
          {recipe.tags.length ? ` · ${recipe.tags.join(", ")}` : ""}
        </p>
      </header>
      {recipe.whyThisWeek && (
        <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">
          <span className="font-medium">Pourquoi cette semaine : </span>
          {recipe.whyThisWeek}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-[2fr_3fr] print:grid-cols-[2fr_3fr]">
        <section>
          <h3 className="font-semibold">Ingrédients</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                <span className="font-medium">{ing.quantity}</span> {ing.name}
                <span className="block text-xs text-zinc-600">
                  {ing.inPantry ? "déjà au placard" : (ing.product ?? "pas de produit Auchan")}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="font-semibold">Étapes</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
            {recipe.steps.map((step, i) => (
              <li key={i} className={step.kid ? "rounded bg-amber-50 px-1" : undefined}>
                {step.text}
                {step.kid && (
                  <span className="ml-2 rounded bg-amber-200 px-1.5 text-xs font-medium text-amber-900">
                    Avec les enfants
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>
      <p className="text-xs text-zinc-600">Nutrition estimée par portion (estimation de Claude) : {recipe.nutrition}</p>
    </article>
  );
}

export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const options = parsePrintOptions(await searchParams);
  await connection();
  const week = getApp().getWeek(id);
  if (!week) notFound();

  if (!isPrintable(week)) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Impression</h1>
        <p className="text-zinc-700">Rien à imprimer : la semaine n&apos;est pas prête ou aucune recette n&apos;est retenue.</p>
        <Link href={`/semaines/${week.id}`} className="text-emerald-700 underline">
          ← Retour à la semaine
        </Link>
      </div>
    );
  }

  const data = buildPrintData(week, options);
  const { shopping } = data;
  return (
    <div className="space-y-6 print:space-y-4 print:text-[11pt]">
      <form method="get" className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 print:hidden">
        <input type="hidden" name="o" value="1" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Nom de la famille
            <input name="famille" defaultValue={options.family} maxLength={MAX_FAMILY_LENGTH} className={field} />
          </label>
          <fieldset>
            <legend className="text-sm font-medium">Sections à imprimer</legend>
            <div className="mt-2 flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="sections" value="recettes" defaultChecked={data.showRecipes} />
                Fiches recettes
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="sections" value="courses" defaultChecked={data.showShopping} />
                Liste de courses
              </label>
            </div>
          </fieldset>
        </div>
        <label className="block text-sm font-medium">
          Notes
          <textarea name="notes" rows={2} defaultValue={options.notes} maxLength={MAX_NOTES_LENGTH} className={field} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100"
          >
            Mettre à jour l&apos;aperçu
          </button>
          <PrintButton />
          <a
            href={`/semaines/${week.id}/pdf?${printQuery(options)}`}
            download
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Télécharger le PDF
          </a>
          <Link href={`/semaines/${week.id}`} className="text-sm text-emerald-700 underline">
            ← Retour à la semaine
          </Link>
        </div>
        <p className="text-xs text-zinc-500">Le PDF reprend les options de l&apos;aperçu (clique d&apos;abord sur « Mettre à jour l&apos;aperçu »).</p>
      </form>

      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">{data.family ? `Les dîners de la famille ${data.family}` : "Nos dîners"}</h1>
        <p className="text-zinc-600">
          {data.heading} · {data.recipes.map((r) => r.title).join(" · ")}
        </p>
        {data.notes && <p className="whitespace-pre-line rounded-lg border border-zinc-300 p-3 text-sm">{data.notes}</p>}
      </header>

      {!data.showRecipes && !data.showShopping && (
        <p className="text-zinc-700 print:hidden">Choisis au moins une section à imprimer.</p>
      )}

      {data.showRecipes && data.recipes.map((r, i) => <RecipeSheet key={r.id} recipe={r} first={i === 0} />)}

      {data.showShopping && (
        <section className={`space-y-3 ${data.showRecipes ? "print:break-before-page" : ""}`}>
          <h2 className="text-2xl font-semibold">Liste de courses</h2>
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-300 text-left text-zinc-600">
              <tr>
                <th className="py-1 pr-2">Produit Auchan</th>
                <th className="py-1 pr-2">Pour</th>
                <th className="py-1 pr-2 text-right">Quantité</th>
                <th className="py-1 text-right">Coût</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {shopping.lines.map((l) => (
                <tr key={l.key} className="break-inside-avoid">
                  <td className="py-1 pr-2">
                    ☐ {l.product}
                    {l.promo && <span className="ml-1 text-xs text-emerald-700">({l.promo})</span>}
                    {l.uncertain && <span className="ml-1 text-xs text-amber-700">(quantité à vérifier)</span>}
                  </td>
                  <td className="py-1 pr-2 text-zinc-600">{l.ingredient}</td>
                  <td className="py-1 pr-2 text-right">{l.packs}</td>
                  <td className="py-1 text-right">{formatEur(l.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm">
            Total estimé : <span className="font-semibold">{formatEur(shopping.net)}</span> (prix en rayon{" "}
            {formatEur(shopping.gross)}
            {shopping.promoSaved > 0 ? `, économies promos ${formatEur(shopping.promoSaved)}` : ""}) · budget{" "}
            {formatEur(shopping.budget)}
          </p>
          {shopping.missing.length > 0 && (
            <p className="text-sm text-amber-800">Introuvables chez Auchan : {shopping.missing.join(", ")}</p>
          )}
          {shopping.pantry.length > 0 && (
            <div>
              <h3 className="font-semibold">Déjà au placard</h3>
              <ul className="mt-1 columns-2 text-sm">
                {shopping.pantry.map((p) => (
                  <li key={p.name}>
                    {p.name} ({p.quantity})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3 : CSS print, en-tête masqué, lien depuis la semaine**

Dans `src/app/globals.css`, ajouter à la fin :

```css
/* Impression et PDF : A4, marges fixes, sans l'indicateur de développement de Next.js */
@page {
  size: A4;
  margin: 12mm;
}

@media print {
  nextjs-portal {
    display: none;
  }
}
```

Dans `src/app/layout.tsx`, ajouter les classes d'impression :

```tsx
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 print:bg-white">
        <header className="border-b border-zinc-200 bg-white print:hidden">
```

et

```tsx
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 print:max-w-none print:p-0">{children}</main>
```

Dans `src/app/semaines/[id]/page.tsx`, ajouter les imports `import Link from "next/link";` (en tête) et `import { isPrintable } from "@/lib/print/sheet";`, puis, dans le rendu de l'écran de validation (le dernier `return`), remplacer la première ligne `{heading}` par :

```tsx
      <div className="flex flex-wrap items-center justify-between gap-3">
        {heading}
        {isPrintable(week) && (
          <Link
            href={`/semaines/${week.id}/imprimer`}
            prefetch={false}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100"
          >
            Imprimer / PDF
          </Link>
        )}
      </div>
```

- [ ] **Step 4 : Vérifier types, lint, tests et build**

Run : `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected : aucune erreur, 274 tests ; route `/semaines/[id]/imprimer` dynamique (ƒ).

- [ ] **Step 5 : Commit**

```bash
git add src/app
git commit -m "feat(app): page d'impression A4 (fiches recettes, liste de courses, options)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8 : Export PDF par Playwright

**Choix : Chromium charge la page d'impression par HTTP à `http://127.0.0.1:3141/…`**, plutôt que de rendre le HTML sans HTTP. Raisons : le PDF est exactement la page d'impression (mêmes composants, même CSS Tailwind compilé, mêmes polices `next/font`), sans dupliquer de gabarit ni chercher la feuille de style générée par Next ; l'adresse `127.0.0.1:3141` est celle qu'accepte la protection Host de `src/proxy.ts` (le navigateur envoie `Host: 127.0.0.1:3141`) ; le serveur Node traite la requête de la page pendant que la route attend (tout est asynchrone). L'URL est reconstruite à partir des options analysées (`printQuery`), jamais recopiée de la requête. `page.pdf()` utilise le média `print` : l'en-tête du site et le formulaire d'options disparaissent. Le moteur de rendu est une fonction injectée (`PdfRenderer`) : les tests passent un faux ; un test de fumée lance le vrai Chromium seulement avec `MYFRESH_PDF_SMOKE=1`. `playwright` fait partie des paquets externes par défaut de Next (`node_modules/next/dist/lib/server-external-packages.jsonc`) : pas de configuration à ajouter ; il est importé dynamiquement pour ne pas le charger hors export.

Avant d'écrire la route, relire `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (`params` est une `Promise`).

**Files:**
- Create: `src/lib/print/pdf.ts`, `src/lib/print/pdf.test.ts`, `src/app/semaines/[id]/pdf/route.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes : `APP_PORT` (`src/lib/app/host-guard.ts`), `isWeekId`, `Week`, `isPrintable`, `parsePrintOptions`, `printQuery`, `searchParamsRecord` (Task 6), `getApp()`.
- Produces :
  - `type PdfRenderer = (url: string) => Promise<Uint8Array>` ;
  - `LOCAL_APP_URL = "http://127.0.0.1:3141"` ;
  - `createPlaywrightPdfRenderer(timeoutMs?: number): PdfRenderer` ;
  - `interface PdfDeps { getWeek(id: string): Week | null; render: PdfRenderer; baseUrl?: string }` ;
  - `pdfResponse(request: Request, id: string, deps: PdfDeps): Promise<Response>` : 200 PDF en pièce jointe ; 403 (requête venue d'un autre site), 404, 409 (rien à imprimer), 400 (aucune section), 500 (échec du rendu), en texte français ;
  - route `GET /semaines/[id]/pdf`.

- [ ] **Step 1 : Écrire les tests**

`src/lib/print/pdf.test.ts` :

```ts
import { describe, expect, it, vi } from "vitest";
import { makeRecipe, makeWeek } from "../../../tests/helpers/factories";
import type { Week } from "../store/weeks";
import { createPlaywrightPdfRenderer, LOCAL_APP_URL, type PdfRenderer, pdfResponse } from "./pdf";

const week = makeWeek({ id: "2026-09-23-1", recipes: [makeRecipe({ id: "a" })], selectedRecipeIds: ["a"] });
const PDF_BYTES = new TextEncoder().encode("%PDF-1.7 faux");

function setup(overrides: { weeks?: Week[]; render?: PdfRenderer } = {}) {
  const weeks = overrides.weeks ?? [week];
  const render = vi.fn<PdfRenderer>(overrides.render ?? (async () => PDF_BYTES));
  const getWeek = vi.fn((id: string) => weeks.find((w) => w.id === id) ?? null);
  return { render, getWeek, deps: { getWeek, render } };
}

const request = (query = "", headers: Record<string, string> = {}) =>
  new Request(`http://127.0.0.1:3141/semaines/2026-09-23-1/pdf${query}`, { headers });

describe("pdfResponse", () => {
  it("rend la page d'impression locale avec les options et renvoie le PDF en téléchargement", async () => {
    const { deps, render } = setup();
    const res = await pdfResponse(request("?famille=Martin&sections=courses&o=1&pirate=1"), "2026-09-23-1", deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="myfresh-2026-09-23-1.pdf"');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF_BYTES);
    expect(render).toHaveBeenCalledWith(`${LOCAL_APP_URL}/semaines/2026-09-23-1/imprimer?famille=Martin&sections=courses&o=1`);
    expect(LOCAL_APP_URL).toBe("http://127.0.0.1:3141");
  });

  it("sans option : toutes les sections", async () => {
    const { deps, render } = setup();
    await pdfResponse(request(), "2026-09-23-1", deps);
    expect(render).toHaveBeenCalledWith(`${LOCAL_APP_URL}/semaines/2026-09-23-1/imprimer?sections=recettes&sections=courses&o=1`);
  });

  it("semaine inconnue ou identifiant forgé : 404, sans navigateur", async () => {
    const { deps, render, getWeek } = setup();
    expect((await pdfResponse(request(), "2026-09-30-1", deps)).status).toBe(404);
    const forged = await pdfResponse(request(), "../../etc", deps);
    expect(forged.status).toBe(404);
    expect(await forged.text()).toBe("Semaine introuvable.");
    expect(getWeek).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });

  it("semaine pas prête ou sans recette retenue : 409 ; aucune section : 400", async () => {
    const { deps, render } = setup({
      weeks: [makeWeek({ id: "2026-09-23-1", status: "generating" }), makeWeek({ id: "2026-09-23-2", selectedRecipeIds: [] })],
    });
    expect((await pdfResponse(request(), "2026-09-23-1", deps)).status).toBe(409);
    expect((await pdfResponse(request(), "2026-09-23-2", deps)).status).toBe(409);
    const none = await pdfResponse(request("?o=1"), "2026-09-23-1", setup().deps);
    expect(none.status).toBe(400);
    expect(await none.text()).toBe("Choisis au moins une section à imprimer.");
    expect(render).not.toHaveBeenCalled();
  });

  it("requête venue d'un autre site : 403, sans navigateur", async () => {
    const { deps, render } = setup();
    const res = await pdfResponse(request("", { "sec-fetch-site": "cross-site" }), "2026-09-23-1", deps);
    expect(res.status).toBe(403);
    expect(render).not.toHaveBeenCalled();
  });

  it("échec du rendu (Chromium absent, délai dépassé) : 500 avec un message en français", async () => {
    const { deps } = setup({
      render: async () => {
        throw new Error("Executable doesn't exist");
      },
    });
    const res = await pdfResponse(request(), "2026-09-23-1", deps);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Impossible de créer le PDF : Executable doesn't exist");
  });
});

// Lance un vrai Chromium : seulement avec MYFRESH_PDF_SMOKE=1 (npx playwright install chromium au préalable).
describe.skipIf(!process.env.MYFRESH_PDF_SMOKE)("createPlaywrightPdfRenderer (smoke)", () => {
  it("rend une page HTML en PDF", async () => {
    const html = "<html><body><h1>Bonjour MyFresh</h1></body></html>";
    const pdf = await createPlaywrightPdfRenderer()(`data:text/html,${encodeURIComponent(html)}`);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  }, 60_000);
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/print/pdf.test.ts`
Expected : FAIL — `./pdf` introuvable.

- [ ] **Step 3 : Implémenter**

`src/lib/print/pdf.ts` :

```ts
import { APP_PORT } from "../app/host-guard";
import { isWeekId, type Week } from "../store/weeks";
import { isPrintable, parsePrintOptions, printQuery, searchParamsRecord } from "./sheet";

/** Rend une page web en PDF A4 ; injecté pour que les tests ne lancent jamais de navigateur. */
export type PdfRenderer = (url: string) => Promise<Uint8Array>;

/** Adresse locale de l'app : acceptée par la protection Host de src/proxy.ts. */
export const LOCAL_APP_URL = `http://127.0.0.1:${APP_PORT}`;
const PDF_TIMEOUT_MS = 60_000;

/** Chromium sans fenêtre (Playwright) : ouvre l'URL et l'imprime en A4, fonds compris. */
export function createPlaywrightPdfRenderer(timeoutMs: number = PDF_TIMEOUT_MS): PdfRenderer {
  return async (url) => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
      return await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      });
    } finally {
      await browser.close();
    }
  };
}

export interface PdfDeps {
  getWeek(id: string): Week | null;
  render: PdfRenderer;
  /** défaut : LOCAL_APP_URL */
  baseUrl?: string;
}

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/** Réponse de GET /semaines/<id>/pdf : la page d'impression rendue en PDF, en téléchargement. */
export async function pdfResponse(request: Request, id: string, deps: PdfDeps): Promise<Response> {
  if (request.headers.get("sec-fetch-site") === "cross-site") return text("Accès refusé.", 403);
  const week = isWeekId(id) ? deps.getWeek(id) : null;
  if (!week) return text("Semaine introuvable.", 404);
  if (!isPrintable(week)) return text("Rien à imprimer : la semaine n'est pas prête ou aucune recette n'est retenue.", 409);
  const options = parsePrintOptions(searchParamsRecord(new URL(request.url).searchParams));
  if (!options.sections.length) return text("Choisis au moins une section à imprimer.", 400);

  const url = `${deps.baseUrl ?? LOCAL_APP_URL}/semaines/${week.id}/imprimer?${printQuery(options)}`;
  let pdf: Uint8Array;
  try {
    pdf = await deps.render(url);
  } catch (e) {
    return text(`Impossible de créer le PDF : ${e instanceof Error ? e.message : String(e)}`, 500);
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="myfresh-${week.id}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
```

(`new Uint8Array(pdf)` : le `Buffer` renvoyé par Playwright est recopié dans un `Uint8Array<ArrayBuffer>`, accepté par le type `BodyInit` de TypeScript.)

`src/app/semaines/[id]/pdf/route.ts` :

```ts
import { getApp } from "@/lib/app/instance";
import { createPlaywrightPdfRenderer, pdfResponse } from "@/lib/print/pdf";

/** Télécharge la page d'impression de la semaine en PDF (A4), rendue par Chromium via Playwright. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return pdfResponse(request, id, {
    getWeek: (weekId) => getApp().getWeek(weekId),
    render: createPlaywrightPdfRenderer(),
  });
}
```

À la fin de `CLAUDE.md`, ajouter :

```markdown

Impression : `/semaines/<id>/imprimer` (fiches recettes et liste de courses), puis « Télécharger le PDF ». Le PDF est rendu par le Chromium de Playwright (`npx playwright install chromium` s'il manque), qui charge la page sur http://127.0.0.1:3141 : l'app doit tourner sur ce port.
```

- [ ] **Step 4 : Vérifier**

Run : `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected : 280 tests passent, 1 sauté (fumée) ; route `/semaines/[id]/pdf` dynamique (ƒ).

Puis, une fois : `MYFRESH_PDF_SMOKE=1 npx vitest run src/lib/print/pdf.test.ts`
Expected : 7 tests passent (le vrai Chromium produit un fichier commençant par `%PDF-`).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/print/pdf.ts src/lib/print/pdf.test.ts "src/app/semaines/[id]/pdf/route.ts" CLAUDE.md
git commit -m "feat(pdf): export A4 de la page d'impression par Playwright" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6 : (vérification manuelle) Semaine réelle : PDF, favoris, pas de répétition**

À faire par le contrôleur avec l'utilisateur (Chrome connecté à auchan.fr ; ne touche pas au panier) :

1. `npm run dev`, ouvrir http://127.0.0.1:3141. L'accueil montre « Contexte de la semaine » avec des thèmes réels (« thèmes : Asie, faites voyager vos papilles (jusqu'au …) ; … ») une fois le contexte rechargé (supprimer `data/cache/context.json` s'il date d'avant la Task 1).
2. Ouvrir une semaine prête : l'étoile ☆ d'une recette passe à ★ ; la recette apparaît dans « Mes favoris » de l'accueil ; « Retirer » l'enlève.
3. Remettre une recette en favori, « Réutiliser » → « Nouvelle semaine » avec le favori coché. Préparer la semaine : le favori est en tête, retenu d'office, avec des quantités adaptées au foyer ; Claude propose N+2 autres recettes, aucune ne reprend les plats retenus des 4 dernières semaines (comparer avec l'historique).
4. « Imprimer / PDF » : aperçu avec une fiche par recette retenue (produit Auchan sous chaque ingrédient, étapes « Avec les enfants » surlignées, nutrition marquée comme estimation, « Pourquoi cette semaine »), puis la liste de courses (produit, quantité, coût, total) et « Déjà au placard ». Saisir un nom de famille et une note, décocher « Liste de courses », « Mettre à jour l'aperçu ».
5. « Télécharger le PDF » : le fichier `myfresh-<id>.pdf` s'enregistre ; en A4, une recette par page, sans l'en-tête du site ni le formulaire, couleurs de fond présentes, nom de la famille et notes en tête. « Imprimer » ouvre la boîte d'impression du navigateur avec la même mise en page.
6. Arrêter `npm run dev`, relancer, puis `curl -s -o /dev/null -w "%{http_code}\n" -H "Host: exemple.com:3141" http://127.0.0.1:3141/semaines/<id>/pdf` → `403`.

---

## Auto-revue

- **Couverture de la spec (section « Plan 3 »)** : page `/semaines/[id]/imprimer` avec CSS print, une fiche par recette retenue et la liste de courses, options nom de famille / sections / notes → Tasks 6 et 7 ; export PDF A4 par Playwright `page.pdf()` → Task 8 ; favoris (étoile, réutilisation dans une nouvelle semaine) → Tasks 3, 4, 5 ; pas de répétition sur 4 semaines, via le prompt partagé des deux backends → Task 2 ; `parseThemes` corrigé sur la fixture réelle → Task 1. Design général (§ PDF : « ingrédients, quantités, produit Auchan correspondant, étapes, temps, estimation nutritionnelle, badges kids/vegan, liste de courses ; personnalisable : nom de la famille, portions, notes, choix des sections ») : tout est couvert sauf « portions » à l'impression (les quantités d'une semaine sont liées au panier ; les portions se règlent dans le brief et par la mise à l'échelle des favoris).
- **Espaces réservés** : aucun « TODO » ni étape sans code ; les étapes manuelles sont marquées.
- **Cohérence des types** : `MenuPromptOptions` (Task 2, étendu en Task 4), `FavoriteStore`/`favoriteId` (Task 3) utilisés tels quels en Tasks 4 et 5 ; `PrintOptions`, `parsePrintOptions`, `printQuery`, `searchParamsRecord`, `isPrintable` (Task 6) utilisés par les Tasks 7 et 8 ; `LOCAL_APP_URL` repose sur `APP_PORT` existant.
- **Review Focus** : chaque ligne a son test (Tasks 3, 4, 6, 8).
