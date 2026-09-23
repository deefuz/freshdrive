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
