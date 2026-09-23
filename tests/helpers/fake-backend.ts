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
    drawVisuals: vi.fn<LlmBackend["drawVisuals"]>(async () => []),
    ...overrides,
  };
}
