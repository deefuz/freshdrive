import { describe, expect, it, vi } from "vitest";
import { SessionExpiredError } from "../drives/errors";
import { RequestGate } from "../drives/gate";
import { LeclercHttp, LeclercHttpError } from "./http";
import { LeclercSession } from "./session";

const session = new LeclercSession([
  { name: "datadome", value: "d", domain: ".leclercdrive.fr" },
  { name: "sid", value: "s", domain: "fd16-courses.leclercdrive.fr" },
]);
const noWait = { wait: async () => undefined } as unknown as RequestGate;
const STORE = "https://fd16-courses.leclercdrive.fr/magasin-274401-x/recherche.aspx?TexteRecherche=lait";

function respond(body: string, init: ResponseInit & { url?: string } = {}) {
  const res = new Response(body, init);
  if (init.url) Object.defineProperty(res, "url", { value: init.url });
  return vi.fn(async () => res);
}

describe("LeclercHttp", () => {
  it("envoie les cookies valables pour l'hôte demandé", async () => {
    const fetchFn = respond("<html></html>", { url: STORE });
    await new LeclercHttp(session, { fetchFn, gate: noWait }).getText(STORE);
    const headers = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.Cookie).toBe("datadome=d; sid=s");
  });

  it("403 ou captcha DataDome : session expirée", async () => {
    await expect(new LeclercHttp(session, { fetchFn: respond("", { status: 403 }), gate: noWait }).getText(STORE)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
    const captcha = respond(`<script src="https://ct.captcha-delivery.com/c.js"></script>`, { url: STORE });
    await expect(new LeclercHttp(session, { fetchFn: captcha, gate: noWait }).getText(STORE)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
  });

  it("renvoi vers l'accueil public : session expirée ; page d'erreur : erreur HTTP", async () => {
    const home = respond("<html></html>", { url: "https://www.leclercdrive.fr/" });
    await expect(new LeclercHttp(session, { fetchFn: home, gate: noWait }).getText(STORE)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
    const error = respond("<html></html>", { url: "https://fd16-courses.leclercdrive.fr/PageDir/pgeWCSD002_Erreur.aspx" });
    await expect(new LeclercHttp(session, { fetchFn: error, gate: noWait }).getText(STORE)).rejects.toBeInstanceOf(
      LeclercHttpError,
    );
  });

  it("getRedirect lit l'en-tête Location sans suivre la redirection", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 302, headers: { Location: "/?mag=274401-274401" } }));
    expect(await new LeclercHttp(session, { fetchFn, gate: noWait }).getRedirect("https://www.leclercdrive.fr/")).toBe(
      "/?mag=274401-274401",
    );
    expect((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe("manual");
  });

  it("postForm : corps urlencodé, réponse JSON ; page HTML à la place : session expirée", async () => {
    const fetchFn = respond(`[{"eTypeEvenement":1}]`, { url: STORE });
    const http = new LeclercHttp(session, { fetchFn, gate: noWait });
    expect(await http.postForm(STORE, { d: `{"a":1}` })).toEqual([{ eTypeEvenement: 1 }]);
    expect((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body).toBe("d=%7B%22a%22%3A1%7D");
    const html = new LeclercHttp(session, { fetchFn: respond("<html>connexion</html>", { url: STORE }), gate: noWait });
    await expect(html.postForm(STORE, { d: "{}" })).rejects.toBeInstanceOf(SessionExpiredError);
  });
});
