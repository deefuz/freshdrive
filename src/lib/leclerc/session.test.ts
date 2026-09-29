import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LeclercSession, loadSession, SessionMissingError } from "./session";

describe("LeclercSession.cookieHeaderFor", () => {
  const session = new LeclercSession([
    { name: "datadome", value: "d", domain: ".leclercdrive.fr" },
    { name: "ASP.NET_SessionId", value: "s16", domain: "fd16-courses.leclercdrive.fr" },
    { name: "autre", value: "x", domain: "fd14-courses.leclercdrive.fr" },
    { name: "apex", value: "a", domain: "leclercdrive.fr" },
  ]);

  it("cookies du domaine et de l'hôte exact seulement", () => {
    expect(session.cookieHeaderFor("fd16-courses.leclercdrive.fr")).toBe("datadome=d; ASP.NET_SessionId=s16");
    expect(session.cookieHeaderFor("www.leclercdrive.fr")).toBe("datadome=d");
    expect(session.cookieHeaderFor("leclercdrive.fr")).toBe("datadome=d; apex=a");
  });
});

describe("loadSession", () => {
  it("garde les cookies leclercdrive.fr non expirés", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "leclerc-")), "state.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        cookies: [
          { name: "a", value: "1", domain: ".leclercdrive.fr", expires: -1 },
          { name: "b", value: "2", domain: "fd16-courses.leclercdrive.fr", expires: 50 },
          { name: "c", value: "3", domain: ".leclercdrive.fr", expires: 200 },
          { name: "d", value: "4", domain: ".exemple.fr", expires: -1 },
        ],
      }),
    );
    expect(loadSession(file, 100_000).cookies.map((c) => c.name)).toEqual(["a", "c"]);
  });

  it("fichier absent : SessionMissingError", () => {
    expect(() => loadSession("/nulle/part.json")).toThrow(SessionMissingError);
  });
});
