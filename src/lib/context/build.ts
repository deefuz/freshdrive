import type { Product, StoreConnector } from "../types";
import { type CalendarEvent, upcomingEvents } from "./events";
import { getSeason, type Season, seasonalProduceFor } from "./season";

export interface WeeklyContext {
  generatedAt: string;
  season: Season;
  seasonalProduce: string[];
  events: CalendarEvent[];
  promos: Product[];
  antiGaspi: Product[];
  themes: string[];
}

export async function buildWeeklyContext(connector: StoreConnector, now: Date = new Date()): Promise<WeeklyContext> {
  const store = await connector.getStoreContext();
  return {
    generatedAt: now.toISOString(),
    season: getSeason(now),
    seasonalProduce: seasonalProduceFor(now),
    events: upcomingEvents(now),
    promos: store.promos,
    antiGaspi: store.antiGaspi,
    themes: store.themes,
  };
}

/** Faux si le contexte n'a aucune promo : signe probable d'une session Auchan expirée (page vide/de connexion)
 * plutôt qu'un vrai magasin sans promo. Un tel contexte ne doit ni être mis en cache, ni être réutilisé. */
export function isCacheableContext(ctx: WeeklyContext): boolean {
  return ctx.promos.length > 0;
}

export function summarizeContext(ctx: WeeklyContext): string {
  const parts = [`${ctx.promos.length} promos`, `${ctx.antiGaspi.length} anti-gaspi`];
  if (ctx.themes.length) parts.push(`thèmes : ${ctx.themes.join(" ; ")}`);
  if (ctx.events.length) parts.push(`événements : ${ctx.events.map((e) => e.name).join(", ")}`);
  return parts.join(" · ");
}
