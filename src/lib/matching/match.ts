import { isRelevant } from "../text";
import type { Product, StoreConnector } from "../types";
import type { Arbiter } from "./arbiter";
import type { IngredientNeed } from "./needs";
import { type MatchCandidate, type ScoreOptions, scoreCandidate } from "./score";

export interface IngredientMatch {
  need: IngredientNeed;
  chosen: MatchCandidate | null;
  alternatives: MatchCandidate[];
}

export interface MatchDeps {
  connector: StoreConnector;
  arbiter?: Arbiter;
  novaLookup?: (p: Product) => Promise<number | null>;
  onProgress?: (done: number, total: number) => void;
}

const MAX_CANDIDATES = 8;
const ARBITER_CANDIDATES = 5;
const MAX_NOVA_CHECKS = 3;

export async function matchNeeds(needs: IngredientNeed[], opts: ScoreOptions, deps: MatchDeps): Promise<IngredientMatch[]> {
  const ranked: MatchCandidate[][] = [];
  for (const [i, need] of needs.entries()) {
    const results = await deps.connector.searchProducts(need.searchQuery);
    ranked.push(
      results
        .filter((p) => p.stock !== 0)
        .filter((p) => p.sellerId !== null)
        .filter((p) => isRelevant(need.searchQuery, p.name) || isRelevant(need.name, p.name))
        .slice(0, MAX_CANDIDATES)
        .map((p) => scoreCandidate(need, p, opts))
        .sort((a, b) => a.score - b.score),
    );
    deps.onProgress?.(i + 1, needs.length);
  }

  const choices = new Map<string, number>();
  if (deps.arbiter) {
    const items = needs
      .map((need, i) => ({ need, cands: ranked[i] }))
      .filter(({ cands }) => cands.length > 1)
      .map(({ need, cands }) => ({
        key: need.key,
        ingredient: need.name,
        candidates: cands.slice(0, ARBITER_CANDIDATES).map((c) => ({
          name: c.product.name,
          brand: c.product.brand,
          pack: c.product.pack ? `${c.product.pack.value}${c.product.pack.unit}` : "?",
          price: c.product.price,
        })),
      }));
    if (items.length) for (const [k, v] of await deps.arbiter(items)) choices.set(k, v);
  }

  const matches: IngredientMatch[] = [];
  for (const [i, need] of needs.entries()) {
    const cands = ranked[i];
    const idx = choices.get(need.key) ?? 0;
    let chosen = idx >= 0 && idx < Math.min(cands.length, ARBITER_CANDIDATES) ? cands[idx] : idx === -1 ? null : (cands[0] ?? null);

    if (chosen && opts.unprocessed && deps.novaLookup) {
      const ordered = [chosen, ...cands.filter((c) => c !== chosen)].slice(0, MAX_NOVA_CHECKS);
      chosen = null;
      for (const c of ordered) {
        let nova: number | null = null;
        if (c.product.url) {
          try {
            nova = await deps.novaLookup(c.product);
          } catch {
            nova = null;
          }
        }
        if (nova !== 4) {
          chosen = c;
          break;
        }
      }
    }
    matches.push({ need, chosen, alternatives: cands.filter((c) => c !== chosen) });
  }
  return matches;
}
