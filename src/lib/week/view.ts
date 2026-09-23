import type { Week } from "../store/weeks";

export type WeekView = "progress" | "retry" | "validation";
export type CartView = "progress" | "report" | "not-ready" | "preview";

export function weekView(week: Pick<Week, "job" | "status">): WeekView {
  if (week.job?.status === "running") return "progress";
  if (week.status === "draft" || week.status === "generating") return "retry";
  return "validation";
}

export function cartView(week: Pick<Week, "job" | "status" | "pushReport">): CartView {
  if (week.job?.status === "running") return "progress";
  if (week.pushReport) return "report";
  if (week.status !== "ready") return "not-ready";
  return "preview";
}
