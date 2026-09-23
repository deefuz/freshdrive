import { formatDateTime, JOB_LABELS } from "@/lib/format";
import type { JobState } from "@/lib/store/weeks";
import { JobPoller } from "./job-poller";
import { card } from "./ui";

export function JobProgress({ job }: { job: JobState }) {
  const pct = job.progress && job.progress.total ? Math.round((job.progress.done / job.progress.total) * 100) : null;
  return (
    <section className={`${card} p-6`} aria-live="polite">
      <h2 className="text-2xl font-bold tracking-[-0.02em]">{JOB_LABELS[job.kind]}</h2>
      <p className="mt-1 text-graphite">{job.step}…</p>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-oat">
        {job.progress && pct !== null ? (
          <div
            className="h-full origin-left rounded-full bg-lime transition-transform duration-500 ease-out-quart"
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        ) : (
          <div className="progress-indeterminate h-full w-1/3 rounded-full bg-lime" />
        )}
      </div>
      {job.progress && pct !== null && (
        <p className="mt-1.5 text-sm text-pebble tabular-nums">
          {job.progress.done} / {job.progress.total}
        </p>
      )}
      <p className="mt-4 max-w-[70ch] text-sm text-pebble">
        Démarré le {formatDateTime(job.startedAt)}. La page se met à jour toute seule ; la génération des recettes peut
        prendre plusieurs minutes.
      </p>
      <JobPoller />
    </section>
  );
}
