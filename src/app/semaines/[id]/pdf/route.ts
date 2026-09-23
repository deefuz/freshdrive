import { getApp } from "@/lib/app/instance";
import { createPlaywrightPdfRenderer, pdfResponse } from "@/lib/print/pdf";

/** Télécharge la page d'impression de la semaine en PDF (A4), rendue par Chromium via Playwright. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return pdfResponse(request, id, {
    getWeek: (weekId) => getApp().getWeek(weekId),
    render: createPlaywrightPdfRenderer(),
  });
}
