import { describe, expect, it, vi } from "vitest";
import { makeRecipe, makeWeek } from "../../../tests/helpers/factories";
import type { Week } from "../store/weeks";
import { createPlaywrightPdfRenderer, LOCAL_APP_URL, type PdfRenderer, pdfResponse } from "./pdf";

const week = makeWeek({ id: "2026-09-23-1", recipes: [makeRecipe({ id: "a" })], selectedRecipeIds: ["a"] });
const PDF_BYTES = new TextEncoder().encode("%PDF-1.7 faux");

function setup(overrides: { weeks?: Week[]; render?: PdfRenderer } = {}) {
  const weeks = overrides.weeks ?? [week];
  const render = vi.fn<PdfRenderer>(overrides.render ?? (async () => PDF_BYTES));
  const getWeek = vi.fn((id: string) => weeks.find((w) => w.id === id) ?? null);
  return { render, getWeek, deps: { getWeek, render } };
}

const request = (query = "", headers: Record<string, string> = {}) =>
  new Request(`http://127.0.0.1:3141/semaines/2026-09-23-1/pdf${query}`, { headers });

describe("pdfResponse", () => {
  it("rend la page d'impression locale avec les options et renvoie le PDF en téléchargement", async () => {
    const { deps, render } = setup();
    const res = await pdfResponse(request("?famille=Martin&sections=courses&o=1&pirate=1"), "2026-09-23-1", deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="myfresh-2026-09-23-1.pdf"');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF_BYTES);
    expect(render).toHaveBeenCalledWith(`${LOCAL_APP_URL}/semaines/2026-09-23-1/imprimer?famille=Martin&sections=courses&o=1`);
    expect(LOCAL_APP_URL).toBe("http://127.0.0.1:3141");
  });

  it("sans option : toutes les sections", async () => {
    const { deps, render } = setup();
    await pdfResponse(request(), "2026-09-23-1", deps);
    expect(render).toHaveBeenCalledWith(`${LOCAL_APP_URL}/semaines/2026-09-23-1/imprimer?sections=recettes&sections=courses&o=1`);
  });

  it("semaine inconnue ou identifiant forgé : 404, sans navigateur", async () => {
    const { deps, render, getWeek } = setup();
    expect((await pdfResponse(request(), "2026-09-30-1", deps)).status).toBe(404);
    const forged = await pdfResponse(request(), "../../etc", deps);
    expect(forged.status).toBe(404);
    expect(await forged.text()).toBe("Semaine introuvable.");
    expect(getWeek).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });

  it("semaine pas prête ou sans recette retenue : 409 ; aucune section : 400", async () => {
    const { deps, render } = setup({
      weeks: [makeWeek({ id: "2026-09-23-1", status: "generating" }), makeWeek({ id: "2026-09-23-2", selectedRecipeIds: [] })],
    });
    expect((await pdfResponse(request(), "2026-09-23-1", deps)).status).toBe(409);
    expect((await pdfResponse(request(), "2026-09-23-2", deps)).status).toBe(409);
    const none = await pdfResponse(request("?o=1"), "2026-09-23-1", setup().deps);
    expect(none.status).toBe(400);
    expect(await none.text()).toBe("Choisis au moins une section à imprimer.");
    expect(render).not.toHaveBeenCalled();
  });

  it("requête venue d'un autre site : 403, sans navigateur", async () => {
    const { deps, render } = setup();
    const res = await pdfResponse(request("", { "sec-fetch-site": "cross-site" }), "2026-09-23-1", deps);
    expect(res.status).toBe(403);
    expect(render).not.toHaveBeenCalled();
  });

  it("échec du rendu (Chromium absent, délai dépassé) : 500 avec un message en français", async () => {
    const { deps } = setup({
      render: async () => {
        throw new Error("Executable doesn't exist");
      },
    });
    const res = await pdfResponse(request(), "2026-09-23-1", deps);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Impossible de créer le PDF : Executable doesn't exist");
  });
});

// Lance un vrai Chromium : seulement avec MYFRESH_PDF_SMOKE=1 (npx playwright install chromium au préalable).
describe.skipIf(!process.env.MYFRESH_PDF_SMOKE)("createPlaywrightPdfRenderer (smoke)", () => {
  it("rend une page HTML en PDF", async () => {
    const html = "<html><body><h1>Bonjour MyFresh</h1></body></html>";
    const pdf = await createPlaywrightPdfRenderer()(`data:text/html,${encodeURIComponent(html)}`);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  }, 60_000);
});
