import { describe, expect, it, vi } from "vitest";
import { AuchanHttp, AuchanHttpError, SessionExpiredError } from "./http";

const session = { cookieHeader: "a=1", consentId: "c" };

function fakeClock() {
  let t = 1000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

describe("AuchanHttp", () => {
  it("envoie cookies et en-têtes, et espace les requêtes", async () => {
    const clock = fakeClock();
    const fetchFn = vi.fn(async () => new Response("<html/>", { status: 200 }));
    const http = new AuchanHttp(session, { fetchFn, minIntervalMs: 350, ...clock });

    await http.getText("/recherche?text=a");
    await http.getText("/recherche?text=b");

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.auchan.fr/recherche?text=a");
    expect((init.headers as Record<string, string>).Cookie).toBe("a=1");
    expect(clock.sleeps).toEqual([350]);
  });

  it("postJson envoie du JSON avec X-Requested-With", async () => {
    const fetchFn = vi.fn(async () => Response.json({ ok: true }));
    const http = new AuchanHttp(session, { fetchFn, minIntervalMs: 0 });
    const res = await http.postJson<{ ok: boolean }>("/cart/update", { x: 1 });
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"x":1}');
    expect((init.headers as Record<string, string>)["X-Requested-With"]).toBe("XMLHttpRequest");
    expect(res.ok).toBe(true);
  });

  it("lève SessionExpiredError sur 401/403", async () => {
    const http = new AuchanHttp(session, { fetchFn: async () => new Response("", { status: 403 }), minIntervalMs: 0 });
    await expect(http.getJson("/cart")).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("lève AuchanHttpError sur les autres erreurs", async () => {
    const http = new AuchanHttp(session, { fetchFn: async () => new Response("", { status: 500 }), minIntervalMs: 0 });
    await expect(http.getText("/x")).rejects.toBeInstanceOf(AuchanHttpError);
  });
});
