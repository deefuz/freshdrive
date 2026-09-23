import { describe, expect, it, vi } from "vitest";
import { makeProduct } from "../../../tests/helpers/factories";
import { FakeConnector } from "../../../tests/helpers/fake-connector";
import { NoStoreError, openAuchan, type OpenAuchanDeps } from "./open";
import { SessionMissingError } from "./session";

function deps(overrides: Partial<OpenAuchanDeps> = {}): OpenAuchanDeps {
  const connector = new FakeConnector({ lait: [makeProduct()] });
  return {
    importChrome: vi.fn(() => ({ profile: "Default", cookies: 12 })),
    loadSession: vi.fn(() => ({ cookieHeader: "a=1", consentId: "c" })),
    makeConnector: vi.fn(() => connector),
    checkStore: vi.fn(async () => true),
    ...overrides,
  };
}

describe("openAuchan", () => {
  it("reprend la session de Chrome puis vérifie que le drive est visible", async () => {
    const d = deps();
    const opened = await openAuchan({}, d);
    expect(opened.source).toBe("chrome");
    expect(opened.warnings).toEqual([]);
    expect(d.importChrome).toHaveBeenCalledTimes(1);
    expect(d.checkStore).toHaveBeenCalledWith(opened.connector);
  });

  it("si l'import depuis Chrome échoue : session enregistrée et avertissement", async () => {
    const d = deps({
      importChrome: vi.fn(() => {
        throw new Error("Chrome introuvable sur ce Mac.");
      }),
    });
    const opened = await openAuchan({}, d);
    expect(opened.source).toBe("saved");
    expect(opened.warnings[0]).toContain("Chrome introuvable sur ce Mac.");
  });

  it("importChrome: false n'appelle pas Chrome", async () => {
    const d = deps();
    const opened = await openAuchan({ importChrome: false }, d);
    expect(d.importChrome).not.toHaveBeenCalled();
    expect(opened.source).toBe("saved");
  });

  it("aucun drive visible : NoStoreError", async () => {
    await expect(openAuchan({}, deps({ checkStore: vi.fn(async () => false) }))).rejects.toBeInstanceOf(NoStoreError);
  });

  it("aucune session : l'erreur de session remonte", async () => {
    const d = deps({
      importChrome: vi.fn(() => {
        throw new Error("Aucune session Auchan trouvée dans Chrome");
      }),
      loadSession: vi.fn(() => {
        throw new SessionMissingError("data/auchan-state.json");
      }),
    });
    await expect(openAuchan({}, d)).rejects.toBeInstanceOf(SessionMissingError);
  });
});
