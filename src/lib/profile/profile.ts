import { z } from "zod";

/** Les 14 allergènes à déclaration obligatoire en Europe. */
export const ALLERGENS = {
  gluten: "gluten",
  crustaceans: "crustacés",
  eggs: "œufs",
  fish: "poisson",
  peanuts: "arachides",
  soy: "soja",
  milk: "lait",
  nuts: "fruits à coque",
  celery: "céleri",
  mustard: "moutarde",
  sesame: "sésame",
  sulphites: "sulfites",
  lupin: "lupin",
  molluscs: "mollusques",
} as const;
export type Allergen = keyof typeof ALLERGENS;

export const APPLIANCES = {
  oven: "four",
  microwave: "micro-ondes",
  induction: "plaques à induction",
  gas: "gazinière",
  air_fryer: "friteuse sans huile",
  food_processor: "robot cuiseur",
  blender: "blender",
  hand_blender: "mixeur plongeant",
  steamer: "cuiseur vapeur",
  pressure_cooker: "autocuiseur",
  plancha: "plancha",
  barbecue: "barbecue",
  raclette: "appareil à raclette",
  crepe_maker: "crêpière",
} as const;
export type Appliance = keyof typeof APPLIANCES;

export const UTENSILS = {
  wok: "wok",
  cast_iron_pot: "cocotte en fonte",
  large_pan: "grande sauteuse",
  baking_sheet: "plaque de cuisson",
  gratin_dish: "plat à gratin",
  tart_pan: "moule à tarte",
  muffin_tin: "moule à muffins",
  mandoline: "mandoline",
  grater: "râpe",
  skewers: "pics à brochette",
  rolling_pin: "rouleau à pâtisserie",
  scale: "balance",
} as const;
export type Utensil = keyof typeof UTENSILS;

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const MemberSchema = z.object({
  name: z.string().trim().min(1).max(40),
  kind: z.enum(["adult", "child"]),
  age: z.number().int().min(0).max(120).nullable(),
  allergies: z.array(z.enum(keys(ALLERGENS))),
  otherAllergies: z.string().max(200),
  dislikes: z.string().max(200),
});
export type Member = z.infer<typeof MemberSchema>;

export const ProfileSchema = z.object({
  members: z.array(MemberSchema).max(12),
  appliances: z.array(z.enum(keys(APPLIANCES))),
  otherAppliances: z.string().max(200),
  utensils: z.array(z.enum(keys(UTENSILS))),
  otherUtensils: z.string().max(200),
  /** temps total (préparation + cuisson) visé un soir de semaine ; null = pas de limite */
  weeknightMaxMinutes: z.number().int().min(10).max(240).nullable(),
  habits: z.string().max(1000),
  likes: z.string().max(500),
  avoid: z.string().max(500),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const EMPTY_PROFILE: Profile = {
  members: [],
  appliances: [],
  otherAppliances: "",
  utensils: [],
  otherUtensils: "",
  weeknightMaxMinutes: null,
  habits: "",
  likes: "",
  avoid: "",
};

/** Adultes et enfants du foyer, pour pré-remplir une nouvelle semaine (au moins un adulte) ; null sans membre. */
export function householdCounts(profile: Profile): { adults: number; children: number } | null {
  if (!profile.members.length) return null;
  const children = profile.members.filter((m) => m.kind === "child").length;
  return { adults: Math.max(1, profile.members.length - children), children };
}

/** « kiwi, fraises » → ["kiwi", "fraises"] */
const splitList = (text: string) =>
  text
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter(Boolean);

function memberLine(m: Member): string {
  const who = m.kind === "adult" ? "adulte" : "enfant";
  const age = m.age !== null ? ` de ${m.age} an${m.age > 1 ? "s" : ""}` : "";
  return `- ${m.name}, ${who}${age}${m.dislikes.trim() ? ` ; n'aime pas : ${m.dislikes.trim()}` : ""}`;
}

/** Profil du foyer tel que Claude doit le respecter ; chaîne vide si le profil est vide. */
export function profilePromptBlock(profile: Profile): string {
  const allergies = profile.members.flatMap((m) => [
    ...m.allergies.map((a) => `${ALLERGENS[a]} (${m.name})`),
    ...splitList(m.otherAllergies).map((a) => `${a} (${m.name})`),
  ]);
  const appliances = [...profile.appliances.map((a) => APPLIANCES[a]), ...splitList(profile.otherAppliances)];
  const utensils = [...profile.utensils.map((u) => UTENSILS[u]), ...splitList(profile.otherUtensils)];
  return [
    allergies.length ? `ALLERGIES (interdits absolus, aucune trace dans aucune recette) : ${allergies.join(", ")}.` : "",
    profile.members.length ? `Membres du foyer :\n${profile.members.map(memberLine).join("\n")}` : "",
    appliances.length ? `Appareils disponibles (n'en suppose aucun autre) : ${appliances.join(", ")}.` : "",
    utensils.length ? `Ustensiles notables : ${utensils.join(", ")}.` : "",
    profile.weeknightMaxMinutes !== null
      ? `Temps total par dîner : ${profile.weeknightMaxMinutes} min maximum (préparation + cuisson).`
      : "",
    profile.habits.trim() ? `Habitudes du foyer : ${profile.habits.trim()}` : "",
    profile.likes.trim() ? `On aime : ${profile.likes.trim()}` : "",
    profile.avoid.trim() ? `À éviter : ${profile.avoid.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
