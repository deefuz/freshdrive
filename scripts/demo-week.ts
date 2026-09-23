/** Écrit une semaine de démonstration (sans Auchan ni Claude) pour vérifier l'écran de validation. */
import { WeekStore } from "@/lib/store/weeks";
import { makeMatch, makeNeed, makeProduct, makeRecipe, makeWeek } from "../tests/helpers/factories";

const ing = (name: string, quantity: number, unit: "g" | "ml" | "pce" = "g", pantryStaple = false) => ({
  name,
  searchQuery: name,
  quantity,
  unit,
  pantryStaple,
  fromPromo: false,
});

const courgettes = makeProduct({ name: "Courgettes", price: 2.2, pack: { value: 1000, unit: "g" } });
const courgettesBio = makeProduct({
  name: "Courgettes",
  brand: "AUCHAN BIO",
  price: 3.5,
  pack: { value: 1000, unit: "g" },
  isOrganic: true,
});
const penne = makeProduct({
  name: "Penne rigate",
  brand: "BARILLA",
  price: 1.2,
  pack: { value: 500, unit: "g" },
  promo: { label: "-50% sur le 2ème", kind: "price" },
});
const riz = makeProduct({ name: "Riz basmati", price: 2.5, pack: { value: 1000, unit: "g" } });
const huile = makeProduct({ name: "Huile d'olive vierge extra", price: 6.9, pack: { value: 750, unit: "ml" } });

const week = makeWeek({
  id: "2000-01-01-1",
  createdAt: "2000-01-01T10:00:00.000Z",
  brief: { dinners: 1, adults: 2, children: 2, budgetEur: 20, filters: ["kids_friendly"], notes: "", preferOrganic: true },
  contextSummary: "Semaine de démonstration (aucune donnée Auchan)",
  recipes: [
    makeRecipe({
      id: "penne-courgettes",
      title: "Penne aux courgettes",
      summary: "Des pâtes crémeuses aux courgettes de saison.",
      ingredients: [ing("courgette", 600), ing("pâtes", 1000), ing("huile d'olive", 30, "ml", true)],
      steps: ["Laver les courgettes.", "Cuire les pâtes.", "Mélanger le tout."],
      kidSteps: [0, 2],
      tags: ["kids_friendly", "vegetarian"],
      whyThisWeek: "Courgettes de saison et pâtes en promo.",
    }),
    makeRecipe({ id: "riz-legumes", title: "Riz sauté aux légumes", ingredients: [ing("riz", 400), ing("courgette", 300)] }),
  ],
  selectedRecipeIds: ["penne-courgettes"],
  matches: [
    makeMatch(
      makeNeed({ key: "courgette|g", quantity: 900, perRecipe: { "penne-courgettes": 600, "riz-legumes": 300 } }),
      courgettes,
      [courgettesBio],
    ),
    makeMatch(makeNeed({ key: "pates|g", name: "pâtes", quantity: 1000, perRecipe: { "penne-courgettes": 1000 } }), penne),
    makeMatch(
      makeNeed({ key: "huile d'olive|ml", quantity: 30, perRecipe: { "penne-courgettes": 30 }, pantryStaple: true }),
      huile,
    ),
    makeMatch(makeNeed({ key: "riz|g", quantity: 400, perRecipe: { "riz-legumes": 400 } }), riz),
  ],
  overrides: { products: {}, pantry: ["huile d'olive|ml"] },
});

new WeekStore().save(week);
console.log("Semaine de démonstration : http://127.0.0.1:3141/semaines/2000-01-01-1");
console.log("À supprimer ensuite : rm data/weeks/2000-01-01-1.json");
