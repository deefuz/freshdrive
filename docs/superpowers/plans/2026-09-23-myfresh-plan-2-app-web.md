# MyFresh : plan 2, l'app web (brief → validation → panier), implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une app web locale (Next.js, `http://127.0.0.1:3000`) qui prépare la semaine de bout en bout : brief, génération des recettes par Claude (Claude Code par défaut, API si clé), choix des produits Auchan, écran de validation avec total en direct, puis envoi confirmé au panier Auchan Drive avec rapport.

**Architecture:** Toute la logique reste dans `src/lib/` (modules TypeScript purs testés avec Vitest) : un stockage JSON par semaine (`src/lib/store/weeks.ts`), une interface `LlmBackend` (Claude Code en mode non interactif ou API Anthropic), un exécuteur de tâches longues en mémoire (une seule à la fois, état recopié dans le fichier de la semaine), des workflows (créer, modifier une recette, envoyer au panier) et un service applicatif `MyFreshApp` qui applique les garde-fous. Les pages Next.js (App Router, composants serveur + server actions) sont minces : elles lisent l'état via `getApp()` et appellent des server actions qui délèguent au service. L'interface interroge l'état toutes les 2 s (`router.refresh()`) pendant une tâche. Le CLI `npm run week` réutilise les mêmes workflows.

**Tech Stack:** Node 20, Next.js 16.3.6 (App Router, React 19.2, Turbopack), TypeScript, Tailwind 4, Vitest 4, zod 4, @anthropic-ai/sdk 0.128, CLI `claude` (Claude Code), tsx, dotenv.

**Spec:** `docs/superpowers/specs/2026-09-23-myfresh-plans-2-3-design.md` (tout sauf la section « Plan 3 »), avec `docs/superpowers/specs/2026-09-23-myfresh-design.md` et `docs/superpowers/specs/2026-09-23-auchan-spike-findings.md`. Le code de `src/lib/**` fait foi quand il diffère du plan 1.

## Global Constraints

- **Accès** : l'app n'est accessible que depuis le Mac. `next dev` et `next start` écoutent sur `127.0.0.1` uniquement (`-H 127.0.0.1`), sans authentification.
- **L'app ne passe jamais commande.** Le panier n'est écrit qu'après une confirmation explicite dans l'interface, avec des quantités **absolues cumulées** avec le panier existant. Une semaine déjà envoyée (`status: "pushed"`) ne peut pas être renvoyée.
- **Au plus une requête toutes les 350 ms vers auchan.fr**, pour tout le processus (une `RequestGate` partagée). Aucun secret journalisé ni écrit en dehors de `data/`.
- **Session Auchan** : avant chaque travail Auchan, `importChromeSession()` (repli sur la session enregistrée avec un avertissement), puis `hasStoreSession()`.
- **Claude, derrière `LlmBackend`** (`generateMenu`, `reviseMenu`, `reviseRecipe`, `arbitrate`) : par défaut Claude Code, `claude -p <prompt> --output-format json --json-schema <schéma> --model claude-opus-5-5 --tools ""`, lancé sans shell (`spawn`), stdin fermé, délai de 10 min ; on lit l'événement `type: "result"` et son `structured_output`, validé par Zod, sinon `LlmError`. Si `ANTHROPIC_API_KEY` est défini : l'API (code du plan 1). L'arbitrage des produits passe aussi par le backend (un seul appel groupé).
- **Tests** : ne lancent jamais le vrai `claude`, n'appellent jamais auchan.fr ni Open Food Facts (exécutable, connecteur et backend injectés). `npm test` reste vert à chaque commit (102 tests au départ).
- **Tâches longues** : exécutées dans le processus serveur, **une seule à la fois** ; état (étape, progression, erreur) en mémoire et dans le fichier de la semaine ; l'interface interroge toutes les 2 s.
- **Stockage** : un fichier JSON par semaine, `data/weeks/<id>.json`, `id` = `AAAA-MM-JJ-N` (date locale + suffixe), lu et écrit par le seul module `src/lib/store/weeks.ts`. Pas de SQLite.
- **Next.js 16.3.6** : `params` est une `Promise` ; chaque page qui lit des données appelle `await connection()` ; les server actions rafraîchissent la page avec `refresh()` de `next/cache` ; lire le guide concerné dans `node_modules/next/dist/docs/01-app/` avant d'écrire du code Next (voir `AGENTS.md`).
- Textes visibles en **français** ; identifiants de code en anglais. Montants en euros, arrondis au centime (`round2`), affichés avec `formatEur` (`12,50 €`).
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Les étapes marquées **(vérification manuelle)** utilisent le vrai Auchan, le vrai `claude` ou le vrai panier : c'est le contrôleur qui les fait, avec l'utilisateur. Un sous-agent les saute et le signale dans son rapport.

## Review Focus

1. **Double envoi au panier** (double clic, rechargement, 2e onglet) : les quantités sont absolues et cumulées, un 2e envoi doublerait le panier. Attendu : refus explicite (« déjà été envoyée ») et une seule tâche à la fois. Tests : Task 10 (`runPush` refuse un 2e envoi), Task 11 (`startPush` puis 2e `startPush`).
2. **Serveur redémarré pendant une tâche** : le fichier garde `job.status: "running"` pour toujours. Attendu : la semaine passe en erreur « interrompue », revient en brouillon si elle était en préparation, et peut être relancée. Tests : Task 8 (`reconcileStaleJob`), Task 11 (`getWeek`).
3. **Fichiers inattendus dans `data/weeks/`** (l'ancien format du CLI, `2026-09-23.json`, déjà présent sur le Mac ; un JSON corrompu) et identifiants forgés (`../…`) : attendu, ils sont ignorés sans planter l'historique, et aucun chemin hors du dossier n'est lu ou écrit. Tests : Task 1.
4. **Claude Code absent, trop lent, en erreur ou hors schéma** : attendu, un message français clair dans l'erreur de la tâche, jamais un plantage silencieux. Tests : Task 4.
5. **Server actions appelées avec des valeurs forgées** (plus de N recettes, produit qui n'est pas un candidat, ingrédient inconnu, consigne vide) : attendu, refus avec un message, fichier inchangé. Tests : Task 7 (`EditError`), Task 11 (consigne vide).

## File Structure

```
package.json                              scripts dev/start sur 127.0.0.1
CLAUDE.md                                 mention de l'arbitrage Claude Code et de --no-arbiter
src/lib/store/weeks.ts                    modèle Week + WeekStore (data/weeks/<id>.json)
src/lib/matching/relevance.ts             pénalité déterministe : formes transformées, variétés, pertinence
src/lib/matching/score.ts                 (modifié) applique la pénalité
src/lib/matching/arbiter.ts               (modifié) prompt et schéma d'arbitrage exportés
src/lib/recipes/schema.ts                 (modifié) kidSteps facultatif, assertUniqueRecipeIds
src/lib/recipes/prompt.ts                 (modifié) consigne kidSteps, buildReviseRecipePrompt
src/lib/recipes/generate.ts               (modifié) reviseRecipe (API)
src/lib/recipes/handoff.ts                (modifié) utilise assertUniqueRecipeIds
src/lib/llm/claude-cli.ts                 exécution de `claude -p` et lecture du résultat structuré
src/lib/llm/backend.ts                    LlmBackend : Claude Code, API, selectBackend
src/lib/auchan/http.ts                    (modifié) RequestGate partageable
src/lib/auchan/open.ts                    openAuchan : import Chrome + session + vérification du drive
src/lib/context/cache.ts                  contexte hebdo en cache 24 h (sorti de scripts/week.ts)
src/lib/budget/promo.ts                   économies et cagnotte d'un libellé promo Auchan
src/lib/week/edit.ts                      éditions (recettes, produits, placard) et totaux en direct
src/lib/jobs/runner.ts                    JobRunner (une tâche à la fois) + reconcileStaleJob
src/lib/week/workflows.ts                 runCreateWeek, runReviseRecipe, runPush
src/lib/cart/push.ts                      aperçu du panier et envoi ligne par ligne avec rapport
src/lib/app/service.ts                    MyFreshApp : garde-fous et lancement des tâches
src/lib/app/instance.ts                   getApp() : singleton serveur (globalThis)
src/lib/app/action-result.ts              type ActionResult des server actions
src/lib/format.ts                         formatage FR (€, quantités, dates, libellés)
src/lib/week/brief-form.ts                lecture et validation du formulaire de brief
src/lib/week/view.ts                      quel écran afficher selon l'état de la semaine
scripts/week.ts                           (réécrit) CLI sur les mêmes workflows, + --no-arbiter
src/app/layout.tsx, globals.css           (modifiés) français, « MyFresh », en-tête
src/app/page.tsx                          (remplacé) accueil
src/app/actions.ts                        server actions
src/app/_components/*.tsx                 JobPoller, JobProgress, ActionButton
src/app/semaines/nouvelle/*               page et formulaire du brief
src/app/semaines/[id]/page.tsx            progression ou écran de validation
src/app/semaines/[id]/_components/*.tsx   cartes recette, liste produits, barre budget, contrôles
src/app/semaines/[id]/panier/*            aperçu, confirmation, rapport
tests/helpers/factories.ts                (modifié) makeCandidate, makeNeed, makeMatch, makeWeek
tests/helpers/fake-backend.ts             faux LlmBackend
```

---

### Task 1 : Modèle de semaine et stockage JSON

**Files:**
- Create: `src/lib/store/weeks.ts`, `src/lib/store/weeks.test.ts`
- Modify: `tests/helpers/factories.ts`

**Interfaces:**
- Consumes : `Brief`, `BriefSchema` (`src/lib/recipes/brief.ts`), `Recipe` (`src/lib/recipes/schema.ts`), `IngredientMatch` (`src/lib/matching/match.ts`), `IngredientNeed` (`src/lib/matching/needs.ts`), `MatchCandidate` (`src/lib/matching/score.ts`), `round2` (`src/lib/units.ts`).
- Produces :
  - types `WeekStatus = "draft" | "generating" | "ready" | "pushed"`, `JobKind = "create" | "revise-recipe" | "push"`, `JobStatus = "running" | "done" | "error"`, `JobState`, `WeekOverrides { products: Record<string, string>; pantry: string[] }`, `PushLineReport`, `PushReport`, `Week` (champs ci-dessous) ;
  - `isWeekId(id: string): boolean`, `newWeekId(now: Date, existing: string[]): string`, `emptyWeek(id: string, brief: Brief, now: Date): Week` ;
  - `class WeekNotFoundError extends Error` ;
  - `class WeekStore { constructor(dir?: string); ids(): string[]; get(id: string): Week | null; list(): Week[]; save(week: Week): void; create(brief: Brief, now?: Date): Week; update(id: string, mutate: (w: Week) => void): Week; latestBrief(): Brief | null }` ;
  - factories de test `makeCandidate(product, packs?)`, `makeNeed(overrides & { key })`, `makeMatch(need, chosen, alternatives?)`, `makeWeek(overrides?)`.

- [ ] **Step 1 : Ajouter les factories de test**

Dans `tests/helpers/factories.ts`, remplacer les deux imports du haut par :

```ts
import type { IngredientMatch } from "@/lib/matching/match";
import type { IngredientNeed } from "@/lib/matching/needs";
import type { MatchCandidate } from "@/lib/matching/score";
import type { Recipe } from "@/lib/recipes/schema";
import type { Week } from "@/lib/store/weeks";
import type { Product } from "@/lib/types";
import { round2 } from "@/lib/units";
```

et ajouter à la fin du fichier :

```ts
export function makeCandidate(product: Product, packs = 1): MatchCandidate {
  const cost = round2(product.price * packs);
  return { product, packs, cost, score: cost, uncertainQuantity: false };
}

export function makeNeed(overrides: Partial<IngredientNeed> & { key: string }): IngredientNeed {
  const [query, unit] = overrides.key.split("|");
  return {
    name: query,
    searchQuery: query,
    unit: (unit ?? "g") as IngredientNeed["unit"],
    quantity: 100,
    perRecipe: {},
    pantryStaple: false,
    ...overrides,
  };
}

export function makeMatch(need: IngredientNeed, chosen: Product | null, alternatives: Product[] = []): IngredientMatch {
  return {
    need,
    chosen: chosen ? makeCandidate(chosen) : null,
    alternatives: alternatives.map((p) => makeCandidate(p)),
  };
}

export function makeWeek(overrides: Partial<Week> = {}): Week {
  return {
    id: "2026-09-23-1",
    createdAt: "2026-09-23T10:00:00.000Z",
    brief: { dinners: 2, adults: 2, children: 0, budgetEur: 30, filters: [], notes: "", preferOrganic: false },
    contextSummary: null,
    recipes: [],
    selectedRecipeIds: [],
    matches: [],
    overrides: { products: {}, pantry: [] },
    status: "ready",
    job: null,
    pushReport: null,
    ...overrides,
  };
}
```

- [ ] **Step 2 : Écrire le test qui échoue**

`src/lib/store/weeks.test.ts` :

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeWeek } from "../../../tests/helpers/factories";
import type { Brief } from "../recipes/brief";
import { isWeekId, newWeekId, WeekNotFoundError, WeekStore } from "./weeks";

const brief: Brief = {
  dinners: 4,
  adults: 2,
  children: 2,
  budgetEur: 60,
  filters: ["kids_friendly"],
  notes: "",
  preferOrganic: true,
};

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "myfresh-weeks-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("newWeekId", () => {
  it("date locale + premier suffixe libre", () => {
    const now = new Date(2026, 8, 23, 12, 0);
    expect(newWeekId(now, [])).toBe("2026-09-23-1");
    expect(newWeekId(now, ["2026-09-23-1", "2026-09-23-2", "2026-09-22-3"])).toBe("2026-09-23-3");
  });
});

describe("isWeekId", () => {
  it("refuse les chemins et l'ancien format du CLI", () => {
    expect(isWeekId("2026-09-23-1")).toBe(true);
    expect(isWeekId("2026-09-23")).toBe(false);
    expect(isWeekId("../../etc/passwd")).toBe(false);
    expect(isWeekId("2026-09-23-1/../x")).toBe(false);
  });
});

describe("WeekStore", () => {
  it("crée une semaine brouillon et la relit", () => {
    const store = new WeekStore(dir);
    const week = store.create(brief, new Date(2026, 8, 23, 12));
    expect(week).toMatchObject({
      id: "2026-09-23-1",
      status: "draft",
      brief,
      recipes: [],
      selectedRecipeIds: [],
      matches: [],
      overrides: { products: {}, pantry: [] },
      contextSummary: null,
      job: null,
      pushReport: null,
    });
    expect(store.get(week.id)).toEqual(week);
    expect(store.create(brief, new Date(2026, 8, 23, 13)).id).toBe("2026-09-23-2");
  });

  it("update modifie et enregistre ; lève WeekNotFoundError si la semaine n'existe pas", () => {
    const store = new WeekStore(dir);
    const { id } = store.create(brief);
    store.update(id, (w) => {
      w.status = "ready";
    });
    expect(store.get(id)?.status).toBe("ready");
    expect(() => store.update("2020-01-01-1", () => {})).toThrow(WeekNotFoundError);
  });

  it("list : la plus récente d'abord, ignore les fichiers illisibles ou d'un autre format", () => {
    const store = new WeekStore(dir);
    store.save(makeWeek({ id: "2026-09-16-1", createdAt: "2026-09-16T10:00:00.000Z" }));
    store.save(makeWeek({ id: "2026-09-23-1", createdAt: "2026-09-23T10:00:00.000Z" }));
    fs.writeFileSync(path.join(dir, "2026-09-23.json"), JSON.stringify({ brief, recipes: [], selected: [] }));
    fs.writeFileSync(path.join(dir, "2026-09-22-1.json"), "{oups");
    fs.writeFileSync(path.join(dir, "2026-09-21-1.json"), JSON.stringify({ id: "2026-09-21-1" }));
    fs.writeFileSync(path.join(dir, "2026-09-20-1.json"), JSON.stringify(makeWeek({ id: "2026-09-19-1" })));
    expect(store.list().map((w) => w.id)).toEqual(["2026-09-23-1", "2026-09-16-1"]);
    expect(store.get("2026-09-22-1")).toBeNull();
    expect(store.get("2026-09-20-1")).toBeNull();
    expect(store.get("../2026-09-23-1")).toBeNull();
  });

  it("latestBrief : le brief de la semaine la plus récente, null sans semaine", () => {
    const store = new WeekStore(dir);
    expect(store.latestBrief()).toBeNull();
    store.save(makeWeek({ id: "2026-09-16-1", createdAt: "2026-09-16T10:00:00.000Z" }));
    store.save(makeWeek({ id: "2026-09-23-1", createdAt: "2026-09-23T10:00:00.000Z", brief }));
    expect(store.latestBrief()).toEqual(brief);
  });

  it("écrit de façon atomique (aucun fichier temporaire laissé)", () => {
    const store = new WeekStore(dir);
    store.save(makeWeek());
    expect(fs.readdirSync(dir)).toEqual(["2026-09-23-1.json"]);
  });

  it("save refuse un identifiant invalide", () => {
    expect(() => new WeekStore(dir).save(makeWeek({ id: "../x" }))).toThrow(/invalide/);
  });
});
```

- [ ] **Step 3 : Lancer le test pour vérifier qu'il échoue**

Run : `npx vitest run src/lib/store`
Expected : FAIL (`Cannot find module './weeks'` ou `@/lib/store/weeks`).

- [ ] **Step 4 : Implémenter `src/lib/store/weeks.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { IngredientMatch } from "../matching/match";
import { type Brief, BriefSchema } from "../recipes/brief";
import type { Recipe } from "../recipes/schema";

export const WEEKS_DIR = "data/weeks";
const ID_RE = /^\d{4}-\d{2}-\d{2}-\d{1,4}$/;

export type WeekStatus = "draft" | "generating" | "ready" | "pushed";
export type JobKind = "create" | "revise-recipe" | "push";
export type JobStatus = "running" | "done" | "error";

export interface JobState {
  weekId: string;
  kind: JobKind;
  status: JobStatus;
  step: string;
  progress: { done: number; total: number } | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface WeekOverrides {
  /** clé d'ingrédient → productId choisi par l'utilisateur */
  products: Record<string, string>;
  /** clés des ingrédients cochés « déjà au placard » (exclus du panier) */
  pantry: string[];
}

export interface PushLineReport {
  productId: string;
  name: string;
  url: string;
  /** quantité absolue demandée (panier existant compris) */
  requested: number;
  /** quantité réellement dans le panier ; null en cas d'échec */
  actual: number | null;
  error: string | null;
}

export interface PushReport {
  pushedAt: string;
  added: PushLineReport[];
  adjusted: PushLineReport[];
  failed: PushLineReport[];
  /** total du panier Auchan après l'envoi, en € ; null s'il n'a pas pu être relu */
  cartTotal: number | null;
}

export interface Week {
  id: string;
  createdAt: string;
  brief: Brief;
  contextSummary: string | null;
  recipes: Recipe[];
  selectedRecipeIds: string[];
  matches: IngredientMatch[];
  overrides: WeekOverrides;
  status: WeekStatus;
  job: JobState | null;
  pushReport: PushReport | null;
}

/** Vérification minimale d'un fichier de semaine : écarte l'ancien format du CLI et les fichiers abîmés. */
const WeekFileSchema = z.looseObject({
  id: z.string(),
  createdAt: z.string(),
  brief: BriefSchema,
  status: z.enum(["draft", "generating", "ready", "pushed"]),
  recipes: z.array(z.unknown()),
  selectedRecipeIds: z.array(z.string()),
  matches: z.array(z.unknown()),
  overrides: z.object({ products: z.record(z.string(), z.string()), pantry: z.array(z.string()) }),
});

export class WeekNotFoundError extends Error {
  constructor(id: string) {
    super(`Semaine introuvable : ${id}`);
    this.name = "WeekNotFoundError";
  }
}

export function isWeekId(id: string): boolean {
  return ID_RE.test(id);
}

function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function newWeekId(now: Date, existing: string[]): string {
  const date = localDate(now);
  let n = 1;
  while (existing.includes(`${date}-${n}`)) n += 1;
  return `${date}-${n}`;
}

export function emptyWeek(id: string, brief: Brief, now: Date): Week {
  return {
    id,
    createdAt: now.toISOString(),
    brief,
    contextSummary: null,
    recipes: [],
    selectedRecipeIds: [],
    matches: [],
    overrides: { products: {}, pantry: [] },
    status: "draft",
    job: null,
    pushReport: null,
  };
}

/** Seul module qui lit et écrit data/weeks/. */
export class WeekStore {
  constructor(private readonly dir: string = WEEKS_DIR) {}

  private fileFor(id: string): string {
    if (!isWeekId(id)) throw new Error(`Identifiant de semaine invalide : ${id}`);
    return path.join(this.dir, `${id}.json`);
  }

  ids(): string[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .filter(isWeekId);
  }

  get(id: string): Week | null {
    if (!isWeekId(id)) return null;
    const file = this.fileFor(id);
    if (!fs.existsSync(file)) return null;
    try {
      const data: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      const parsed = WeekFileSchema.safeParse(data);
      return parsed.success && parsed.data.id === id ? (data as Week) : null;
    } catch {
      return null;
    }
  }

  list(): Week[] {
    return this.ids()
      .map((id) => this.get(id))
      .filter((w): w is Week => w !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  save(week: Week): void {
    const file = this.fileFor(week.id);
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(week, null, 2));
    fs.renameSync(tmp, file);
  }

  create(brief: Brief, now: Date = new Date()): Week {
    const week = emptyWeek(newWeekId(now, this.ids()), brief, now);
    this.save(week);
    return week;
  }

  /** Lecture, modification et écriture synchrones : aucune autre écriture ne peut s'intercaler dans le processus. */
  update(id: string, mutate: (week: Week) => void): Week {
    const week = this.get(id);
    if (!week) throw new WeekNotFoundError(id);
    mutate(week);
    this.save(week);
    return week;
  }

  latestBrief(): Brief | null {
    return this.list()[0]?.brief ?? null;
  }
}
```

- [ ] **Step 5 : Lancer les tests**

Run : `npx vitest run src/lib/store && npx tsc --noEmit`
Expected : PASS, aucune erreur de type.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/store tests/helpers/factories.ts
git commit -m "feat(store): modèle de semaine et stockage JSON dans data/weeks" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 : Garde-fou déterministe du matching et prompt d'arbitrage partagé

Constat d'un vrai passage sans arbitre : « courgette » → « AUCHAN Courgettes en rondelles » (surgelées), « oignon rouge » → « Oignons rouges émincés », « fromage frais nature » → « Fromage frais de chèvre ». On pénalise dans le score les formes transformées et les variétés que l'ingrédient ne demande pas, ainsi qu'une couverture partielle des mots de l'ingrédient. Le prompt d'arbitrage est exporté pour que le backend Claude Code (Task 5) l'utilise tel quel.

**Files:**
- Create: `src/lib/matching/relevance.ts`, `src/lib/matching/relevance.test.ts`, `src/lib/matching/arbiter.test.ts`
- Modify: `src/lib/matching/score.ts`, `src/lib/matching/score.test.ts`, `src/lib/matching/match.test.ts`, `src/lib/matching/arbiter.ts`

**Interfaces:**
- Consumes : `normalizeText`, `tokens` (`src/lib/text.ts`) ; `RECIPE_MODEL`, `unwrapParsed` (`src/lib/recipes/generate.ts`).
- Produces :
  - `processedMarkers(text: string): string[]`, `matchPenalty(ingredient: { name: string; searchQuery: string }, productName: string): number` (1 = aucune pénalité) ;
  - `scoreCandidate(need, product, opts)` accepte maintenant `need: { quantity; unit; name?; searchQuery? }` et applique `matchPenalty` quand `name` et `searchQuery` sont présents (c'est le cas des `IngredientNeed` passés par `matchNeeds`) ;
  - dans `arbiter.ts` : `ChoicesSchema` (zod `{ choices: { key: string; index: number }[] }`), `buildArbiterPrompt(items: ArbiterItem[]): string`, `toChoiceMap(choices): Map<string, number>` ; `createClaudeArbiter(client)` inchangé en signature.

- [ ] **Step 1 : Écrire les tests de `relevance`**

`src/lib/matching/relevance.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { matchPenalty, processedMarkers } from "./relevance";

const ing = (name: string, searchQuery = name) => ({ name, searchQuery });

describe("processedMarkers", () => {
  it("repère les formes transformées, accents et pluriels compris", () => {
    expect(processedMarkers("AUCHAN Courgettes en rondelles")).toEqual(["en rondelles"]);
    expect(processedMarkers("Oignons rouges émincés")).toEqual(["émincé"]);
    expect(processedMarkers("Emmental râpé")).toEqual(["râpé"]);
    expect(processedMarkers("Purée de tomates")).toEqual(["purée"]);
    expect(processedMarkers("Carottes en dés surgelées")).toEqual(["en dés", "surgelé"]);
    expect(processedMarkers("Courgette")).toEqual([]);
  });
});

describe("matchPenalty", () => {
  it("vaut 1 pour le produit attendu", () => {
    expect(matchPenalty(ing("courgette"), "Courgettes")).toBe(1);
    expect(matchPenalty(ing("fromage frais nature", "fromage frais"), "AUCHAN BIO Fromage frais nature 400g")).toBe(1);
  });

  it("double le score d'une forme transformée que l'ingrédient ne demande pas", () => {
    expect(matchPenalty(ing("courgette"), "Courgettes en rondelles")).toBe(2);
    expect(matchPenalty(ing("oignon rouge"), "Oignons rouges émincés")).toBe(2);
    expect(matchPenalty(ing("oignon rouge émincé", "oignon rouge"), "Oignons rouges émincés")).toBe(1);
    expect(matchPenalty(ing("sauce soja"), "Sauce soja salée")).toBe(1);
  });

  it("pénalise une variété que l'ingrédient ne demande pas", () => {
    expect(matchPenalty(ing("fromage frais nature", "fromage frais"), "Fromage frais de chèvre")).toBeCloseTo(
      (1 + 0.5 / 3) * 1.6,
    );
    expect(matchPenalty(ing("fromage de chèvre"), "Fromage frais de chèvre")).toBe(1);
    expect(matchPenalty(ing("saumon"), "Saumon fumé")).toBeCloseTo(1.6);
  });

  it("pénalise un produit qui ne couvre qu'une partie des mots de l'ingrédient", () => {
    expect(matchPenalty(ing("tomates cerises"), "Tomates rondes")).toBeCloseTo(1.25);
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run : `npx vitest run src/lib/matching/relevance.test.ts`
Expected : FAIL (`Cannot find module './relevance'`).

- [ ] **Step 3 : Implémenter `src/lib/matching/relevance.ts`**

```ts
import { normalizeText, tokens } from "../text";

/** Formes transformées : on les évite quand l'ingrédient ne les demande pas. Regex sur le texte normalisé (sans accents). */
const PROCESSED: [label: string, pattern: RegExp][] = [
  ["émincé", /\bemince(e|s|es)?\b/],
  ["en rondelles", /\ben rondelles?\b/],
  ["en dés", /\ben des\b/],
  ["râpé", /\brape(e|s|es)?\b/],
  ["surgelé", /\bsurgele(e|s|es)?\b/],
  ["en conserve", /\bconserves?\b/],
  ["cuisiné", /\bcuisine(e|s|es)?\b/],
  ["poêlée", /\bpoelee?s?\b/],
  ["purée", /\bpurees?\b/],
  ["soupe", /\b(soupe|veloute)s?\b/],
  ["sauce", /\bsauces?\b/],
  ["pané", /\bpane(e|s|es)?\b/],
];

/** Variétés ou aromatisations (tokens tels que produits par tokens()) qui changent le produit. */
const VARIETIES = new Set([
  "chevre",
  "brebi",
  "bufflonne",
  "fume",
  "fumee",
  "epice",
  "epicee",
  "aromatise",
  "aromatisee",
  "herbe",
  "piment",
  "vanille",
  "chocolat",
  "ail",
]);

const PROCESSED_FACTOR = 1;
const VARIETY_FACTOR = 1.6;
const COVERAGE_WEIGHT = 0.5;

export function processedMarkers(text: string): string[] {
  const t = normalizeText(text);
  return PROCESSED.filter(([, re]) => re.test(t)).map(([label]) => label);
}

/**
 * Multiplicateur de score (≥ 1, plus haut = moins pertinent) :
 * couverture partielle des mots de l'ingrédient, forme transformée non demandée (×2 chacune),
 * variété non demandée (×1,6 chacune).
 */
export function matchPenalty(ingredient: { name: string; searchQuery: string }, productName: string): number {
  const ingredientText = `${ingredient.name} ${ingredient.searchQuery}`;
  const wanted = new Set(tokens(ingredientText));
  const offered = new Set(tokens(productName));
  const shared = [...wanted].filter((t) => offered.has(t)).length;
  const coverage = wanted.size ? shared / wanted.size : 1;

  const askedForms = new Set(processedMarkers(ingredientText));
  const extraForms = processedMarkers(productName).filter((m) => !askedForms.has(m)).length;
  const extraVarieties = [...offered].filter((t) => VARIETIES.has(t) && !wanted.has(t)).length;

  return (1 + COVERAGE_WEIGHT * (1 - coverage)) * (1 + PROCESSED_FACTOR * extraForms) * VARIETY_FACTOR ** extraVarieties;
}
```

- [ ] **Step 4 : Lancer le test**

Run : `npx vitest run src/lib/matching/relevance.test.ts`
Expected : PASS.

- [ ] **Step 5 : Tests du score et du matching avec la pénalité**

Dans `src/lib/matching/score.test.ts`, à l'intérieur du `describe("scoreCandidate", …)` (après le dernier `it`), ajouter :

```ts
  it("applique la pénalité de pertinence quand le besoin porte un nom", () => {
    const named = { quantity: 500, unit: "g" as const, name: "courgette", searchQuery: "courgette" };
    const frozen = makeProduct({ name: "Courgettes en rondelles", price: 2, pack: { value: 500, unit: "g" } });
    expect(scoreCandidate(named, frozen, opts).score).toBeCloseTo(4);
    expect(scoreCandidate({ quantity: 500, unit: "g" }, frozen, opts).score).toBeCloseTo(2);
  });
```

Dans `src/lib/matching/match.test.ts`, à l'intérieur du `describe("matchNeeds", …)`, ajouter :

```ts
  it("préfère le produit brut à une forme transformée ou une autre variété moins chère", async () => {
    const frozen = makeProduct({ name: "Courgettes en rondelles", price: 1.29, pack: { value: 500, unit: "g" } });
    const fresh = makeProduct({ name: "Courgettes", price: 2.2, pack: { value: 1000, unit: "g" } });
    const chevre = makeProduct({ name: "Fromage frais de chèvre", price: 1.5, pack: { value: 200, unit: "g" } });
    const nature = makeProduct({ name: "Fromage frais nature", price: 1.9, pack: { value: 200, unit: "g" } });
    const connector = new FakeConnector({ courgette: [frozen, fresh], "fromage frais": [chevre, nature] });
    const fromage: IngredientNeed = { ...need("fromage frais", 200), name: "fromage frais nature" };
    const [c, f] = await matchNeeds([need("courgette", 400), fromage], opts, { connector });
    expect(c.chosen?.product).toBe(fresh);
    expect(f.chosen?.product).toBe(nature);
  });
```

- [ ] **Step 6 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/matching`
Expected : FAIL sur les deux nouveaux tests (score 2 au lieu de 4 ; `frozen` et `chevre` choisis).

- [ ] **Step 7 : Appliquer la pénalité dans `src/lib/matching/score.ts`**

Ajouter l'import en tête :

```ts
import { matchPenalty } from "./relevance";
```

Remplacer la ligne `type Need = { quantity: number; unit: QtyUnit };` par :

```ts
type Need = { quantity: number; unit: QtyUnit; name?: string; searchQuery?: string };
```

Dans `scoreCandidate`, remplacer :

```ts
  if (uncertain) score *= 1.3;
  return { product, packs, cost, score, uncertainQuantity: uncertain };
```

par :

```ts
  if (uncertain) score *= 1.3;
  if (need.name !== undefined && need.searchQuery !== undefined) {
    score *= matchPenalty({ name: need.name, searchQuery: need.searchQuery }, product.name);
  }
  return { product, packs, cost, score, uncertainQuantity: uncertain };
```

- [ ] **Step 8 : Lancer les tests du matching**

Run : `npx vitest run src/lib/matching src/lib/pipeline.test.ts`
Expected : PASS (les anciens tests restent verts : leurs produits ne portent ni forme transformée ni variété).

- [ ] **Step 9 : Test du prompt d'arbitrage partagé**

`src/lib/matching/arbiter.test.ts` :

```ts
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { type ArbiterItem, buildArbiterPrompt, createClaudeArbiter, toChoiceMap } from "./arbiter";

const items: ArbiterItem[] = [
  {
    key: "courgette|g",
    ingredient: "courgette",
    candidates: [
      { name: "Courgettes en rondelles", brand: "AUCHAN", pack: "1000g", price: 2.49 },
      { name: "Courgettes", brand: null, pack: "?", price: 2.2 },
    ],
  },
];

describe("buildArbiterPrompt", () => {
  it("contient les candidats, la règle -1 et la mise en garde sur les formes transformées", () => {
    const p = buildArbiterPrompt(items);
    expect(p).toContain("Courgettes en rondelles");
    expect(p).toContain("-1");
    expect(p).toContain("formes transformées");
  });
});

describe("toChoiceMap", () => {
  it("clé → index", () => {
    expect(toChoiceMap([{ key: "a", index: 1 }])).toEqual(new Map([["a", 1]]));
  });
});

describe("createClaudeArbiter", () => {
  it("appelle l'API avec un effort bas et renvoie une Map clé → index", async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { choices: [{ key: "courgette|g", index: 1 }] },
    });
    const arbiter = createClaudeArbiter({ messages: { parse } } as unknown as Anthropic);
    expect(await arbiter(items)).toEqual(new Map([["courgette|g", 1]]));
    expect(parse.mock.calls[0][0].output_config.effort).toBe("low");
    expect(parse.mock.calls[0][0].messages[0].content).toBe(buildArbiterPrompt(items));
  });
});
```

- [ ] **Step 10 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/matching/arbiter.test.ts`
Expected : FAIL (`buildArbiterPrompt` et `toChoiceMap` ne sont pas exportés).

- [ ] **Step 11 : Réécrire `src/lib/matching/arbiter.ts`**

```ts
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { RECIPE_MODEL, unwrapParsed } from "../recipes/generate";

export interface ArbiterItem {
  key: string;
  ingredient: string;
  candidates: { name: string; brand: string | null; pack: string; price: number }[];
}

export type Arbiter = (items: ArbiterItem[]) => Promise<Map<string, number>>;

export const ChoicesSchema = z.object({
  choices: z.array(z.object({ key: z.string(), index: z.number().int() })),
});

export function buildArbiterPrompt(items: ArbiterItem[]): string {
  return `Pour chaque ingrédient de recette, choisis parmi les produits Auchan proposés celui qui EST cet ingrédient, à acheter pour cuisiner (pas un plat préparé, une sauce ou un dérivé, sauf si l'ingrédient en est un).
Méfie-toi des formes transformées (émincé, en rondelles, en dés, râpé, surgelé, en conserve, cuisiné…) et des variétés différentes (chèvre au lieu de vache, fumé, aromatisé…) quand l'ingrédient ne les demande pas.
Réponds avec l'index (0 = premier produit) ; -1 si aucun ne convient. Les produits sont déjà triés du meilleur rapport qualité-prix au moins bon : à pertinence égale, prends le plus petit index.

${JSON.stringify(items)}`;
}

export function toChoiceMap(choices: { key: string; index: number }[]): Map<string, number> {
  return new Map(choices.map((c) => [c.key, c.index]));
}

export function createClaudeArbiter(client: Anthropic): Arbiter {
  return async (items) => {
    const response = await client.messages.parse({
      model: RECIPE_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodOutputFormat(ChoicesSchema) },
      messages: [{ role: "user", content: buildArbiterPrompt(items) }],
    });
    return toChoiceMap(unwrapParsed(response).choices);
  };
}
```

- [ ] **Step 12 : Lancer tous les tests**

Run : `npm test && npx tsc --noEmit`
Expected : PASS, aucune erreur de type.

- [ ] **Step 13 : Commit**

```bash
git add src/lib/matching
git commit -m "feat(matching): pénalité formes transformées et variétés, prompt d'arbitrage partagé" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 : Recettes — étapes enfants et modification d'une seule recette

**Files:**
- Modify: `src/lib/recipes/schema.ts`, `src/lib/recipes/prompt.ts`, `src/lib/recipes/generate.ts`, `src/lib/recipes/handoff.ts`, `src/lib/recipes/recipes.test.ts`, `src/lib/recipes/handoff.test.ts`

**Interfaces:**
- Consumes : `WeeklyContext`, `Brief`, `servingsFor`, `contextBlock`/`briefBlock` (privés de `prompt.ts`).
- Produces :
  - `RecipeSchema` gagne `kidSteps?: number[]` (indices des étapes faisables par des enfants, facultatif pour rester compatible avec les fichiers existants) ;
  - `assertUniqueRecipeIds(recipes: Recipe[]): Recipe[]` (dans `schema.ts`, lève `Error` « … en double … ») ;
  - `buildReviseRecipePrompt(brief: Brief, ctx: WeeklyContext, recipe: Recipe, others: Recipe[], instruction: string): string` ;
  - `reviseRecipe(client: Anthropic, brief, ctx, recipe, others, instruction): Promise<Recipe>` (API ; l'identifiant d'origine est conservé).

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `src/lib/recipes/recipes.test.ts`, remplacer les deux imports locaux :

```ts
import { generateMenu, LlmError, RECIPE_MODEL, reviseMenu } from "./generate";
import { buildMenuPrompt } from "./prompt";
```

par :

```ts
import { generateMenu, LlmError, RECIPE_MODEL, reviseMenu, reviseRecipe } from "./generate";
import { buildMenuPrompt, buildReviseRecipePrompt, SYSTEM_PROMPT } from "./prompt";
```

et ajouter à la fin du fichier :

```ts
describe("SYSTEM_PROMPT", () => {
  it("demande les étapes réalisables par les enfants", () => {
    expect(SYSTEM_PROMPT).toContain("kidSteps");
  });
});

describe("buildReviseRecipePrompt", () => {
  it("contient la recette, la consigne, les autres titres et l'identifiant à garder", () => {
    const recipe = makeRecipe({ id: "curry", title: "Curry de légumes" });
    const p = buildReviseRecipePrompt(brief, ctx, recipe, [makeRecipe({ title: "Gratin" })], "sans four");
    expect(p).toContain("Curry de légumes");
    expect(p).toContain("sans four");
    expect(p).toContain("Gratin");
    expect(p).toContain("« curry »");
    expect(p).toContain("4 portions");
    expect(p).toContain("Potimarron");
  });
});

describe("reviseRecipe", () => {
  it("renvoie une seule recette et garde son identifiant", async () => {
    const original = makeRecipe({ id: "curry", title: "Curry" });
    const { client, parse } = fakeClient({
      stop_reason: "end_turn",
      parsed_output: { ...original, id: "autre-id", title: "Curry doux" },
    });
    const revised = await reviseRecipe(client, brief, ctx, original, [], "moins épicé");
    expect(revised).toMatchObject({ id: "curry", title: "Curry doux" });
    const args = parse.mock.calls[0][0];
    expect(args.model).toBe(RECIPE_MODEL);
    expect(args.output_config.format).toBeDefined();
    expect(args.messages[0].content).toContain("moins épicé");
  });

  it("lève LlmError sur un refus", async () => {
    const { client } = fakeClient({ stop_reason: "refusal", parsed_output: null });
    await expect(reviseRecipe(client, brief, ctx, makeRecipe(), [], "x")).rejects.toBeInstanceOf(LlmError);
  });
});
```

Dans `src/lib/recipes/handoff.test.ts`, dans le `describe("parseRecipesFile", …)`, ajouter :

```ts
  it("accepte kidSteps (facultatif)", () => {
    const withKids = [makeRecipe({ id: "k", kidSteps: [0] })];
    expect(parseRecipesFile(JSON.stringify(withKids))).toEqual(withKids);
  });
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/recipes`
Expected : FAIL (`reviseRecipe`/`buildReviseRecipePrompt` non exportés ; `kidSteps` inconnu du type `Recipe`).

- [ ] **Step 3 : `src/lib/recipes/schema.ts`**

Dans `RecipeSchema`, remplacer la ligne `steps: z.array(z.string()),` par :

```ts
  steps: z.array(z.string()),
  kidSteps: z
    .array(z.number().int())
    .optional()
    .describe("indices (0 = première étape) des étapes que des enfants peuvent réaliser : laver, mélanger, garnir, dresser"),
```

et ajouter à la fin du fichier :

```ts
export function assertUniqueRecipeIds(recipes: Recipe[]): Recipe[] {
  const ids = recipes.map((r) => r.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length) {
    throw new Error(`Menu : identifiants de recette en double (${[...new Set(duplicates)].join(", ")})`);
  }
  return recipes;
}
```

- [ ] **Step 4 : `src/lib/recipes/handoff.ts` utilise `assertUniqueRecipeIds`**

Remplacer l'import `import { MenuSchema, type Recipe } from "./schema";` par :

```ts
import { assertUniqueRecipeIds, MenuSchema, type Recipe } from "./schema";
```

et remplacer la fin de `parseRecipesFile` :

```ts
  const { recipes } = result.data;
  const ids = recipes.map((r) => r.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length) throw new Error(`Fichier de recettes : identifiants en double (${[...new Set(duplicates)].join(", ")})`);
  return recipes;
```

par :

```ts
  return assertUniqueRecipeIds(result.data.recipes);
```

- [ ] **Step 5 : `src/lib/recipes/prompt.ts`**

Remplacer la constante `SYSTEM_PROMPT` par :

```ts
export const SYSTEM_PROMPT = `Tu es le chef d'un service de box repas familiales, en France.
Tu composes des dîners faisables en semaine avec des produits d'un supermarché Auchan Drive.
Tu privilégies les produits en promotion et de saison fournis, tu réutilises un même produit dans plusieurs recettes pour limiter le gaspillage et tu respectes strictement les contraintes alimentaires.
Les quantités d'ingrédients sont des totaux pour la recette, en g, ml ou pièces (pce), cohérents avec le nombre de portions.
Indique dans kidSteps les indices des étapes que des enfants peuvent réaliser (laver, mélanger, garnir, dresser).`;
```

et ajouter à la fin du fichier :

```ts
export function buildReviseRecipePrompt(
  brief: Brief,
  ctx: WeeklyContext,
  recipe: Recipe,
  others: Recipe[],
  instruction: string,
): string {
  const titles = others.map((r) => r.title).join(", ") || "aucune";
  return `${contextBlock(ctx)}

${briefBlock(brief)}

Autres recettes du menu (garde de la variété et partage des ingrédients avec elles) : ${titles}.

Recette à modifier (JSON) :
${JSON.stringify(recipe)}

Consigne : ${instruction}
Renvoie uniquement cette recette mise à jour, pour ${servingsFor(brief)} portions, avec le même identifiant « ${recipe.id} ».`;
}
```

- [ ] **Step 6 : `src/lib/recipes/generate.ts`**

Remplacer les imports locaux :

```ts
import { buildMenuPrompt, buildRevisePrompt, SYSTEM_PROMPT } from "./prompt";
import { MenuSchema, type Recipe } from "./schema";
```

par :

```ts
import { buildMenuPrompt, buildRevisePrompt, buildReviseRecipePrompt, SYSTEM_PROMPT } from "./prompt";
import { MenuSchema, type Recipe, RecipeSchema } from "./schema";
```

et ajouter à la fin du fichier :

```ts
export async function reviseRecipe(
  client: Anthropic,
  brief: Brief,
  ctx: WeeklyContext,
  recipe: Recipe,
  others: Recipe[],
  instruction: string,
): Promise<Recipe> {
  const response = await client.messages.parse({
    model: RECIPE_MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(RecipeSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildReviseRecipePrompt(brief, ctx, recipe, others, instruction) }],
  });
  return { ...unwrapParsed(response), id: recipe.id };
}
```

- [ ] **Step 7 : Lancer les tests**

Run : `npm test && npx tsc --noEmit`
Expected : PASS (le test « refuse des identifiants de recette en double » de `handoff.test.ts` passe toujours : le message contient « en double »).

- [ ] **Step 8 : Commit**

```bash
git add src/lib/recipes
git commit -m "feat(recipes): étapes enfants (kidSteps) et modification d'une seule recette" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4 : Exécution de Claude Code en mode non interactif

**Files:**
- Create: `src/lib/llm/claude-cli.ts`, `src/lib/llm/claude-cli.test.ts`

**Interfaces:**
- Consumes : `LlmError`, `RECIPE_MODEL` (`src/lib/recipes/generate.ts`), `z.toJSONSchema` (zod 4).
- Produces :
  - `interface ExecResult { stdout: string; stderr: string; code: number | null; timedOut: boolean; notFound: boolean }` ;
  - `type ExecFn = (cmd: string, args: string[], opts: { timeoutMs: number }) => Promise<ExecResult>` ;
  - `CLAUDE_TIMEOUT_MS = 600_000` ;
  - `nodeExec: ExecFn` (spawn sans shell, stdin fermé, SIGTERM au délai puis SIGKILL 5 s après) ;
  - `claudeArgs(prompt: string, jsonSchema: object, model?: string): string[]` ;
  - `runClaudeStructured<S extends z.ZodType>(schema: S, prompt: string, deps?: { exec?: ExecFn; timeoutMs?: number; command?: string }): Promise<z.output<S>>` (lève `LlmError`).

Le prompt passe en argument (pas de shell, donc aucun échappement nécessaire ; la limite d'arguments de macOS, environ 1 Mo, est très au-dessus de nos prompts de 10 à 40 Ko). stdin est fermé (`"ignore"`) pour que `claude -p` n'attende jamais une entrée.

- [ ] **Step 1 : Écrire le test qui échoue**

`src/lib/llm/claude-cli.test.ts` :

```ts
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmError } from "../recipes/generate";
import { CLAUDE_TIMEOUT_MS, claudeArgs, type ExecFn, type ExecResult, nodeExec, runClaudeStructured } from "./claude-cli";

const Schema = z.object({ answer: z.string() });
const ok = (stdout: string): ExecResult => ({ stdout, stderr: "", code: 0, timedOut: false, notFound: false });
const resultEvent = (extra: object) => ({ type: "result", subtype: "success", is_error: false, ...extra });
const execReturning = (r: ExecResult) => vi.fn<ExecFn>(async () => r);

describe("claudeArgs", () => {
  it("mode non interactif, sortie JSON, schéma, modèle et aucun outil", () => {
    expect(claudeArgs("Bonjour", { type: "object" })).toEqual([
      "-p",
      "Bonjour",
      "--output-format",
      "json",
      "--json-schema",
      '{"type":"object"}',
      "--model",
      "claude-opus-5-5",
      "--tools",
      "",
    ]);
  });
});

describe("runClaudeStructured", () => {
  it("lance claude avec le schéma JSON et lit structured_output du dernier événement", async () => {
    const exec = execReturning(
      ok(
        JSON.stringify([
          { type: "system", subtype: "init" },
          { type: "assistant", message: {} },
          resultEvent({ structured_output: { answer: "42" }, result: '{"answer":"42"}' }),
        ]),
      ),
    );
    await expect(runClaudeStructured(Schema, "Question ?", { exec })).resolves.toEqual({ answer: "42" });
    const [cmd, args, opts] = exec.mock.calls[0];
    expect(cmd).toBe("claude");
    expect(args[1]).toBe("Question ?");
    expect(JSON.parse(args[args.indexOf("--json-schema") + 1]).properties.answer).toBeDefined();
    expect(opts.timeoutMs).toBe(CLAUDE_TIMEOUT_MS);
  });

  it("accepte un événement résultat seul et, sans structured_output, le texte JSON de result", async () => {
    const exec = execReturning(ok(JSON.stringify(resultEvent({ result: '{"answer":"oui"}' }))));
    await expect(runClaudeStructured(Schema, "q", { exec })).resolves.toEqual({ answer: "oui" });
  });

  it("is_error : LlmError avec le message de Claude Code", async () => {
    const exec = execReturning(
      ok(JSON.stringify([resultEvent({ subtype: "error_during_execution", is_error: true, result: "Limite d'usage atteinte" })])),
    );
    await expect(runClaudeStructured(Schema, "q", { exec })).rejects.toThrow(/Limite d'usage atteinte/);
  });

  it("sortie non conforme au schéma : LlmError qui cite le champ", async () => {
    const exec = execReturning(ok(JSON.stringify([resultEvent({ structured_output: { answer: 42 } })])));
    const error = await runClaudeStructured(Schema, "q", { exec }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as Error).message).toMatch(/non conforme.*answer/);
  });

  it("JSON illisible : LlmError", async () => {
    await expect(runClaudeStructured(Schema, "q", { exec: execReturning(ok("pas du json")) })).rejects.toThrow(/illisible/);
  });

  it("commande absente : message d'installation", async () => {
    const exec = execReturning({ stdout: "", stderr: "spawn claude ENOENT", code: null, timedOut: false, notFound: true });
    await expect(runClaudeStructured(Schema, "q", { exec })).rejects.toThrow(/introuvable/);
  });

  it("délai dépassé : LlmError", async () => {
    const exec = execReturning({ stdout: "", stderr: "", code: null, timedOut: true, notFound: false });
    await expect(runClaudeStructured(Schema, "q", { exec })).rejects.toThrow(/10 min/);
  });

  it("sortie vide : LlmError avec le code et la fin de stderr", async () => {
    const exec = execReturning({ stdout: "", stderr: "Erreur : quota dépassé", code: 1, timedOut: false, notFound: false });
    await expect(runClaudeStructured(Schema, "q", { exec })).rejects.toThrow(/code 1.*quota dépassé/);
  });
});

describe("nodeExec", () => {
  it("capture stdout et le code de sortie", async () => {
    const r = await nodeExec(process.execPath, ["-e", "process.stdout.write('ok')"], { timeoutMs: 10_000 });
    expect(r).toMatchObject({ stdout: "ok", code: 0, timedOut: false, notFound: false });
  });

  it("arrête le processus au bout du délai", async () => {
    const r = await nodeExec(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { timeoutMs: 200 });
    expect(r.timedOut).toBe(true);
  });

  it("signale une commande introuvable", async () => {
    const r = await nodeExec("myfresh-commande-inexistante", [], { timeoutMs: 1000 });
    expect(r.notFound).toBe(true);
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/llm`
Expected : FAIL (`Cannot find module './claude-cli'`).

- [ ] **Step 3 : Implémenter `src/lib/llm/claude-cli.ts`**

```ts
import { spawn } from "node:child_process";
import { z } from "zod";
import { LlmError, RECIPE_MODEL } from "../recipes/generate";

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  notFound: boolean;
}

export type ExecFn = (cmd: string, args: string[], opts: { timeoutMs: number }) => Promise<ExecResult>;

export const CLAUDE_TIMEOUT_MS = 10 * 60_000;

/** Lance une commande sans shell, stdin fermé ; ne rejette jamais (tout est dans ExecResult). */
export const nodeExec: ExecFn = (cmd, args, { timeoutMs }) =>
  new Promise((resolve) => {
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let settled = false;
    let timedOut = false;
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, timeoutMs);
    const finish = (r: Omit<ExecResult, "timedOut">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...r, timedOut });
    };
    child.stdout?.on("data", (c: Buffer) => out.push(c));
    child.stderr?.on("data", (c: Buffer) => err.push(c));
    child.on("error", (e: NodeJS.ErrnoException) =>
      finish({ stdout: "", stderr: e.message, code: null, notFound: e.code === "ENOENT" }),
    );
    child.on("close", (code) =>
      finish({
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        code,
        notFound: false,
      }),
    );
  });

export function claudeArgs(prompt: string, jsonSchema: object, model: string = RECIPE_MODEL): string[] {
  return ["-p", prompt, "--output-format", "json", "--json-schema", JSON.stringify(jsonSchema), "--model", model, "--tools", ""];
}

interface ResultEvent {
  type: "result";
  subtype?: string;
  is_error?: boolean;
  structured_output?: unknown;
  result?: string;
}

function isResultEvent(e: unknown): e is ResultEvent {
  return typeof e === "object" && e !== null && (e as { type?: unknown }).type === "result";
}

const tail = (s: string) => s.trim().slice(-500) || "aucun message";

function extractResult(stdout: string): ResultEvent {
  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new LlmError("Réponse de Claude Code illisible (JSON invalide).");
  }
  const events = Array.isArray(data) ? data : [data];
  const result = [...events].reverse().find(isResultEvent);
  if (!result) throw new LlmError("Réponse de Claude Code sans résultat.");
  return result;
}

/** Appelle `claude -p` avec un schéma JSON et renvoie la sortie structurée validée par Zod. */
export async function runClaudeStructured<S extends z.ZodType>(
  schema: S,
  prompt: string,
  deps: { exec?: ExecFn; timeoutMs?: number; command?: string } = {},
): Promise<z.output<S>> {
  const exec = deps.exec ?? nodeExec;
  const timeoutMs = deps.timeoutMs ?? CLAUDE_TIMEOUT_MS;
  const res = await exec(deps.command ?? "claude", claudeArgs(prompt, z.toJSONSchema(schema)), { timeoutMs });
  if (res.notFound) {
    throw new LlmError("Commande « claude » introuvable : installe Claude Code, ou définis ANTHROPIC_API_KEY pour passer par l'API.");
  }
  if (res.timedOut) throw new LlmError(`Claude Code n'a pas répondu en ${Math.round(timeoutMs / 60_000)} min.`);
  if (!res.stdout.trim()) throw new LlmError(`Claude Code a échoué (code ${res.code}) : ${tail(res.stderr)}`);

  const event = extractResult(res.stdout);
  if (event.is_error || (event.subtype !== undefined && event.subtype !== "success")) {
    throw new LlmError(`Claude Code a renvoyé une erreur : ${event.result ?? event.subtype ?? "inconnue"}`);
  }
  let output = event.structured_output;
  if (output === undefined && typeof event.result === "string") {
    try {
      output = JSON.parse(event.result);
    } catch {
      output = undefined;
    }
  }
  const parsed = schema.safeParse(output);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`)
      .join(" ; ");
    throw new LlmError(`Réponse de Claude Code non conforme : ${issues}`);
  }
  return parsed.data;
}
```

- [ ] **Step 4 : Lancer les tests**

Run : `npx vitest run src/lib/llm && npx tsc --noEmit`
Expected : PASS, aucune erreur de type.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/llm
git commit -m "feat(llm): appel de Claude Code en mode non interactif avec sortie structurée" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5 : Interface `LlmBackend` (Claude Code par défaut, API si clé)

**Files:**
- Create: `src/lib/llm/backend.ts`, `src/lib/llm/backend.test.ts`, `tests/helpers/fake-backend.ts`

**Interfaces:**
- Consumes : `runClaudeStructured`, `ExecFn` (Task 4) ; `generateMenu`, `reviseMenu`, `reviseRecipe` (`generate.ts`, Task 3) ; `buildMenuPrompt`, `buildRevisePrompt`, `buildReviseRecipePrompt`, `SYSTEM_PROMPT` ; `MenuSchema`, `RecipeSchema`, `assertUniqueRecipeIds` ; `Arbiter`, `ChoicesSchema`, `buildArbiterPrompt`, `toChoiceMap`, `createClaudeArbiter` (Task 2).
- Produces :
  - `type BackendName = "claude-code" | "api"` ;
  - `interface LlmBackend { name: BackendName; label: string; generateMenu(brief: Brief, ctx: WeeklyContext): Promise<Recipe[]>; reviseMenu(brief, ctx, recipes: Recipe[], instruction: string): Promise<Recipe[]>; reviseRecipe(brief, ctx, recipe: Recipe, others: Recipe[], instruction: string): Promise<Recipe>; arbitrate: Arbiter }` ;
  - `createApiBackend(client: Anthropic): LlmBackend` (label « API Anthropic ») ;
  - `createClaudeCodeBackend(deps?: { exec?: ExecFn; timeoutMs?: number }): LlmBackend` (label « Claude Code (abonnement) ») ;
  - `selectBackend(env?: Record<string, string | undefined>, deps?): LlmBackend` ;
  - `fakeBackend(overrides?: Partial<LlmBackend>): LlmBackend` (helper de test, fonctions `vi.fn`, label « Claude (faux) »).

- [ ] **Step 1 : Helper de test `tests/helpers/fake-backend.ts`**

```ts
import { vi } from "vitest";
import type { LlmBackend } from "@/lib/llm/backend";

export function fakeBackend(overrides: Partial<LlmBackend> = {}): LlmBackend {
  return {
    name: "claude-code",
    label: "Claude (faux)",
    generateMenu: vi.fn<LlmBackend["generateMenu"]>(async () => []),
    reviseMenu: vi.fn<LlmBackend["reviseMenu"]>(async (_brief, _ctx, recipes) => recipes),
    reviseRecipe: vi.fn<LlmBackend["reviseRecipe"]>(async (_brief, _ctx, recipe) => recipe),
    arbitrate: vi.fn<LlmBackend["arbitrate"]>(async () => new Map<string, number>()),
    ...overrides,
  };
}
```

- [ ] **Step 2 : Écrire le test qui échoue**

`src/lib/llm/backend.test.ts` :

```ts
import { describe, expect, it, vi } from "vitest";
import { makeRecipe } from "../../../tests/helpers/factories";
import type { WeeklyContext } from "../context/build";
import type { ArbiterItem } from "../matching/arbiter";
import type { Brief } from "../recipes/brief";
import { createClaudeCodeBackend, selectBackend } from "./backend";
import type { ExecFn } from "./claude-cli";

const brief: Brief = { dinners: 4, adults: 2, children: 2, budgetEur: 60, filters: [], notes: "", preferOrganic: false };
const ctx: WeeklyContext = {
  generatedAt: "2026-10-20T08:00:00.000Z",
  season: "automne",
  seasonalProduce: ["potiron"],
  events: [],
  promos: [],
  antiGaspi: [],
  themes: [],
};

function fakeExec(output: unknown) {
  return vi.fn<ExecFn>(async () => ({
    stdout: JSON.stringify([{ type: "result", subtype: "success", is_error: false, structured_output: output }]),
    stderr: "",
    code: 0,
    timedOut: false,
    notFound: false,
  }));
}
const argsOf = (exec: ReturnType<typeof fakeExec>) => exec.mock.calls[0][1];
const promptOf = (exec: ReturnType<typeof fakeExec>) => argsOf(exec)[1];
const schemaOf = (exec: ReturnType<typeof fakeExec>) => {
  const args = argsOf(exec);
  return JSON.parse(args[args.indexOf("--json-schema") + 1]);
};

describe("createClaudeCodeBackend", () => {
  it("generateMenu : rôle + demande dans le prompt, schéma du menu", async () => {
    const recipes = [makeRecipe({ id: "a" }), makeRecipe({ id: "b" })];
    const exec = fakeExec({ recipes });
    const backend = createClaudeCodeBackend({ exec });
    expect(backend).toMatchObject({ name: "claude-code", label: "Claude Code (abonnement)" });
    await expect(backend.generateMenu(brief, ctx)).resolves.toEqual(recipes);
    expect(promptOf(exec)).toMatch(/^Tu es le chef/);
    expect(promptOf(exec)).toContain("6 recettes");
    expect(schemaOf(exec).properties.recipes).toBeDefined();
  });

  it("generateMenu refuse des identifiants de recette en double", async () => {
    const exec = fakeExec({ recipes: [makeRecipe({ id: "a" }), makeRecipe({ id: "a" })] });
    await expect(createClaudeCodeBackend({ exec }).generateMenu(brief, ctx)).rejects.toThrow(/en double/);
  });

  it("reviseMenu transmet le menu actuel et la consigne", async () => {
    const current = [makeRecipe({ id: "a", title: "Lasagnes" })];
    const exec = fakeExec({ recipes: current });
    await createClaudeCodeBackend({ exec }).reviseMenu(brief, ctx, current, "moins cher");
    expect(promptOf(exec)).toContain("Lasagnes");
    expect(promptOf(exec)).toContain("moins cher");
  });

  it("reviseRecipe renvoie une seule recette avec l'identifiant d'origine", async () => {
    const original = makeRecipe({ id: "curry", title: "Curry" });
    const exec = fakeExec({ ...original, id: "nouveau", title: "Curry doux" });
    const revised = await createClaudeCodeBackend({ exec }).reviseRecipe(brief, ctx, original, [], "moins épicé");
    expect(revised).toMatchObject({ id: "curry", title: "Curry doux" });
    expect(schemaOf(exec).properties.steps).toBeDefined();
    expect(promptOf(exec)).toContain("moins épicé");
  });

  it("arbitrate : un seul appel groupé, avec le prompt d'arbitrage, renvoie une Map", async () => {
    const items: ArbiterItem[] = [
      { key: "courgette|g", ingredient: "courgette", candidates: [{ name: "Courgettes", brand: null, pack: "?", price: 2 }] },
      { key: "oignon|g", ingredient: "oignon", candidates: [{ name: "Oignons", brand: null, pack: "1000g", price: 1 }] },
    ];
    const exec = fakeExec({ choices: [{ key: "courgette|g", index: 1 }, { key: "oignon|g", index: -1 }] });
    const map = await createClaudeCodeBackend({ exec }).arbitrate(items);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(map).toEqual(new Map([["courgette|g", 1], ["oignon|g", -1]]));
    expect(promptOf(exec)).toContain("formes transformées");
    expect(schemaOf(exec).properties.choices).toBeDefined();
  });
});

describe("selectBackend", () => {
  it("Claude Code par défaut, l'API si ANTHROPIC_API_KEY est défini", () => {
    expect(selectBackend({}).name).toBe("claude-code");
    expect(selectBackend({ ANTHROPIC_API_KEY: "sk-test" })).toMatchObject({ name: "api", label: "API Anthropic" });
  });
});
```

- [ ] **Step 3 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/llm/backend.test.ts`
Expected : FAIL (`Cannot find module './backend'`).

- [ ] **Step 4 : Implémenter `src/lib/llm/backend.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { WeeklyContext } from "../context/build";
import { type Arbiter, buildArbiterPrompt, ChoicesSchema, createClaudeArbiter, toChoiceMap } from "../matching/arbiter";
import type { Brief } from "../recipes/brief";
import { generateMenu, reviseMenu, reviseRecipe } from "../recipes/generate";
import { buildMenuPrompt, buildRevisePrompt, buildReviseRecipePrompt, SYSTEM_PROMPT } from "../recipes/prompt";
import { assertUniqueRecipeIds, MenuSchema, type Recipe, RecipeSchema } from "../recipes/schema";
import { type ExecFn, runClaudeStructured } from "./claude-cli";

export type BackendName = "claude-code" | "api";

export interface LlmBackend {
  name: BackendName;
  /** libellé affiché dans l'interface et le CLI */
  label: string;
  generateMenu(brief: Brief, ctx: WeeklyContext): Promise<Recipe[]>;
  reviseMenu(brief: Brief, ctx: WeeklyContext, recipes: Recipe[], instruction: string): Promise<Recipe[]>;
  reviseRecipe(brief: Brief, ctx: WeeklyContext, recipe: Recipe, others: Recipe[], instruction: string): Promise<Recipe>;
  arbitrate: Arbiter;
}

export function createApiBackend(client: Anthropic): LlmBackend {
  return {
    name: "api",
    label: "API Anthropic",
    generateMenu: async (brief, ctx) => assertUniqueRecipeIds(await generateMenu(client, brief, ctx)),
    reviseMenu: async (brief, ctx, recipes, instruction) =>
      assertUniqueRecipeIds(await reviseMenu(client, brief, ctx, recipes, instruction)),
    reviseRecipe: (brief, ctx, recipe, others, instruction) => reviseRecipe(client, brief, ctx, recipe, others, instruction),
    arbitrate: createClaudeArbiter(client),
  };
}

/** Claude Code n'a pas de paramètre « system » ici : le rôle est placé en tête du prompt. */
const withRole = (prompt: string) => `${SYSTEM_PROMPT}\n\n${prompt}`;

export function createClaudeCodeBackend(deps: { exec?: ExecFn; timeoutMs?: number } = {}): LlmBackend {
  const ask = <S extends z.ZodType>(schema: S, prompt: string) => runClaudeStructured(schema, prompt, deps);
  return {
    name: "claude-code",
    label: "Claude Code (abonnement)",
    generateMenu: async (brief, ctx) =>
      assertUniqueRecipeIds((await ask(MenuSchema, withRole(buildMenuPrompt(brief, ctx)))).recipes),
    reviseMenu: async (brief, ctx, recipes, instruction) =>
      assertUniqueRecipeIds(
        (await ask(MenuSchema, withRole(buildRevisePrompt(brief, ctx, recipes, instruction)))).recipes,
      ),
    reviseRecipe: async (brief, ctx, recipe, others, instruction) => ({
      ...(await ask(RecipeSchema, withRole(buildReviseRecipePrompt(brief, ctx, recipe, others, instruction)))),
      id: recipe.id,
    }),
    arbitrate: async (items) => toChoiceMap((await ask(ChoicesSchema, buildArbiterPrompt(items))).choices),
  };
}

/** Claude Code (abonnement) par défaut ; l'API Anthropic si ANTHROPIC_API_KEY est défini. */
export function selectBackend(
  env: Record<string, string | undefined> = process.env,
  deps: { exec?: ExecFn; timeoutMs?: number } = {},
): LlmBackend {
  const apiKey = env.ANTHROPIC_API_KEY;
  return apiKey ? createApiBackend(new Anthropic({ apiKey })) : createClaudeCodeBackend(deps);
}
```

- [ ] **Step 5 : Lancer les tests**

Run : `npx vitest run src/lib/llm && npx tsc --noEmit`
Expected : PASS, aucune erreur de type.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/llm tests/helpers/fake-backend.ts
git commit -m "feat(llm): interface LlmBackend, Claude Code par défaut et API si clé" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 : Ouverture de la session Auchan, débit partagé et contexte en cache

**Files:**
- Create: `src/lib/auchan/open.ts`, `src/lib/auchan/open.test.ts`, `src/lib/context/cache.ts`, `src/lib/context/cache.test.ts`
- Modify: `src/lib/auchan/http.ts`, `src/lib/auchan/http.test.ts`

**Interfaces:**
- Consumes : `importChromeSession` (`chrome-cookies.ts`), `loadSession`, `AuchanSession`, `SessionMissingError` (`session.ts`), `AuchanConnector`, `hasStoreSession`, `buildWeeklyContext`, `isCacheableContext`, `WeeklyContext`, `StoreConnector`.
- Produces :
  - `class RequestGate { constructor(minIntervalMs?: number, now?: () => number, sleep?: (ms: number) => Promise<void>); wait(): Promise<void> }` ; `AuchanHttp` accepte `opts.gate?: RequestGate` ;
  - `class NoStoreError extends Error` ;
  - `interface OpenAuchanDeps { importChrome(): { profile: string; cookies: number }; loadSession(): AuchanSession; makeConnector(s: AuchanSession): StoreConnector; checkStore(c: StoreConnector): Promise<boolean> }` ;
  - `interface OpenedStore { connector: StoreConnector; source: "chrome" | "saved"; warnings: string[] }` ;
  - `sharedGate(): RequestGate` (singleton `globalThis`) ; `defaultOpenDeps: OpenAuchanDeps` ;
  - `openAuchan(opts?: { importChrome?: boolean }, deps?: OpenAuchanDeps): Promise<OpenedStore>` ;
  - `CONTEXT_CACHE = "data/cache/context.json"`, `readCachedContext(cachePath?: string, nowMs?: number): WeeklyContext | null`, `loadWeeklyContext(connector: StoreConnector, opts?: { cachePath?: string; now?: Date }): Promise<WeeklyContext>`.

- [ ] **Step 1 : Test d'une `RequestGate` partagée**

Dans `src/lib/auchan/http.test.ts`, remplacer l'import par :

```ts
import { AuchanHttp, AuchanHttpError, RequestGate, SessionExpiredError } from "./http";
```

et ajouter dans le `describe("AuchanHttp", …)` :

```ts
  it("deux clients qui partagent une RequestGate respectent l'intervalle entre eux", async () => {
    const clock = fakeClock();
    const gate = new RequestGate(350, clock.now, clock.sleep);
    const fetchFn = vi.fn(async () => new Response("<html/>", { status: 200 }));
    const a = new AuchanHttp(session, { fetchFn, gate });
    const b = new AuchanHttp(session, { fetchFn, gate });
    await a.getText("/x");
    await b.getText("/y");
    expect(clock.sleeps).toEqual([350]);
  });
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/auchan/http.test.ts`
Expected : FAIL (`RequestGate` n'existe pas).

- [ ] **Step 3 : Réécrire `src/lib/auchan/http.ts`**

```ts
import { BASE_URL } from "./parse";
import type { AuchanSession } from "./session";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export interface HttpClient {
  getText(path: string): Promise<string>;
  getJson<T>(path: string): Promise<T>;
  postJson<T>(path: string, body: unknown): Promise<T>;
}

export class AuchanHttpError extends Error {
  constructor(
    public status: number,
    public path: string,
  ) {
    super(`Auchan a répondu ${status} pour ${path}`);
    this.name = "AuchanHttpError";
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Session Auchan expirée. Relance : npm run auchan:login");
    this.name = "SessionExpiredError";
  }
}

/** Espacement minimal entre deux requêtes ; partageable entre plusieurs clients pour un débit global. */
export class RequestGate {
  private last = Number.NEGATIVE_INFINITY;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly minIntervalMs: number = 350,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  wait(): Promise<void> {
    const turn = this.queue.then(async () => {
      const wait = this.last + this.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.last = this.now();
    });
    this.queue = turn.catch(() => undefined);
    return turn;
  }
}

interface Options {
  fetchFn?: typeof fetch;
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** porte partagée ; sinon une porte propre à ce client (minIntervalMs, now, sleep) */
  gate?: RequestGate;
}

export class AuchanHttp implements HttpClient {
  private readonly fetchFn: typeof fetch;
  private readonly gate: RequestGate;

  constructor(
    private readonly session: AuchanSession,
    opts: Options = {},
  ) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.gate = opts.gate ?? new RequestGate(opts.minIntervalMs ?? 350, opts.now, opts.sleep);
  }

  private async request(path: string, init: RequestInit, extraHeaders: Record<string, string>): Promise<Response> {
    await this.gate.wait();
    const res = await this.fetchFn(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Cookie: this.session.cookieHeader,
        "User-Agent": USER_AGENT,
        "Accept-Language": "fr-FR,fr;q=0.9",
        ...extraHeaders,
      },
    });
    if (res.status === 401 || res.status === 403) throw new SessionExpiredError();
    if (!res.ok) throw new AuchanHttpError(res.status, path);
    if (res.redirected && /login|connexion|identification|auth/i.test(res.url)) throw new SessionExpiredError();
    return res;
  }

  async getText(path: string): Promise<string> {
    const res = await this.request(path, { method: "GET" }, { Accept: "text/html" });
    return res.text();
  }

  async getJson<T>(path: string): Promise<T> {
    const res = await this.request(
      path,
      { method: "GET" },
      { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    );
    if (!(res.headers.get("content-type") ?? "").includes("json")) throw new SessionExpiredError();
    return (await res.json()) as T;
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await this.request(
      path,
      { method: "POST", body: JSON.stringify(body) },
      { Accept: "application/json", "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    );
    return (await res.json()) as T;
  }
}
```

(Passer `undefined` à un paramètre avec valeur par défaut applique la valeur par défaut : `new RequestGate(350, undefined, undefined)` utilise `Date.now` et `setTimeout`.)

- [ ] **Step 4 : Lancer les tests HTTP**

Run : `npx vitest run src/lib/auchan/http.test.ts`
Expected : PASS (les anciens tests aussi).

- [ ] **Step 5 : Test de `openAuchan`**

`src/lib/auchan/open.test.ts` :

```ts
import { describe, expect, it, vi } from "vitest";
import { makeProduct } from "../../../tests/helpers/factories";
import { FakeConnector } from "../../../tests/helpers/fake-connector";
import { NoStoreError, openAuchan, type OpenAuchanDeps } from "./open";
import { SessionMissingError } from "./session";

function deps(overrides: Partial<OpenAuchanDeps> = {}): OpenAuchanDeps {
  const connector = new FakeConnector({ lait: [makeProduct()] });
  return {
    importChrome: vi.fn(() => ({ profile: "Default", cookies: 12 })),
    loadSession: vi.fn(() => ({ cookieHeader: "a=1", consentId: "c" })),
    makeConnector: vi.fn(() => connector),
    checkStore: vi.fn(async () => true),
    ...overrides,
  };
}

describe("openAuchan", () => {
  it("reprend la session de Chrome puis vérifie que le drive est visible", async () => {
    const d = deps();
    const opened = await openAuchan({}, d);
    expect(opened.source).toBe("chrome");
    expect(opened.warnings).toEqual([]);
    expect(d.importChrome).toHaveBeenCalledTimes(1);
    expect(d.checkStore).toHaveBeenCalledWith(opened.connector);
  });

  it("si l'import depuis Chrome échoue : session enregistrée et avertissement", async () => {
    const d = deps({
      importChrome: vi.fn(() => {
        throw new Error("Chrome introuvable sur ce Mac.");
      }),
    });
    const opened = await openAuchan({}, d);
    expect(opened.source).toBe("saved");
    expect(opened.warnings[0]).toContain("Chrome introuvable sur ce Mac.");
  });

  it("importChrome: false n'appelle pas Chrome", async () => {
    const d = deps();
    const opened = await openAuchan({ importChrome: false }, d);
    expect(d.importChrome).not.toHaveBeenCalled();
    expect(opened.source).toBe("saved");
  });

  it("aucun drive visible : NoStoreError", async () => {
    await expect(openAuchan({}, deps({ checkStore: vi.fn(async () => false) }))).rejects.toBeInstanceOf(NoStoreError);
  });

  it("aucune session : l'erreur de session remonte", async () => {
    const d = deps({
      importChrome: vi.fn(() => {
        throw new Error("Aucune session Auchan trouvée dans Chrome");
      }),
      loadSession: vi.fn(() => {
        throw new SessionMissingError("data/auchan-state.json");
      }),
    });
    await expect(openAuchan({}, d)).rejects.toBeInstanceOf(SessionMissingError);
  });
});
```

- [ ] **Step 6 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/auchan/open.test.ts`
Expected : FAIL (`Cannot find module './open'`).

- [ ] **Step 7 : Implémenter `src/lib/auchan/open.ts`**

```ts
import type { StoreConnector } from "../types";
import { hasStoreSession } from "./check";
import { importChromeSession } from "./chrome-cookies";
import { AuchanConnector } from "./connector";
import { AuchanHttp, RequestGate } from "./http";
import { type AuchanSession, loadSession } from "./session";

export class NoStoreError extends Error {
  constructor() {
    super("Auchan ne voit aucun drive : dans Chrome, connecte-toi sur auchan.fr et choisis ton drive, puis réessaie.");
    this.name = "NoStoreError";
  }
}

export interface OpenAuchanDeps {
  importChrome(): { profile: string; cookies: number };
  loadSession(): AuchanSession;
  makeConnector(session: AuchanSession): StoreConnector;
  checkStore(connector: StoreConnector): Promise<boolean>;
}

export interface OpenedStore {
  connector: StoreConnector;
  source: "chrome" | "saved";
  warnings: string[];
}

const globalForGate = globalThis as typeof globalThis & { __myfreshAuchanGate?: RequestGate };

/** Une seule porte pour tout le processus : au plus une requête toutes les 350 ms vers auchan.fr. */
export function sharedGate(): RequestGate {
  globalForGate.__myfreshAuchanGate ??= new RequestGate();
  return globalForGate.__myfreshAuchanGate;
}

export const defaultOpenDeps: OpenAuchanDeps = {
  importChrome: () => importChromeSession(),
  loadSession: () => loadSession(),
  makeConnector: (session) => new AuchanConnector(new AuchanHttp(session, { gate: sharedGate() }), session),
  checkStore: (connector) => hasStoreSession(connector),
};

/** Reprend la session du Chrome habituel (repli sur la session enregistrée), puis vérifie qu'un drive est visible. */
export async function openAuchan(
  opts: { importChrome?: boolean } = {},
  deps: OpenAuchanDeps = defaultOpenDeps,
): Promise<OpenedStore> {
  const warnings: string[] = [];
  let source: OpenedStore["source"] = "saved";
  if (opts.importChrome ?? true) {
    try {
      deps.importChrome();
      source = "chrome";
    } catch (e) {
      warnings.push(`Import depuis Chrome impossible (${(e as Error).message}) : session enregistrée utilisée.`);
    }
  }
  const session = deps.loadSession();
  const connector = deps.makeConnector(session);
  if (!(await deps.checkStore(connector))) throw new NoStoreError();
  return { connector, source, warnings };
}
```

- [ ] **Step 8 : Test du contexte en cache**

`src/lib/context/cache.test.ts` :

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeProduct } from "../../../tests/helpers/factories";
import { FakeConnector } from "../../../tests/helpers/fake-connector";
import { loadWeeklyContext, readCachedContext } from "./cache";

let dir: string;
let cachePath: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "myfresh-ctx-"));
  cachePath = path.join(dir, "cache", "context.json");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const now = new Date("2026-10-20T08:00:00.000Z");
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);
const withPromos = () =>
  new FakeConnector({}, { promos: [makeProduct({ name: "Potimarron" })], antiGaspi: [], themes: ["Asie"] });

describe("loadWeeklyContext", () => {
  it("construit le contexte et l'écrit en cache", async () => {
    const ctx = await loadWeeklyContext(withPromos(), { cachePath, now });
    expect(ctx.promos).toHaveLength(1);
    expect(ctx.themes).toEqual(["Asie"]);
    expect(JSON.parse(fs.readFileSync(cachePath, "utf8")).generatedAt).toBe(now.toISOString());
  });

  it("réutilise un cache de moins de 24 h sans appeler Auchan", async () => {
    await loadWeeklyContext(withPromos(), { cachePath, now });
    const connector = withPromos();
    const spy = vi.spyOn(connector, "getStoreContext");
    const ctx = await loadWeeklyContext(connector, { cachePath, now: hours(2) });
    expect(spy).not.toHaveBeenCalled();
    expect(ctx.generatedAt).toBe(now.toISOString());
  });

  it("reconstruit un cache de plus de 24 h ou illisible", async () => {
    await loadWeeklyContext(withPromos(), { cachePath, now });
    const connector = withPromos();
    const spy = vi.spyOn(connector, "getStoreContext");
    await loadWeeklyContext(connector, { cachePath, now: hours(25) });
    fs.writeFileSync(cachePath, "{oups");
    await loadWeeklyContext(connector, { cachePath, now: hours(26) });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("ne met pas en cache un contexte sans promo (session probablement expirée)", async () => {
    await loadWeeklyContext(new FakeConnector({}), { cachePath, now });
    expect(fs.existsSync(cachePath)).toBe(false);
  });
});

describe("readCachedContext", () => {
  it("null sans fichier", () => {
    expect(readCachedContext(cachePath, now.getTime())).toBeNull();
  });
});
```

- [ ] **Step 9 : Implémenter `src/lib/context/cache.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import type { StoreConnector } from "../types";
import { buildWeeklyContext, isCacheableContext, type WeeklyContext } from "./build";

export const CONTEXT_CACHE = "data/cache/context.json";
const DAY_MS = 86_400_000;

/** Contexte en cache s'il a moins de 24 h et contient des promos ; sinon null. */
export function readCachedContext(cachePath: string = CONTEXT_CACHE, nowMs: number = Date.now()): WeeklyContext | null {
  if (!fs.existsSync(cachePath)) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8")) as WeeklyContext;
    const age = nowMs - Date.parse(cached.generatedAt);
    return age >= 0 && age < DAY_MS && isCacheableContext(cached) ? cached : null;
  } catch {
    return null;
  }
}

export async function loadWeeklyContext(
  connector: StoreConnector,
  opts: { cachePath?: string; now?: Date } = {},
): Promise<WeeklyContext> {
  const cachePath = opts.cachePath ?? CONTEXT_CACHE;
  const now = opts.now ?? new Date();
  const cached = readCachedContext(cachePath, now.getTime());
  if (cached) return cached;
  const ctx = await buildWeeklyContext(connector, now);
  if (isCacheableContext(ctx)) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(ctx));
  }
  return ctx;
}
```

- [ ] **Step 10 : Lancer les tests**

Run : `npm test && npx tsc --noEmit`
Expected : PASS, aucune erreur de type.

- [ ] **Step 11 : Commit**

```bash
git add src/lib/auchan src/lib/context
git commit -m "feat(auchan): ouverture de session partagée, débit global et contexte en cache" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7 : Économies promo, éditions de la semaine et totaux en direct

**Files:**
- Create: `src/lib/budget/promo.ts`, `src/lib/budget/promo.test.ts`, `src/lib/week/edit.ts`, `src/lib/week/edit.test.ts`

**Interfaces:**
- Consumes : `computeBasket`, `Basket`, `BasketLine` (`budget/basket.ts`) ; `IngredientMatch` ; `MatchCandidate` ; `Week`, `WeekOverrides` (Task 1) ; `normalizeText` ; `parseFrNumber`, `round2`.
- Produces :
  - `promoEffect(label: string, unitPrice: number, packs: number): { saved: number; loyalty: number }` ;
  - `class EditError extends Error` ;
  - `effectiveMatches(week: Pick<Week, "matches" | "overrides">): IngredientMatch[]` ;
  - `interface WeekTotals { basket: Basket; gross: number; promoSaved: number; loyalty: number; net: number; budget: number; remaining: number; overBudget: boolean }` et `weekTotals(week: Week): WeekTotals` (`net = gross − promoSaved`, comparé au budget ; la cagnotte est affichée à part) ;
  - `toggleRecipe(week, recipeId, selected: boolean): Week`, `chooseProduct(week, key, productId): Week`, `setPantry(week, key, inPantry: boolean): Week` (renvoient une nouvelle semaine, lèvent `EditError`) ;
  - `interface ProductRow { key: string; name: string; quantity: number; unit: QtyUnit; inPantry: boolean; pantryStaple: boolean; chosen: MatchCandidate | null; options: MatchCandidate[]; line: BasketLine | null }` et `productRows(week: Week): ProductRow[]` ;
  - `initialOverrides(matches: IngredientMatch[], includePantryStaples?: boolean): WeekOverrides` ;
  - `reconcileOverrides(overrides: WeekOverrides, oldMatches: IngredientMatch[], newMatches: IngredientMatch[], rematchedKeys: Set<string>): WeekOverrides`.

Libellés promo réels relevés dans `data/cache/context.json` : « -60% sur le 2ème », « -0,87 € sur le 3ème », « 3 achetés = 2 payés », « 40 % cagnottés sur le 2ème », « 10% Jour W! cagnottés », « Prix Choc » (plusieurs libellés sont joints par « · »). Le prix affiché par Auchan est le prix en rayon : les remises « sur le Nème » et « N achetés = M payés » ne s'appliquent qu'à partir de N paquets.

- [ ] **Step 1 : Test de `promoEffect`**

`src/lib/budget/promo.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { promoEffect } from "./promo";

describe("promoEffect", () => {
  it("-X% sur le Nème : remise sur chaque Nème paquet", () => {
    expect(promoEffect("-60% sur le 2ème", 2, 3)).toEqual({ saved: 1.2, loyalty: 0 });
    expect(promoEffect("-60% sur le 2ème", 2, 1)).toEqual({ saved: 0, loyalty: 0 });
  });

  it("-X € sur le Nème", () => {
    expect(promoEffect("-0,87 € sur le 3ème", 1.5, 3)).toEqual({ saved: 0.87, loyalty: 0 });
  });

  it("N achetés = M payés", () => {
    expect(promoEffect("3 achetés = 2 payés", 1.5, 3)).toEqual({ saved: 1.5, loyalty: 0 });
    expect(promoEffect("3 achetés = 2 payés", 1.5, 2).saved).toBe(0);
  });

  it("cagnotte sur le Nème, cagnotte simple et libellés combinés", () => {
    expect(promoEffect("40 % cagnottés sur le 2ème", 3, 2)).toEqual({ saved: 0, loyalty: 1.2 });
    expect(promoEffect("Prix Choc · 10% Jour W! cagnottés", 4, 2)).toEqual({ saved: 0, loyalty: 0.8 });
  });

  it("libellé sans montant calculable : aucun effet", () => {
    expect(promoEffect("Prix Choc", 3, 2)).toEqual({ saved: 0, loyalty: 0 });
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/budget/promo.test.ts`
Expected : FAIL (`Cannot find module './promo'`).

- [ ] **Step 3 : Implémenter `src/lib/budget/promo.ts`**

```ts
import { normalizeText } from "../text";
import { parseFrNumber, round2 } from "../units";

export interface PromoEffect {
  /** remise immédiate en € */
  saved: number;
  /** montant cagnotté sur la carte Waaoh, en € */
  loyalty: number;
}

const NUM = "(\\d+(?:[.,]\\d+)?)";
const NTH = "sur le (\\d+)\\s*e(?:me)?\\b";
const PERCENT_ON_NTH = new RegExp(`^-\\s*${NUM}\\s*%\\s*${NTH}`);
const EUROS_ON_NTH = new RegExp(`^-\\s*${NUM}\\s*€\\s*${NTH}`);
const BUY_N_PAY_M = /(\d+)\s*achetes?\s*=\s*(\d+)\s*payes?/;
const LOYALTY_ON_NTH = new RegExp(`${NUM}\\s*%.*cagnott\\w*\\s*${NTH}`);
const LOYALTY = new RegExp(`${NUM}\\s*%.*cagnott`);

/** Effet d'un libellé promo Auchan pour `packs` paquets au prix unitaire `unitPrice`. */
export function promoEffect(label: string, unitPrice: number, packs: number): PromoEffect {
  let saved = 0;
  let loyalty = 0;
  for (const part of label.split("·").map((p) => normalizeText(p))) {
    let m: RegExpMatchArray | null;
    if ((m = part.match(PERCENT_ON_NTH))) {
      saved += Math.floor(packs / Number(m[2])) * unitPrice * (parseFrNumber(m[1]) / 100);
    } else if ((m = part.match(EUROS_ON_NTH))) {
      saved += Math.floor(packs / Number(m[2])) * parseFrNumber(m[1]);
    } else if ((m = part.match(BUY_N_PAY_M))) {
      const bought = Number(m[1]);
      const paid = Number(m[2]);
      if (bought > paid) saved += Math.floor(packs / bought) * (bought - paid) * unitPrice;
    } else if ((m = part.match(LOYALTY_ON_NTH))) {
      loyalty += Math.floor(packs / Number(m[2])) * unitPrice * (parseFrNumber(m[1]) / 100);
    } else if ((m = part.match(LOYALTY))) {
      loyalty += packs * unitPrice * (parseFrNumber(m[1]) / 100);
    }
  }
  return { saved: round2(saved), loyalty: round2(loyalty) };
}
```

- [ ] **Step 4 : Lancer**

Run : `npx vitest run src/lib/budget/promo.test.ts`
Expected : PASS.

- [ ] **Step 5 : Test des éditions et des totaux**

`src/lib/week/edit.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { makeMatch, makeNeed, makeProduct, makeRecipe, makeWeek } from "../../../tests/helpers/factories";
import type { Week } from "../store/weeks";
import {
  chooseProduct,
  EditError,
  effectiveMatches,
  initialOverrides,
  productRows,
  reconcileOverrides,
  setPantry,
  toggleRecipe,
  weekTotals,
} from "./edit";

const tomates = makeProduct({ name: "Tomates", price: 2, pack: { value: 500, unit: "g" } });
const tomatesBio = makeProduct({ name: "Tomates bio", price: 3, pack: { value: 500, unit: "g" }, isOrganic: true });
const pates = makeProduct({
  name: "Pâtes",
  price: 1,
  pack: { value: 500, unit: "g" },
  promo: { label: "-50% sur le 2ème", kind: "price" },
});
const sel = makeProduct({ name: "Sel", price: 0.5, pack: { value: 1000, unit: "g" } });

function week(overrides: Partial<Week> = {}): Week {
  return makeWeek({
    brief: { dinners: 2, adults: 2, children: 0, budgetEur: 5, filters: [], notes: "", preferOrganic: false },
    recipes: [makeRecipe({ id: "a" }), makeRecipe({ id: "b" }), makeRecipe({ id: "c" })],
    selectedRecipeIds: ["a", "b"],
    matches: [
      makeMatch(makeNeed({ key: "tomates|g", perRecipe: { a: 400, c: 200 } }), tomates, [tomatesBio]),
      makeMatch(makeNeed({ key: "pates|g", perRecipe: { a: 500, b: 500 } }), pates),
      makeMatch(makeNeed({ key: "sel|g", perRecipe: { a: 5 }, pantryStaple: true }), sel),
    ],
    overrides: { products: {}, pantry: ["sel|g"] },
    ...overrides,
  });
}

describe("weekTotals", () => {
  it("total des recettes retenues, placard exclu, économies promo déduites", () => {
    const t = weekTotals(week());
    expect(t.basket.lines.map((l) => [l.key, l.packs])).toEqual([
      ["tomates|g", 1],
      ["pates|g", 2],
    ]);
    expect(t).toMatchObject({ gross: 4, promoSaved: 0.5, loyalty: 0, net: 3.5, budget: 5, remaining: 1.5, overBudget: false });
  });

  it("au-dessus du budget", () => {
    const w = week();
    const t = weekTotals({ ...w, brief: { ...w.brief, budgetEur: 3 } });
    expect(t).toMatchObject({ net: 3.5, remaining: -0.5, overBudget: true });
  });
});

describe("chooseProduct / effectiveMatches", () => {
  it("remplace le produit choisi et recalcule le total", () => {
    const w = chooseProduct(week(), "tomates|g", tomatesBio.productId);
    expect(w.overrides.products).toEqual({ "tomates|g": tomatesBio.productId });
    const [m] = effectiveMatches(w);
    expect(m.chosen?.product).toBe(tomatesBio);
    expect(m.alternatives.map((a) => a.product)).toEqual([tomates]);
    expect(weekTotals(w).gross).toBe(5);
  });

  it("revenir au produit proposé efface le choix", () => {
    const w = chooseProduct(chooseProduct(week(), "tomates|g", tomatesBio.productId), "tomates|g", tomates.productId);
    expect(w.overrides.products).toEqual({});
  });

  it("refuse un produit qui n'est pas un candidat, ou un ingrédient inconnu", () => {
    expect(() => chooseProduct(week(), "tomates|g", "p-inconnu")).toThrow(EditError);
    expect(() => chooseProduct(week(), "truffe|g", tomates.productId)).toThrow(EditError);
  });
});

describe("setPantry", () => {
  it("décocher « au placard » remet l'ingrédient dans le panier", () => {
    expect(weekTotals(setPantry(week(), "sel|g", false)).gross).toBe(4.5);
    expect(setPantry(week(), "tomates|g", true).overrides.pantry).toEqual(["sel|g", "tomates|g"]);
  });

  it("refuse un ingrédient inconnu", () => {
    expect(() => setPantry(week(), "truffe|g", true)).toThrow(EditError);
  });
});

describe("toggleRecipe", () => {
  it("au plus N recettes, dans l'ordre du menu", () => {
    expect(() => toggleRecipe(week(), "c", true)).toThrow(/déjà choisi 2 recettes/);
    const w = toggleRecipe(toggleRecipe(week(), "a", false), "c", true);
    expect(w.selectedRecipeIds).toEqual(["b", "c"]);
    expect(() => toggleRecipe(w, "a", true)).toThrow(EditError);
    expect(toggleRecipe(toggleRecipe(w, "c", false), "a", true).selectedRecipeIds).toEqual(["a", "b"]);
  });

  it("refuse une recette inconnue", () => {
    expect(() => toggleRecipe(week(), "zzz", true)).toThrow(EditError);
  });
});

describe("productRows", () => {
  it("un ingrédient par ligne pour les recettes retenues, placard compris", () => {
    const rows = productRows(week());
    expect(rows.map((r) => [r.key, r.quantity, r.inPantry, r.line?.packs ?? null])).toEqual([
      ["tomates|g", 400, false, 1],
      ["pates|g", 1000, false, 2],
      ["sel|g", 5, true, null],
    ]);
    expect(rows[0].options.map((o) => o.product)).toEqual([tomates, tomatesBio]);
  });
});

describe("initialOverrides / reconcileOverrides", () => {
  it("les basiques de placard sont cochés au départ, sauf si on les inclut", () => {
    expect(initialOverrides(week().matches)).toEqual({ products: {}, pantry: ["sel|g"] });
    expect(initialOverrides(week().matches, true)).toEqual({ products: {}, pantry: [] });
  });

  it("garde les choix encore valides, oublie ceux des ingrédients recherchés à nouveau, coche les nouveaux basiques", () => {
    const old = week().matches;
    const next = [old[0], old[1], makeMatch(makeNeed({ key: "huile|ml", pantryStaple: true }), makeProduct())];
    const r = reconcileOverrides(
      { products: { "tomates|g": tomatesBio.productId, "pates|g": "p-x" }, pantry: ["sel|g"] },
      old,
      next,
      new Set(["pates|g", "huile|ml"]),
    );
    expect(r).toEqual({ products: { "tomates|g": tomatesBio.productId }, pantry: ["huile|ml"] });
  });
});
```

- [ ] **Step 6 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/week`
Expected : FAIL (`Cannot find module './edit'`).

- [ ] **Step 7 : Implémenter `src/lib/week/edit.ts`**

```ts
import { type Basket, type BasketLine, computeBasket } from "../budget/basket";
import { promoEffect } from "../budget/promo";
import type { IngredientMatch } from "../matching/match";
import type { MatchCandidate } from "../matching/score";
import type { Week, WeekOverrides } from "../store/weeks";
import type { QtyUnit } from "../types";
import { round2 } from "../units";

export class EditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditError";
  }
}

/** Correspondances avec les produits choisis par l'utilisateur à la place des produits proposés. */
export function effectiveMatches(week: Pick<Week, "matches" | "overrides">): IngredientMatch[] {
  return week.matches.map((m) => {
    const wanted = week.overrides.products[m.need.key];
    if (!wanted || m.chosen?.product.productId === wanted) return m;
    const alt = m.alternatives.find((a) => a.product.productId === wanted);
    if (!alt) return m;
    return {
      need: m.need,
      chosen: alt,
      alternatives: [...(m.chosen ? [m.chosen] : []), ...m.alternatives.filter((a) => a !== alt)],
    };
  });
}

export interface WeekTotals {
  basket: Basket;
  /** total au prix en rayon */
  gross: number;
  /** remises immédiates des promos */
  promoSaved: number;
  /** montant cagnotté (carte Waaoh), non déduit */
  loyalty: number;
  /** total estimé, comparé au budget */
  net: number;
  budget: number;
  remaining: number;
  overBudget: boolean;
}

export function weekTotals(week: Week): WeekTotals {
  const basket = computeBasket(effectiveMatches(week), week.selectedRecipeIds, new Set(week.overrides.pantry));
  let saved = 0;
  let loyalty = 0;
  for (const line of basket.lines) {
    if (!line.product.promo) continue;
    const effect = promoEffect(line.product.promo.label, line.product.price, line.packs);
    saved += effect.saved;
    loyalty += effect.loyalty;
  }
  const net = round2(basket.total - saved);
  const budget = week.brief.budgetEur;
  return {
    basket,
    gross: basket.total,
    promoSaved: round2(saved),
    loyalty: round2(loyalty),
    net,
    budget,
    remaining: round2(budget - net),
    overBudget: net > budget,
  };
}

export function toggleRecipe(week: Week, recipeId: string, selected: boolean): Week {
  if (!week.recipes.some((r) => r.id === recipeId)) throw new EditError("Recette inconnue.");
  const ids = new Set(week.selectedRecipeIds.filter((id) => id !== recipeId));
  if (selected) {
    if (ids.size >= week.brief.dinners) {
      throw new EditError(`Tu as déjà choisi ${week.brief.dinners} recettes : décoches-en une d'abord.`);
    }
    ids.add(recipeId);
  }
  return { ...week, selectedRecipeIds: week.recipes.map((r) => r.id).filter((id) => ids.has(id)) };
}

function findMatch(week: Week, key: string): IngredientMatch {
  const m = week.matches.find((x) => x.need.key === key);
  if (!m) throw new EditError("Ingrédient inconnu.");
  return m;
}

export function chooseProduct(week: Week, key: string, productId: string): Week {
  const m = findMatch(week, key);
  const candidates = [...(m.chosen ? [m.chosen] : []), ...m.alternatives];
  if (!candidates.some((c) => c.product.productId === productId)) {
    throw new EditError("Ce produit ne fait pas partie des choix possibles pour cet ingrédient.");
  }
  const products = { ...week.overrides.products };
  if (m.chosen?.product.productId === productId) delete products[key];
  else products[key] = productId;
  return { ...week, overrides: { ...week.overrides, products } };
}

export function setPantry(week: Week, key: string, inPantry: boolean): Week {
  findMatch(week, key);
  const pantry = week.overrides.pantry.filter((k) => k !== key);
  if (inPantry) pantry.push(key);
  return { ...week, overrides: { ...week.overrides, pantry } };
}

export interface ProductRow {
  key: string;
  name: string;
  quantity: number;
  unit: QtyUnit;
  inPantry: boolean;
  pantryStaple: boolean;
  chosen: MatchCandidate | null;
  /** produit choisi d'abord, puis les autres choix possibles */
  options: MatchCandidate[];
  /** ligne du panier ; null si au placard ou sans produit */
  line: BasketLine | null;
}

export function productRows(week: Week): ProductRow[] {
  const pantry = new Set(week.overrides.pantry);
  const lines = new Map(weekTotals(week).basket.lines.map((l) => [l.key, l]));
  return effectiveMatches(week).flatMap((m) => {
    const quantity = week.selectedRecipeIds.reduce((sum, id) => sum + (m.need.perRecipe[id] ?? 0), 0);
    if (quantity === 0) return [];
    return [
      {
        key: m.need.key,
        name: m.need.name,
        quantity,
        unit: m.need.unit,
        inPantry: pantry.has(m.need.key),
        pantryStaple: m.need.pantryStaple,
        chosen: m.chosen,
        options: [...(m.chosen ? [m.chosen] : []), ...m.alternatives],
        line: lines.get(m.need.key) ?? null,
      },
    ];
  });
}

export function initialOverrides(matches: IngredientMatch[], includePantryStaples = false): WeekOverrides {
  return {
    products: {},
    pantry: includePantryStaples ? [] : matches.filter((m) => m.need.pantryStaple).map((m) => m.need.key),
  };
}

/** Après une modification de recette : garde ce qui reste valable dans les choix de l'utilisateur. */
export function reconcileOverrides(
  overrides: WeekOverrides,
  oldMatches: IngredientMatch[],
  newMatches: IngredientMatch[],
  rematchedKeys: Set<string>,
): WeekOverrides {
  const newKeys = new Set(newMatches.map((m) => m.need.key));
  const oldKeys = new Set(oldMatches.map((m) => m.need.key));
  const products = Object.fromEntries(
    Object.entries(overrides.products).filter(([key]) => newKeys.has(key) && !rematchedKeys.has(key)),
  );
  const pantry = overrides.pantry.filter((key) => newKeys.has(key));
  for (const m of newMatches) {
    if (!oldKeys.has(m.need.key) && m.need.pantryStaple && !pantry.includes(m.need.key)) pantry.push(m.need.key);
  }
  return { products, pantry };
}
```

- [ ] **Step 8 : Lancer les tests**

Run : `npm test && npx tsc --noEmit`
Expected : PASS, aucune erreur de type.

- [ ] **Step 9 : Commit**

```bash
git add src/lib/budget/promo.ts src/lib/budget/promo.test.ts src/lib/week
git commit -m "feat(week): éditions de la semaine, totaux en direct et économies promo" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 8 : Exécuteur de tâches longues (une à la fois)

**Files:**
- Create: `src/lib/jobs/runner.ts`, `src/lib/jobs/runner.test.ts`

**Interfaces:**
- Consumes : `JobKind`, `JobState`, `Week` (Task 1).
- Produces :
  - `interface JobContext { step(label: string): void; progress(done: number, total: number): void }` ;
  - `class JobBusyError extends Error { current: JobState }` ;
  - `class JobRunner { constructor(opts?: { onUpdate?: (s: JobState) => void; now?: () => Date }); current(): JobState | null; isBusy(): boolean; start(weekId: string, kind: JobKind, fn: (job: JobContext) => Promise<void>): JobState; idle(): Promise<void> }` — `onUpdate` reçoit une copie de l'état à chaque changement (démarrage, étape, progression, fin) ; `start` lève `JobBusyError` si une tâche tourne ;
  - `reconcileStaleJob(week: Week, current: JobState | null, now?: Date): Week` — une tâche « running » dans le fichier que l'exécuteur ne connaît pas (serveur redémarré) passe en erreur, et la semaine en préparation repasse en brouillon.

- [ ] **Step 1 : Écrire le test qui échoue**

`src/lib/jobs/runner.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { makeWeek } from "../../../tests/helpers/factories";
import type { JobState } from "../store/weeks";
import { JobBusyError, JobRunner, reconcileStaleJob } from "./runner";

const fixedNow = () => new Date("2026-09-23T10:00:00.000Z");

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("JobRunner", () => {
  it("publie démarrage, étapes, progression puis fin", async () => {
    const updates: JobState[] = [];
    const runner = new JobRunner({ onUpdate: (s) => updates.push(s), now: fixedNow });
    const started = runner.start("2026-09-23-1", "create", async (job) => {
      job.step("Contexte de la semaine");
      job.progress(1, 3);
    });
    expect(started).toMatchObject({ weekId: "2026-09-23-1", kind: "create", status: "running" });
    await runner.idle();
    expect(updates.map((u) => [u.status, u.step, u.progress])).toEqual([
      ["running", "Démarrage", null],
      ["running", "Contexte de la semaine", null],
      ["running", "Contexte de la semaine", { done: 1, total: 3 }],
      ["done", "Terminé", null],
    ]);
    expect(runner.current()).toMatchObject({ status: "done", error: null, finishedAt: "2026-09-23T10:00:00.000Z" });
  });

  it("garde le message d'erreur et l'étape où la tâche a échoué", async () => {
    const runner = new JobRunner({ now: fixedNow });
    runner.start("2026-09-23-1", "create", async (job) => {
      job.step("Connexion à Auchan");
      throw new Error("Auchan ne voit aucun drive");
    });
    await runner.idle();
    expect(runner.current()).toMatchObject({ status: "error", step: "Connexion à Auchan", error: "Auchan ne voit aucun drive" });
  });

  it("une seule tâche à la fois", async () => {
    const runner = new JobRunner();
    const gate = deferred();
    runner.start("2026-09-23-1", "create", () => gate.promise);
    expect(runner.isBusy()).toBe(true);
    expect(() => runner.start("2026-09-23-2", "push", async () => {})).toThrow(JobBusyError);
    gate.resolve();
    await runner.idle();
    expect(runner.isBusy()).toBe(false);
    expect(() => runner.start("2026-09-23-2", "push", async () => {})).not.toThrow();
    await runner.idle();
  });

  it("une erreur dans onUpdate n'interrompt pas la tâche", async () => {
    const runner = new JobRunner({
      onUpdate: () => {
        throw new Error("disque plein");
      },
    });
    runner.start("2026-09-23-1", "push", async () => {});
    await runner.idle();
    expect(runner.current()?.status).toBe("done");
  });
});

describe("reconcileStaleJob", () => {
  const running: JobState = {
    weekId: "2026-09-23-1",
    kind: "create",
    status: "running",
    step: "Génération des recettes",
    progress: null,
    error: null,
    startedAt: "2026-09-23T09:00:00.000Z",
    finishedAt: null,
  };

  it("tâche inconnue de l'exécuteur : erreur « interrompue » et retour au brouillon", () => {
    const week = reconcileStaleJob(makeWeek({ status: "generating", job: running }), null, fixedNow());
    expect(week.status).toBe("draft");
    expect(week.job).toMatchObject({ status: "error", finishedAt: "2026-09-23T10:00:00.000Z" });
    expect(week.job?.error).toMatch(/interrompue/);
  });

  it("une modification de recette interrompue laisse la semaine prête", () => {
    const week = reconcileStaleJob(makeWeek({ status: "ready", job: { ...running, kind: "revise-recipe" } }), null);
    expect(week.status).toBe("ready");
    expect(week.job?.status).toBe("error");
  });

  it("tâche réellement en cours, ou déjà terminée : semaine inchangée", () => {
    const week = makeWeek({ status: "generating", job: running });
    expect(reconcileStaleJob(week, running)).toBe(week);
    const done = makeWeek({ job: { ...running, status: "done" } });
    expect(reconcileStaleJob(done, null)).toBe(done);
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/jobs`
Expected : FAIL (`Cannot find module './runner'`).

- [ ] **Step 3 : Implémenter `src/lib/jobs/runner.ts`**

```ts
import type { JobKind, JobState, Week } from "../store/weeks";

export interface JobContext {
  step(label: string): void;
  progress(done: number, total: number): void;
}

export class JobBusyError extends Error {
  constructor(public readonly current: JobState) {
    super("Une tâche est déjà en cours : attends qu'elle se termine.");
    this.name = "JobBusyError";
  }
}

/** Exécute une tâche longue à la fois dans le processus serveur ; l'état est publié via onUpdate. */
export class JobRunner {
  private state: JobState | null = null;
  private running: Promise<void> = Promise.resolve();

  constructor(private readonly opts: { onUpdate?: (state: JobState) => void; now?: () => Date } = {}) {}

  private now(): string {
    return (this.opts.now ?? (() => new Date()))().toISOString();
  }

  current(): JobState | null {
    return this.state ? { ...this.state } : null;
  }

  isBusy(): boolean {
    return this.state?.status === "running";
  }

  start(weekId: string, kind: JobKind, fn: (job: JobContext) => Promise<void>): JobState {
    if (this.state?.status === "running") throw new JobBusyError({ ...this.state });
    const state: JobState = {
      weekId,
      kind,
      status: "running",
      step: "Démarrage",
      progress: null,
      error: null,
      startedAt: this.now(),
      finishedAt: null,
    };
    this.state = state;
    const emit = () => {
      try {
        this.opts.onUpdate?.({ ...state });
      } catch (e) {
        console.error(`MyFresh : état de la tâche non enregistré (${(e as Error).message})`);
      }
    };
    emit();
    const job: JobContext = {
      step: (label) => {
        state.step = label;
        state.progress = null;
        emit();
      },
      progress: (done, total) => {
        state.progress = { done, total };
        emit();
      },
    };
    this.running = (async () => {
      try {
        await fn(job);
        state.status = "done";
        state.step = "Terminé";
      } catch (e) {
        state.status = "error";
        state.error = e instanceof Error ? e.message : String(e);
      }
      state.progress = null;
      state.finishedAt = this.now();
      emit();
    })();
    return { ...state };
  }

  /** Attend la fin de la tâche en cours (utile aux tests et au CLI). */
  idle(): Promise<void> {
    return this.running;
  }
}

/** Une tâche « running » dans le fichier, inconnue de l'exécuteur (serveur redémarré), passe en erreur. */
export function reconcileStaleJob(week: Week, current: JobState | null, now: Date = new Date()): Week {
  const job = week.job;
  if (!job || job.status !== "running") return week;
  const alive =
    current?.status === "running" && current.weekId === week.id && current.startedAt === job.startedAt;
  if (alive) return week;
  return {
    ...week,
    status: week.status === "generating" ? "draft" : week.status,
    job: {
      ...job,
      status: "error",
      error: "Tâche interrompue (le serveur a redémarré). Relance-la.",
      finishedAt: now.toISOString(),
    },
  };
}
```

- [ ] **Step 4 : Lancer les tests**

Run : `npx vitest run src/lib/jobs && npx tsc --noEmit`
Expected : PASS (le `console.error` du test « disque plein » s'affiche, c'est voulu).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/jobs
git commit -m "feat(jobs): exécuteur de tâches longues, une à la fois, et reprise après redémarrage" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9 : Workflows — préparer la semaine et modifier une recette

**Files:**
- Create: `src/lib/week/workflows.ts`, `src/lib/week/workflows.test.ts`

**Interfaces:**
- Consumes : `WeekStore`, `WeekNotFoundError` (Task 1) ; `LlmBackend` (Task 5) ; `JobContext` (Task 8) ; `initialOverrides`, `reconcileOverrides` (Task 7) ; `aggregateNeeds`, `IngredientNeed` ; `matchNeeds`, `IngredientMatch` ; `chooseSelection` ; `summarizeContext`, `WeeklyContext` ; `fetchOffInfo` ; `Brief` ; `Product`, `StoreConnector`.
- Produces :
  - `interface WorkflowDeps { store: WeekStore; backend: LlmBackend; openStore(): Promise<StoreConnector>; loadContext(connector: StoreConnector): Promise<WeeklyContext>; useArbiter?: boolean /* défaut true */; novaLookup?: (connector: StoreConnector) => (p: Product) => Promise<number | null> }` ;
  - `scoreOptions(brief: Brief): ScoreOptions` ; `defaultNovaLookup(connector): (p: Product) => Promise<number | null>` ;
  - `mergeMatches(old: IngredientMatch[], needs: IngredientNeed[], fresh: IngredientMatch[]): IngredientMatch[]` ;
  - `runCreateWeek(weekId: string, deps: WorkflowDeps, job: JobContext, opts?: { includePantryStaples?: boolean }): Promise<void>` — si la semaine a déjà des recettes, elles sont gardées (reprise sans nouvel appel à Claude) ; en cas d'échec, `status` repasse de `generating` à `draft` et l'erreur remonte ;
  - `runReviseRecipe(weekId: string, recipeId: string, instruction: string, deps: WorkflowDeps, job: JobContext): Promise<void>` — remplace la recette (même identifiant) et ne recherche que les produits de ses ingrédients.

Étapes publiées (textes affichés tels quels dans l'interface) : « Connexion à Auchan », « Contexte de la semaine », « Génération des recettes (<label du backend>) », « Choix des produits Auchan », « Vérification des produits par Claude » (quand l'arbitrage est actif, au moment où la dernière recherche se termine), « Modification de « <titre> » (<label>) ».

- [ ] **Step 1 : Écrire le test qui échoue**

`src/lib/week/workflows.test.ts` :

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBackend } from "../../../tests/helpers/fake-backend";
import { makeProduct, makeRecipe } from "../../../tests/helpers/factories";
import { FakeConnector } from "../../../tests/helpers/fake-connector";
import type { WeeklyContext } from "../context/build";
import type { JobContext } from "../jobs/runner";
import type { LlmBackend } from "../llm/backend";
import type { Brief } from "../recipes/brief";
import { WeekStore } from "../store/weeks";
import { chooseProduct } from "./edit";
import { runCreateWeek, runReviseRecipe, type WorkflowDeps } from "./workflows";

const brief: Brief = { dinners: 1, adults: 2, children: 0, budgetEur: 30, filters: [], notes: "", preferOrganic: false };
const ctx: WeeklyContext = {
  generatedAt: "2026-09-23T08:00:00.000Z",
  season: "automne",
  seasonalProduce: [],
  events: [],
  promos: [],
  antiGaspi: [],
  themes: [],
};
const ing = (q: string, quantity: number, pantryStaple = false) => ({
  name: q,
  searchQuery: q,
  quantity,
  unit: "g" as const,
  pantryStaple,
  fromPromo: false,
});
const pack500 = { value: 500, unit: "g" as const };
const tomates = makeProduct({ name: "Tomates", price: 2, pack: pack500 });
const pates = makeProduct({ name: "Pâtes", price: 1, pack: pack500 });
const patesCompletes = makeProduct({ name: "Pâtes complètes", price: 1.5, pack: pack500 });
const riz = makeProduct({ name: "Riz", price: 3, pack: pack500 });
const rizBasmati = makeProduct({ name: "Riz basmati", price: 3.5, pack: pack500 });
const courgette = makeProduct({ name: "Courgette", price: 1, pack: { value: 300, unit: "g" } });
const sel = makeProduct({ name: "Sel", price: 0.5, pack: { value: 1000, unit: "g" } });
const menu = () => [
  makeRecipe({ id: "pates-tomate", ingredients: [ing("tomates", 400), ing("pates", 500), ing("sel", 5, true)] }),
  makeRecipe({ id: "riz-tomate", ingredients: [ing("riz", 1000), ing("tomates", 200)] }),
];

function jobRecorder(): JobContext & { steps: string[] } {
  const steps: string[] = [];
  return {
    steps,
    step: (label) => {
      steps.push(label);
    },
    progress: () => {},
  };
}

let dir: string;
let store: WeekStore;
let connector: FakeConnector;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "myfresh-wf-"));
  store = new WeekStore(dir);
  connector = new FakeConnector({
    tomates: [tomates],
    pates: [pates, patesCompletes],
    riz: [riz, rizBasmati],
    courgette: [courgette],
    sel: [sel],
  });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function deps(backend: LlmBackend, extra: Partial<WorkflowDeps> = {}): WorkflowDeps {
  return { store, backend, openStore: async () => connector, loadContext: async () => ctx, ...extra };
}

function newWeek(): string {
  const { id } = store.create(brief, new Date(2026, 8, 23, 12));
  store.update(id, (w) => {
    w.status = "generating";
  });
  return id;
}

describe("runCreateWeek", () => {
  it("génère, choisit les produits avec arbitrage et retient les recettes les moins chères", async () => {
    const backend = fakeBackend({ generateMenu: vi.fn(async () => menu()) });
    const id = newWeek();
    const job = jobRecorder();
    await runCreateWeek(id, deps(backend), job);
    const week = store.get(id)!;
    expect(week.status).toBe("ready");
    expect(week.recipes.map((r) => r.id)).toEqual(["pates-tomate", "riz-tomate"]);
    expect(week.selectedRecipeIds).toEqual(["pates-tomate"]);
    expect(week.overrides).toEqual({ products: {}, pantry: ["sel|g"] });
    expect(week.contextSummary).toBe("0 promos · 0 anti-gaspi");
    expect(backend.arbitrate).toHaveBeenCalledTimes(1);
    expect(job.steps).toEqual([
      "Connexion à Auchan",
      "Contexte de la semaine",
      "Génération des recettes (Claude (faux))",
      "Choix des produits Auchan",
      "Vérification des produits par Claude",
    ]);
  });

  it("useArbiter: false : Claude n'arbitre pas les produits", async () => {
    const backend = fakeBackend({ generateMenu: vi.fn(async () => menu()) });
    const id = newWeek();
    await runCreateWeek(id, deps(backend, { useArbiter: false }), jobRecorder());
    expect(backend.arbitrate).not.toHaveBeenCalled();
    expect(store.get(id)!.status).toBe("ready");
  });

  it("reprend sans régénérer quand les recettes sont déjà là", async () => {
    const backend = fakeBackend();
    const id = newWeek();
    store.update(id, (w) => {
      w.recipes = menu();
    });
    await runCreateWeek(id, deps(backend), jobRecorder());
    expect(backend.generateMenu).not.toHaveBeenCalled();
    expect(store.get(id)!.matches).toHaveLength(4);
  });

  it("includePantryStaples : aucun basique n'est mis au placard", async () => {
    const backend = fakeBackend({ generateMenu: vi.fn(async () => menu()) });
    const id = newWeek();
    await runCreateWeek(id, deps(backend), jobRecorder(), { includePantryStaples: true });
    expect(store.get(id)!.overrides.pantry).toEqual([]);
  });

  it("en cas d'échec, la semaine repasse en brouillon et l'erreur remonte", async () => {
    const backend = fakeBackend({
      generateMenu: vi.fn(async () => {
        throw new Error("Claude Code n'a pas répondu en 10 min.");
      }),
    });
    const id = newWeek();
    await expect(runCreateWeek(id, deps(backend), jobRecorder())).rejects.toThrow(/10 min/);
    expect(store.get(id)!.status).toBe("draft");
  });
});

describe("runReviseRecipe", () => {
  it("remplace la recette et ne recherche que ses ingrédients", async () => {
    const revised = makeRecipe({
      id: "riz-tomate",
      title: "Riz aux courgettes",
      ingredients: [ing("riz", 1000), ing("courgette", 300)],
    });
    const backend = fakeBackend({ generateMenu: vi.fn(async () => menu()), reviseRecipe: vi.fn(async () => revised) });
    const id = newWeek();
    await runCreateWeek(id, deps(backend), jobRecorder());
    const created = store.get(id)!;
    store.save(chooseProduct(chooseProduct(created, "pates|g", patesCompletes.productId), "riz|g", rizBasmati.productId));
    connector.searches = [];

    const job = jobRecorder();
    await runReviseRecipe(id, "riz-tomate", "avec des courgettes", deps(backend), job);

    const week = store.get(id)!;
    expect(connector.searches).toEqual(["riz", "courgette"]);
    expect(week.recipes.map((r) => r.title)).toEqual([created.recipes[0].title, "Riz aux courgettes"]);
    expect(week.matches.map((m) => m.need.key)).toEqual(["tomates|g", "pates|g", "sel|g", "riz|g", "courgette|g"]);
    expect(week.matches[0].need.perRecipe).toEqual({ "pates-tomate": 400 });
    expect(week.overrides.products).toEqual({ "pates|g": patesCompletes.productId });
    expect(week.selectedRecipeIds).toEqual(["pates-tomate"]);
    expect(week.status).toBe("ready");
    expect(job.steps).toContain(`Modification de « ${created.recipes[1].title} » (Claude (faux))`);
    expect(backend.reviseRecipe).toHaveBeenCalledWith(
      brief,
      ctx,
      expect.objectContaining({ id: "riz-tomate" }),
      [expect.objectContaining({ id: "pates-tomate" })],
      "avec des courgettes",
    );
  });

  it("recette inconnue : erreur, semaine inchangée", async () => {
    const backend = fakeBackend({ generateMenu: vi.fn(async () => menu()) });
    const id = newWeek();
    await runCreateWeek(id, deps(backend), jobRecorder());
    const before = store.get(id);
    await expect(runReviseRecipe(id, "zzz", "x", deps(backend), jobRecorder())).rejects.toThrow(/Recette introuvable/);
    expect(store.get(id)).toEqual(before);
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/week/workflows.test.ts`
Expected : FAIL (`Cannot find module './workflows'`).

- [ ] **Step 3 : Implémenter `src/lib/week/workflows.ts`**

```ts
import { chooseSelection } from "../budget/basket";
import { summarizeContext, type WeeklyContext } from "../context/build";
import type { JobContext } from "../jobs/runner";
import type { LlmBackend } from "../llm/backend";
import { type IngredientMatch, matchNeeds } from "../matching/match";
import { aggregateNeeds, type IngredientNeed } from "../matching/needs";
import { fetchOffInfo } from "../matching/off";
import type { ScoreOptions } from "../matching/score";
import type { Brief } from "../recipes/brief";
import { WeekNotFoundError, type Week, type WeekStore } from "../store/weeks";
import type { Product, StoreConnector } from "../types";
import { initialOverrides, reconcileOverrides } from "./edit";

export interface WorkflowDeps {
  store: WeekStore;
  backend: LlmBackend;
  /** ouvre la session Auchan (import Chrome + vérification du drive) */
  openStore(): Promise<StoreConnector>;
  loadContext(connector: StoreConnector): Promise<WeeklyContext>;
  /** arbitrage des produits par Claude (défaut : true) */
  useArbiter?: boolean;
  novaLookup?: (connector: StoreConnector) => (p: Product) => Promise<number | null>;
}

export function scoreOptions(brief: Brief): ScoreOptions {
  return { preferOrganic: brief.preferOrganic, unprocessed: brief.filters.includes("unprocessed") };
}

export function defaultNovaLookup(connector: StoreConnector): (p: Product) => Promise<number | null> {
  return async (p) => {
    const { ean } = await connector.getProductDetails(p.url);
    return ean ? (await fetchOffInfo(ean)).nova : null;
  };
}

function requireWeek(deps: Pick<WorkflowDeps, "store">, weekId: string): Week {
  const week = deps.store.get(weekId);
  if (!week) throw new WeekNotFoundError(weekId);
  return week;
}

async function matchFor(
  needs: IngredientNeed[],
  brief: Brief,
  connector: StoreConnector,
  deps: WorkflowDeps,
  job: JobContext,
): Promise<IngredientMatch[]> {
  const arbiter = deps.useArbiter === false ? undefined : deps.backend.arbitrate;
  job.step("Choix des produits Auchan");
  return matchNeeds(needs, scoreOptions(brief), {
    connector,
    arbiter,
    novaLookup: (deps.novaLookup ?? defaultNovaLookup)(connector),
    onProgress: (done, total) => {
      job.progress(done, total);
      if (done === total && arbiter) job.step("Vérification des produits par Claude");
    },
  });
}

/** Correspondances pour les nouveaux besoins : fraîches pour les ingrédients recherchés, anciennes sinon. */
export function mergeMatches(old: IngredientMatch[], needs: IngredientNeed[], fresh: IngredientMatch[]): IngredientMatch[] {
  const freshByKey = new Map(fresh.map((m) => [m.need.key, m]));
  const oldByKey = new Map(old.map((m) => [m.need.key, m]));
  return needs.flatMap((need) => {
    const m = freshByKey.get(need.key) ?? oldByKey.get(need.key);
    return m ? [{ ...m, need }] : [];
  });
}

export async function runCreateWeek(
  weekId: string,
  deps: WorkflowDeps,
  job: JobContext,
  opts: { includePantryStaples?: boolean } = {},
): Promise<void> {
  const week = requireWeek(deps, weekId);
  try {
    job.step("Connexion à Auchan");
    const connector = await deps.openStore();
    job.step("Contexte de la semaine");
    const ctx = await deps.loadContext(connector);
    deps.store.update(weekId, (w) => {
      w.contextSummary = summarizeContext(ctx);
    });

    let recipes = week.recipes;
    if (!recipes.length) {
      job.step(`Génération des recettes (${deps.backend.label})`);
      recipes = await deps.backend.generateMenu(week.brief, ctx);
      // enregistrées tout de suite : une relance après un échec ne rappelle pas Claude
      deps.store.update(weekId, (w) => {
        w.recipes = recipes;
      });
    }

    const matches = await matchFor(aggregateNeeds(recipes), week.brief, connector, deps, job);
    const overrides = initialOverrides(matches, opts.includePantryStaples);
    const selected = chooseSelection(
      recipes.map((r) => r.id),
      matches,
      week.brief.dinners,
      new Set(overrides.pantry),
    );
    deps.store.update(weekId, (w) => {
      w.matches = matches;
      w.overrides = overrides;
      w.selectedRecipeIds = selected;
      w.status = "ready";
    });
  } catch (e) {
    deps.store.update(weekId, (w) => {
      if (w.status === "generating") w.status = "draft";
    });
    throw e;
  }
}

export async function runReviseRecipe(
  weekId: string,
  recipeId: string,
  instruction: string,
  deps: WorkflowDeps,
  job: JobContext,
): Promise<void> {
  const week = requireWeek(deps, weekId);
  const recipe = week.recipes.find((r) => r.id === recipeId);
  if (!recipe) throw new Error("Recette introuvable.");

  job.step("Connexion à Auchan");
  const connector = await deps.openStore();
  job.step("Contexte de la semaine");
  const ctx = await deps.loadContext(connector);
  job.step(`Modification de « ${recipe.title} » (${deps.backend.label})`);
  const others = week.recipes.filter((r) => r.id !== recipeId);
  const revised = { ...(await deps.backend.reviseRecipe(week.brief, ctx, recipe, others, instruction)), id: recipeId };

  const recipes = week.recipes.map((r) => (r.id === recipeId ? revised : r));
  const needs = aggregateNeeds(recipes);
  const rematchKeys = new Set(aggregateNeeds([revised]).map((n) => n.key));
  const fresh = await matchFor(
    needs.filter((n) => rematchKeys.has(n.key)),
    week.brief,
    connector,
    deps,
    job,
  );
  const matches = mergeMatches(week.matches, needs, fresh);

  deps.store.update(weekId, (w) => {
    w.overrides = reconcileOverrides(w.overrides, w.matches, matches, rematchKeys);
    w.recipes = recipes;
    w.matches = matches;
  });
}
```

- [ ] **Step 4 : Lancer les tests**

Run : `npx vitest run src/lib/week && npx tsc --noEmit`
Expected : PASS, aucune erreur de type.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/week/workflows.ts src/lib/week/workflows.test.ts
git commit -m "feat(week): workflows préparation de la semaine et modification d'une recette" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10 : Envoi au panier — aperçu, envoi ligne par ligne, rapport

**Files:**
- Create: `src/lib/cart/push.ts`, `src/lib/cart/push.test.ts`
- Modify: `src/lib/week/workflows.ts`, `src/lib/week/workflows.test.ts`

**Interfaces:**
- Consumes : `mergeBasketIntoCart`, `BasketLine` ; `PushLineReport`, `PushReport` (Task 1) ; `weekTotals` (Task 7) ; `WorkflowDeps`, `JobContext`.
- Produces :
  - `interface PushPreviewRow { productId: string; productName: string; ingredients: string[]; url: string; packs: number; inCart: number; finalQuantity: number; cost: number }` ;
  - `interface PushPreview { rows: PushPreviewRow[]; cartLines: CartLine[]; addedCost: number }` et `previewPush(cart: Cart, lines: BasketLine[]): PushPreview` ;
  - `productLabels(lines: BasketLine[]): Map<string, { name: string; url: string }>` ;
  - `pushLines(connector: Pick<StoreConnector, "setCartQuantities" | "getCart">, lines: CartLine[], labels: Map<string, { name: string; url: string }>, opts?: { onProgress?: (done: number, total: number) => void; now?: Date }): Promise<PushReport>` ;
  - `runPush(weekId: string, deps: Pick<WorkflowDeps, "store" | "openStore">, job: JobContext, now?: () => Date): Promise<void>` — refuse une semaine déjà envoyée ou pas prête, relit le panier au moment de l'envoi, envoie les quantités absolues cumulées, enregistre `pushReport` et passe la semaine à `pushed` (même avec des échecs partiels, pour ne jamais doubler un panier).

- [ ] **Step 1 : Tests de `previewPush` et `pushLines`**

`src/lib/cart/push.test.ts` :

```ts
import { describe, expect, it, vi } from "vitest";
import { makeProduct } from "../../../tests/helpers/factories";
import { FakeConnector } from "../../../tests/helpers/fake-connector";
import type { BasketLine } from "../budget/basket";
import type { Product } from "../types";
import { round2 } from "../units";
import { previewPush, productLabels, pushLines } from "./push";

const line = (key: string, name: string, product: Product, packs: number): BasketLine => ({
  key,
  name,
  product,
  quantityNeeded: 100,
  unit: "g",
  packs,
  cost: round2(packs * product.price),
  uncertainQuantity: false,
});

describe("previewPush", () => {
  it("regroupe par produit et ajoute la quantité déjà présente dans le panier", () => {
    const tomates = makeProduct({ name: "Tomates", brand: "AUCHAN", price: 2 });
    const lines = [line("tomates|g", "tomates", tomates, 1), line("tomates cerises|g", "tomates cerises", tomates, 2)];
    const cart = { id: "c", items: [{ productId: tomates.productId, offerId: tomates.offerId, quantity: 1 }], totalPrice: 2 };
    const p = previewPush(cart, lines);
    expect(p.rows).toEqual([
      {
        productId: tomates.productId,
        productName: "AUCHAN Tomates",
        ingredients: ["tomates", "tomates cerises"],
        url: tomates.url,
        packs: 3,
        inCart: 1,
        finalQuantity: 4,
        cost: 6,
      },
    ]);
    expect(p.cartLines).toEqual([expect.objectContaining({ productId: tomates.productId, quantity: 4 })]);
    expect(p.addedCost).toBe(6);
    expect(productLabels(lines).get(tomates.productId)).toEqual({ name: "AUCHAN Tomates", url: tomates.url });
  });
});

describe("pushLines", () => {
  it("classe chaque ligne : ajoutée, ajustée par Auchan ou en échec", async () => {
    const connector = new FakeConnector({});
    const [a, b, c] = ["a", "b", "c"].map((id) => ({
      productId: id,
      offerId: `o-${id}`,
      sellerId: "s",
      sellerType: "GROCERY",
      quantity: 2,
    }));
    vi.spyOn(connector, "setCartQuantities").mockImplementation(async ([l]) => {
      if (l.productId === "b") return { cart: connector.cart, revised: [{ productId: "b", requested: 2, actual: 1 }] };
      if (l.productId === "c") throw new Error("Auchan a répondu 500 pour /cart/update");
      return { cart: connector.cart, revised: [] };
    });
    const labels = new Map([
      ["a", { name: "Tomates", url: "u-a" }],
      ["b", { name: "Riz", url: "u-b" }],
      ["c", { name: "Sel", url: "u-c" }],
    ]);
    const progress: number[] = [];
    const report = await pushLines(connector, [a, b, c], labels, {
      onProgress: (done) => progress.push(done),
      now: new Date("2026-09-23T18:00:00.000Z"),
    });
    expect(report).toEqual({
      pushedAt: "2026-09-23T18:00:00.000Z",
      added: [{ productId: "a", name: "Tomates", url: "u-a", requested: 2, actual: 2, error: null }],
      adjusted: [{ productId: "b", name: "Riz", url: "u-b", requested: 2, actual: 1, error: null }],
      failed: [{ productId: "c", name: "Sel", url: "u-c", requested: 2, actual: null, error: "Auchan a répondu 500 pour /cart/update" }],
      cartTotal: 0,
    });
    expect(progress).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/cart/push.test.ts`
Expected : FAIL (`Cannot find module './push'`).

- [ ] **Step 3 : Implémenter `src/lib/cart/push.ts`**

```ts
import { type BasketLine, mergeBasketIntoCart } from "../budget/basket";
import type { PushLineReport, PushReport } from "../store/weeks";
import type { Cart, CartLine, StoreConnector } from "../types";
import { round2 } from "../units";

export interface PushPreviewRow {
  productId: string;
  productName: string;
  ingredients: string[];
  url: string;
  /** paquets ajoutés par MyFresh */
  packs: number;
  /** quantité déjà dans le panier Auchan */
  inCart: number;
  /** quantité absolue envoyée à Auchan */
  finalQuantity: number;
  cost: number;
}

export interface PushPreview {
  rows: PushPreviewRow[];
  cartLines: CartLine[];
  addedCost: number;
}

const displayName = (l: BasketLine) => `${l.product.brand ? `${l.product.brand} ` : ""}${l.product.name}`;

export function productLabels(lines: BasketLine[]): Map<string, { name: string; url: string }> {
  return new Map(lines.map((l) => [l.product.productId, { name: displayName(l), url: l.product.url }]));
}

export function previewPush(cart: Cart, lines: BasketLine[]): PushPreview {
  const cartLines = mergeBasketIntoCart(cart, lines);
  const rows = cartLines.map((cl) => {
    const own = lines.filter((l) => l.product.productId === cl.productId);
    const packs = own.reduce((sum, l) => sum + l.packs, 0);
    return {
      productId: cl.productId,
      productName: displayName(own[0]),
      ingredients: own.map((l) => l.name),
      url: own[0].product.url,
      packs,
      inCart: cl.quantity - packs,
      finalQuantity: cl.quantity,
      cost: round2(own.reduce((sum, l) => sum + l.cost, 0)),
    };
  });
  return { rows, cartLines, addedCost: round2(rows.reduce((sum, r) => sum + r.cost, 0)) };
}

/** Envoie les lignes une par une (une erreur n'arrête pas les suivantes) et dresse le rapport. */
export async function pushLines(
  connector: Pick<StoreConnector, "setCartQuantities" | "getCart">,
  lines: CartLine[],
  labels: Map<string, { name: string; url: string }>,
  opts: { onProgress?: (done: number, total: number) => void; now?: Date } = {},
): Promise<PushReport> {
  const added: PushLineReport[] = [];
  const adjusted: PushLineReport[] = [];
  const failed: PushLineReport[] = [];
  for (const [i, line] of lines.entries()) {
    const label = labels.get(line.productId) ?? { name: line.productId, url: "" };
    const base = { productId: line.productId, name: label.name, url: label.url, requested: line.quantity };
    try {
      const { revised } = await connector.setCartQuantities([line]);
      const r = revised.find((x) => x.productId === line.productId);
      if (r) adjusted.push({ ...base, actual: r.actual, error: null });
      else added.push({ ...base, actual: line.quantity, error: null });
    } catch (e) {
      failed.push({ ...base, actual: null, error: (e as Error).message });
    }
    opts.onProgress?.(i + 1, lines.length);
  }
  let cartTotal: number | null = null;
  try {
    cartTotal = (await connector.getCart()).totalPrice;
  } catch {
    cartTotal = null;
  }
  return { pushedAt: (opts.now ?? new Date()).toISOString(), added, adjusted, failed, cartTotal };
}
```

- [ ] **Step 4 : Lancer**

Run : `npx vitest run src/lib/cart`
Expected : PASS.

- [ ] **Step 5 : Test de `runPush`**

Dans `src/lib/week/workflows.test.ts`, remplacer l'import `import { runCreateWeek, runReviseRecipe, type WorkflowDeps } from "./workflows";` par :

```ts
import { runCreateWeek, runPush, runReviseRecipe, type WorkflowDeps } from "./workflows";
```

et ajouter à la fin du fichier :

```ts
describe("runPush", () => {
  it("cumule avec le panier existant, enregistre le rapport et refuse un 2e envoi", async () => {
    const id = newWeek();
    await runCreateWeek(id, deps(fakeBackend({ generateMenu: vi.fn(async () => menu()) })), jobRecorder());
    connector.cart.items = [{ productId: tomates.productId, offerId: tomates.offerId, quantity: 1 }];
    const pushDeps = { store, openStore: async () => connector };

    await runPush(id, pushDeps, jobRecorder(), () => new Date("2026-09-23T18:00:00.000Z"));

    const week = store.get(id)!;
    expect(week.status).toBe("pushed");
    expect(connector.cart.items.find((i) => i.productId === tomates.productId)?.quantity).toBe(2);
    expect(connector.cart.items.find((i) => i.productId === pates.productId)?.quantity).toBe(1);
    expect(week.pushReport).toMatchObject({ pushedAt: "2026-09-23T18:00:00.000Z", adjusted: [], failed: [] });
    expect(week.pushReport?.added.map((l) => l.name)).toEqual(["Tomates", "Pâtes"]);
    await expect(runPush(id, pushDeps, jobRecorder())).rejects.toThrow(/déjà été envoyée/);
    expect(connector.cart.items.find((i) => i.productId === tomates.productId)?.quantity).toBe(2);
  });

  it("refuse un panier vide ou une semaine pas prête", async () => {
    const id = newWeek();
    const pushDeps = { store, openStore: async () => connector };
    await expect(runPush(id, pushDeps, jobRecorder())).rejects.toThrow(/pas prête/);
    store.update(id, (w) => {
      w.status = "ready";
    });
    await expect(runPush(id, pushDeps, jobRecorder())).rejects.toThrow(/Aucun produit/);
  });
});
```

- [ ] **Step 6 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/week/workflows.test.ts`
Expected : FAIL (`runPush` n'est pas exporté).

- [ ] **Step 7 : Ajouter `runPush` à `src/lib/week/workflows.ts`**

Ajouter aux imports :

```ts
import { previewPush, productLabels, pushLines } from "../cart/push";
import { weekTotals } from "./edit";
```

(fusionner `weekTotals` avec l'import existant de `./edit` : `import { initialOverrides, reconcileOverrides, weekTotals } from "./edit";`), puis ajouter à la fin du fichier :

```ts
export async function runPush(
  weekId: string,
  deps: Pick<WorkflowDeps, "store" | "openStore">,
  job: JobContext,
  now: () => Date = () => new Date(),
): Promise<void> {
  const week = requireWeek(deps, weekId);
  if (week.status === "pushed") throw new Error("Cette semaine a déjà été envoyée au panier.");
  if (week.status !== "ready") throw new Error("La semaine n'est pas prête.");
  const { basket } = weekTotals(week);
  if (!basket.lines.length) throw new Error("Aucun produit à envoyer : retiens au moins une recette.");

  job.step("Connexion à Auchan");
  const connector = await deps.openStore();
  job.step("Lecture du panier Auchan");
  const { cartLines } = previewPush(await connector.getCart(), basket.lines);
  job.step("Ajout au panier Auchan");
  const report = await pushLines(connector, cartLines, productLabels(basket.lines), {
    onProgress: (done, total) => job.progress(done, total),
    now: now(),
  });
  deps.store.update(weekId, (w) => {
    w.pushReport = report;
    w.status = "pushed";
  });
}
```

- [ ] **Step 8 : Lancer les tests**

Run : `npm test && npx tsc --noEmit`
Expected : PASS, aucune erreur de type.

- [ ] **Step 9 : Commit**

```bash
git add src/lib/cart/push.ts src/lib/cart/push.test.ts src/lib/week/workflows.ts src/lib/week/workflows.test.ts
git commit -m "feat(cart): aperçu et envoi au panier avec rapport ajoutés / ajustés / échecs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11 : Service applicatif `MyFreshApp` et singleton serveur

**Files:**
- Create: `src/lib/app/service.ts`, `src/lib/app/service.test.ts`, `src/lib/app/instance.ts`, `src/lib/app/action-result.ts`

**Interfaces:**
- Consumes : `WeekStore`, `Week` ; `JobRunner`, `reconcileStaleJob` ; `runCreateWeek`, `runReviseRecipe`, `runPush`, `WorkflowDeps` ; `LlmBackend`, `selectBackend` ; `OpenedStore`, `openAuchan` ; `loadWeeklyContext` ; `Brief` ; `StoreConnector`.
- Produces :
  - `interface SessionStatus { ok: boolean; message: string; checkedAt: string }` ;
  - `interface AppDeps { store: WeekStore; backend: () => LlmBackend; openAuchan: () => Promise<OpenedStore>; loadContext: (c: StoreConnector) => Promise<WeeklyContext>; now?: () => Date }` ;
  - `class ActionError extends Error` ;
  - `class MyFreshApp { readonly store: WeekStore; readonly runner: JobRunner; session: SessionStatus | null; constructor(deps: AppDeps); backendLabel(): string; openStore(): Promise<StoreConnector>; checkSession(): Promise<SessionStatus>; getWeek(id: string): Week | null; listWeeks(): Week[]; startCreateWeek(brief: Brief): Week; retryCreateWeek(id: string): Week; startReviseRecipe(id: string, recipeId: string, instruction: string): void; startPush(id: string): void; edit(id: string, change: (w: Week) => Week): Week }` ;
  - `getApp(): MyFreshApp` (singleton `globalThis`, dépendances réelles) ;
  - `interface ActionResult { error: string | null }`, `OK: ActionResult`, `failure(e: unknown): ActionResult`.

Le service est la seule porte d'entrée des server actions : il refuse une 2e tâche, un 2e envoi, une consigne vide, une édition pendant une tâche sur la même semaine, et répare l'état d'une tâche interrompue à la lecture.

- [ ] **Step 1 : Écrire le test qui échoue**

`src/lib/app/service.test.ts` :

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBackend } from "../../../tests/helpers/fake-backend";
import { makeProduct, makeRecipe, makeWeek } from "../../../tests/helpers/factories";
import { FakeConnector } from "../../../tests/helpers/fake-connector";
import { NoStoreError } from "../auchan/open";
import type { WeeklyContext } from "../context/build";
import type { LlmBackend } from "../llm/backend";
import type { Brief } from "../recipes/brief";
import { WeekStore } from "../store/weeks";
import { ActionError, type AppDeps, MyFreshApp } from "./service";

const brief: Brief = { dinners: 1, adults: 2, children: 0, budgetEur: 30, filters: [], notes: "", preferOrganic: false };
const ctx: WeeklyContext = {
  generatedAt: "2026-09-23T08:00:00.000Z",
  season: "automne",
  seasonalProduce: [],
  events: [],
  promos: [],
  antiGaspi: [],
  themes: [],
};
const ing = (q: string, quantity: number) => ({
  name: q,
  searchQuery: q,
  quantity,
  unit: "g" as const,
  pantryStaple: false,
  fromPromo: false,
});
const recipes = [
  makeRecipe({ id: "pates", ingredients: [ing("pates", 500)] }),
  makeRecipe({ id: "riz", ingredients: [ing("riz", 500)] }),
];

function blocker() {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  return { gate, release };
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "myfresh-app-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function setup(backend: LlmBackend = fakeBackend({ generateMenu: vi.fn(async () => recipes) }), overrides: Partial<AppDeps> = {}) {
  const connector = new FakeConnector({
    pates: [makeProduct({ name: "Pâtes", price: 1, pack: { value: 500, unit: "g" } })],
    riz: [makeProduct({ name: "Riz", price: 2, pack: { value: 500, unit: "g" } })],
  });
  const store = new WeekStore(dir);
  const app = new MyFreshApp({
    store,
    backend: () => backend,
    openAuchan: async () => ({ connector, source: "chrome", warnings: [] }),
    loadContext: async () => ctx,
    now: () => new Date("2026-09-23T10:00:00.000Z"),
    ...overrides,
  });
  return { app, store, connector };
}

describe("MyFreshApp", () => {
  it("startCreateWeek : crée la semaine, suit la tâche et enregistre l'état final", async () => {
    const { app } = setup();
    const week = app.startCreateWeek(brief);
    expect(week.status).toBe("generating");
    expect(week.job).toMatchObject({ kind: "create", status: "running" });
    await app.runner.idle();
    const done = app.getWeek(week.id)!;
    expect(done).toMatchObject({ status: "ready", selectedRecipeIds: ["pates"] });
    expect(done.job).toMatchObject({ status: "done", step: "Terminé" });
    expect(app.session).toMatchObject({ ok: true, message: "Session reprise de Chrome, drive détecté." });
  });

  it("une seule tâche à la fois : la 2e demande échoue sans créer de semaine", async () => {
    const { gate, release } = blocker();
    const { app, store } = setup(
      fakeBackend({
        generateMenu: vi.fn(async () => {
          await gate;
          return recipes;
        }),
      }),
    );
    app.startCreateWeek(brief);
    expect(() => app.startCreateWeek(brief)).toThrow(/déjà en cours/);
    expect(store.list()).toHaveLength(1);
    release();
    await app.runner.idle();
  });

  it("startPush : envoie une fois, puis refuse un 2e envoi", async () => {
    const { app, connector } = setup();
    const { id } = app.startCreateWeek(brief);
    await app.runner.idle();
    app.startPush(id);
    await app.runner.idle();
    expect(app.getWeek(id)?.status).toBe("pushed");
    expect(connector.cart.items).toHaveLength(1);
    expect(() => app.startPush(id)).toThrow(/déjà été envoyée/);
  });

  it("getWeek : une tâche « en cours » inconnue du serveur (redémarrage) passe en erreur, et c'est enregistré", () => {
    const { app, store } = setup();
    store.save(
      makeWeek({
        status: "generating",
        job: {
          weekId: "2026-09-23-1",
          kind: "create",
          status: "running",
          step: "Génération des recettes",
          progress: null,
          error: null,
          startedAt: "2026-09-23T09:00:00.000Z",
          finishedAt: null,
        },
      }),
    );
    const week = app.getWeek("2026-09-23-1")!;
    expect(week.status).toBe("draft");
    expect(week.job?.error).toMatch(/interrompue/);
    expect(store.get("2026-09-23-1")?.status).toBe("draft");
  });

  it("retryCreateWeek relance une semaine en brouillon", async () => {
    const { app, store } = setup();
    store.save(makeWeek({ status: "draft", brief }));
    app.retryCreateWeek("2026-09-23-1");
    await app.runner.idle();
    expect(app.getWeek("2026-09-23-1")?.status).toBe("ready");
    expect(() => app.retryCreateWeek("2026-09-23-1")).toThrow(ActionError);
  });

  it("startReviseRecipe refuse une consigne vide ou une recette inconnue", async () => {
    const { app } = setup();
    const { id } = app.startCreateWeek(brief);
    await app.runner.idle();
    expect(() => app.startReviseRecipe(id, "pates", "   ")).toThrow(/Écris ce que tu veux changer/);
    expect(() => app.startReviseRecipe(id, "zzz", "sans four")).toThrow(/Recette introuvable/);
  });

  it("edit est refusé pendant une tâche sur la même semaine", async () => {
    const { gate, release } = blocker();
    const backend = fakeBackend({
      generateMenu: vi.fn(async () => recipes),
      reviseRecipe: vi.fn<LlmBackend["reviseRecipe"]>(async (_b, _c, recipe) => {
        await gate;
        return recipe;
      }),
    });
    const { app } = setup(backend);
    const { id } = app.startCreateWeek(brief);
    await app.runner.idle();
    app.startReviseRecipe(id, "riz", "sans four");
    expect(() => app.edit(id, (w) => w)).toThrow(/tâche est en cours/);
    release();
    await app.runner.idle();
    expect(() => app.edit(id, (w) => w)).not.toThrow();
  });

  it("checkSession enregistre un échec avec son message", async () => {
    const { app } = setup(undefined, {
      openAuchan: async () => {
        throw new NoStoreError();
      },
    });
    const status = await app.checkSession();
    expect(status.ok).toBe(false);
    expect(status.message).toMatch(/aucun drive/);
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/app`
Expected : FAIL (`Cannot find module './service'`).

- [ ] **Step 3 : Implémenter `src/lib/app/service.ts`**

```ts
import type { OpenedStore } from "../auchan/open";
import type { WeeklyContext } from "../context/build";
import { JobRunner, reconcileStaleJob } from "../jobs/runner";
import type { LlmBackend } from "../llm/backend";
import type { Brief } from "../recipes/brief";
import type { Week, WeekStore } from "../store/weeks";
import type { StoreConnector } from "../types";
import { runCreateWeek, runPush, runReviseRecipe, type WorkflowDeps } from "../week/workflows";

export interface SessionStatus {
  ok: boolean;
  message: string;
  checkedAt: string;
}

export interface AppDeps {
  store: WeekStore;
  backend: () => LlmBackend;
  openAuchan: () => Promise<OpenedStore>;
  loadContext: (connector: StoreConnector) => Promise<WeeklyContext>;
  now?: () => Date;
}

/** Refus d'une action, avec un message à afficher tel quel. */
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

const MAX_INSTRUCTION = 500;

export class MyFreshApp {
  readonly store: WeekStore;
  readonly runner: JobRunner;
  session: SessionStatus | null = null;

  constructor(private readonly deps: AppDeps) {
    this.store = deps.store;
    this.runner = new JobRunner({
      now: deps.now,
      onUpdate: (state) => {
        if (this.store.get(state.weekId)) {
          this.store.update(state.weekId, (w) => {
            w.job = state;
          });
        }
      },
    });
  }

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  backendLabel(): string {
    return this.deps.backend().label;
  }

  /** Ouvre la session Auchan et mémorise son état pour l'accueil. */
  async openStore(): Promise<StoreConnector> {
    const checkedAt = this.now().toISOString();
    try {
      const opened = await this.deps.openAuchan();
      const base = opened.source === "chrome" ? "Session reprise de Chrome, drive détecté." : "Session enregistrée, drive détecté.";
      this.session = { ok: true, message: [base, ...opened.warnings].join(" "), checkedAt };
      return opened.connector;
    } catch (e) {
      this.session = { ok: false, message: (e as Error).message, checkedAt };
      throw e;
    }
  }

  async checkSession(): Promise<SessionStatus> {
    try {
      await this.openStore();
    } catch {
      // l'échec est déjà enregistré dans this.session
    }
    return this.session!;
  }

  private workflowDeps(): WorkflowDeps {
    return {
      store: this.store,
      backend: this.deps.backend(),
      openStore: () => this.openStore(),
      loadContext: this.deps.loadContext,
    };
  }

  private reconcile(week: Week): Week {
    const fixed = reconcileStaleJob(week, this.runner.current(), this.now());
    if (fixed !== week) this.store.save(fixed);
    return fixed;
  }

  getWeek(id: string): Week | null {
    const week = this.store.get(id);
    return week ? this.reconcile(week) : null;
  }

  listWeeks(): Week[] {
    return this.store.list().map((w) => this.reconcile(w));
  }

  private requireWeek(id: string): Week {
    const week = this.getWeek(id);
    if (!week) throw new ActionError("Semaine introuvable.");
    return week;
  }

  private assertIdle(): void {
    const current = this.runner.current();
    if (current?.status === "running") {
      throw new ActionError("Une tâche est déjà en cours : attends qu'elle se termine.");
    }
  }

  private launchCreate(id: string): Week {
    this.store.update(id, (w) => {
      w.status = "generating";
    });
    this.runner.start(id, "create", (job) => runCreateWeek(id, this.workflowDeps(), job));
    return this.store.get(id)!;
  }

  startCreateWeek(brief: Brief): Week {
    this.assertIdle();
    const week = this.store.create(brief, this.now());
    return this.launchCreate(week.id);
  }

  retryCreateWeek(id: string): Week {
    const week = this.requireWeek(id);
    if (week.status !== "draft" && week.status !== "generating") {
      throw new ActionError("Cette semaine est déjà préparée.");
    }
    this.assertIdle();
    return this.launchCreate(id);
  }

  startReviseRecipe(id: string, recipeId: string, instruction: string): void {
    const text = instruction.trim();
    if (!text) throw new ActionError("Écris ce que tu veux changer dans la recette.");
    if (text.length > MAX_INSTRUCTION) throw new ActionError(`Consigne trop longue (${MAX_INSTRUCTION} caractères au maximum).`);
    const week = this.requireWeek(id);
    if (week.status !== "ready" && week.status !== "pushed") throw new ActionError("La semaine n'est pas prête.");
    if (!week.recipes.some((r) => r.id === recipeId)) throw new ActionError("Recette introuvable.");
    this.assertIdle();
    this.runner.start(id, "revise-recipe", (job) => runReviseRecipe(id, recipeId, text, this.workflowDeps(), job));
  }

  startPush(id: string): void {
    const week = this.requireWeek(id);
    if (week.status === "pushed") throw new ActionError("Cette semaine a déjà été envoyée au panier.");
    if (week.status !== "ready") throw new ActionError("La semaine n'est pas prête.");
    this.assertIdle();
    this.runner.start(id, "push", (job) =>
      runPush(id, { store: this.store, openStore: () => this.openStore() }, job, () => this.now()),
    );
  }

  /** Applique une édition (fonction pure de src/lib/week/edit.ts) et l'enregistre. */
  edit(id: string, change: (week: Week) => Week): Week {
    const week = this.requireWeek(id);
    const current = this.runner.current();
    if (current?.status === "running" && current.weekId === id) {
      throw new ActionError("Une tâche est en cours sur cette semaine : attends qu'elle se termine.");
    }
    if (week.status !== "ready" && week.status !== "pushed") throw new ActionError("La semaine n'est pas prête.");
    const next = change(week);
    this.store.save(next);
    return next;
  }
}
```

- [ ] **Step 4 : Lancer les tests**

Run : `npx vitest run src/lib/app`
Expected : PASS.

- [ ] **Step 5 : `src/lib/app/action-result.ts` et `src/lib/app/instance.ts`**

`src/lib/app/action-result.ts` :

```ts
/** Résultat renvoyé par les server actions appelées depuis un composant client. */
export interface ActionResult {
  error: string | null;
}

export const OK: ActionResult = { error: null };

export function failure(e: unknown): ActionResult {
  return { error: e instanceof Error ? e.message : String(e) };
}
```

`src/lib/app/instance.ts` :

```ts
import { openAuchan } from "../auchan/open";
import { loadWeeklyContext } from "../context/cache";
import { selectBackend } from "../llm/backend";
import { WeekStore } from "../store/weeks";
import { MyFreshApp } from "./service";

const globalForApp = globalThis as typeof globalThis & { __myfreshApp?: MyFreshApp };

/**
 * Instance unique pour le processus serveur Next.js (les tâches en cours vivent en mémoire).
 * Rangée dans globalThis pour survivre aux rechargements de modules de `next dev`.
 */
export function getApp(): MyFreshApp {
  globalForApp.__myfreshApp ??= new MyFreshApp({
    store: new WeekStore(),
    backend: () => selectBackend(),
    openAuchan: () => openAuchan(),
    loadContext: (connector) => loadWeeklyContext(connector),
  });
  return globalForApp.__myfreshApp;
}
```

- [ ] **Step 6 : Vérifier**

Run : `npm test && npx tsc --noEmit`
Expected : PASS, aucune erreur de type.

- [ ] **Step 7 : Commit**

```bash
git add src/lib/app
git commit -m "feat(app): service MyFreshApp (garde-fous, tâches) et singleton serveur" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12 : CLI `npm run week` sur les mêmes workflows, arbitrage par défaut

**Files:**
- Modify: `scripts/week.ts` (réécrit), `CLAUDE.md`

**Interfaces:**
- Consumes : `openAuchan` (Task 6), `loadWeeklyContext` (Task 6), `selectBackend` (Task 5), `WeekStore` (Task 1), `runCreateWeek`, `runPush`, `WorkflowDeps` (Tasks 9-10), `weekTotals` (Task 7), `previewPush` (Task 10), `JobContext` (Task 8), `buildRequestDocument`, `parseRecipesFile`, `BriefSchema`, `summarizeContext`.
- Produces : la commande `npm run week` avec les options inchangées `--prepare`, `--from-recipes <fichier>`, `--push`, `--with-pantry`, `--brief <fichier>`, `--no-chrome`, et la nouvelle `--no-arbiter`. La semaine est enregistrée au format `Week` dans `data/weeks/<id>.json`, donc visible dans l'app. Avec `--from-recipes`, aucun appel à Claude pour les recettes, mais l'arbitrage des produits passe par Claude Code (ou l'API si clé) sauf `--no-arbiter`.

- [ ] **Step 1 : Réécrire `scripts/week.ts`**

```ts
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { openAuchan } from "@/lib/auchan/open";
import { previewPush } from "@/lib/cart/push";
import { summarizeContext } from "@/lib/context/build";
import { loadWeeklyContext } from "@/lib/context/cache";
import type { JobContext } from "@/lib/jobs/runner";
import { selectBackend } from "@/lib/llm/backend";
import { type Brief, BriefSchema } from "@/lib/recipes/brief";
import { buildRequestDocument, parseRecipesFile } from "@/lib/recipes/handoff";
import { type Week, WeekStore } from "@/lib/store/weeks";
import { type WeekTotals, weekTotals } from "@/lib/week/edit";
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
      coût: l.cost,
      infos: [l.product.isOrganic && "bio", l.product.promo?.label, l.uncertainQuantity && "⚠ quantité à vérifier"]
        .filter(Boolean)
        .join(" · "),
    })),
  );
  if (totals.basket.missing.length) console.log(`Introuvables : ${totals.basket.missing.join(", ")}`);
  const promo = totals.promoSaved ? ` (dont ${totals.promoSaved} € d'économies promo)` : "";
  const status = totals.overBudget ? "⚠ au-dessus du budget" : "✅";
  console.log(`Total estimé : ${totals.net} € / budget ${totals.budget} €${promo} ${status}`);
  return totals;
}

async function main() {
  const brief = loadBrief(argValue("--brief") ?? "data/brief.json");
  const recipesFile = argValue("--from-recipes");
  const today = new Date().toISOString().slice(0, 10);

  const opened = await openAuchan({ importChrome: !has("--no-chrome") });
  console.log(opened.source === "chrome" ? "Session Auchan reprise de Chrome" : "Session Auchan enregistrée utilisée");
  for (const w of opened.warnings) console.log(`⚠ ${w}`);
  const connector = opened.connector;

  step("Contexte de la semaine");
  const ctx = await loadWeeklyContext(connector);
  console.log(summarizeContext(ctx));

  if (has("--prepare")) {
    const requestFile = `data/requests/${today}.md`;
    const outputFile = `data/recipes/${today}.json`;
    fs.mkdirSync(path.dirname(requestFile), { recursive: true });
    fs.writeFileSync(requestFile, buildRequestDocument(brief, ctx, outputFile));
    console.log(`\nDemande écrite : ${requestFile}`);
    console.log(`Dans Claude Code, dis : « génère les recettes de ${requestFile} »`);
    console.log(`Puis lance : npm run week -- --from-recipes ${outputFile}`);
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
    if (await ask(`Ajouter ${cartLines.length} produits à ton panier Auchan ?`)) {
      await runPush(week.id, { store, openStore: async () => connector }, cliJob);
      const report = store.get(week.id)!.pushReport!;
      console.log();
      for (const a of report.adjusted) console.log(`⚠ ${a.name} : ${a.actual} au lieu de ${a.requested} (stock)`);
      if (report.cartTotal !== null) console.log(`Panier : ${report.cartTotal} €`);
      if (report.failed.length) console.log(`❌ Échecs : ${report.failed.map((f) => `${f.name} (${f.error})`).join(", ")}`);
      console.log("Finalise ta commande (créneau et paiement) sur https://www.auchan.fr");
    }
  }
  rl.close();
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}`);
  process.exit(1);
});
```

- [ ] **Step 2 : Mettre à jour `CLAUDE.md`**

Remplacer l'étape 3 :

```
3. L'utilisateur lance ensuite `npm run week -- --from-recipes data/recipes/<date>.json` (ajouter `--push` pour remplir le panier).
```

par :

```
3. L'utilisateur lance ensuite `npm run week -- --from-recipes data/recipes/<date>.json` (ajouter `--push` pour remplir le panier). Le choix des produits est vérifié par un appel groupé à `claude -p` (sauter avec `--no-arbiter`). La semaine est enregistrée dans `data/weeks/<id>.json` et visible dans l'app (`npm run dev`, puis http://127.0.0.1:3000).
```

- [ ] **Step 3 : Vérifier types, lint et tests**

Run : `npx tsc --noEmit && npm run lint && npm test`
Expected : aucune erreur ; tous les tests PASS.

- [ ] **Step 4 : (vérification manuelle) CLI réel, sans panier**

À faire par le contrôleur, avec l'utilisateur (Chrome connecté à auchan.fr) :

Run : `npm run week -- --from-recipes data/recipes/<date>.json` (le fichier de recettes du dernier essai réel, `ls data/recipes`)
Expected : « Session Auchan reprise de Chrome » ; « Claude : Claude Code (abonnement) » ; étapes « Choix des produits Auchan » puis « Vérification des produits par Claude » (un seul appel `claude -p`) ; tableau où « courgette », « oignon rouge » et « fromage frais nature » ne sont plus des formes transformées ou du chèvre ; « Semaine enregistrée : data/weeks/2026-09-23-N.json ». Relancer avec `--no-arbiter` : pas d'étape de vérification.

- [ ] **Step 5 : Commit**

```bash
git add scripts/week.ts CLAUDE.md
git commit -m "refactor(cli): npm run week sur les workflows partagés, arbitrage Claude Code par défaut (--no-arbiter)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 13 : Coquille de l'app, accueil et écran du brief

Avant d'écrire du code Next.js, lire : `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, `…/02-guides/forms.md`, `…/03-api-reference/04-functions/refresh.md`, `…/03-api-reference/04-functions/connection.md`, `…/03-api-reference/03-file-conventions/dynamic-routes.md`, `…/03-api-reference/06-cli/next.md` (option `-H`).

**Files:**
- Create: `src/lib/format.ts`, `src/lib/format.test.ts`, `src/lib/week/brief-form.ts`, `src/lib/week/brief-form.test.ts`, `src/app/actions.ts`, `src/app/_components/action-button.tsx`, `src/app/_components/job-poller.tsx`, `src/app/_components/job-progress.tsx`, `src/app/semaines/nouvelle/page.tsx`, `src/app/semaines/nouvelle/brief-form.tsx`
- Modify: `package.json` (scripts `dev`, `start`), `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` (remplacé)

**Interfaces:**
- Consumes : `getApp()`, `MyFreshApp` (Task 11) ; `ActionResult`, `OK`, `failure` (Task 11) ; `readCachedContext` (Task 6) ; `summarizeContext` ; `weekTotals` (Task 7) ; `BriefSchema`, `DIET_FILTERS`, `DietFilter`, `Brief` ; `round2`.
- Produces :
  - `formatEur(n: number): string`, `formatQty(value: number, unit: QtyUnit): string`, `productLabel(p): string`, `formatWeekDate(weekId: string): string`, `formatDateTime(iso: string): string`, `WEEK_STATUS_LABELS`, `JOB_LABELS`, `TAG_LABELS` (dans `src/lib/format.ts`, sans dépendance serveur : importable par les composants client) ;
  - `DEFAULT_BRIEF: Brief`, `FILTER_UI_LABELS: Record<DietFilter, string>`, `type BriefFormResult`, `parseBriefForm(form: FormData): BriefFormResult` ;
  - server actions `checkSessionAction(): Promise<ActionResult>`, `createWeekAction(prev: ActionResult, formData: FormData): Promise<ActionResult>` (redirige vers `/semaines/<id>`) ;
  - composants `ActionButton({ action: () => Promise<ActionResult>; label; pendingLabel; variant? })` (client), `JobPoller({ intervalMs? })` (client, `router.refresh()` toutes les 2 s), `JobProgress({ job: JobState })` (serveur).

- [ ] **Step 1 : Tests du formatage et du formulaire de brief**

`src/lib/format.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { makeProduct } from "../../tests/helpers/factories";
import { formatEur, formatQty, formatWeekDate, productLabel } from "./format";

describe("formatEur", () => {
  it("virgule décimale, arrondi au centime", () => {
    expect(formatEur(12.5)).toBe("12,50 €");
    expect(formatEur(0.1 + 0.2)).toBe("0,30 €");
    expect(formatEur(-3.456)).toBe("-3,46 €");
  });
});

describe("formatQty", () => {
  it("g, ml et pièces", () => {
    expect(formatQty(400, "g")).toBe("400 g");
    expect(formatQty(12.5, "ml")).toBe("12,5 ml");
    expect(formatQty(1, "pce")).toBe("1 pièce");
    expect(formatQty(3, "pce")).toBe("3 pièces");
  });
});

describe("productLabel", () => {
  it("marque, nom, conditionnement, prix, bio et promo", () => {
    const p = makeProduct({
      brand: "AUCHAN BIO",
      name: "Courgettes",
      pack: { value: 1000, unit: "g" },
      price: 3.5,
      isOrganic: true,
      promo: { label: "-30% sur le 2ème", kind: "price" },
    });
    expect(productLabel(p)).toBe("AUCHAN BIO Courgettes · 1000 g · 3,50 € · bio · -30% sur le 2ème");
    expect(productLabel(makeProduct({ name: "Riz", price: 2 }))).toBe("Riz · 2,00 €");
  });
});

describe("formatWeekDate", () => {
  it("date en toutes lettres à partir de l'identifiant", () => {
    expect(formatWeekDate("2026-09-23-2")).toBe("23 septembre 2026");
  });
});
```

`src/lib/week/brief-form.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { parseBriefForm } from "./brief-form";

function form(entries: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

const base: [string, string][] = [
  ["dinners", "4"],
  ["adults", "2"],
  ["children", "2"],
  ["budgetEur", "60,5"],
];

describe("parseBriefForm", () => {
  it("lit un brief complet (virgule décimale, cases à cocher, précisions nettoyées)", () => {
    const r = parseBriefForm(
      form([...base, ["filters", "kids_friendly"], ["filters", "vegan"], ["notes", "  pas de poisson "], ["preferOrganic", "on"]]),
    );
    expect(r).toEqual({
      ok: true,
      brief: {
        dinners: 4,
        adults: 2,
        children: 2,
        budgetEur: 60.5,
        filters: ["kids_friendly", "vegan"],
        notes: "pas de poisson",
        preferOrganic: true,
      },
    });
  });

  it("cases décochées : aucun filtre, pas de préférence bio", () => {
    expect(parseBriefForm(form(base))).toMatchObject({ ok: true, brief: { filters: [], preferOrganic: false, notes: "" } });
  });

  it("arrondit le budget au centime", () => {
    const r = parseBriefForm(form([...base.slice(0, 3), ["budgetEur", "59,999"]]));
    expect(r).toMatchObject({ ok: true, brief: { budgetEur: 60 } });
  });

  it("refuse des valeurs invalides en nommant les champs en français", () => {
    const r = parseBriefForm(form([["dinners", "9"], ["adults", "0"], ["children", "1"], ["budgetEur", "abc"]]));
    expect(r).toEqual({
      ok: false,
      error: "Vérifie le nombre de dîners (1 à 7), le nombre d'adultes (au moins 1), le budget (un montant en euros).",
    });
  });

  it("refuse un filtre inconnu", () => {
    expect(parseBriefForm(form([...base, ["filters", "carnivore"]]))).toEqual({
      ok: false,
      error: "Vérifie les contraintes.",
    });
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/format.test.ts src/lib/week/brief-form.test.ts`
Expected : FAIL (modules introuvables).

- [ ] **Step 3 : `src/lib/format.ts`**

```ts
import type { Recipe } from "./recipes/schema";
import type { JobKind, WeekStatus } from "./store/weeks";
import type { Product, QtyUnit } from "./types";
import { round2 } from "./units";

export function formatEur(n: number): string {
  return `${round2(n).toFixed(2).replace(".", ",")} €`;
}

export function formatQty(value: number, unit: QtyUnit): string {
  const v = String(round2(value)).replace(".", ",");
  if (unit === "pce") return `${v} pièce${value > 1 ? "s" : ""}`;
  return `${v} ${unit}`;
}

export function productLabel(p: Pick<Product, "brand" | "name" | "pack" | "price" | "isOrganic" | "promo">): string {
  const parts = [`${p.brand ? `${p.brand} ` : ""}${p.name}`];
  if (p.pack) parts.push(formatQty(p.pack.value, p.pack.unit));
  parts.push(formatEur(p.price));
  if (p.isOrganic) parts.push("bio");
  if (p.promo) parts.push(p.promo.label);
  return parts.join(" · ");
}

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « 2026-09-23-2 » → « 23 septembre 2026 » */
export function formatWeekDate(weekId: string): string {
  const [y, m, d] = weekId.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export const WEEK_STATUS_LABELS: Record<WeekStatus, string> = {
  draft: "Brouillon",
  generating: "En préparation",
  ready: "Prête",
  pushed: "Envoyée au panier",
};

export const JOB_LABELS: Record<JobKind, string> = {
  create: "Préparation de la semaine",
  "revise-recipe": "Modification d'une recette",
  push: "Envoi au panier Auchan",
};

export const TAG_LABELS: Record<Recipe["tags"][number], string> = {
  kids_friendly: "Enfants",
  low_calorie: "Léger",
  vegan: "Vegan",
  vegetarian: "Végétarien",
  unprocessed: "Brut",
  quick: "Rapide",
};
```

- [ ] **Step 4 : `src/lib/week/brief-form.ts`**

```ts
import { type Brief, BriefSchema, type DietFilter } from "../recipes/brief";
import { round2 } from "../units";

export const DEFAULT_BRIEF: Brief = {
  dinners: 4,
  adults: 2,
  children: 2,
  budgetEur: 60,
  filters: ["kids_friendly", "unprocessed"],
  notes: "",
  preferOrganic: true,
};

export const FILTER_UI_LABELS: Record<DietFilter, string> = {
  kids_friendly: "Adapté aux enfants",
  low_calorie: "Peu calorique",
  vegan: "Vegan",
  unprocessed: "Sans produits transformés",
};

const FIELD_LABELS: Record<string, string> = {
  dinners: "le nombre de dîners (1 à 7)",
  adults: "le nombre d'adultes (au moins 1)",
  children: "le nombre d'enfants",
  budgetEur: "le budget (un montant en euros)",
  filters: "les contraintes",
  notes: "les précisions",
  preferOrganic: "le bio",
};

export type BriefFormResult = { ok: true; brief: Brief } | { ok: false; error: string };

function readNumber(form: FormData, key: string): number {
  const raw = String(form.get(key) ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  return raw === "" ? Number.NaN : Number(raw);
}

export function parseBriefForm(form: FormData): BriefFormResult {
  const budget = readNumber(form, "budgetEur");
  const result = BriefSchema.safeParse({
    dinners: readNumber(form, "dinners"),
    adults: readNumber(form, "adults"),
    children: readNumber(form, "children"),
    budgetEur: Number.isFinite(budget) ? round2(budget) : budget,
    filters: form.getAll("filters").map(String),
    notes: String(form.get("notes") ?? "")
      .trim()
      .slice(0, 1000),
    preferOrganic: form.get("preferOrganic") === "on",
  });
  if (result.success) return { ok: true, brief: result.data };
  const fields = [...new Set(result.error.issues.map((i) => String(i.path[0])))];
  return { ok: false, error: `Vérifie ${fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}.` };
}
```

- [ ] **Step 5 : Lancer les tests**

Run : `npx vitest run src/lib/format.test.ts src/lib/week/brief-form.test.ts`
Expected : PASS.

- [ ] **Step 6 : Scripts npm sur 127.0.0.1**

Dans `package.json`, remplacer :

```json
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
```

par :

```json
    "dev": "next dev -H 127.0.0.1",
    "build": "next build",
    "start": "next start -H 127.0.0.1",
```

- [ ] **Step 7 : Layout et styles**

`src/app/layout.tsx` :

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MyFresh",
  description: "Les dîners de la semaine choisis avec les promos Auchan Drive, et le panier rempli pour toi.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900">
        <header className="border-b border-zinc-200 bg-white">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold text-emerald-700">
              MyFresh
            </Link>
            <Link
              href="/semaines/nouvelle"
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Nouvelle semaine
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
```

`src/app/globals.css` (remplacé) :

```css
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}
```

- [ ] **Step 8 : Composants partagés**

`src/app/_components/action-button.tsx` :

```tsx
"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/app/action-result";

export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = "secondary",
}: {
  action: () => Promise<ActionResult>;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
}) {
  const [state, formAction, pending] = useActionState<ActionResult>(() => action(), { error: null });
  const style =
    variant === "primary"
      ? "bg-emerald-600 text-white hover:bg-emerald-700"
      : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100";
  return (
    <form action={formAction} className="mt-2">
      <button
        type="submit"
        disabled={pending}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${style}`}
      >
        {pending ? pendingLabel : label}
      </button>
      {state.error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
```

`src/app/_components/job-poller.tsx` :

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recharge les données de la page toutes les 2 s tant qu'une tâche tourne. */
export function JobPoller({ intervalMs = 2000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
```

`src/app/_components/job-progress.tsx` :

```tsx
import { formatDateTime, JOB_LABELS } from "@/lib/format";
import type { JobState } from "@/lib/store/weeks";
import { JobPoller } from "./job-poller";

export function JobProgress({ job }: { job: JobState }) {
  const pct = job.progress && job.progress.total ? Math.round((job.progress.done / job.progress.total) * 100) : null;
  return (
    <section className="rounded-xl border border-emerald-200 bg-white p-6" aria-live="polite">
      <h2 className="text-lg font-semibold">{JOB_LABELS[job.kind]}</h2>
      <p className="mt-1 text-zinc-700">{job.step}…</p>
      {job.progress && pct !== null && (
        <div className="mt-3">
          <div className="h-2 rounded bg-zinc-200">
            <div className="h-2 rounded bg-emerald-600" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {job.progress.done} / {job.progress.total}
          </p>
        </div>
      )}
      <p className="mt-4 text-sm text-zinc-500">
        Démarré le {formatDateTime(job.startedAt)}. La page se met à jour toute seule ; la génération des recettes peut
        prendre plusieurs minutes.
      </p>
      <JobPoller />
    </section>
  );
}
```

- [ ] **Step 9 : Server actions (première version)**

`src/app/actions.ts` :

```ts
"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionResult, failure, OK } from "@/lib/app/action-result";
import { getApp } from "@/lib/app/instance";
import { parseBriefForm } from "@/lib/week/brief-form";

export async function checkSessionAction(): Promise<ActionResult> {
  await getApp().checkSession();
  refresh();
  return OK;
}

export async function createWeekAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseBriefForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  let id: string;
  try {
    id = getApp().startCreateWeek(parsed.brief).id;
  } catch (e) {
    return failure(e);
  }
  redirect(`/semaines/${id}`);
}
```

- [ ] **Step 10 : Accueil `src/app/page.tsx` (remplace la page par défaut de Next.js)**

```tsx
import Link from "next/link";
import { connection } from "next/server";
import { ActionButton } from "@/app/_components/action-button";
import { checkSessionAction } from "@/app/actions";
import { getApp } from "@/lib/app/instance";
import { summarizeContext } from "@/lib/context/build";
import { readCachedContext } from "@/lib/context/cache";
import { formatDateTime, formatEur, formatWeekDate, JOB_LABELS, WEEK_STATUS_LABELS } from "@/lib/format";
import { weekTotals } from "@/lib/week/edit";

const card = "rounded-xl border border-zinc-200 bg-white p-4";

export default async function HomePage() {
  await connection();
  const app = getApp();
  const weeks = app.listWeeks();
  const job = app.runner.current();
  const context = readCachedContext();
  const session = app.session;

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className={card}>
          <h2 className="text-sm font-semibold text-zinc-500">Session Auchan</h2>
          {session ? (
            <p className={`mt-1 ${session.ok ? "text-emerald-700" : "text-red-700"}`}>
              {session.ok ? "✓ " : "✗ "}
              {session.message}
            </p>
          ) : (
            <p className="mt-1 text-zinc-600">Pas encore vérifiée.</p>
          )}
          {session && <p className="text-xs text-zinc-500">Vérifiée le {formatDateTime(session.checkedAt)}</p>}
          <ActionButton action={checkSessionAction} label="Vérifier la session" pendingLabel="Vérification…" />
        </div>
        <div className={card}>
          <h2 className="text-sm font-semibold text-zinc-500">Contexte de la semaine</h2>
          <p className="mt-1 text-zinc-700">
            {context ? summarizeContext(context) : "Pas encore chargé : il le sera à la création d'une semaine."}
          </p>
        </div>
        <div className={card}>
          <h2 className="text-sm font-semibold text-zinc-500">Claude</h2>
          <p className="mt-1 text-zinc-700">{app.backendLabel()}</p>
        </div>
      </section>

      {job?.status === "running" && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p>
            {JOB_LABELS[job.kind]} en cours : {job.step}…
          </p>
          <Link href={`/semaines/${job.weekId}`} className="font-medium underline">
            Voir la progression
          </Link>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Mes semaines</h1>
          <Link
            href="/semaines/nouvelle"
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Nouvelle semaine
          </Link>
        </div>
        {weeks.length === 0 ? (
          <p className="text-zinc-600">Aucune semaine pour l&apos;instant. Crée la première !</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
            {weeks.map((w) => {
              const titles = w.recipes.filter((r) => w.selectedRecipeIds.includes(r.id)).map((r) => r.title);
              const total = w.matches.length ? weekTotals(w).net : null;
              return (
                <li key={w.id}>
                  <Link
                    href={`/semaines/${w.id}`}
                    className="flex flex-col gap-1 p-4 hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">Semaine du {formatWeekDate(w.id)}</p>
                      <p className="text-sm text-zinc-600">
                        {titles.length
                          ? titles.join(" · ")
                          : `${w.brief.dinners} dîners, ${w.brief.adults} adulte(s), ${w.brief.children} enfant(s)`}
                      </p>
                    </div>
                    <p className="text-sm text-zinc-600">
                      {WEEK_STATUS_LABELS[w.status]}
                      {total !== null && ` · ${formatEur(total)}`}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 11 : Écran du brief**

`src/app/semaines/nouvelle/page.tsx` :

```tsx
import { connection } from "next/server";
import { getApp } from "@/lib/app/instance";
import { DEFAULT_BRIEF } from "@/lib/week/brief-form";
import { BriefForm } from "./brief-form";

export default async function NewWeekPage() {
  await connection();
  const app = getApp();
  const brief = app.store.latestBrief() ?? DEFAULT_BRIEF;
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
      <BriefForm initial={brief} />
    </div>
  );
}
```

`src/app/semaines/nouvelle/brief-form.tsx` :

```tsx
"use client";

import { useActionState } from "react";
import { createWeekAction } from "@/app/actions";
import type { ActionResult } from "@/lib/app/action-result";
import { type Brief, DIET_FILTERS } from "@/lib/recipes/brief";
import { FILTER_UI_LABELS } from "@/lib/week/brief-form";

const field = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-normal";
const label = "block text-sm font-medium";

export function BriefForm({ initial }: { initial: Brief }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createWeekAction, { error: null });
  return (
    <form action={formAction} className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <label className={label}>
          Dîners
          <input name="dinners" type="number" min={1} max={7} required defaultValue={initial.dinners} className={field} />
        </label>
        <label className={label}>
          Adultes
          <input name="adults" type="number" min={1} required defaultValue={initial.adults} className={field} />
        </label>
        <label className={label}>
          Enfants
          <input name="children" type="number" min={0} required defaultValue={initial.children} className={field} />
        </label>
        <label className={label}>
          Budget (€)
          <input
            name="budgetEur"
            type="text"
            inputMode="decimal"
            required
            defaultValue={String(initial.budgetEur).replace(".", ",")}
            className={field}
          />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Contraintes</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {DIET_FILTERS.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="filters" value={f} defaultChecked={initial.filters.includes(f)} />
              {FILTER_UI_LABELS[f]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="preferOrganic" defaultChecked={initial.preferOrganic} />
        Bio de préférence
      </label>
      <label className={label}>
        Précisions
        <textarea
          name="notes"
          rows={3}
          maxLength={1000}
          defaultValue={initial.notes}
          placeholder="Ex. : pas de poisson, un plat sans four, Léa n'aime pas les champignons"
          className={field}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? "Lancement…" : "Préparer la semaine"}
      </button>
    </form>
  );
}
```

- [ ] **Step 12 : Vérifier types, lint, tests et build**

Run : `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected : aucune erreur ; le build liste les routes `/` et `/semaines/nouvelle` comme dynamiques (ƒ).

- [ ] **Step 13 : Vérifier que le serveur n'écoute que sur 127.0.0.1 et que les pages s'affichent**

(Ne touche ni Auchan ni Claude : l'accueil lit seulement `data/`.)

```bash
(npm run start > /tmp/myfresh-next.log 2>&1 &)
curl -s --retry 30 --retry-connrefused --retry-delay 1 http://127.0.0.1:3000/ | grep -c "Mes semaines"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/semaines/nouvelle
lsof -nP -iTCP:3000 -sTCP:LISTEN
pkill -f "next start"
```

Expected : `1` ; `200` ; `lsof` ne montre que `127.0.0.1:3000` (pas `*:3000`). L'ancien fichier `data/weeks/2026-09-23.json` (format CLI) n'apparaît pas dans l'historique et ne fait pas planter la page.

- [ ] **Step 14 : Commit**

```bash
git add package.json src/lib/format.ts src/lib/format.test.ts src/lib/week/brief-form.ts src/lib/week/brief-form.test.ts src/app
git commit -m "feat(app): accueil, écran du brief et serveur limité à 127.0.0.1" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14 : Écran de la semaine — progression et validation

**Files:**
- Create: `src/lib/week/view.ts`, `src/lib/week/view.test.ts`, `src/app/semaines/[id]/page.tsx`, `src/app/semaines/[id]/_components/budget-bar.tsx`, `src/app/semaines/[id]/_components/recipe-card.tsx`, `src/app/semaines/[id]/_components/product-list.tsx`, `src/app/semaines/[id]/_components/week-controls.tsx`, `scripts/demo-week.ts`
- Modify: `src/app/actions.ts`

**Interfaces:**
- Consumes : `MyFreshApp.getWeek/edit/retryCreateWeek/startReviseRecipe` (Task 11) ; `toggleRecipe`, `chooseProduct`, `setPantry`, `weekTotals`, `productRows`, `WeekTotals`, `ProductRow` (Task 7) ; `formatEur`, `formatQty`, `productLabel`, `formatWeekDate`, `JOB_LABELS`, `TAG_LABELS` (Task 13) ; `ActionButton`, `JobProgress` (Task 13).
- Produces :
  - `type WeekView = "progress" | "retry" | "validation"`, `weekView(week: Pick<Week, "job" | "status">): WeekView` ;
  - `type CartView = "progress" | "report" | "not-ready" | "preview"`, `cartView(week: Pick<Week, "job" | "status" | "pushReport">): CartView` (utilisé en Task 15) ;
  - server actions `retryCreateAction(weekId)`, `toggleRecipeAction(weekId, recipeId, selected)`, `chooseProductAction(weekId, ingredientKey, productId)`, `setPantryAction(weekId, ingredientKey, inPantry)`, `reviseRecipeAction(weekId, recipeId, prev, formData)`, toutes `Promise<ActionResult>` ;
  - composants client `RecipeToggle`, `ProductPicker`, `PantryToggle`, `ReviseRecipeForm` ;
  - `scripts/demo-week.ts` : écrit `data/weeks/2000-01-01-1.json`, une semaine de démonstration (sans Auchan ni Claude) pour vérifier l'écran.

- [ ] **Step 1 : Test de `weekView` / `cartView`**

`src/lib/week/view.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import type { JobState, PushReport } from "../store/weeks";
import { cartView, weekView } from "./view";

const job = (status: JobState["status"], kind: JobState["kind"] = "create"): JobState => ({
  weekId: "2026-09-23-1",
  kind,
  status,
  step: "x",
  progress: null,
  error: status === "error" ? "boum" : null,
  startedAt: "2026-09-23T10:00:00.000Z",
  finishedAt: null,
});
const report: PushReport = { pushedAt: "2026-09-23T18:00:00.000Z", added: [], adjusted: [], failed: [], cartTotal: 0 };

describe("weekView", () => {
  it("progression pendant une tâche, relance si la préparation n'a pas abouti, validation sinon", () => {
    expect(weekView({ status: "generating", job: job("running") })).toBe("progress");
    expect(weekView({ status: "ready", job: job("running", "revise-recipe") })).toBe("progress");
    expect(weekView({ status: "draft", job: job("error") })).toBe("retry");
    expect(weekView({ status: "generating", job: null })).toBe("retry");
    expect(weekView({ status: "ready", job: job("error", "revise-recipe") })).toBe("validation");
    expect(weekView({ status: "pushed", job: job("done", "push") })).toBe("validation");
  });
});

describe("cartView", () => {
  it("progression, rapport, pas prête ou aperçu", () => {
    expect(cartView({ status: "ready", job: job("running", "push"), pushReport: null })).toBe("progress");
    expect(cartView({ status: "pushed", job: job("done", "push"), pushReport: report })).toBe("report");
    expect(cartView({ status: "draft", job: null, pushReport: null })).toBe("not-ready");
    expect(cartView({ status: "ready", job: job("error", "push"), pushReport: null })).toBe("preview");
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/week/view.test.ts`
Expected : FAIL (`Cannot find module './view'`).

- [ ] **Step 3 : `src/lib/week/view.ts`**

```ts
import type { Week } from "../store/weeks";

export type WeekView = "progress" | "retry" | "validation";
export type CartView = "progress" | "report" | "not-ready" | "preview";

export function weekView(week: Pick<Week, "job" | "status">): WeekView {
  if (week.job?.status === "running") return "progress";
  if (week.status === "draft" || week.status === "generating") return "retry";
  return "validation";
}

export function cartView(week: Pick<Week, "job" | "status" | "pushReport">): CartView {
  if (week.job?.status === "running") return "progress";
  if (week.pushReport) return "report";
  if (week.status !== "ready") return "not-ready";
  return "preview";
}
```

- [ ] **Step 4 : Lancer**

Run : `npx vitest run src/lib/week/view.test.ts`
Expected : PASS.

- [ ] **Step 5 : Server actions de la semaine**

Remplacer `src/app/actions.ts` par :

```ts
"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionResult, failure, OK } from "@/lib/app/action-result";
import { getApp } from "@/lib/app/instance";
import { parseBriefForm } from "@/lib/week/brief-form";
import { chooseProduct, setPantry, toggleRecipe } from "@/lib/week/edit";

/** Exécute une opération du service ; en cas de succès, la page courante est rendue à nouveau. */
async function attempt(operation: () => unknown): Promise<ActionResult> {
  try {
    operation();
  } catch (e) {
    return failure(e);
  }
  refresh();
  return OK;
}

export async function checkSessionAction(): Promise<ActionResult> {
  await getApp().checkSession();
  refresh();
  return OK;
}

export async function createWeekAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseBriefForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  let id: string;
  try {
    id = getApp().startCreateWeek(parsed.brief).id;
  } catch (e) {
    return failure(e);
  }
  redirect(`/semaines/${id}`);
}

export async function retryCreateAction(weekId: string): Promise<ActionResult> {
  return attempt(() => getApp().retryCreateWeek(String(weekId)));
}

export async function toggleRecipeAction(weekId: string, recipeId: string, selected: boolean): Promise<ActionResult> {
  return attempt(() => getApp().edit(String(weekId), (w) => toggleRecipe(w, String(recipeId), selected === true)));
}

export async function chooseProductAction(weekId: string, ingredientKey: string, productId: string): Promise<ActionResult> {
  return attempt(() => getApp().edit(String(weekId), (w) => chooseProduct(w, String(ingredientKey), String(productId))));
}

export async function setPantryAction(weekId: string, ingredientKey: string, inPantry: boolean): Promise<ActionResult> {
  return attempt(() => getApp().edit(String(weekId), (w) => setPantry(w, String(ingredientKey), inPantry === true)));
}

export async function reviseRecipeAction(
  weekId: string,
  recipeId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(() =>
    getApp().startReviseRecipe(String(weekId), String(recipeId), String(formData.get("instruction") ?? "")),
  );
}
```

- [ ] **Step 6 : Contrôles client `src/app/semaines/[id]/_components/week-controls.tsx`**

```tsx
"use client";

import { useActionState, useState, useTransition } from "react";
import { chooseProductAction, reviseRecipeAction, setPantryAction, toggleRecipeAction } from "@/app/actions";
import type { ActionResult } from "@/lib/app/action-result";

function useServerAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (call: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await call();
      setError(result.error);
    });
  return { pending, error, run };
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <span role="alert" className="block text-xs text-red-700">
      {error}
    </span>
  ) : null;
}

export function RecipeToggle({
  weekId,
  recipeId,
  selected,
  disabled,
}: {
  weekId: string;
  recipeId: string;
  selected: boolean;
  disabled: boolean;
}) {
  const { pending, error, run } = useServerAction();
  return (
    <label className="flex shrink-0 flex-col items-end gap-1 text-sm">
      <span className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={selected}
          disabled={pending || disabled}
          onChange={(e) => {
            const next = e.target.checked;
            run(() => toggleRecipeAction(weekId, recipeId, next));
          }}
          className="h-5 w-5 accent-emerald-600"
        />
        {selected ? "Retenue" : "Retenir"}
      </span>
      <ErrorText error={error} />
    </label>
  );
}

export function ProductPicker({
  weekId,
  ingredientKey,
  value,
  options,
}: {
  weekId: string;
  ingredientKey: string;
  value: string;
  options: { productId: string; label: string }[];
}) {
  const { pending, error, run } = useServerAction();
  return (
    <div>
      <select
        aria-label="Produit Auchan"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const productId = e.target.value;
          run(() => chooseProductAction(weekId, ingredientKey, productId));
        }}
        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
      >
        {value === "" && <option value="">Aucun produit retenu</option>}
        {options.map((o) => (
          <option key={o.productId} value={o.productId}>
            {o.label}
          </option>
        ))}
      </select>
      <ErrorText error={error} />
    </div>
  );
}

export function PantryToggle({ weekId, ingredientKey, inPantry }: { weekId: string; ingredientKey: string; inPantry: boolean }) {
  const { pending, error, run } = useServerAction();
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-700">
      <input
        type="checkbox"
        checked={inPantry}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          run(() => setPantryAction(weekId, ingredientKey, next));
        }}
      />
      Déjà au placard
      <ErrorText error={error} />
    </label>
  );
}

export function ReviseRecipeForm({ weekId, recipeId }: { weekId: string; recipeId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    reviseRecipeAction.bind(null, weekId, recipeId),
    { error: null },
  );
  return (
    <form action={formAction} className="space-y-2 border-t border-zinc-200 pt-3">
      <label className="block font-medium">
        Modifier cette recette
        <textarea
          name="instruction"
          rows={2}
          maxLength={500}
          required
          placeholder="Ex. : moins épicé, sans four, remplacer le poisson par du poulet"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1 font-normal"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50"
      >
        {pending ? "Envoi…" : "Demander la modification"}
      </button>
      <p className="text-xs text-zinc-500">Claude réécrit la recette, puis MyFresh recherche à nouveau ses produits.</p>
    </form>
  );
}
```

- [ ] **Step 7 : Composants serveur de l'écran de validation**

`src/app/semaines/[id]/_components/budget-bar.tsx` :

```tsx
import Link from "next/link";
import { formatEur } from "@/lib/format";
import type { WeekTotals } from "@/lib/week/edit";

const primary = "inline-block rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700";

export function BudgetBar({
  weekId,
  totals,
  selected,
  dinners,
  pushed,
}: {
  weekId: string;
  totals: WeekTotals;
  selected: number;
  dinners: number;
  pushed: boolean;
}) {
  const pct = Math.min(100, Math.round((totals.net / totals.budget) * 100));
  return (
    <section className="sticky top-0 z-10 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg">
          <span className={`font-semibold ${totals.overBudget ? "text-red-700" : "text-emerald-700"}`}>
            {formatEur(totals.net)}
          </span>{" "}
          <span className="text-zinc-500">/ budget {formatEur(totals.budget)}</span>
        </p>
        <p className="text-sm text-zinc-600">
          {totals.overBudget
            ? `${formatEur(-totals.remaining)} au-dessus du budget`
            : `Reste ${formatEur(totals.remaining)}`}
        </p>
      </div>
      <div className="mt-2 h-2 rounded bg-zinc-200">
        <div
          className={`h-2 rounded ${totals.overBudget ? "bg-red-600" : "bg-emerald-600"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
        <span>Prix en rayon : {formatEur(totals.gross)}</span>
        {totals.promoSaved > 0 && <span className="text-emerald-700">Économies promos : {formatEur(totals.promoSaved)}</span>}
        {totals.loyalty > 0 && <span>Cagnotte Waaoh : {formatEur(totals.loyalty)}</span>}
        {totals.basket.missing.length > 0 && (
          <span className="text-amber-700">Introuvables : {totals.basket.missing.join(", ")}</span>
        )}
      </div>
      <div className="mt-3">
        {pushed ? (
          <Link href={`/semaines/${weekId}/panier`} className={primary}>
            Voir le rapport d&apos;envoi
          </Link>
        ) : selected === 0 ? (
          <p className="text-sm text-zinc-500">Retiens au moins une recette pour préparer le panier.</p>
        ) : (
          <Link href={`/semaines/${weekId}/panier`} className={primary}>
            Vérifier le panier ({selected}/{dinners} dîners) →
          </Link>
        )}
      </div>
    </section>
  );
}
```

`src/app/semaines/[id]/_components/recipe-card.tsx` :

```tsx
import { formatQty, TAG_LABELS } from "@/lib/format";
import type { Recipe } from "@/lib/recipes/schema";
import { RecipeToggle, ReviseRecipeForm } from "./week-controls";

export function RecipeCard({
  weekId,
  recipe,
  selected,
  full,
}: {
  weekId: string;
  recipe: Recipe;
  selected: boolean;
  full: boolean;
}) {
  const kids = new Set(recipe.kidSteps ?? []);
  const n = recipe.nutritionPerServing;
  return (
    <article
      className={`rounded-xl border bg-white p-4 ${selected ? "border-emerald-500 ring-1 ring-emerald-500" : "border-zinc-200"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{recipe.title}</h3>
          <p className="text-sm text-zinc-600">{recipe.summary}</p>
        </div>
        <RecipeToggle weekId={weekId} recipeId={recipe.id} selected={selected} disabled={!selected && full} />
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {recipe.prepMinutes + recipe.cookMinutes} min · {recipe.servings} portions
        {recipe.tags.length ? ` · ${recipe.tags.map((t) => TAG_LABELS[t]).join(", ")}` : ""}
      </p>
      {recipe.whyThisWeek && <p className="mt-2 text-sm text-emerald-800">{recipe.whyThisWeek}</p>}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-zinc-700">Détail de la recette</summary>
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <h4 className="font-medium">Ingrédients</h4>
            <ul className="list-disc pl-5">
              {recipe.ingredients.map((i, index) => (
                <li key={index}>
                  {i.name} : {formatQty(i.quantity, i.unit)}
                  {i.pantryStaple ? " (placard)" : ""}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-medium">Étapes</h4>
            <ol className="list-decimal space-y-1 pl-5">
              {recipe.steps.map((s, index) => (
                <li key={index} className={kids.has(index) ? "rounded bg-amber-50 px-1" : undefined}>
                  {s}
                  {kids.has(index) && (
                    <span className="ml-2 rounded bg-amber-200 px-1.5 text-xs font-medium text-amber-900">
                      Avec les enfants
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <p className="text-zinc-600">
            Nutrition estimée par portion : {Math.round(n.kcal)} kcal · protéines {Math.round(n.proteinG)} g · glucides{" "}
            {Math.round(n.carbsG)} g · lipides {Math.round(n.fatG)} g
          </p>
          <ReviseRecipeForm weekId={weekId} recipeId={recipe.id} />
        </div>
      </details>
    </article>
  );
}
```

`src/app/semaines/[id]/_components/product-list.tsx` :

```tsx
import { formatEur, formatQty, productLabel } from "@/lib/format";
import type { ProductRow } from "@/lib/week/edit";
import { PantryToggle, ProductPicker } from "./week-controls";

export function ProductList({ weekId, rows }: { weekId: string; rows: ProductRow[] }) {
  if (!rows.length) return null;
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold">Produits</h2>
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
        {rows.map((row) => (
          <li
            key={row.key}
            className={`grid gap-2 p-3 sm:grid-cols-[1fr_2fr_auto] sm:items-center ${row.inPantry ? "opacity-60" : ""}`}
          >
            <div>
              <p className="font-medium">{row.name}</p>
              <p className="text-xs text-zinc-500">{formatQty(row.quantity, row.unit)} pour les recettes retenues</p>
            </div>
            <div>
              {row.options.length ? (
                <ProductPicker
                  weekId={weekId}
                  ingredientKey={row.key}
                  value={row.chosen?.product.productId ?? ""}
                  options={row.options.map((c) => ({ productId: c.product.productId, label: productLabel(c.product) }))}
                />
              ) : (
                <p className="text-sm text-amber-700">Aucun produit trouvé chez Auchan</p>
              )}
              {row.chosen?.product.url && (
                <a
                  href={row.chosen.product.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-700 underline"
                >
                  Voir sur auchan.fr
                </a>
              )}
            </div>
            <div className="flex items-center gap-4 sm:justify-end">
              <PantryToggle weekId={weekId} ingredientKey={row.key} inPantry={row.inPantry} />
              <p className="w-40 text-right text-sm">
                {row.line ? `${row.line.packs} × ${formatEur(row.line.product.price)} = ${formatEur(row.line.cost)}` : "—"}
                {row.line?.uncertainQuantity && <span className="block text-xs text-amber-700">quantité à vérifier</span>}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 8 : Page `src/app/semaines/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ActionButton } from "@/app/_components/action-button";
import { JobProgress } from "@/app/_components/job-progress";
import { retryCreateAction } from "@/app/actions";
import { getApp } from "@/lib/app/instance";
import { formatWeekDate, JOB_LABELS } from "@/lib/format";
import { productRows, weekTotals } from "@/lib/week/edit";
import { weekView } from "@/lib/week/view";
import { BudgetBar } from "./_components/budget-bar";
import { ProductList } from "./_components/product-list";
import { RecipeCard } from "./_components/recipe-card";

export default async function WeekPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const week = getApp().getWeek(id);
  if (!week) notFound();

  const view = weekView(week);
  const heading = <h1 className="text-2xl font-semibold">Semaine du {formatWeekDate(week.id)}</h1>;

  if (view === "progress" && week.job) {
    return (
      <div className="space-y-4">
        {heading}
        <JobProgress job={week.job} />
      </div>
    );
  }

  if (view === "retry") {
    return (
      <div className="space-y-4">
        {heading}
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-medium">La préparation de la semaine n&apos;a pas abouti.</p>
          {week.job?.error && <p className="mt-1 text-sm">{week.job.error}</p>}
          <ActionButton
            action={retryCreateAction.bind(null, week.id)}
            label="Relancer"
            pendingLabel="Relance…"
            variant="primary"
          />
        </div>
      </div>
    );
  }

  const totals = weekTotals(week);
  const full = week.selectedRecipeIds.length >= week.brief.dinners;
  return (
    <div className="space-y-6">
      {heading}
      {week.contextSummary && <p className="text-sm text-zinc-600">Contexte Auchan : {week.contextSummary}</p>}
      {week.job?.status === "error" && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {JOB_LABELS[week.job.kind]} : échec. {week.job.error}
        </p>
      )}
      <BudgetBar
        weekId={week.id}
        totals={totals}
        selected={week.selectedRecipeIds.length}
        dinners={week.brief.dinners}
        pushed={week.status === "pushed"}
      />
      <section>
        <h2 className="mb-3 text-xl font-semibold">
          Recettes ({week.selectedRecipeIds.length}/{week.brief.dinners} retenues)
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {week.recipes.map((r) => (
            <RecipeCard
              key={r.id}
              weekId={week.id}
              recipe={r}
              selected={week.selectedRecipeIds.includes(r.id)}
              full={full}
            />
          ))}
        </div>
      </section>
      <ProductList weekId={week.id} rows={productRows(week)} />
    </div>
  );
}
```

- [ ] **Step 9 : Semaine de démonstration `scripts/demo-week.ts`**

```ts
/** Écrit une semaine de démonstration (sans Auchan ni Claude) pour vérifier l'écran de validation. */
import { WeekStore } from "@/lib/store/weeks";
import { makeMatch, makeNeed, makeProduct, makeRecipe, makeWeek } from "../tests/helpers/factories";

const ing = (name: string, quantity: number, unit: "g" | "ml" | "pce" = "g", pantryStaple = false) => ({
  name,
  searchQuery: name,
  quantity,
  unit,
  pantryStaple,
  fromPromo: false,
});

const courgettes = makeProduct({ name: "Courgettes", price: 2.2, pack: { value: 1000, unit: "g" } });
const courgettesBio = makeProduct({
  name: "Courgettes",
  brand: "AUCHAN BIO",
  price: 3.5,
  pack: { value: 1000, unit: "g" },
  isOrganic: true,
});
const penne = makeProduct({
  name: "Penne rigate",
  brand: "BARILLA",
  price: 1.2,
  pack: { value: 500, unit: "g" },
  promo: { label: "-50% sur le 2ème", kind: "price" },
});
const riz = makeProduct({ name: "Riz basmati", price: 2.5, pack: { value: 1000, unit: "g" } });
const huile = makeProduct({ name: "Huile d'olive vierge extra", price: 6.9, pack: { value: 750, unit: "ml" } });

const week = makeWeek({
  id: "2000-01-01-1",
  createdAt: "2000-01-01T10:00:00.000Z",
  brief: { dinners: 1, adults: 2, children: 2, budgetEur: 20, filters: ["kids_friendly"], notes: "", preferOrganic: true },
  contextSummary: "Semaine de démonstration (aucune donnée Auchan)",
  recipes: [
    makeRecipe({
      id: "penne-courgettes",
      title: "Penne aux courgettes",
      summary: "Des pâtes crémeuses aux courgettes de saison.",
      ingredients: [ing("courgette", 600), ing("pâtes", 1000), ing("huile d'olive", 30, "ml", true)],
      steps: ["Laver les courgettes.", "Cuire les pâtes.", "Mélanger le tout."],
      kidSteps: [0, 2],
      tags: ["kids_friendly", "vegetarian"],
      whyThisWeek: "Courgettes de saison et pâtes en promo.",
    }),
    makeRecipe({ id: "riz-legumes", title: "Riz sauté aux légumes", ingredients: [ing("riz", 400), ing("courgette", 300)] }),
  ],
  selectedRecipeIds: ["penne-courgettes"],
  matches: [
    makeMatch(
      makeNeed({ key: "courgette|g", quantity: 900, perRecipe: { "penne-courgettes": 600, "riz-legumes": 300 } }),
      courgettes,
      [courgettesBio],
    ),
    makeMatch(makeNeed({ key: "pates|g", name: "pâtes", quantity: 1000, perRecipe: { "penne-courgettes": 1000 } }), penne),
    makeMatch(
      makeNeed({ key: "huile d'olive|ml", quantity: 30, perRecipe: { "penne-courgettes": 30 }, pantryStaple: true }),
      huile,
    ),
    makeMatch(makeNeed({ key: "riz|g", quantity: 400, perRecipe: { "riz-legumes": 400 } }), riz),
  ],
  overrides: { products: {}, pantry: ["huile d'olive|ml"] },
});

new WeekStore().save(week);
console.log("Semaine de démonstration : http://127.0.0.1:3000/semaines/2000-01-01-1");
console.log("À supprimer ensuite : rm data/weeks/2000-01-01-1.json");
```

- [ ] **Step 10 : Vérifier types, lint, tests et build**

Run : `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected : aucune erreur ; la route `/semaines/[id]` apparaît comme dynamique (ƒ).

- [ ] **Step 11 : Rendu de l'écran avec la semaine de démonstration**

(Ne touche ni Auchan ni Claude. Ne pas cliquer « Vérifier le panier » : la page panier ouvre la vraie session Auchan.)

```bash
npx tsx scripts/demo-week.ts
(npm run start > /tmp/myfresh-next.log 2>&1 &)
curl -s --retry 30 --retry-connrefused --retry-delay 1 http://127.0.0.1:3000/semaines/2000-01-01-1 > /tmp/myfresh-week.html
grep -c "Penne aux courgettes" /tmp/myfresh-week.html
grep -o "0,60 €" /tmp/myfresh-week.html | head -1
grep -o "Avec les enfants" /tmp/myfresh-week.html | head -1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/semaines/2000-01-01-99
pkill -f "next start"
rm data/weeks/2000-01-01-1.json
```

Expected : un nombre ≥ 1 ; `0,60 €` (économies promo : 2 paquets de penne, -50 % sur le 2e) ; `Avec les enfants` ; `404`.

- [ ] **Step 12 : (vérification manuelle) Interactions dans le navigateur**

À faire par le contrôleur avec l'utilisateur, sur la semaine de démonstration (`npx tsx scripts/demo-week.ts`, `npm run dev`, http://127.0.0.1:3000/semaines/2000-01-01-1) : cocher « Riz sauté » est refusé tant que « Penne » est retenue (message « déjà choisi 1 recettes ») ; décocher « Penne » puis cocher « Riz » met à jour le total ; choisir « AUCHAN BIO Courgettes » change le coût de la ligne et le total ; décocher « Déjà au placard » sur l'huile ajoute 6,90 € ; chaque changement survit à un rechargement de page. Supprimer ensuite `data/weeks/2000-01-01-1.json`. (« Modifier cette recette » se teste en Task 15 avec une vraie semaine : il appelle Claude et Auchan.)

- [ ] **Step 13 : Commit**

```bash
git add src/lib/week/view.ts src/lib/week/view.test.ts src/app scripts/demo-week.ts
git commit -m "feat(app): écran de la semaine (progression, recettes, produits, placard, total en direct)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15 : Écran du panier — aperçu, confirmation, rapport ; vérification de bout en bout

**Files:**
- Create: `src/app/semaines/[id]/panier/page.tsx`, `src/app/semaines/[id]/panier/push-report.tsx`
- Modify: `src/app/actions.ts`

**Interfaces:**
- Consumes : `MyFreshApp.getWeek/openStore/startPush` (Task 11) ; `previewPush`, `PushPreview` (Task 10) ; `weekTotals` (Task 7) ; `cartView` (Task 14) ; `PushReport` (Task 1) ; `formatEur`, `formatDateTime`, `formatWeekDate` ; `ActionButton`, `JobProgress`.
- Produces : server action `confirmPushAction(weekId: string): Promise<ActionResult>` ; la page `/semaines/[id]/panier`.

- [ ] **Step 1 : Server action de confirmation**

Ajouter à la fin de `src/app/actions.ts` :

```ts
export async function confirmPushAction(weekId: string): Promise<ActionResult> {
  return attempt(() => getApp().startPush(String(weekId)));
}
```

- [ ] **Step 2 : Rapport `src/app/semaines/[id]/panier/push-report.tsx`**

```tsx
import { formatDateTime, formatEur } from "@/lib/format";
import type { PushReport } from "@/lib/store/weeks";

export function PushReportView({ report }: { report: PushReport }) {
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-emerald-50 p-3 text-emerald-900">
        Envoyé le {formatDateTime(report.pushedAt)} : {report.added.length} produit(s) ajouté(s),{" "}
        {report.adjusted.length} ajusté(s) par Auchan, {report.failed.length} en échec.
        {report.cartTotal !== null && ` Total du panier Auchan : ${formatEur(report.cartTotal)}.`}
      </p>
      {report.adjusted.length > 0 && (
        <section>
          <h2 className="font-semibold">Ajustés par Auchan (stock)</h2>
          <ul className="list-disc pl-5 text-sm">
            {report.adjusted.map((l) => (
              <li key={l.productId}>
                {l.name} : {l.actual} dans le panier au lieu de {l.requested}
              </li>
            ))}
          </ul>
        </section>
      )}
      {report.failed.length > 0 && (
        <section>
          <h2 className="font-semibold text-red-800">En échec : à ajouter à la main</h2>
          <ul className="list-disc pl-5 text-sm">
            {report.failed.map((l) => (
              <li key={l.productId}>
                {l.url ? (
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-emerald-700 underline">
                    {l.name}
                  </a>
                ) : (
                  l.name
                )}{" "}
                ({l.error})
              </li>
            ))}
          </ul>
        </section>
      )}
      {report.added.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold">Produits ajoutés ({report.added.length})</summary>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {report.added.map((l) => (
              <li key={l.productId}>
                {l.name} : {l.actual} dans le panier
              </li>
            ))}
          </ul>
        </details>
      )}
      <a
        href="https://www.auchan.fr"
        target="_blank"
        rel="noreferrer"
        className="inline-block rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
      >
        Finaliser ma commande sur auchan.fr
      </a>
      <p className="text-sm text-zinc-500">
        MyFresh ne passe jamais commande : choisis ton créneau et paie sur le site Auchan.
      </p>
    </div>
  );
}
```

- [ ] **Step 3 : Page `src/app/semaines/[id]/panier/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ActionButton } from "@/app/_components/action-button";
import { JobProgress } from "@/app/_components/job-progress";
import { confirmPushAction } from "@/app/actions";
import { getApp } from "@/lib/app/instance";
import { type PushPreview, previewPush } from "@/lib/cart/push";
import { formatEur, formatWeekDate } from "@/lib/format";
import { weekTotals } from "@/lib/week/edit";
import { cartView } from "@/lib/week/view";
import { PushReportView } from "./push-report";

export default async function CartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const app = getApp();
  const week = app.getWeek(id);
  if (!week) notFound();

  const view = cartView(week);
  const header = (
    <>
      <Link href={`/semaines/${week.id}`} className="text-sm text-emerald-700 underline">
        ← Retour à la semaine
      </Link>
      <h1 className="text-2xl font-semibold">Panier Auchan · semaine du {formatWeekDate(week.id)}</h1>
    </>
  );

  if (view === "progress" && week.job) {
    return (
      <div className="space-y-4">
        {header}
        <JobProgress job={week.job} />
      </div>
    );
  }
  if (view === "report" && week.pushReport) {
    return (
      <div className="space-y-4">
        {header}
        <PushReportView report={week.pushReport} />
      </div>
    );
  }
  if (view === "not-ready") {
    return (
      <div className="space-y-4">
        {header}
        <p className="text-zinc-600">La semaine n&apos;est pas encore prête.</p>
      </div>
    );
  }

  const { basket } = weekTotals(week);
  if (!basket.lines.length) {
    return (
      <div className="space-y-4">
        {header}
        <p className="text-zinc-600">Aucun produit à envoyer : retiens au moins une recette.</p>
      </div>
    );
  }

  let preview: PushPreview | null = null;
  let error: string | null = null;
  try {
    const connector = await app.openStore();
    preview = previewPush(await connector.getCart(), basket.lines);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="space-y-4">
      {header}
      {week.job?.kind === "push" && week.job.status === "error" && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          Échec de l&apos;envoi : {week.job.error}
        </p>
      )}
      {!preview ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-medium">Impossible de lire ton panier Auchan.</p>
          <p className="text-sm">{error}</p>
          <p className="mt-2 text-sm">
            Vérifie que tu es connecté sur auchan.fr dans Chrome, avec ton drive choisi, puis recharge la page.
          </p>
        </div>
      ) : (
        <>
          <p className="text-zinc-600">
            Voici ce que MyFresh va mettre dans ton panier. Les quantités s&apos;ajoutent à ce qui s&apos;y trouve déjà.
            MyFresh ne passe jamais commande : tu finaliseras sur auchan.fr.
          </p>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-600">
                <tr>
                  <th className="p-3">Produit</th>
                  <th className="p-3 text-right">À ajouter</th>
                  <th className="p-3 text-right">Déjà au panier</th>
                  <th className="p-3 text-right">Total dans le panier</th>
                  <th className="p-3 text-right">Coût</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {preview.rows.map((r) => (
                  <tr key={r.productId}>
                    <td className="p-3">
                      <a href={r.url} target="_blank" rel="noreferrer" className="font-medium underline">
                        {r.productName}
                      </a>
                      <span className="block text-xs text-zinc-500">{r.ingredients.join(", ")}</span>
                    </td>
                    <td className="p-3 text-right">{r.packs}</td>
                    <td className="p-3 text-right">{r.inCart}</td>
                    <td className="p-3 text-right font-medium">{r.finalQuantity}</td>
                    <td className="p-3 text-right">{formatEur(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Coût des produits ajoutés (prix en rayon) : {formatEur(preview.addedCost)}</p>
          <ActionButton
            action={confirmPushAction.bind(null, week.id)}
            label={`Confirmer l'ajout de ${preview.cartLines.length} produits au panier`}
            pendingLabel="Envoi…"
            variant="primary"
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4 : Vérifier types, lint, tests et build**

Run : `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected : aucune erreur ; route `/semaines/[id]/panier` dynamique (ƒ).

- [ ] **Step 5 : Commit**

```bash
git add src/app
git commit -m "feat(app): écran du panier (aperçu cumulé, confirmation, rapport)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6 : (vérification manuelle) Semaine réelle de bout en bout**

À faire par le contrôleur avec l'utilisateur (Chrome connecté à auchan.fr, drive choisi ; modifie son vrai panier, jamais de commande) :

1. `npm run dev`, ouvrir http://127.0.0.1:3000. « Vérifier la session » → ✓ « Session reprise de Chrome, drive détecté. » ; « Claude : Claude Code (abonnement) » (sans `ANTHROPIC_API_KEY`).
2. « Nouvelle semaine » : 4 dîners, 2 adultes, 2 enfants, 60 €, « Adapté aux enfants ». « Préparer la semaine » → redirection vers `/semaines/<id>` ; la progression passe par « Connexion à Auchan », « Contexte de la semaine », « Génération des recettes (Claude Code (abonnement)) », « Choix des produits Auchan » (compteur), « Vérification des produits par Claude », puis l'écran de validation, sans recharger à la main.
3. Pendant la génération, un 2e onglet sur « Nouvelle semaine » affiche l'avertissement de tâche en cours, et lancer une 2e semaine est refusé.
4. Écran de validation : 6 recettes dont 4 retenues ; étapes « Avec les enfants » visibles ; courgette, oignon, fromage frais sont des produits bruts ; changer un produit, décocher le placard et changer de recette mettent à jour le total.
5. « Modifier cette recette » avec « sans four » : progression « Modification de « … » », puis la recette est réécrite, reste retenue, et seuls ses produits ont changé.
6. « Vérifier le panier » : les colonnes « Déjà au panier » et « Total dans le panier » reflètent le panier Auchan actuel. « Confirmer » → progression « Ajout au panier Auchan » (compteur) → rapport. Sur auchan.fr, les quantités sont cumulées. Recharger la page : le rapport reste, aucun bouton de renvoi.
7. Redémarrer `npm run dev` pendant une génération : la semaine affiche « Tâche interrompue (le serveur a redémarré). Relance-la. » et « Relancer » reprend (sans rappeler Claude si les recettes étaient déjà enregistrées).
8. `lsof -nP -iTCP:3000 -sTCP:LISTEN` : uniquement `127.0.0.1:3000`.

---

## Hors de ce plan (plan 3)

- `/semaines/[id]/imprimer` (CSS print) et export PDF A4 via Playwright `page.pdf()`.
- Favoris (étoile sur une recette, réutilisation dans une nouvelle semaine).
- Pas de répétition : titres des recettes retenues sur les 4 dernières semaines transmis au prompt.
- Thèmes de la semaine : corriger `parseThemes` à partir d'une fixture réelle de la page d'accueil.
