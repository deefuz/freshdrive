import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readVisual, visualSlug, visualUrl } from "./visuals";

describe("visualSlug", () => {
  it("dérive un nom de fichier stable du titre", () => {
    expect(visualSlug("Galettes de sarrasin à l'œuf, champignons et épinards")).toBe(
      "galettes-de-sarrasin-a-l-oeuf-champignons-et-epinards",
    );
    expect(visualSlug("  Dahl doux !  ")).toBe("dahl-doux");
  });
});

describe("visualUrl / readVisual", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "visuels-"));
  fs.writeFileSync(path.join(dir, "dahl-doux.svg"), "<svg/>");

  it("donne l'adresse du visuel seulement s'il existe", () => {
    expect(visualUrl("Dahl doux", dir)).toBe("/visuels/dahl-doux");
    expect(visualUrl("Tarte inconnue", dir)).toBeNull();
  });

  it("lit un visuel et refuse les noms qui sortent du dossier", () => {
    expect(readVisual("dahl-doux", dir)).toBe("<svg/>");
    expect(readVisual("../secret", dir)).toBeNull();
    expect(readVisual("absent", dir)).toBeNull();
  });
});
