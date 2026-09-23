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
