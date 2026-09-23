import { APP_PORT } from "../app/host-guard";
import { isWeekId, type Week } from "../store/weeks";
import { isPrintable, parsePrintOptions, printQuery, searchParamsRecord } from "./sheet";

/** Rend une page web en PDF A4 ; injecté pour que les tests ne lancent jamais de navigateur. */
export type PdfRenderer = (url: string) => Promise<Uint8Array>;

/** Adresse locale de l'app : acceptée par la protection Host de src/proxy.ts. */
export const LOCAL_APP_URL = `http://127.0.0.1:${APP_PORT}`;
const PDF_TIMEOUT_MS = 60_000;

/** Chromium sans fenêtre (Playwright) : ouvre l'URL et l'imprime en A4, fonds compris. */
export function createPlaywrightPdfRenderer(timeoutMs: number = PDF_TIMEOUT_MS): PdfRenderer {
  return async (url) => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
      return await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      });
    } finally {
      await browser.close();
    }
  };
}

export interface PdfDeps {
  getWeek(id: string): Week | null;
  render: PdfRenderer;
  /** défaut : LOCAL_APP_URL */
  baseUrl?: string;
}

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/** Réponse de GET /semaines/<id>/pdf : la page d'impression rendue en PDF, en téléchargement. */
const ALLOWED_SEC_FETCH_SITES = new Set([null, "same-origin", "none"]);

export async function pdfResponse(request: Request, id: string, deps: PdfDeps): Promise<Response> {
  if (!ALLOWED_SEC_FETCH_SITES.has(request.headers.get("sec-fetch-site"))) return text("Accès refusé.", 403);
  const week = isWeekId(id) ? deps.getWeek(id) : null;
  if (!week) return text("Semaine introuvable.", 404);
  if (!isPrintable(week)) return text("Rien à imprimer : la semaine n'est pas prête ou aucune recette n'est retenue.", 409);
  const params = new URL(request.url).searchParams;
  const disposition = params.get("affichage") === "1" ? "inline" : "attachment";
  const options = parsePrintOptions(searchParamsRecord(params));
  if (!options.sections.length) return text("Choisis au moins une section à imprimer.", 400);

  const url = `${deps.baseUrl ?? LOCAL_APP_URL}/semaines/${week.id}/imprimer?${printQuery(options)}`;
  let pdf: Uint8Array;
  try {
    pdf = await deps.render(url);
  } catch (e) {
    return text(`Impossible de créer le PDF : ${e instanceof Error ? e.message : String(e)}`, 500);
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${disposition}; filename="freshdrive-${week.id}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
