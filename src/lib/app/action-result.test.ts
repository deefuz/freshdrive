import { describe, expect, it } from "vitest";
import { failure, formValues } from "./action-result";

describe("formValues", () => {
  it("renvoie les champs texte saisis, les champs répétés en liste", () => {
    const fd = new FormData();
    fd.set("dinners", "4");
    fd.set("notes", "sans four");
    fd.append("filters", "vegetarian");
    fd.append("filters", "quick");
    fd.set("preferOrganic", "on");
    expect(formValues(fd)).toEqual({
      dinners: ["4"],
      notes: ["sans four"],
      filters: ["vegetarian", "quick"],
      preferOrganic: ["on"],
    });
  });

  it("ignore les fichiers et les champs internes de Next ($ACTION_…)", () => {
    const fd = new FormData();
    fd.set("instruction", "moins épicé");
    fd.set("$ACTION_ID_abc", "");
    fd.set("piece", new Blob(["x"]), "x.txt");
    expect(formValues(fd)).toEqual({ instruction: ["moins épicé"] });
  });

  it("failure garde les valeurs saisies quand on les lui donne", () => {
    expect(failure(new Error("Budget invalide."), { budgetEur: ["abc"] })).toEqual({
      error: "Budget invalide.",
      values: { budgetEur: ["abc"] },
    });
    expect(failure("x")).toEqual({ error: "x" });
  });
});
