import { formatDateTime, JOB_LABELS } from "@/lib/format";
import type { JobState } from "@/lib/store/weeks";
import { JobPoller } from "./job-poller";

export function JobProgress({ job }: { job: JobState }) {
  const pct = job.progress && job.progress.total ? Math.round((job.progress.done / job.progress.total) * 100) : null;
  return (
    <section className="rounded-xl border border-emerald-200 bg-white p-6" aria-live="polite">
      <h2 className="text-lg font-semibold">{JOB_LABELS[job.kind]}</h2>
      <p className="mt-1 text-zinc-700">{job.step}…</p>
      {job.progress && pct !== null && (
        <div className="mt-3">
          <div className="h-2 rounded bg-zinc-200">
            <div className="h-2 rounded bg-emerald-600" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {job.progress.done} / {job.progress.total}
          </p>
        </div>
      )}
      <p className="mt-4 text-sm text-zinc-500">
        Démarré le {formatDateTime(job.startedAt)}. La page se met à jour toute seule ; la génération des recettes peut
        prendre plusieurs minutes.
      </p>
      <JobPoller />
    </section>
  );
}
