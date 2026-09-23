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
  const res = await exec(deps.command ?? "claude", claudeArgs(prompt, z.toJSONSchema(schema, { target: "draft-7" })), { timeoutMs });
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
