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
