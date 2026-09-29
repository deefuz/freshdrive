import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { NoStoreError, SessionExpiredError } from "../drives/errors";
import type { LeclercHttpClient } from "./http";
import { openLeclerc, type OpenLeclercDeps, resolveStore, storeFromCookies } from "./open";
import { LeclercSession } from "./session";

const fixture = (name: string) => fs.readFileSync(`tests/fixtures/leclerc/${name}`, "utf8");
const STORE_HOME = "https://fd16-courses.leclercdrive.fr/magasin-274401-Orvault-Grand-Val/home.aspx";

function http(overrides: Partial<Record<"home" | "probe" | "storeHome" | "search", string | null>> = {}): LeclercHttpClient {
  const pages = {
    home: "https://www.leclercdrive.fr/?mag=274401-274401&sRedirect=false",
    probe: STORE_HOME,
    storeHome: fixture("home.html"),
    search: fixture("search.html"),
    ...overrides,
  };
  return {
    getRedirect: async (url) => (url === "https://www.leclercdrive.fr/" ? pages.home : pages.probe),
    getText: async (url) => (url.includes("recherche.aspx") ? pages.search! : pages.storeHome!),
    postForm: async () => {
      throw new Error("pas de POST à l'ouverture");
    },
  };
}

describe("resolveStore", () => {
  it("point de livraison depuis l'accueil, serveur et chemin depuis la redirection du magasin", async () => {
    expect(await resolveStore(http())).toEqual({
      noPL: "274401",
      origin: "https://fd16-courses.leclercdrive.fr",
      storePath: "/magasin-274401-Orvault-Grand-Val",
    });
  });

  it("sans redirection de l'accueil : magasin du cookie de session, sinon dernier magasin trouvé", async () => {
    const noRedirect = http({ home: null });
    expect((await resolveStore(noRedirect, { cookieNames: ["datadome", "clsWCCD125:@274401"] })).noPL).toBe("274401");
    const saved = { noPL: "274401", origin: "https://fd16-courses.leclercdrive.fr", storePath: "/magasin-274401-x" };
    expect((await resolveStore(noRedirect, { saved })).storePath).toBe("/magasin-274401-Orvault-Grand-Val");
  });

  it("aucun magasin choisi : NoStoreError", async () => {
    await expect(resolveStore(http({ home: "https://www.leclercdrive.fr/?sRedirect=false" }))).rejects.toBeInstanceOf(
      NoStoreError,
    );
    await expect(resolveStore(http({ home: null }))).rejects.toBeInstanceOf(NoStoreError);
  });

  it("redirection vers un autre magasin : NoStoreError", async () => {
    await expect(
      resolveStore(http({ probe: "https://fd3-courses.leclercdrive.fr/magasin-999999-Ailleurs/home.aspx" })),
    ).rejects.toBeInstanceOf(NoStoreError);
  });
});

describe("storeFromCookies", () => {
  it("un seul magasin courant, sinon rien", () => {
    expect(storeFromCookies(["clsWCCD125:@274401", "clsWDMA031:ciBandeauQLMC-7002-iOpcGT-274401"])).toBe("274401");
    expect(storeFromCookies(["clsWCCD125:@1", "clsWCCD125:@2"])).toBeNull();
    expect(storeFromCookies([])).toBeNull();
  });
});

function deps(client: LeclercHttpClient, overrides: Partial<OpenLeclercDeps> = {}): OpenLeclercDeps {
  return {
    readStore: () => null,
    saveStore: vi.fn(),
    importChrome: vi.fn(() => ({ profile: "Default", cookies: 30 })),
    loadSession: () => new LeclercSession([]),
    makeHttp: () => client,
    ...overrides,
  };
}

describe("openLeclerc", () => {
  it("session reprise de Chrome, magasin trouvé, client connecté", async () => {
    const d = deps(http());
    const opened = await openLeclerc({}, d);
    expect(d.saveStore).toHaveBeenCalledWith(expect.objectContaining({ noPL: "274401" }));
    expect(opened.source).toBe("chrome");
    expect(opened.warnings).toEqual([]);
    expect(await opened.connector.searchProducts("lait")).toHaveLength(5);
  });

  it("import Chrome impossible : session enregistrée et avertissement", async () => {
    const d = deps(http(), {
      importChrome: () => {
        throw new Error("trousseau refusé");
      },
    });
    const opened = await openLeclerc({}, d);
    expect(opened.source).toBe("saved");
    expect(opened.warnings[0]).toMatch(/trousseau refusé/);
  });

  it("client non connecté : session expirée", async () => {
    await expect(openLeclerc({}, deps(http({ storeHome: `{"fClientConnecte":false}` })))).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
  });

  it("boutique vide : NoStoreError", async () => {
    await expect(openLeclerc({}, deps(http({ search: "<html></html>" })))).rejects.toBeInstanceOf(NoStoreError);
  });
});
