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
  /** posé avant le premier envoi de ligne au panier ; empêche un 2e envoi si le serveur redémarre en cours de route */
  pushStartedAt?: string;
  /** avertissements de la dernière préparation (ex. : vérification des produits par Claude impossible) */
  warnings?: string[];
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
