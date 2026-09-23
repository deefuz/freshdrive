import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSession, SessionMissingError } from "./session";

const fixture = path.join(__dirname, "../../../tests/fixtures/auchan/storage-state.json");

describe("loadSession", () => {
  it("garde les cookies auchan.fr non expirés et lit le consentId", () => {
    const s = loadSession(fixture, 1_700_000_000_000);
    expect(s.cookieHeader).toBe("lark-consentId=consent-123; sid=abc");
    expect(s.consentId).toBe("consent-123");
  });

  it("lève SessionMissingError si le fichier n'existe pas", () => {
    expect(() => loadSession("/nope/state.json")).toThrow(SessionMissingError);
  });
});
