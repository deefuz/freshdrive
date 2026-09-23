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
    const jsonSchema = JSON.parse(args[args.indexOf("--json-schema") + 1]);
    expect(jsonSchema.properties.answer).toBeDefined();
    // Claude Code refuse le méta-schéma 2020-12 (vérifié en réel) : draft-07 obligatoire.
    expect(jsonSchema.$schema).toBe("http://json-schema.org/draft-07/schema#");
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
