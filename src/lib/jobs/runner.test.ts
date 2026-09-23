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
