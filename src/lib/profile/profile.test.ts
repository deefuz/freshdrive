import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, householdCounts, type Profile, profilePromptBlock } from "./profile";
import { ProfileStore } from "./store";

const profile: Profile = {
  members: [
    { name: "Alex", kind: "adult", age: null, allergies: [], otherAllergies: "", dislikes: "" },
    { name: "Léa", kind: "child", age: 7, allergies: ["peanuts", "sesame"], otherAllergies: "kiwi", dislikes: "champignons" },
    { name: "Tom", kind: "child", age: 4, allergies: [], otherAllergies: "", dislikes: "" },
  ],
  appliances: ["oven", "induction", "blender"],
  otherAppliances: "yaourtière",
  utensils: ["cast_iron_pot", "skewers"],
  otherUtensils: "",
  weeknightMaxMinutes: 40,
  habits: "On dîne à 19 h ; les restes servent au déjeuner du lendemain.",
  likes: "cuisine du monde",
  avoid: "plats trop gras",
};

describe("householdCounts", () => {
  it("compte adultes et enfants du foyer", () => {
    expect(householdCounts(profile)).toEqual({ adults: 1, children: 2 });
    expect(householdCounts(EMPTY_PROFILE)).toBeNull();
    // une semaine demande au moins un adulte
    expect(householdCounts({ ...EMPTY_PROFILE, members: [profile.members[1]] })).toEqual({ adults: 1, children: 1 });
  });
});

describe("profilePromptBlock", () => {
  const block = profilePromptBlock(profile);

  it("liste les allergies comme des interdits absolus, avec la personne concernée", () => {
    expect(block).toContain("ALLERGIES (interdits absolus, aucune trace dans aucune recette) : arachides (Léa), sésame (Léa), kiwi (Léa).");
  });

  it("décrit le foyer, les goûts et les habitudes", () => {
    expect(block).toContain("- Léa, enfant de 7 ans ; n'aime pas : champignons");
    expect(block).toContain("- Tom, enfant de 4 ans");
    expect(block).toContain("40 min maximum");
    expect(block).toContain("On dîne à 19 h");
    expect(block).toContain("On aime : cuisine du monde");
    expect(block).toContain("À éviter : plats trop gras");
  });

  it("limite les recettes au matériel disponible", () => {
    expect(block).toContain("Appareils disponibles (n'en suppose aucun autre) : four, plaques à induction, blender, yaourtière.");
    expect(block).toContain("Ustensiles notables : cocotte en fonte, pics à brochette.");
  });

  it("profil vide : rien à dire", () => {
    expect(profilePromptBlock(EMPTY_PROFILE)).toBe("");
  });
});

describe("ProfileStore", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "profil-")), "profile.json");

  it("rend un profil vide tant que rien n'est enregistré, puis relit ce qui a été enregistré", () => {
    const store = new ProfileStore(file);
    expect(store.get()).toEqual(EMPTY_PROFILE);
    store.save(profile);
    expect(new ProfileStore(file).get()).toEqual(profile);
  });

  it("un fichier abîmé donne un profil vide", () => {
    fs.writeFileSync(file, "{ pas du json");
    expect(new ProfileStore(file).get()).toEqual(EMPTY_PROFILE);
  });
});
