# MyFresh : plan 1, le noyau (connecteur Auchan → recettes → panier), implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obtenir un pipeline complet utilisable en ligne de commande (`npm run week`) : il lit le contexte Auchan de la semaine, fait générer les recettes par Claude, choisit les produits Auchan, calcule le budget et peut remplir le panier Auchan Drive.

**Architecture:** Le projet est une app Next.js (l'interface viendra au plan 2), mais toute la logique vit dans `src/lib/` : ce sont des modules TypeScript purs, testés avec Vitest. Le connecteur Auchan est un client HTTP (fetch + cookies d'une session Playwright sauvegardée, parsing avec cheerio) qui respecte l'interface `StoreConnector`. Le reste du code ne dépend que de cette interface. Claude est appelé via `messages.parse` + `zodOutputFormat` (sorties structurées validées par Zod).

**Tech Stack:** Node 20, Next.js 16, TypeScript, Vitest 4, tsx, cheerio 1.2, Playwright 1.63 (connexion seulement), zod 4, @anthropic-ai/sdk 0.128, dotenv.

**Spec:** `docs/superpowers/specs/2026-09-23-myfresh-design.md` + `docs/superpowers/specs/2026-09-23-auchan-spike-findings.md`

## Global Constraints

- L'app **ne passe jamais commande** : elle modifie uniquement le panier via `POST /cart/update`.
- Débit maximum vers auchan.fr : **une requête toutes les 350 ms** (throttle global dans `AuchanHttp`).
- Aucun mot de passe stocké. La session vient d'une connexion manuelle (`npm run auchan:login`) sauvegardée dans `data/auchan-state.json`. Le dossier `data/` est gitignoré.
- Modèle Claude : `claude-opus-5` partout (génération : effort `high` ; arbitrage produits : effort `low`), avec `thinking: { type: "adaptive" }`.
- `desiredQuantity` envoyé à Auchan est une **quantité absolue**. On additionne toujours la quantité déjà présente dans le panier.
- Textes visibles par l'utilisateur en français. Identifiants de code en anglais.
- Montants en euros (number, arrondis à 2 décimales). Les montants du panier Auchan sont en centimes : on divise par 100 à la lecture.

## File Structure

```
package.json, vitest.config.ts, .gitignore, brief.example.json
src/lib/types.ts                 types partagés (Product, Cart, StoreConnector…)
src/lib/units.ts                 parsing des nombres, conditionnements et prix unitaires FR
src/lib/text.ts                  normalisation du texte, tokens, pertinence
src/lib/auchan/parse.ts          HTML/JSON Auchan → objets (cartes produit, fiche, thèmes, panier)
src/lib/auchan/session.ts        storageState Playwright → en-tête Cookie + consentId
src/lib/auchan/http.ts           client HTTP avec throttle et erreurs typées
src/lib/auchan/connector.ts      AuchanConnector implements StoreConnector
src/lib/cart/merge.ts            addition des quantités avec le panier existant
src/lib/context/season.ts        saison et produits de saison par mois
src/lib/context/events.ts        calendrier des événements FR (Pâques, fête des mères…)
src/lib/context/build.ts         WeeklyContext = store + saison + événements
src/lib/recipes/brief.ts         schéma du brief hebdo
src/lib/recipes/schema.ts        schémas Zod Recipe / Menu
src/lib/recipes/prompt.ts        prompts
src/lib/recipes/generate.ts      generateMenu / reviseMenu (Claude)
src/lib/matching/needs.ts        agrégation des ingrédients entre recettes
src/lib/matching/score.ts        paquets nécessaires + score d'un produit
src/lib/matching/off.ts          Open Food Facts (NOVA, Nutri-Score)
src/lib/matching/arbiter.ts      arbitrage Claude du meilleur produit
src/lib/matching/match.ts        ingrédients → produits choisis + alternatives
src/lib/budget/basket.ts         panier final, coût, sélection des recettes, lignes panier
scripts/auchan-login.ts          connexion manuelle + sauvegarde de la session
scripts/auchan-smoke.ts          vérification en réel du connecteur (lecture seule)
scripts/week.ts                  CLI de bout en bout
tests/helpers/factories.ts       makeProduct(), makeRecipe()
tests/helpers/fake-connector.ts  FakeConnector
tests/fixtures/auchan/*          HTML/JSON synthétiques calqués sur les pages réelles
```

---

### Task 1 : Scaffold, outillage de test, types partagés

**Files:**
- Create: projet Next.js, `vitest.config.ts`, `src/lib/types.ts`, `tests/helpers/factories.ts`, `src/lib/types.test.ts`, `brief.example.json`
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Produces : tous les types de `src/lib/types.ts` (ci-dessous) ; `makeProduct(overrides?: Partial<Product>): Product`.

- [ ] **Step 1 : Générer Next.js dans un dossier temporaire puis le rapatrier** (create-next-app refuse un dossier qui contient déjà `docs/`)

```bash
cd "/Users/deefuz/Local Sites/PERSO/hellofresh"
TMP=$(mktemp -d)
npx create-next-app@16.3.6 "$TMP/app" --yes --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --skip-install --disable-git
rsync -a "$TMP/app/" ./
rm -rf "$TMP"
npm install
npm install cheerio@1.2.0 zod@4 @anthropic-ai/sdk@0.128.0 dotenv playwright@1.63.0
npm install -D vitest@4 tsx
npx playwright install chromium
```

- [ ] **Step 2 : Scripts npm et .gitignore**

Dans `package.json`, ajouter à `"scripts"` :

```json
"test": "vitest run",
"test:watch": "vitest",
"auchan:login": "tsx scripts/auchan-login.ts",
"auchan:smoke": "tsx scripts/auchan-smoke.ts",
"week": "tsx scripts/week.ts"
```

Ajouter à la fin de `.gitignore` :

```
# MyFresh
/data/
```

(`.env*` est déjà ignoré par le gitignore de Next.js ; vérifier avec `grep -n "env" .gitignore`.)

- [ ] **Step 3 : `vitest.config.ts`**

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["src/**/*.test.ts", "tests/**/*.test.ts"], environment: "node" },
});
```

- [ ] **Step 4 : `src/lib/types.ts`**

```ts
export type QtyUnit = "g" | "ml" | "pce";

export interface Quantity {
  value: number;
  unit: QtyUnit;
}

export interface Promo {
  label: string;
  /** "price" = vraie baisse de prix ; "loyalty" = cagnotte carte Waaoh */
  kind: "price" | "loyalty";
}

export interface Product {
  productId: string;
  offerId: string;
  sellerId: string | null;
  sellerType: string;
  name: string;
  brand: string | null;
  /** prix de vente d'une unité (paquet, pièce…) en € */
  price: number;
  unitPrice: number | null;
  unitPriceUnit: "kg" | "l" | "pce" | null;
  /** contenu d'un paquet, normalisé en g / ml / pce */
  pack: Quantity | null;
  isOrganic: boolean;
  isSeasonal: boolean;
  promo: Promo | null;
  /** stock magasin (data-stock) ; null si inconnu */
  stock: number | null;
  url: string;
}

export interface ProductDetails {
  ean: string | null;
  ingredients: string | null;
}

export interface StoreContext {
  promos: Product[];
  antiGaspi: Product[];
  themes: string[];
}

export interface CartItem {
  productId: string;
  offerId: string;
  quantity: number;
}

export interface Cart {
  id: string;
  items: CartItem[];
  /** total en € */
  totalPrice: number;
}

export interface CartLine {
  productId: string;
  offerId: string;
  sellerId: string;
  sellerType: string;
  /** quantité absolue voulue dans le panier */
  quantity: number;
}

export interface CartUpdateResult {
  cart: Cart;
  revised: { productId: string; requested: number; actual: number }[];
}

export interface StoreConnector {
  searchProducts(query: string): Promise<Product[]>;
  getProductDetails(url: string): Promise<ProductDetails>;
  getStoreContext(): Promise<StoreContext>;
  getCart(): Promise<Cart>;
  setCartQuantities(lines: CartLine[]): Promise<CartUpdateResult>;
}
```

- [ ] **Step 5 : `tests/helpers/factories.ts`**

```ts
import type { Product } from "@/lib/types";

let seq = 0;

export function makeProduct(overrides: Partial<Product> = {}): Product {
  seq += 1;
  return {
    productId: `p-${seq}`,
    offerId: `o-${seq}`,
    sellerId: "seller-1",
    sellerType: "GROCERY",
    name: `Produit ${seq}`,
    brand: null,
    price: 1,
    unitPrice: null,
    unitPriceUnit: null,
    pack: null,
    isOrganic: false,
    isSeasonal: false,
    promo: null,
    stock: 10,
    url: `https://www.auchan.fr/produit-${seq}/pr-C${seq}`,
    ...overrides,
  };
}
```

- [ ] **Step 6 : Test de fumée de l'outillage** `src/lib/types.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { makeProduct } from "../../tests/helpers/factories";

describe("factories", () => {
  it("crée des produits distincts avec des valeurs par défaut", () => {
    const a = makeProduct();
    const b = makeProduct({ price: 2.5 });
    expect(a.productId).not.toBe(b.productId);
    expect(b.price).toBe(2.5);
  });
});
```

- [ ] **Step 7 : `brief.example.json`**

```json
{
  "dinners": 4,
  "adults": 2,
  "children": 2,
  "budgetEur": 60,
  "filters": ["kids_friendly", "unprocessed"],
  "notes": "",
  "preferOrganic": true
}
```

- [ ] **Step 8 : Vérifier**

Run : `npm test && npm run build`
Expected : 1 test PASS ; build Next.js OK.

- [ ] **Step 9 : Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js, Vitest et types partagés"
```

---

### Task 2 : Utilitaires unités et texte

**Files:**
- Create: `src/lib/units.ts`, `src/lib/units.test.ts`, `src/lib/text.ts`, `src/lib/text.test.ts`

**Interfaces:**
- Consumes : `Quantity`, `QtyUnit` (Task 1)
- Produces :
  - `parseFrNumber(s: string): number`
  - `round2(n: number): number`
  - `parsePack(text: string): Quantity | null`
  - `parseUnitPrice(text: string): { value: number; unit: "kg" | "l" | "pce" } | null`
  - `normalizeText(s: string): string`
  - `tokens(s: string): string[]`
  - `isRelevant(query: string, productName: string): boolean`

- [ ] **Step 1 : Tests `src/lib/units.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { parseFrNumber, parsePack, parseUnitPrice, round2 } from "./units";

describe("parseFrNumber", () => {
  it("gère la virgule décimale", () => expect(parseFrNumber("11,96")).toBe(11.96));
});

describe("round2", () => {
  it("arrondit au centime", () => expect(round2(5.985)).toBe(5.99));
});

describe("parsePack", () => {
  it.each([
    ["France 250g 11,96€ / kg", { value: 250, unit: "g" }],
    ["Mélange de tomates anciennes France 1,5kg 5,99€ / kg", { value: 1500, unit: "g" }],
    ["Lait demi-écrémé 6x1L 1,70€ / l", { value: 6000, unit: "ml" }],
    ["Crème 20cl", { value: 200, unit: "ml" }],
    ["Oeufs plein air 6 pièces 0,35€ / pce", { value: 6, unit: "pce" }],
  ])("%s", (text, expected) => expect(parsePack(text)).toEqual(expected));

  it("renvoie null sans conditionnement lisible", () => {
    expect(parsePack("Tomates rondes en grappe France environ 3-4 fruits 3,29€ / pce")).toBeNull();
  });

  it("ne prend pas un multipack sans unité (8x2 barres)", () => {
    expect(parsePack("KINDER Bueno 340g 8x2 barres")).toEqual({ value: 340, unit: "g" });
  });
});

describe("parseUnitPrice", () => {
  it("lit le prix au kilo", () => expect(parseUnitPrice("250g 11,96€ / kg")).toEqual({ value: 11.96, unit: "kg" }));
  it("lit le prix à la pièce", () => expect(parseUnitPrice("3,29€ / pce")).toEqual({ value: 3.29, unit: "pce" }));
  it("renvoie null sinon", () => expect(parseUnitPrice("3,29€")).toBeNull());
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run : `npx vitest run src/lib/units.test.ts`
Expected : FAIL (`Cannot find module './units'`)

- [ ] **Step 3 : `src/lib/units.ts`**

```ts
import type { Quantity, QtyUnit } from "./types";

const UNITS: Record<string, { unit: QtyUnit; factor: number }> = {
  kg: { unit: "g", factor: 1000 },
  g: { unit: "g", factor: 1 },
  l: { unit: "ml", factor: 1000 },
  cl: { unit: "ml", factor: 10 },
  ml: { unit: "ml", factor: 1 },
};

export function parseFrNumber(s: string): number {
  return Number(s.replace(/\s/g, "").replace(",", "."));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function parsePack(text: string): Quantity | null {
  const t = text.toLowerCase();
  const multi = t.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|cl|ml)\b/);
  if (multi) {
    const u = UNITS[multi[3]];
    return { value: round2(Number(multi[1]) * parseFrNumber(multi[2]) * u.factor), unit: u.unit };
  }
  const single = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|cl|ml)\b/);
  if (single) {
    const u = UNITS[single[2]];
    return { value: round2(parseFrNumber(single[1]) * u.factor), unit: u.unit };
  }
  const pieces = t.match(/(\d+)\s*(?:pièces?|pieces?|pces?|oeufs|œufs)\b/);
  if (pieces) return { value: Number(pieces[1]), unit: "pce" };
  return null;
}

export function parseUnitPrice(text: string): { value: number; unit: "kg" | "l" | "pce" } | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*€\s*\/\s*(kg|l|pce)\b/i);
  if (!m) return null;
  return { value: parseFrNumber(m[1]), unit: m[2].toLowerCase() as "kg" | "l" | "pce" };
}
```

- [ ] **Step 4 : Tests `src/lib/text.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { isRelevant, normalizeText, tokens } from "./text";

describe("normalizeText", () => {
  it("retire accents et majuscules", () => expect(normalizeText("  Crème Fraîche ")).toBe("creme fraiche"));
});

describe("tokens", () => {
  it("singularise et ignore les mots courts et vides", () => {
    expect(tokens("Soupe à l'oignons avec des tomates")).toEqual(["soupe", "oignon", "tomate"]);
  });
});

describe("isRelevant", () => {
  it("vrai si au moins un mot significatif est commun", () => {
    expect(isRelevant("tomates cerises", "AUCHAN BIO Tomates cerises rouges")).toBe(true);
  });
  it("faux sinon", () => expect(isRelevant("courgette", "Tomates rondes")).toBe(false));
});
```

- [ ] **Step 5 : `src/lib/text.ts`**

```ts
const STOPWORDS = new Set(["des", "les", "aux", "avec", "pour", "sans", "une", "par", "sur"]);

export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function tokens(s: string): string[] {
  return normalizeText(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .map((t) => (t.length > 3 ? t.replace(/[sx]$/, "") : t));
}

export function isRelevant(query: string, productName: string): boolean {
  const q = new Set(tokens(query));
  return tokens(productName).some((t) => q.has(t));
}
```

- [ ] **Step 6 : Lancer**

Run : `npx vitest run src/lib/units.test.ts src/lib/text.test.ts`
Expected : PASS

- [ ] **Step 7 : Commit**

```bash
git add src/lib/units.ts src/lib/units.test.ts src/lib/text.ts src/lib/text.test.ts
git commit -m "feat: parsing des unités, prix unitaires et pertinence texte"
```

---

### Task 3 : Parsing des pages Auchan

**Files:**
- Create: `src/lib/auchan/parse.ts`, `src/lib/auchan/parse.test.ts`, `tests/fixtures/auchan/search.html`, `tests/fixtures/auchan/product-packaged.html`, `tests/fixtures/auchan/product-fresh.html`, `tests/fixtures/auchan/home.html`, `tests/fixtures/auchan/cart.json`

**Interfaces:**
- Consumes : `Product`, `ProductDetails`, `Cart` (Task 1) ; `parsePack`, `parseUnitPrice`, `parseFrNumber` (Task 2)
- Produces :
  - `BASE_URL = "https://www.auchan.fr"`
  - `cleanText(s: string): string`
  - `parseProductCards(html: string): Product[]`
  - `parseProductPage(html: string): ProductDetails`
  - `parseThemes(html: string): string[]`
  - `RawCartResponse` (type) et `parseCart(raw: RawCartResponse): Cart`

- [ ] **Step 1 : Fixtures** (synthétiques, calquées sur la structure observée pendant le test de faisabilité)

`tests/fixtures/auchan/search.html` :

```html
<html><body>
<article itemscope itemtype="http://schema.org/Product" data-id="p-bio-cerise" data-current-offer-id="o-bio-cerise" data-current-seller-type="GROCERY">
  <div class="product-flap__label">C'est de saison !</div>
  <a href="/tomates-cerises-rouges/pr-C1000001?source=search">
    <p itemprop="name description"><span itemprop="brand">AUCHAN BIO</span> Tomates cerises rouges</p>
  </a>
  <span>France 250g</span>
  <span>11,96€ / kg</span>
  <div class="discount-markups"><span class="product-discount-label">10% Jour W! cagnottés</span></div>
  <div itemprop="offers" itemscope itemtype="http://schema.org/Offer">
    <meta itemprop="price" content="2.99"><meta itemprop="priceCurrency" content="EUR">
  </div>
  <div class="quantity-selector qa2c-wrapper" data-product-id="p-bio-cerise" data-offer-id="o-bio-cerise" data-stock="12" data-seller-type="GROCERY" data-seller-id="seller-1"></div>
</article>
<article itemscope itemtype="http://schema.org/Product" data-id="p-mutti" data-current-offer-id="o-mutti" data-current-seller-type="GROCERY">
  <a href="/mutti-polpa-pulpe-fine-de-tomates/pr-C1236828">
    <p itemprop="name description"><span itemprop="brand">MUTTI</span> Pulpe fine de tomates</p>
  </a>
  <span>400g</span><span>4,98€ / kg</span>
  <div class="discount-markups"><span class="product-discount-label">-60% sur le 2ème</span></div>
  <div itemprop="offers"><meta itemprop="price" content="1.99"></div>
  <div class="quantity-selector qa2c-wrapper" data-stock="0" data-seller-type="GROCERY" data-seller-id="seller-1"></div>
</article>
<article itemscope itemtype="http://schema.org/Product" data-id="p-grappe" data-current-offer-id="o-grappe" data-current-seller-type="GROCERY">
  Pipe.start(610) (30) Pipe.end(610)
  <a href="/tomates-rondes-en-grappe/pr-C1000003"><p itemprop="name description">Tomates rondes en grappe</p></a>
  <span>France environ 3-4 fruits</span><span>3,29€ / pce</span>
  <div itemprop="offers"><meta itemprop="price" content="3.29"></div>
</article>
<article itemscope itemtype="http://schema.org/Product" data-id="p-sans-prix" data-current-offer-id="o-x">
  <p itemprop="name">Produit indisponible</p>
</article>
</body></html>
```

`tests/fixtures/auchan/product-packaged.html` :

```html
<html><body>
<h2>Caractéristiques</h2>
<div class="product-description__feature">EAN : 526183 / 8005110170300 <button>copier</button></div>
<h2>Ingrédients</h2><p>Tomates 99.8% sel.</p>
<h2>Informations pratiques</h2><p>Mode d'emploi…</p>
</body></html>
```

`tests/fixtures/auchan/product-fresh.html` :

```html
<html><body><h2>Caractéristiques</h2><div>EAN : </div><h2>Informations pratiques</h2></body></html>
```

`tests/fixtures/auchan/home.html` :

```html
<html><body>
<nav><a href="/boutique/promos">Promos</a><a href="/boutique/anti-gaspi">Anti gaspi</a><a href="/boutique/baf-maison-loisirs">Maison</a></nav>
<section><a href="/boutique/saveurs-d-asie?cmp=home">Voir les promos</a></section>
<section><a href="/boutique/foire-a-la-biere">Foire à la bière</a><a href="/boutique/saveurs-d-asie">Asie</a></section>
</body></html>
```

`tests/fixtures/auchan/cart.json` :

```json
{
  "cart": {
    "cart": {
      "id": "cart-1",
      "items": [
        { "productId": "p-a", "offerId": "o-a", "desiredQuantity": 1 },
        { "productId": "p-b", "offerId": "o-b", "desiredQuantity": 2 }
      ],
      "prices": { "totalPrice": { "amount": 391, "currency": "EUR" } }
    }
  },
  "itemsSortedByMostRecent": [],
  "revisedItems": []
}
```

- [ ] **Step 2 : Tests `src/lib/auchan/parse.test.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanText, parseCart, parseProductCards, parseProductPage, parseThemes } from "./parse";

const fx = (f: string) => fs.readFileSync(path.join(__dirname, "../../../tests/fixtures/auchan", f), "utf8");

describe("cleanText", () => {
  it("retire les marqueurs Pipe et compresse les espaces", () => {
    expect(cleanText(" a Pipe.start(12)\n  b Pipe.end(12) ")).toBe("a b");
  });
});

describe("parseProductCards", () => {
  const products = parseProductCards(fx("search.html"));

  it("ignore les cartes sans prix", () => {
    expect(products.map((p) => p.productId)).toEqual(["p-bio-cerise", "p-mutti", "p-grappe"]);
  });

  it("extrait une carte complète", () => {
    expect(products[0]).toEqual({
      productId: "p-bio-cerise",
      offerId: "o-bio-cerise",
      sellerId: "seller-1",
      sellerType: "GROCERY",
      name: "Tomates cerises rouges",
      brand: "AUCHAN BIO",
      price: 2.99,
      unitPrice: 11.96,
      unitPriceUnit: "kg",
      pack: { value: 250, unit: "g" },
      isOrganic: true,
      isSeasonal: true,
      promo: { label: "10% Jour W! cagnottés", kind: "loyalty" },
      stock: 12,
      url: "https://www.auchan.fr/tomates-cerises-rouges/pr-C1000001",
    });
  });

  it("classe les promos prix et lit le stock à 0", () => {
    expect(products[1].promo).toEqual({ label: "-60% sur le 2ème", kind: "price" });
    expect(products[1].stock).toBe(0);
    expect(products[1].isOrganic).toBe(false);
  });

  it("gère un produit frais sans marque ni conditionnement", () => {
    expect(products[2]).toMatchObject({
      name: "Tomates rondes en grappe",
      brand: null,
      pack: null,
      unitPrice: 3.29,
      unitPriceUnit: "pce",
      sellerId: null,
      stock: null,
      promo: null,
    });
  });
});

describe("parseProductPage", () => {
  it("lit l'EAN et les ingrédients", () => {
    expect(parseProductPage(fx("product-packaged.html"))).toEqual({
      ean: "8005110170300",
      ingredients: "Tomates 99.8% sel.",
    });
  });
  it("renvoie null pour un produit frais", () => {
    expect(parseProductPage(fx("product-fresh.html"))).toEqual({ ean: null, ingredients: null });
  });
});

describe("parseThemes", () => {
  it("liste les boutiques thématiques hors navigation, dédupliquées", () => {
    expect(parseThemes(fx("home.html"))).toEqual(["saveurs d asie", "foire a la biere"]);
  });
});

describe("parseCart", () => {
  it("convertit le panier et les centimes", () => {
    expect(parseCart(JSON.parse(fx("cart.json")))).toEqual({
      id: "cart-1",
      items: [
        { productId: "p-a", offerId: "o-a", quantity: 1 },
        { productId: "p-b", offerId: "o-b", quantity: 2 },
      ],
      totalPrice: 3.91,
    });
  });
});
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

Run : `npx vitest run src/lib/auchan/parse.test.ts`
Expected : FAIL (`Cannot find module './parse'`)

- [ ] **Step 4 : `src/lib/auchan/parse.ts`**

```ts
import * as cheerio from "cheerio";
import type { Cart, Product, ProductDetails, Promo } from "../types";
import { parseFrNumber, parsePack, parseUnitPrice, round2 } from "../units";

export const BASE_URL = "https://www.auchan.fr";

const NAV_SHOPS = new Set(["promos", "anti-gaspi", "baf-maison-loisirs", "nouveautes"]);

export function cleanText(s: string): string {
  return s.replace(/Pipe\.(start|end)\(\d+\)/g, " ").replace(/\s+/g, " ").trim();
}

function promoKind(label: string): Promo["kind"] {
  return /cagnott/i.test(label) ? "loyalty" : "price";
}

export function parseProductCards(html: string): Product[] {
  const $ = cheerio.load(html);
  const products: Product[] = [];
  $('article[itemtype*="schema.org/Product"]').each((_, el) => {
    const card = $(el);
    const productId = card.attr("data-id");
    const offerId = card.attr("data-current-offer-id");
    const priceEl = card.find('[itemprop="price"]').first();
    const priceRaw = priceEl.attr("content") ?? priceEl.text();
    if (!productId || !offerId || !priceRaw) return;

    const brandEl = card.find('[itemprop="brand"]').first();
    const brand = cleanText(brandEl.attr("content") ?? brandEl.text()) || null;
    const fullName = cleanText(card.find('[itemprop~="name"]').first().text());
    const name = brand && fullName.startsWith(brand) ? fullName.slice(brand.length).trim() : fullName;
    const text = cleanText(card.text());
    const qa = card.find(".qa2c-wrapper").first();
    const stockAttr = qa.attr("data-stock");
    const unit = parseUnitPrice(text);
    const labels = card
      .find(".product-discount-label")
      .map((_, e) => cleanText($(e).text()))
      .get()
      .filter(Boolean);
    const href = (card.find('a[href*="/pr-"]').first().attr("href") ?? "").split("?")[0];

    products.push({
      productId,
      offerId,
      sellerId: qa.attr("data-seller-id") ?? null,
      sellerType: card.attr("data-current-seller-type") ?? qa.attr("data-seller-type") ?? "GROCERY",
      name,
      brand,
      price: round2(parseFrNumber(priceRaw)),
      unitPrice: unit?.value ?? null,
      unitPriceUnit: unit?.unit ?? null,
      pack: parsePack(text),
      isOrganic: /\bbio\b/i.test(`${brand ?? ""} ${name}`),
      isSeasonal: /de saison/i.test(text),
      promo: labels.length ? { label: labels.join(" · "), kind: promoKind(labels.join(" ")) } : null,
      stock: stockAttr !== undefined ? Number(stockAttr) : null,
      url: href ? `${BASE_URL}${href}` : "",
    });
  });
  return products;
}

export function parseProductPage(html: string): ProductDetails {
  const $ = cheerio.load(html);
  const text = cleanText($("body").text());
  const ean = text.match(/EAN\s*:\s*(?:\d+\s*\/\s*)?(\d{8,14})/)?.[1] ?? null;
  const ingredients =
    text.match(/Ingrédients\s*(.+?)\s*(?:Informations pratiques|Valeurs nutritionnelles|$)/)?.[1]?.trim() || null;
  return { ean, ingredients };
}

export function parseThemes(html: string): string[] {
  const $ = cheerio.load(html);
  const themes: string[] = [];
  $('a[href^="/boutique/"]').each((_, el) => {
    const slug = ($(el).attr("href") ?? "").split("?")[0].split("/")[2];
    if (!slug || NAV_SHOPS.has(slug)) return;
    const theme = slug.replace(/-/g, " ");
    if (!themes.includes(theme)) themes.push(theme);
  });
  return themes;
}

export interface RawCartResponse {
  cart: {
    cart: {
      id: string;
      items: { productId: string; offerId: string; desiredQuantity: number }[];
      prices: { totalPrice: { amount: number } };
    };
  };
  revisedItems?: unknown[];
}

export function parseCart(raw: RawCartResponse): Cart {
  const c = raw.cart.cart;
  return {
    id: c.id,
    items: c.items.map((i) => ({ productId: i.productId, offerId: i.offerId, quantity: i.desiredQuantity })),
    totalPrice: round2(c.prices.totalPrice.amount / 100),
  };
}
```

- [ ] **Step 5 : Lancer**

Run : `npx vitest run src/lib/auchan/parse.test.ts`
Expected : PASS

- [ ] **Step 6 : Commit**

```bash
git add src/lib/auchan/parse.ts src/lib/auchan/parse.test.ts tests/fixtures/auchan
git commit -m "feat(auchan): parsing des cartes produit, fiches, thèmes et panier"
```

---

### Task 4 : Session Auchan (connexion manuelle et chargement des cookies)

**Files:**
- Create: `src/lib/auchan/session.ts`, `src/lib/auchan/session.test.ts`, `tests/fixtures/auchan/storage-state.json`, `scripts/auchan-login.ts`

**Interfaces:**
- Produces :
  - `STATE_PATH = "data/auchan-state.json"`
  - `interface AuchanSession { cookieHeader: string; consentId: string | null }`
  - `class SessionMissingError extends Error`
  - `loadSession(statePath?: string, nowMs?: number): AuchanSession`

- [ ] **Step 1 : Fixture `tests/fixtures/auchan/storage-state.json`**

```json
{
  "cookies": [
    { "name": "lark-consentId", "value": "consent-123", "domain": ".auchan.fr", "path": "/", "expires": -1, "httpOnly": false, "secure": false, "sameSite": "Lax" },
    { "name": "sid", "value": "abc", "domain": "www.auchan.fr", "path": "/", "expires": 9999999999, "httpOnly": true, "secure": true, "sameSite": "Lax" },
    { "name": "old", "value": "x", "domain": ".auchan.fr", "path": "/", "expires": 1, "httpOnly": false, "secure": false, "sameSite": "Lax" },
    { "name": "_ga", "value": "y", "domain": ".google.com", "path": "/", "expires": -1, "httpOnly": false, "secure": false, "sameSite": "Lax" }
  ],
  "origins": []
}
```

- [ ] **Step 2 : Tests `src/lib/auchan/session.test.ts`**

```ts
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
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

Run : `npx vitest run src/lib/auchan/session.test.ts`
Expected : FAIL (module introuvable)

- [ ] **Step 4 : `src/lib/auchan/session.ts`**

```ts
import fs from "node:fs";

export const STATE_PATH = "data/auchan-state.json";

export interface AuchanSession {
  cookieHeader: string;
  consentId: string | null;
}

export class SessionMissingError extends Error {
  constructor(path: string) {
    super(`Session Auchan absente (${path}). Lance d'abord : npm run auchan:login`);
    this.name = "SessionMissingError";
  }
}

interface StorageState {
  cookies: { name: string; value: string; domain: string; expires: number }[];
}

export function loadSession(statePath: string = STATE_PATH, nowMs: number = Date.now()): AuchanSession {
  if (!fs.existsSync(statePath)) throw new SessionMissingError(statePath);
  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as StorageState;
  const nowSec = nowMs / 1000;
  const cookies = state.cookies.filter(
    (c) => c.domain.replace(/^\./, "").endsWith("auchan.fr") && (c.expires === -1 || c.expires > nowSec),
  );
  const consent = cookies.find((c) => c.name === "lark-consentId");
  return {
    cookieHeader: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    consentId: consent ? decodeURIComponent(consent.value) : null,
  };
}
```

- [ ] **Step 5 : Lancer**

Run : `npx vitest run src/lib/auchan/session.test.ts`
Expected : PASS

- [ ] **Step 6 : `scripts/auchan-login.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { chromium } from "playwright";
import { STATE_PATH } from "@/lib/auchan/session";

const PROFILE_DIR = "data/chromium-profile";

async function main() {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://www.auchan.fr/");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(
    "Dans la fenêtre : connecte-toi à ton compte Auchan et choisis ton drive.\nAppuie sur Entrée ici quand c'est fait… ",
  );
  rl.close();

  await page.goto("https://www.auchan.fr/recherche?text=lait");
  const withStore = await page.locator(".qa2c-wrapper[data-seller-id]").count();
  if (withStore === 0) {
    console.error("Aucun drive détecté sur la page de recherche. Choisis ton magasin puis relance.");
    await context.close();
    process.exit(1);
  }
  await context.storageState({ path: STATE_PATH });
  await context.close();
  console.log(`Session enregistrée dans ${STATE_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 7 : Vérification manuelle**

Run : `npm run auchan:login`, se connecter dans la fenêtre, puis appuyer sur Entrée.
Expected : `Session enregistrée dans data/auchan-state.json` ; `git status` ne montre pas `data/`.

- [ ] **Step 8 : Commit**

```bash
git add src/lib/auchan/session.ts src/lib/auchan/session.test.ts tests/fixtures/auchan/storage-state.json scripts/auchan-login.ts
git commit -m "feat(auchan): connexion manuelle et chargement de la session"
```

---

### Task 5 : Client HTTP Auchan avec throttle

**Files:**
- Create: `src/lib/auchan/http.ts`, `src/lib/auchan/http.test.ts`

**Interfaces:**
- Consumes : `AuchanSession` (Task 4), `BASE_URL` (Task 3)
- Produces :
  - `interface HttpClient { getText(path: string): Promise<string>; getJson<T>(path: string): Promise<T>; postJson<T>(path: string, body: unknown): Promise<T> }`
  - `class AuchanHttp implements HttpClient` : `constructor(session: AuchanSession, opts?: { fetchFn?: typeof fetch; minIntervalMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> })`
  - `class AuchanHttpError extends Error { status: number; path: string }`
  - `class SessionExpiredError extends Error`

- [ ] **Step 1 : Tests `src/lib/auchan/http.test.ts`**

```ts
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
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run : `npx vitest run src/lib/auchan/http.test.ts`
Expected : FAIL (module introuvable)

- [ ] **Step 3 : `src/lib/auchan/http.ts`**

```ts
import { BASE_URL } from "./parse";
import type { AuchanSession } from "./session";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export interface HttpClient {
  getText(path: string): Promise<string>;
  getJson<T>(path: string): Promise<T>;
  postJson<T>(path: string, body: unknown): Promise<T>;
}

export class AuchanHttpError extends Error {
  constructor(
    public status: number,
    public path: string,
  ) {
    super(`Auchan a répondu ${status} pour ${path}`);
    this.name = "AuchanHttpError";
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Session Auchan expirée. Relance : npm run auchan:login");
    this.name = "SessionExpiredError";
  }
}

interface Options {
  fetchFn?: typeof fetch;
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class AuchanHttp implements HttpClient {
  private readonly fetchFn: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private last = Number.NEGATIVE_INFINITY;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly session: AuchanSession,
    opts: Options = {},
  ) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.minIntervalMs = opts.minIntervalMs ?? 350;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private throttle(): Promise<void> {
    const turn = this.queue.then(async () => {
      const wait = this.last + this.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.last = this.now();
    });
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  private async request(path: string, init: RequestInit, extraHeaders: Record<string, string>): Promise<Response> {
    await this.throttle();
    const res = await this.fetchFn(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Cookie: this.session.cookieHeader,
        "User-Agent": USER_AGENT,
        "Accept-Language": "fr-FR,fr;q=0.9",
        ...extraHeaders,
      },
    });
    if (res.status === 401 || res.status === 403) throw new SessionExpiredError();
    if (!res.ok) throw new AuchanHttpError(res.status, path);
    return res;
  }

  async getText(path: string): Promise<string> {
    const res = await this.request(path, { method: "GET" }, { Accept: "text/html" });
    return res.text();
  }

  async getJson<T>(path: string): Promise<T> {
    const res = await this.request(
      path,
      { method: "GET" },
      { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    );
    return (await res.json()) as T;
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await this.request(
      path,
      { method: "POST", body: JSON.stringify(body) },
      { Accept: "application/json", "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    );
    return (await res.json()) as T;
  }
}
```

- [ ] **Step 4 : Lancer**

Run : `npx vitest run src/lib/auchan/http.test.ts`
Expected : PASS

- [ ] **Step 5 : Commit**

```bash
git add src/lib/auchan/http.ts src/lib/auchan/http.test.ts
git commit -m "feat(auchan): client HTTP avec throttle et erreurs typées"
```

---

### Task 6 : AuchanConnector, fusion panier, test réel en lecture seule

**Files:**
- Create: `src/lib/auchan/connector.ts`, `src/lib/auchan/connector.test.ts`, `src/lib/cart/merge.ts`, `src/lib/cart/merge.test.ts`, `scripts/auchan-smoke.ts`

**Interfaces:**
- Consumes : `HttpClient` (Task 5), `AuchanSession` (Task 4), fonctions de `parse.ts` (Task 3), types (Task 1)
- Produces :
  - `FOOD_PROMO_AISLES: string[]`
  - `class AuchanConnector implements StoreConnector` : `constructor(http: HttpClient, session: Pick<AuchanSession, "consentId">)`
  - `mergeWithCart(cart: Cart, wanted: CartLine[]): CartLine[]`

- [ ] **Step 1 : Tests `src/lib/auchan/connector.test.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AuchanConnector, FOOD_PROMO_AISLES } from "./connector";
import type { HttpClient } from "./http";

const fx = (f: string) => fs.readFileSync(path.join(__dirname, "../../../tests/fixtures/auchan", f), "utf8");

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    getText: vi.fn(async (p: string) => (p === "/" ? fx("home.html") : fx("search.html"))),
    getJson: vi.fn(async () => JSON.parse(fx("cart.json"))) as HttpClient["getJson"],
    postJson: vi.fn(async () => JSON.parse(fx("cart.json"))) as HttpClient["postJson"],
    ...overrides,
  };
}

describe("AuchanConnector", () => {
  it("cherche des produits et met le résultat en cache", async () => {
    const http = fakeHttp();
    const c = new AuchanConnector(http, { consentId: "c" });
    const a = await c.searchProducts("Tomates ");
    await c.searchProducts("tomates");
    expect(a).toHaveLength(3);
    expect(http.getText).toHaveBeenCalledTimes(1);
    expect(http.getText).toHaveBeenCalledWith("/recherche?text=Tomates");
  });

  it("construit le contexte magasin sans doublons", async () => {
    const http = fakeHttp();
    const ctx = await new AuchanConnector(http, { consentId: "c" }).getStoreContext();
    expect(http.getText).toHaveBeenCalledWith(`/boutique/promos/${FOOD_PROMO_AISLES[0]}`);
    expect(http.getText).toHaveBeenCalledWith("/boutique/anti-gaspi");
    expect(ctx.promos).toHaveLength(3);
    expect(ctx.antiGaspi).toHaveLength(3);
    expect(ctx.themes).toEqual(["saveurs d asie", "foire a la biere"]);
  });

  it("envoie une mise à jour panier au format Auchan et détecte les révisions", async () => {
    const http = fakeHttp();
    const c = new AuchanConnector(http, { consentId: "consent-1" });
    const res = await c.setCartQuantities([
      { productId: "p-b", offerId: "o-b", sellerId: "s1", sellerType: "GROCERY", quantity: 3 },
    ]);
    expect(http.postJson).toHaveBeenCalledWith("/cart/update", {
      cartId: "cart-1",
      items: [
        { productId: "p-b", offerId: "o-b", sellerType: "GROCERY", desiredQuantity: 3, desiredType: "DEFAULT", sellerId: "s1" },
      ],
      consentId: "consent-1",
      reservationId: null,
      mbaAvailabilityNeeded: true,
    });
    // la réponse (fixture) contient p-b en quantité 2 : Auchan a révisé
    expect(res.revised).toEqual([{ productId: "p-b", requested: 3, actual: 2 }]);
  });

  it("getProductDetails passe l'URL en chemin relatif", async () => {
    const http = fakeHttp({ getText: vi.fn(async () => fx("product-packaged.html")) });
    const d = await new AuchanConnector(http, { consentId: null }).getProductDetails(
      "https://www.auchan.fr/mutti/pr-C1236828",
    );
    expect(http.getText).toHaveBeenCalledWith("/mutti/pr-C1236828");
    expect(d.ean).toBe("8005110170300");
  });
});
```

- [ ] **Step 2 : Tests `src/lib/cart/merge.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { mergeWithCart } from "./merge";

describe("mergeWithCart", () => {
  it("additionne la quantité déjà présente et fusionne les doublons", () => {
    const cart = { id: "c", totalPrice: 0, items: [{ productId: "p1", offerId: "o1", quantity: 2 }] };
    const line = (productId: string, quantity: number) => ({
      productId,
      offerId: `o${productId.slice(1)}`,
      sellerId: "s",
      sellerType: "GROCERY",
      quantity,
    });
    expect(mergeWithCart(cart, [line("p1", 1), line("p2", 1), line("p2", 2)])).toEqual([line("p1", 3), line("p2", 3)]);
  });
});
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

Run : `npx vitest run src/lib/auchan/connector.test.ts src/lib/cart/merge.test.ts`
Expected : FAIL (modules introuvables)

- [ ] **Step 4 : `src/lib/auchan/connector.ts`**

```ts
import type { Cart, CartLine, CartUpdateResult, Product, ProductDetails, StoreConnector, StoreContext } from "../types";
import type { HttpClient } from "./http";
import { BASE_URL, parseCart, parseProductCards, parseProductPage, parseThemes, type RawCartResponse } from "./parse";
import type { AuchanSession } from "./session";

export const FOOD_PROMO_AISLES = [
  "fruits-legumes/ca-n03",
  "boucherie-volaille-poissonnerie/ca-n02",
  "oeufs-produits-laitiers/ca-n01",
  "charcuterie-traiteur-pain/ca-n12",
  "epicerie-salee/ca-n06",
  "surgeles/ca-n04",
];

function dedupe(products: Product[]): Product[] {
  const seen = new Set<string>();
  return products.filter((p) => (seen.has(p.productId) ? false : (seen.add(p.productId), true)));
}

export class AuchanConnector implements StoreConnector {
  private readonly searchCache = new Map<string, Product[]>();

  constructor(
    private readonly http: HttpClient,
    private readonly session: Pick<AuchanSession, "consentId">,
  ) {}

  async searchProducts(query: string): Promise<Product[]> {
    const q = query.trim();
    const key = q.toLowerCase();
    const cached = this.searchCache.get(key);
    if (cached) return cached;
    const products = parseProductCards(await this.http.getText(`/recherche?text=${encodeURIComponent(q)}`));
    this.searchCache.set(key, products);
    return products;
  }

  async getProductDetails(url: string): Promise<ProductDetails> {
    return parseProductPage(await this.http.getText(url.replace(BASE_URL, "")));
  }

  async getStoreContext(): Promise<StoreContext> {
    const promos: Product[] = [];
    for (const aisle of FOOD_PROMO_AISLES) {
      promos.push(...parseProductCards(await this.http.getText(`/boutique/promos/${aisle}`)));
    }
    const antiGaspi = parseProductCards(await this.http.getText("/boutique/anti-gaspi"));
    const themes = parseThemes(await this.http.getText("/"));
    return { promos: dedupe(promos), antiGaspi: dedupe(antiGaspi), themes };
  }

  async getCart(): Promise<Cart> {
    return parseCart(await this.http.getJson<RawCartResponse>("/cart"));
  }

  async setCartQuantities(lines: CartLine[]): Promise<CartUpdateResult> {
    const current = await this.getCart();
    const raw = await this.http.postJson<RawCartResponse>("/cart/update", {
      cartId: current.id,
      items: lines.map((l) => ({
        productId: l.productId,
        offerId: l.offerId,
        sellerType: l.sellerType,
        desiredQuantity: l.quantity,
        desiredType: "DEFAULT",
        sellerId: l.sellerId,
      })),
      consentId: this.session.consentId,
      reservationId: null,
      mbaAvailabilityNeeded: true,
    });
    const cart = parseCart(raw);
    const revised = lines
      .map((l) => ({
        productId: l.productId,
        requested: l.quantity,
        actual: cart.items.find((i) => i.productId === l.productId)?.quantity ?? 0,
      }))
      .filter((r) => r.actual !== r.requested);
    return { cart, revised };
  }
}
```

- [ ] **Step 5 : `src/lib/cart/merge.ts`**

```ts
import type { Cart, CartLine } from "../types";

export function mergeWithCart(cart: Cart, wanted: CartLine[]): CartLine[] {
  const merged = new Map<string, CartLine>();
  for (const line of wanted) {
    const prev = merged.get(line.productId);
    merged.set(line.productId, prev ? { ...prev, quantity: prev.quantity + line.quantity } : { ...line });
  }
  for (const line of merged.values()) {
    line.quantity += cart.items.find((i) => i.productId === line.productId)?.quantity ?? 0;
  }
  return [...merged.values()];
}
```

- [ ] **Step 6 : Lancer**

Run : `npx vitest run src/lib/auchan src/lib/cart`
Expected : PASS

- [ ] **Step 7 : `scripts/auchan-smoke.ts`** (lecture seule : ne modifie pas le panier)

```ts
import { AuchanConnector } from "@/lib/auchan/connector";
import { AuchanHttp } from "@/lib/auchan/http";
import { loadSession } from "@/lib/auchan/session";

async function main() {
  const session = loadSession();
  const c = new AuchanConnector(new AuchanHttp(session), session);

  const products = await c.searchProducts("tomates");
  console.log(`Recherche "tomates" : ${products.length} produits`);
  console.table(
    products.slice(0, 6).map((p) => ({
      nom: p.name,
      marque: p.brand ?? "",
      prix: p.price,
      paquet: p.pack ? `${p.pack.value}${p.pack.unit}` : "?",
      unitaire: p.unitPrice ? `${p.unitPrice}€/${p.unitPriceUnit}` : "?",
      bio: p.isOrganic,
      saison: p.isSeasonal,
      promo: p.promo?.label ?? "",
      stock: p.stock,
      vendeur: p.sellerId ? "ok" : "absent",
    })),
  );

  const packaged = (await c.searchProducts("pulpe de tomates")).find((p) => p.brand);
  if (packaged) console.log("Fiche :", packaged.name, await c.getProductDetails(packaged.url));

  const ctx = await c.getStoreContext();
  console.log(`Contexte : ${ctx.promos.length} promos, ${ctx.antiGaspi.length} anti-gaspi`);
  console.log(`Thèmes : ${ctx.themes.join(", ") || "(aucun)"}`);

  const cart = await c.getCart();
  console.log(`Panier : ${cart.items.length} lignes, ${cart.totalPrice} €`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 8 : Vérification en réel**

Run : `npm run auchan:smoke`
Expected : au moins 20 produits pour « tomates », avec `vendeur = ok` et des prix cohérents avec le site ; un EAN à 13 chiffres sur la fiche ; plus de 50 promos ; le panier affiché correspond à celui du site. **Si les thèmes sont vides ou absurdes**, noter ce qui s'affiche sur la page d'accueil (liens `/boutique/...`) et ajuster `NAV_SHOPS` dans `parse.ts` ainsi que la fixture `home.html`.

- [ ] **Step 9 : Commit**

```bash
git add src/lib/auchan/connector.ts src/lib/auchan/connector.test.ts src/lib/cart scripts/auchan-smoke.ts
git commit -m "feat(auchan): connecteur (recherche, contexte, panier) et smoke test réel"
```

---

### Task 7 : Contexte de la semaine (saison, événements, magasin)

**Files:**
- Create: `src/lib/context/season.ts`, `src/lib/context/events.ts`, `src/lib/context/build.ts`, `src/lib/context/context.test.ts`, `tests/helpers/fake-connector.ts`

**Interfaces:**
- Consumes : `StoreConnector`, `Product` (Task 1) ; `makeProduct` (Task 1)
- Produces :
  - `type Season = "hiver" | "printemps" | "été" | "automne"` ; `getSeason(d: Date): Season` ; `seasonalProduceFor(d: Date): string[]`
  - `interface CalendarEvent { name: string; date: string }` ; `easterSunday(year: number): Date` ; `upcomingEvents(from: Date, horizonDays?: number): CalendarEvent[]`
  - `interface WeeklyContext { generatedAt: string; season: Season; seasonalProduce: string[]; events: CalendarEvent[]; promos: Product[]; antiGaspi: Product[]; themes: string[] }`
  - `buildWeeklyContext(connector: StoreConnector, now?: Date): Promise<WeeklyContext>`
  - `summarizeContext(ctx: WeeklyContext): string`
  - `class FakeConnector implements StoreConnector` (tests) : `constructor(catalog: Record<string, Product[]>, context?: StoreContext)`

- [ ] **Step 1 : `tests/helpers/fake-connector.ts`**

```ts
import type { Cart, CartLine, CartUpdateResult, Product, ProductDetails, StoreConnector, StoreContext } from "@/lib/types";

export class FakeConnector implements StoreConnector {
  public cart: Cart = { id: "cart-fake", items: [], totalPrice: 0 };
  public searches: string[] = [];
  public details: Record<string, ProductDetails> = {};

  constructor(
    private readonly catalog: Record<string, Product[]>,
    private readonly context: StoreContext = { promos: [], antiGaspi: [], themes: [] },
  ) {}

  async searchProducts(query: string): Promise<Product[]> {
    this.searches.push(query);
    return this.catalog[query.trim().toLowerCase()] ?? [];
  }

  async getProductDetails(url: string): Promise<ProductDetails> {
    return this.details[url] ?? { ean: null, ingredients: null };
  }

  async getStoreContext(): Promise<StoreContext> {
    return this.context;
  }

  async getCart(): Promise<Cart> {
    return this.cart;
  }

  async setCartQuantities(lines: CartLine[]): Promise<CartUpdateResult> {
    for (const l of lines) {
      this.cart.items = this.cart.items.filter((i) => i.productId !== l.productId);
      if (l.quantity > 0) this.cart.items.push({ productId: l.productId, offerId: l.offerId, quantity: l.quantity });
    }
    return { cart: this.cart, revised: [] };
  }
}
```

- [ ] **Step 2 : Tests `src/lib/context/context.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { makeProduct } from "../../../tests/helpers/factories";
import { FakeConnector } from "../../../tests/helpers/fake-connector";
import { buildWeeklyContext, summarizeContext } from "./build";
import { easterSunday, upcomingEvents } from "./events";
import { getSeason, seasonalProduceFor } from "./season";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe("season", () => {
  it("septembre = automne", () => expect(getSeason(new Date(2026, 8, 23))).toBe("automne"));
  it("janvier = hiver", () => expect(getSeason(new Date(2026, 0, 10))).toBe("hiver"));
  it("liste des produits de saison en octobre", () => expect(seasonalProduceFor(new Date(2026, 9, 1))).toContain("potiron"));
});

describe("events", () => {
  it("calcule Pâques 2026", () => expect(ymd(easterSunday(2026))).toBe("2026-04-05"));
  it("Halloween dans les 14 jours", () => {
    expect(upcomingEvents(new Date(2026, 9, 20)).map((e) => e.name)).toEqual(["Halloween"]);
  });
  it("Mardi gras 2026 = 17 février", () => {
    expect(upcomingEvents(new Date(2026, 1, 10))).toContainEqual({ name: "Mardi gras", date: "2026-02-17" });
  });
  it("fête des mères 2026 = 31 mai", () => {
    expect(upcomingEvents(new Date(2026, 4, 25))).toContainEqual({ name: "Fête des mères", date: "2026-05-31" });
  });
  it("rentrée scolaire en début septembre", () => {
    expect(upcomingEvents(new Date(2026, 8, 5)).map((e) => e.name)).toContain("Rentrée scolaire");
  });
  it("passe l'année (depuis le 25 décembre)", () => {
    expect(upcomingEvents(new Date(2026, 11, 25)).map((e) => e.name)).toEqual([
      "Noël",
      "Réveillon du Nouvel an",
      "Nouvel an",
      "Épiphanie",
    ]);
  });
});

describe("buildWeeklyContext", () => {
  it("combine magasin, saison et événements", async () => {
    const promo = makeProduct({ name: "Potimarron", isSeasonal: true, promo: { label: "-30%", kind: "price" } });
    const connector = new FakeConnector({}, { promos: [promo], antiGaspi: [], themes: ["saveurs d asie"] });
    const ctx = await buildWeeklyContext(connector, new Date(2026, 9, 20));
    expect(ctx.season).toBe("automne");
    expect(ctx.events.map((e) => e.name)).toEqual(["Halloween"]);
    expect(ctx.promos).toEqual([promo]);
    expect(summarizeContext(ctx)).toBe("1 promos · 0 anti-gaspi · thèmes : saveurs d asie · événements : Halloween");
  });
});
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

Run : `npx vitest run src/lib/context`
Expected : FAIL (modules introuvables)

- [ ] **Step 4 : `src/lib/context/season.ts`**

```ts
export type Season = "hiver" | "printemps" | "été" | "automne";

export function getSeason(d: Date): Season {
  const m = d.getMonth() + 1;
  if (m === 12 || m <= 2) return "hiver";
  if (m <= 5) return "printemps";
  if (m <= 8) return "été";
  return "automne";
}

const PRODUCE: Record<number, string[]> = {
  1: ["poireau", "chou", "carotte", "céleri", "endive", "mâche", "navet", "panais", "potiron", "orange", "clémentine", "kiwi", "pomme", "poire"],
  2: ["poireau", "chou", "carotte", "endive", "mâche", "navet", "panais", "orange", "kiwi", "pomme", "poire"],
  3: ["poireau", "chou", "carotte", "endive", "épinard", "radis", "kiwi", "pomme"],
  4: ["asperge", "épinard", "radis", "petits pois", "blette", "carotte nouvelle"],
  5: ["asperge", "petits pois", "fraise", "radis", "artichaut", "courgette", "concombre"],
  6: ["courgette", "tomate", "concombre", "haricot vert", "fraise", "cerise", "abricot", "melon"],
  7: ["tomate", "courgette", "aubergine", "poivron", "haricot vert", "melon", "pêche", "abricot", "framboise"],
  8: ["tomate", "courgette", "aubergine", "poivron", "maïs", "melon", "pêche", "prune", "mûre"],
  9: ["tomate", "courgette", "aubergine", "poivron", "potiron", "champignon", "raisin", "pomme", "poire", "prune", "figue"],
  10: ["potiron", "potimarron", "courge butternut", "champignon", "chou", "poireau", "céleri", "raisin", "pomme", "poire", "châtaigne", "coing"],
  11: ["potiron", "potimarron", "courge butternut", "chou", "poireau", "endive", "céleri", "panais", "pomme", "poire", "clémentine", "kiwi"],
  12: ["potiron", "chou", "poireau", "endive", "mâche", "panais", "topinambour", "clémentine", "orange", "pomme", "poire", "kiwi"],
};

export function seasonalProduceFor(d: Date): string[] {
  return PRODUCE[d.getMonth() + 1];
}
```

- [ ] **Step 5 : `src/lib/context/events.ts`** (dates en UTC pour éviter les décalages de fuseau horaire)

```ts
export interface CalendarEvent {
  name: string;
  date: string; // YYYY-MM-DD
}

const DAY = 86_400_000;

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** Algorithme de Meeus/Jones/Butcher */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

function lastSundayOf(year: number, month: number): Date {
  const last = utc(year, month + 1, 0);
  return addDays(last, -last.getUTCDay());
}

function nthSundayOf(year: number, month: number, n: number): Date {
  const first = utc(year, month, 1);
  return addDays(first, ((7 - first.getUTCDay()) % 7) + 7 * (n - 1));
}

function eventsOfYear(y: number): CalendarEvent[] {
  const easter = easterSunday(y);
  const pentecost = addDays(easter, 49);
  let mothers = lastSundayOf(y, 5);
  if (iso(mothers) === iso(pentecost)) mothers = nthSundayOf(y, 6, 1);
  const events: [string, Date][] = [
    ["Nouvel an", utc(y, 1, 1)],
    ["Épiphanie", utc(y, 1, 6)],
    ["Chandeleur", utc(y, 2, 2)],
    ["Saint-Valentin", utc(y, 2, 14)],
    ["Mardi gras", addDays(easter, -47)],
    ["Pâques", easter],
    ["Fête des mères", mothers],
    ["Fête des pères", nthSundayOf(y, 6, 3)],
    ["Rentrée scolaire", utc(y, 9, 1)],
    ["Halloween", utc(y, 10, 31)],
    ["Noël", utc(y, 12, 25)],
    ["Réveillon du Nouvel an", utc(y, 12, 31)],
  ];
  return events.map(([name, date]) => ({ name, date: iso(date) }));
}

/** Événements dans [from, from + horizonDays]. La rentrée reste active jusqu'au 15 septembre. */
export function upcomingEvents(from: Date, horizonDays = 14): CalendarEvent[] {
  const start = utc(from.getFullYear(), from.getMonth() + 1, from.getDate());
  const end = addDays(start, horizonDays);
  const y = start.getUTCFullYear();
  return [...eventsOfYear(y), ...eventsOfYear(y + 1)].filter((e) => {
    const d = new Date(`${e.date}T00:00:00Z`);
    const until = e.name === "Rentrée scolaire" ? addDays(d, 14) : d;
    return until >= start && d <= end;
  });
}
```

- [ ] **Step 6 : `src/lib/context/build.ts`**

```ts
import type { Product, StoreConnector } from "../types";
import { type CalendarEvent, upcomingEvents } from "./events";
import { getSeason, type Season, seasonalProduceFor } from "./season";

export interface WeeklyContext {
  generatedAt: string;
  season: Season;
  seasonalProduce: string[];
  events: CalendarEvent[];
  promos: Product[];
  antiGaspi: Product[];
  themes: string[];
}

export async function buildWeeklyContext(connector: StoreConnector, now: Date = new Date()): Promise<WeeklyContext> {
  const store = await connector.getStoreContext();
  return {
    generatedAt: now.toISOString(),
    season: getSeason(now),
    seasonalProduce: seasonalProduceFor(now),
    events: upcomingEvents(now),
    promos: store.promos,
    antiGaspi: store.antiGaspi,
    themes: store.themes,
  };
}

export function summarizeContext(ctx: WeeklyContext): string {
  const parts = [`${ctx.promos.length} promos`, `${ctx.antiGaspi.length} anti-gaspi`];
  if (ctx.themes.length) parts.push(`thèmes : ${ctx.themes.join(", ")}`);
  if (ctx.events.length) parts.push(`événements : ${ctx.events.map((e) => e.name).join(", ")}`);
  return parts.join(" · ");
}
```

- [ ] **Step 7 : Lancer**

Run : `npx vitest run src/lib/context`
Expected : PASS

- [ ] **Step 8 : Commit**

```bash
git add src/lib/context tests/helpers/fake-connector.ts
git commit -m "feat(context): saison, calendrier des événements FR et contexte hebdo"
```

---

### Task 8 : Génération des recettes avec Claude

**Files:**
- Create: `src/lib/recipes/brief.ts`, `src/lib/recipes/schema.ts`, `src/lib/recipes/prompt.ts`, `src/lib/recipes/generate.ts`, `src/lib/recipes/recipes.test.ts`, `.env.local` (non commité)
- Modify: `tests/helpers/factories.ts` (ajout de `makeRecipe`)

**Interfaces:**
- Consumes : `WeeklyContext` (Task 7), `Product` (Task 1)
- Produces :
  - `DIET_FILTERS`, `type DietFilter`, `BriefSchema`, `type Brief = { dinners; adults; children; budgetEur; filters: DietFilter[]; notes: string; preferOrganic: boolean }`, `servingsFor(brief: Brief): number`
  - `IngredientSchema`, `RecipeSchema`, `MenuSchema`, `type Ingredient`, `type Recipe` (champs : `id, title, summary, servings, prepMinutes, cookMinutes, tags, ingredients[{name, searchQuery, quantity, unit, pantryStaple, fromPromo}], steps, nutritionPerServing{kcal, proteinG, carbsG, fatG}, whyThisWeek`)
  - `SYSTEM_PROMPT`, `buildMenuPrompt(brief, ctx): string`, `buildRevisePrompt(brief, ctx, recipes, instruction): string`
  - `RECIPE_MODEL = "claude-opus-5"`, `class LlmError`, `unwrapParsed<T>(r): T`, `generateMenu(client: Anthropic, brief, ctx): Promise<Recipe[]>`, `reviseMenu(client, brief, ctx, recipes, instruction): Promise<Recipe[]>`
  - `makeRecipe(overrides?: Partial<Recipe>): Recipe` (tests)

- [ ] **Step 1 : `src/lib/recipes/brief.ts`**

```ts
import { z } from "zod";

export const DIET_FILTERS = ["kids_friendly", "low_calorie", "vegan", "unprocessed"] as const;
export type DietFilter = (typeof DIET_FILTERS)[number];

export const BriefSchema = z.object({
  dinners: z.number().int().min(1).max(7),
  adults: z.number().int().min(1),
  children: z.number().int().min(0),
  budgetEur: z.number().positive(),
  filters: z.array(z.enum(DIET_FILTERS)),
  notes: z.string(),
  preferOrganic: z.boolean(),
});
export type Brief = z.infer<typeof BriefSchema>;

/** Nombre de portions : un enfant compte pour 0,6 adulte. */
export function servingsFor(brief: Brief): number {
  return Math.ceil(brief.adults + brief.children * 0.6);
}
```

- [ ] **Step 2 : `src/lib/recipes/schema.ts`** (pas de contraintes min/max : non gérées par les sorties structurées)

```ts
import { z } from "zod";

export const IngredientSchema = z.object({
  name: z.string().describe("nom générique en français, ex. « tomates cerises »"),
  searchQuery: z.string().describe("requête courte (1 à 3 mots) pour le moteur de recherche Auchan, ex. « tomates cerises »"),
  quantity: z.number().describe("quantité totale pour la recette, au nombre de portions indiqué"),
  unit: z.enum(["g", "ml", "pce"]),
  pantryStaple: z.boolean().describe("true pour les basiques de placard : sel, poivre, huile, vinaigre, épices, farine, sucre"),
  fromPromo: z.boolean().describe("true si l'ingrédient vient de la liste des promos fournie"),
});

export const RecipeSchema = z.object({
  id: z.string().describe("identifiant court en kebab-case, unique dans le menu"),
  title: z.string(),
  summary: z.string(),
  servings: z.number().int(),
  prepMinutes: z.number().int(),
  cookMinutes: z.number().int(),
  tags: z.array(z.enum(["kids_friendly", "low_calorie", "vegan", "vegetarian", "unprocessed", "quick"])),
  ingredients: z.array(IngredientSchema),
  steps: z.array(z.string()),
  nutritionPerServing: z.object({ kcal: z.number(), proteinG: z.number(), carbsG: z.number(), fatG: z.number() }),
  whyThisWeek: z.string().describe("pourquoi cette recette cette semaine (promo, saison, événement)"),
});

export const MenuSchema = z.object({ recipes: z.array(RecipeSchema) });

export type Ingredient = z.infer<typeof IngredientSchema>;
export type Recipe = z.infer<typeof RecipeSchema>;
```

- [ ] **Step 3 : Ajouter `makeRecipe` à `tests/helpers/factories.ts`**

```ts
import type { Recipe } from "@/lib/recipes/schema";

export function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  seq += 1;
  return {
    id: `r-${seq}`,
    title: `Recette ${seq}`,
    summary: "",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    tags: [],
    ingredients: [],
    steps: ["Cuire."],
    nutritionPerServing: { kcal: 500, proteinG: 20, carbsG: 50, fatG: 15 },
    whyThisWeek: "",
    ...overrides,
  };
}
```

(Fusionner les imports : `import type { Product } from "@/lib/types";` et `import type { Recipe } from "@/lib/recipes/schema";` en haut du fichier.)

- [ ] **Step 4 : Tests `src/lib/recipes/recipes.test.ts`**

```ts
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { makeProduct, makeRecipe } from "../../../tests/helpers/factories";
import type { WeeklyContext } from "../context/build";
import { type Brief, servingsFor } from "./brief";
import { generateMenu, LlmError, RECIPE_MODEL, reviseMenu } from "./generate";
import { buildMenuPrompt } from "./prompt";

const brief: Brief = {
  dinners: 4,
  adults: 2,
  children: 2,
  budgetEur: 60,
  filters: ["kids_friendly", "unprocessed"],
  notes: "pas de poisson",
  preferOrganic: true,
};

const ctx: WeeklyContext = {
  generatedAt: "2026-10-20T08:00:00.000Z",
  season: "automne",
  seasonalProduce: ["potiron", "poireau"],
  events: [{ name: "Halloween", date: "2026-10-31" }],
  promos: [makeProduct({ name: "Potimarron", brand: null, price: 1.99, promo: { label: "-30%", kind: "price" } })],
  antiGaspi: [makeProduct({ name: "Yaourts nature" })],
  themes: ["saveurs d asie"],
};

function fakeClient(result: object) {
  const parse = vi.fn().mockResolvedValue(result);
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
}

describe("servingsFor", () => {
  it("2 adultes + 2 enfants = 4 portions", () => expect(servingsFor(brief)).toBe(4));
});

describe("buildMenuPrompt", () => {
  it("contient le contexte, les filtres et le nombre de recettes", () => {
    const p = buildMenuPrompt(brief, ctx);
    expect(p).toContain("6 recettes");
    expect(p).toContain("4 portions");
    expect(p).toContain("Potimarron");
    expect(p).toContain("-30%");
    expect(p).toContain("Halloween");
    expect(p).toContain("potiron");
    expect(p).toContain("adapté aux enfants");
    expect(p).toContain("sans produits ultra-transformés");
    expect(p).toContain("pas de poisson");
    expect(p).toContain("60 €");
  });
});

describe("generateMenu", () => {
  it("appelle Claude avec le bon modèle et un format structuré", async () => {
    const recipes = [makeRecipe()];
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: { recipes } });
    await expect(generateMenu(client, brief, ctx)).resolves.toEqual(recipes);
    const args = parse.mock.calls[0][0];
    expect(args.model).toBe(RECIPE_MODEL);
    expect(args.thinking).toEqual({ type: "adaptive" });
    expect(args.output_config.effort).toBe("high");
    expect(args.output_config.format).toBeDefined();
  });

  it("lève LlmError sur un refus", async () => {
    const { client } = fakeClient({ stop_reason: "refusal", parsed_output: null });
    await expect(generateMenu(client, brief, ctx)).rejects.toBeInstanceOf(LlmError);
  });

  it("lève LlmError si la réponse est tronquée", async () => {
    const { client } = fakeClient({ stop_reason: "max_tokens", parsed_output: null });
    await expect(generateMenu(client, brief, ctx)).rejects.toThrow(/tronquée/);
  });
});

describe("reviseMenu", () => {
  it("transmet les recettes actuelles et la consigne", async () => {
    const current = [makeRecipe({ title: "Lasagnes" })];
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: { recipes: current } });
    await reviseMenu(client, brief, ctx, current, "moins cher");
    const content = parse.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain("Lasagnes");
    expect(content).toContain("moins cher");
  });
});
```

- [ ] **Step 5 : Lancer, vérifier l'échec**

Run : `npx vitest run src/lib/recipes`
Expected : FAIL (modules `./generate` et `./prompt` introuvables)

- [ ] **Step 6 : `src/lib/recipes/prompt.ts`**

```ts
import type { WeeklyContext } from "../context/build";
import type { Product } from "../types";
import { type Brief, type DietFilter, servingsFor } from "./brief";
import type { Recipe } from "./schema";

const FILTER_LABELS: Record<DietFilter, string> = {
  kids_friendly: "adapté aux enfants (saveurs douces, pas trop épicé, textures simples)",
  low_calorie: "peu calorique (environ 500 kcal max par portion adulte)",
  vegan: "100 % végétal (aucun produit animal)",
  unprocessed: "sans produits ultra-transformés (ingrédients bruts, pas de plats préparés, sauces toutes faites ou additifs)",
};

export const SYSTEM_PROMPT = `Tu es le chef d'un service de box repas familiales, en France.
Tu composes des dîners faisables en semaine avec des produits d'un supermarché Auchan Drive.
Tu privilégies les produits en promotion et de saison fournis, tu réutilises un même produit dans plusieurs recettes pour limiter le gaspillage et tu respectes strictement les contraintes alimentaires.
Les quantités d'ingrédients sont des totaux pour la recette, en g, ml ou pièces (pce), cohérents avec le nombre de portions.`;

function productLine(p: Product): string {
  const pack = p.pack ? ` ${p.pack.value}${p.pack.unit}` : "";
  const promo = p.promo ? ` [${p.promo.label}]` : "";
  return `- ${p.brand ? `${p.brand} ` : ""}${p.name}${pack} : ${p.price.toFixed(2)} €${promo}`;
}

function contextBlock(ctx: WeeklyContext): string {
  const promos = ctx.promos.filter((p) => p.promo?.kind === "price").slice(0, 80);
  return [
    `Saison : ${ctx.season}. Produits de saison : ${ctx.seasonalProduce.join(", ")}.`,
    ctx.events.length ? `Événements à venir : ${ctx.events.map((e) => `${e.name} (${e.date})`).join(", ")}.` : "",
    ctx.themes.length ? `Thèmes mis en avant par le magasin : ${ctx.themes.join(", ")}.` : "",
    `Promos alimentaires de la semaine :\n${promos.map(productLine).join("\n")}`,
    ctx.antiGaspi.length ? `Produits anti-gaspi :\n${ctx.antiGaspi.slice(0, 20).map(productLine).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function briefBlock(brief: Brief): string {
  const constraints = brief.filters.map((f) => `- ${FILTER_LABELS[f]}`).join("\n") || "- aucune";
  return [
    `Foyer : ${brief.adults} adulte(s) et ${brief.children} enfant(s), soit ${servingsFor(brief)} portions par dîner.`,
    `Budget courses total : ${brief.budgetEur} € pour tous les dîners retenus.`,
    `Contraintes :\n${constraints}`,
    brief.preferOrganic ? "Préférence pour le bio quand c'est raisonnable." : "",
    brief.notes ? `Précisions : ${brief.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildMenuPrompt(brief: Brief, ctx: WeeklyContext): string {
  const count = brief.dinners + 2;
  return `${contextBlock(ctx)}

${briefBlock(brief)}

Propose ${count} recettes de dîner variées (${brief.dinners} seront retenues, les autres servent d'alternatives), chacune pour ${servingsFor(brief)} portions.`;
}

export function buildRevisePrompt(brief: Brief, ctx: WeeklyContext, recipes: Recipe[], instruction: string): string {
  return `${contextBlock(ctx)}

${briefBlock(brief)}

Voici le menu actuel (JSON) :
${JSON.stringify(recipes)}

Consigne : ${instruction}
Renvoie le menu complet mis à jour (même nombre de recettes ; garde les identifiants des recettes inchangées).`;
}
```

- [ ] **Step 7 : `src/lib/recipes/generate.ts`**

```ts
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { WeeklyContext } from "../context/build";
import type { Brief } from "./brief";
import { buildMenuPrompt, buildRevisePrompt, SYSTEM_PROMPT } from "./prompt";
import { MenuSchema, type Recipe } from "./schema";

export const RECIPE_MODEL = "claude-opus-5";

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

export function unwrapParsed<T>(r: { stop_reason: string | null; parsed_output: T | null }): T {
  if (r.stop_reason === "refusal") throw new LlmError("Claude a refusé la demande.");
  if (r.stop_reason === "max_tokens") throw new LlmError("Réponse de Claude tronquée (max_tokens atteint).");
  if (!r.parsed_output) throw new LlmError("Réponse de Claude illisible.");
  return r.parsed_output;
}

async function askMenu(client: Anthropic, prompt: string): Promise<Recipe[]> {
  const response = await client.messages.parse({
    model: RECIPE_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(MenuSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });
  return unwrapParsed(response).recipes;
}

export function generateMenu(client: Anthropic, brief: Brief, ctx: WeeklyContext): Promise<Recipe[]> {
  return askMenu(client, buildMenuPrompt(brief, ctx));
}

export function reviseMenu(
  client: Anthropic,
  brief: Brief,
  ctx: WeeklyContext,
  recipes: Recipe[],
  instruction: string,
): Promise<Recipe[]> {
  return askMenu(client, buildRevisePrompt(brief, ctx, recipes, instruction));
}
```

- [ ] **Step 8 : Lancer**

Run : `npx vitest run src/lib/recipes && npx tsc --noEmit`
Expected : PASS ; pas d'erreur de type. Si `tsc` signale un problème sur `output_config.effort` ou `thinking`, vérifier le type attendu dans `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts` (`OutputConfig`, `ThinkingConfigParam`) et corriger selon ce qu'indique le compilateur.

- [ ] **Step 9 : Clé API**

Créer `.env.local` (déjà gitignoré) :

```
ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 10 : Commit**

```bash
git add src/lib/recipes tests/helpers/factories.ts
git commit -m "feat(recipes): brief, schémas et génération du menu avec Claude"
```

---

### Task 9 : Besoins agrégés et score des produits

**Files:**
- Create: `src/lib/matching/needs.ts`, `src/lib/matching/score.ts`, `src/lib/matching/score.test.ts`

**Interfaces:**
- Consumes : `Recipe` (Task 8), `Product`, `QtyUnit` (Task 1), `normalizeText`, `round2` (Task 2)
- Produces :
  - `interface IngredientNeed { key: string; name: string; searchQuery: string; unit: QtyUnit; quantity: number; perRecipe: Record<string, number>; pantryStaple: boolean }`
  - `aggregateNeeds(recipes: Recipe[]): IngredientNeed[]`
  - `interface ScoreOptions { preferOrganic: boolean; unprocessed: boolean }`
  - `interface MatchCandidate { product: Product; packs: number; cost: number; score: number; uncertainQuantity: boolean }`
  - `packsNeeded(need: { quantity: number; unit: QtyUnit }, product: Product): { packs: number; uncertain: boolean }`
  - `scoreCandidate(need: { quantity: number; unit: QtyUnit }, product: Product, opts: ScoreOptions): MatchCandidate`

- [ ] **Step 1 : Tests `src/lib/matching/score.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { makeProduct, makeRecipe } from "../../../tests/helpers/factories";
import { aggregateNeeds } from "./needs";
import { packsNeeded, scoreCandidate } from "./score";

const ing = (searchQuery: string, quantity: number, unit: "g" | "ml" | "pce" = "g", pantryStaple = false) => ({
  name: searchQuery,
  searchQuery,
  quantity,
  unit,
  pantryStaple,
  fromPromo: false,
});

describe("aggregateNeeds", () => {
  it("regroupe un même ingrédient entre recettes (insensible à la casse et aux accents)", () => {
    const needs = aggregateNeeds([
      makeRecipe({ id: "a", ingredients: [ing("Crème fraîche", 200, "ml"), ing("sel", 5, "g", true)] }),
      makeRecipe({ id: "b", ingredients: [ing("creme fraiche", 100, "ml")] }),
    ]);
    expect(needs).toHaveLength(2);
    expect(needs[0]).toMatchObject({ key: "creme fraiche|ml", quantity: 300, perRecipe: { a: 200, b: 100 }, pantryStaple: false });
    expect(needs[1]).toMatchObject({ key: "sel|g", pantryStaple: true });
  });
});

describe("packsNeeded", () => {
  it("arrondit au paquet supérieur", () => {
    expect(packsNeeded({ quantity: 500, unit: "g" }, makeProduct({ pack: { value: 250, unit: "g" } }))).toEqual({ packs: 2, uncertain: false });
    expect(packsNeeded({ quantity: 300, unit: "g" }, makeProduct({ pack: { value: 1000, unit: "g" } }))).toEqual({ packs: 1, uncertain: false });
  });
  it("compte les pièces pour un produit vendu à la pièce", () => {
    expect(packsNeeded({ quantity: 3, unit: "pce" }, makeProduct({ pack: null, unitPriceUnit: "pce" }))).toEqual({ packs: 3, uncertain: false });
  });
  it("marque incertain si les unités ne se comparent pas", () => {
    expect(packsNeeded({ quantity: 400, unit: "g" }, makeProduct({ pack: null, unitPriceUnit: "pce" }))).toEqual({ packs: 1, uncertain: true });
  });
});

describe("scoreCandidate", () => {
  const need = { quantity: 500, unit: "g" as const };
  const opts = { preferOrganic: false, unprocessed: false };

  it("calcule le coût réel et pénalise le gaspillage", () => {
    const big = scoreCandidate(need, makeProduct({ price: 7.99, pack: { value: 1000, unit: "g" } }), opts);
    const small = scoreCandidate(need, makeProduct({ price: 2.99, pack: { value: 250, unit: "g" } }), opts);
    expect(big.cost).toBe(7.99);
    expect(small.cost).toBe(5.98);
    expect(big.score).toBeCloseTo(7.99 * 1.15);
    expect(small.score).toBeLessThan(big.score);
  });

  it("le bio l'emporte à prix proche seulement si on le préfère", () => {
    const conv = makeProduct({ price: 3, pack: { value: 500, unit: "g" } });
    const bio = makeProduct({ price: 3.4, pack: { value: 500, unit: "g" }, isOrganic: true });
    const s = (p: typeof conv, preferOrganic: boolean) => scoreCandidate(need, p, { preferOrganic, unprocessed: false }).score;
    expect(s(bio, true)).toBeLessThan(s(conv, true));
    expect(s(bio, false)).toBeGreaterThan(s(conv, false));
  });

  it("favorise une vraie promo et pénalise une quantité incertaine", () => {
    const base = { price: 3, pack: { value: 500, unit: "g" as const } };
    expect(scoreCandidate(need, makeProduct({ ...base, promo: { label: "-30%", kind: "price" } }), opts).score).toBeCloseTo(2.7);
    const uncertain = scoreCandidate(need, makeProduct({ price: 3, pack: null }), opts);
    expect(uncertain.uncertainQuantity).toBe(true);
    expect(uncertain.score).toBeCloseTo(3.9);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run : `npx vitest run src/lib/matching/score.test.ts`
Expected : FAIL (modules introuvables)

- [ ] **Step 3 : `src/lib/matching/needs.ts`**

```ts
import type { Recipe } from "../recipes/schema";
import { normalizeText } from "../text";
import type { QtyUnit } from "../types";

export interface IngredientNeed {
  key: string;
  name: string;
  searchQuery: string;
  unit: QtyUnit;
  quantity: number;
  perRecipe: Record<string, number>;
  pantryStaple: boolean;
}

export function aggregateNeeds(recipes: Recipe[]): IngredientNeed[] {
  const byKey = new Map<string, IngredientNeed>();
  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      const key = `${normalizeText(ing.searchQuery)}|${ing.unit}`;
      const need =
        byKey.get(key) ??
        byKey
          .set(key, {
            key,
            name: ing.name,
            searchQuery: ing.searchQuery,
            unit: ing.unit,
            quantity: 0,
            perRecipe: {},
            pantryStaple: true,
          })
          .get(key)!;
      need.quantity += ing.quantity;
      need.perRecipe[recipe.id] = (need.perRecipe[recipe.id] ?? 0) + ing.quantity;
      need.pantryStaple = need.pantryStaple && ing.pantryStaple;
    }
  }
  return [...byKey.values()];
}
```

- [ ] **Step 4 : `src/lib/matching/score.ts`**

```ts
import type { Product, QtyUnit } from "../types";
import { round2 } from "../units";

export interface ScoreOptions {
  preferOrganic: boolean;
  unprocessed: boolean;
}

export interface MatchCandidate {
  product: Product;
  packs: number;
  cost: number;
  /** plus bas = meilleur */
  score: number;
  uncertainQuantity: boolean;
}

type Need = { quantity: number; unit: QtyUnit };

export function packsNeeded(need: Need, product: Product): { packs: number; uncertain: boolean } {
  if (product.pack && product.pack.unit === need.unit) {
    return { packs: Math.max(1, Math.ceil(need.quantity / product.pack.value - 1e-9)), uncertain: false };
  }
  if (need.unit === "pce" && !product.pack) {
    return { packs: Math.max(1, Math.ceil(need.quantity)), uncertain: false };
  }
  return { packs: 1, uncertain: true };
}

export function scoreCandidate(need: Need, product: Product, opts: ScoreOptions): MatchCandidate {
  const { packs, uncertain } = packsNeeded(need, product);
  const cost = round2(packs * product.price);
  let score = cost;
  if (product.pack && product.pack.unit === need.unit) {
    const bought = packs * product.pack.value;
    score *= 1 + 0.3 * ((bought - need.quantity) / bought);
  }
  if (opts.preferOrganic && product.isOrganic) score *= 0.85;
  if (product.promo?.kind === "price") score *= 0.9;
  if (product.promo?.kind === "loyalty") score *= 0.97;
  if (uncertain) score *= 1.3;
  return { product, packs, cost, score, uncertainQuantity: uncertain };
}
```

- [ ] **Step 5 : Lancer**

Run : `npx vitest run src/lib/matching/score.test.ts`
Expected : PASS

- [ ] **Step 6 : Commit**

```bash
git add src/lib/matching/needs.ts src/lib/matching/score.ts src/lib/matching/score.test.ts
git commit -m "feat(matching): agrégation des besoins et score des produits"
```

---

### Task 10 : Correspondance ingrédients → produits (arbitrage Claude, NOVA)

**Files:**
- Create: `src/lib/matching/off.ts`, `src/lib/matching/arbiter.ts`, `src/lib/matching/match.ts`, `src/lib/matching/match.test.ts`

**Interfaces:**
- Consumes : `IngredientNeed`, `scoreCandidate`, `MatchCandidate`, `ScoreOptions` (Task 9) ; `isRelevant` (Task 2) ; `StoreConnector`, `Product` (Task 1) ; `unwrapParsed`, `RECIPE_MODEL` (Task 8) ; `FakeConnector` (Task 7)
- Produces :
  - `fetchOffInfo(ean: string, fetchFn?: typeof fetch): Promise<{ nova: number | null; nutriscore: string | null }>`
  - `interface ArbiterItem { key: string; ingredient: string; candidates: { name: string; brand: string | null; pack: string; price: number }[] }`
  - `type Arbiter = (items: ArbiterItem[]) => Promise<Map<string, number>>` (index choisi ; -1 = aucun ne convient)
  - `createClaudeArbiter(client: Anthropic): Arbiter`
  - `interface IngredientMatch { need: IngredientNeed; chosen: MatchCandidate | null; alternatives: MatchCandidate[] }`
  - `interface MatchDeps { connector: StoreConnector; arbiter?: Arbiter; novaLookup?: (p: Product) => Promise<number | null>; onProgress?: (done: number, total: number) => void }`
  - `matchNeeds(needs: IngredientNeed[], opts: ScoreOptions, deps: MatchDeps): Promise<IngredientMatch[]>`

- [ ] **Step 1 : Tests `src/lib/matching/match.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { makeProduct } from "../../../tests/helpers/factories";
import { FakeConnector } from "../../../tests/helpers/fake-connector";
import { fetchOffInfo } from "./off";
import { matchNeeds } from "./match";
import type { IngredientNeed } from "./needs";

const need = (searchQuery: string, quantity: number, unit: "g" | "ml" | "pce" = "g"): IngredientNeed => ({
  key: `${searchQuery}|${unit}`,
  name: searchQuery,
  searchQuery,
  unit,
  quantity,
  perRecipe: { r1: quantity },
  pantryStaple: false,
});
const opts = { preferOrganic: false, unprocessed: false };

describe("matchNeeds", () => {
  const cheap = makeProduct({ name: "Tomates cerises", price: 2.99, pack: { value: 250, unit: "g" } });
  const pricey = makeProduct({ name: "Tomates cerises allongées", price: 7.99, pack: { value: 1000, unit: "g" } });
  const offTopic = makeProduct({ name: "Ketchup", price: 1, pack: { value: 500, unit: "g" } });
  const outOfStock = makeProduct({ name: "Tomates cerises bio", price: 1, pack: { value: 500, unit: "g" }, stock: 0 });

  it("sans arbitre : garde les produits pertinents en stock, triés par score", async () => {
    const connector = new FakeConnector({ "tomates cerises": [pricey, offTopic, cheap, outOfStock] });
    const [m] = await matchNeeds([need("tomates cerises", 500)], opts, { connector });
    expect(m.chosen?.product).toBe(cheap);
    expect(m.alternatives.map((a) => a.product)).toEqual([pricey]);
  });

  it("suit le choix de l'arbitre, et -1 = aucun produit", async () => {
    const connector = new FakeConnector({ "tomates cerises": [cheap, pricey], courgette: [makeProduct({ name: "Courgette" }), makeProduct({ name: "Courgettes bio" })] });
    const arbiter = vi.fn(async () => new Map([["tomates cerises|g", 1], ["courgette|pce", -1]]));
    const [tomates, courgette] = await matchNeeds([need("tomates cerises", 500), need("courgette", 2, "pce")], opts, { connector, arbiter });
    expect(arbiter).toHaveBeenCalledTimes(1);
    expect(tomates.chosen?.product).toBe(pricey);
    expect(courgette.chosen).toBeNull();
  });

  it("aucun candidat : chosen null", async () => {
    const [m] = await matchNeeds([need("truffe", 10)], opts, { connector: new FakeConnector({}) });
    expect(m).toMatchObject({ chosen: null, alternatives: [] });
  });

  it("filtre sans produits transformés : écarte un NOVA 4", async () => {
    const ultra = makeProduct({ name: "Sauce tomate", price: 1, pack: { value: 500, unit: "g" } });
    const raw = makeProduct({ name: "Pulpe de tomate", price: 2, pack: { value: 500, unit: "g" } });
    const connector = new FakeConnector({ "sauce tomate": [ultra, raw] });
    const novaLookup = vi.fn(async (p) => (p === ultra ? 4 : 1));
    const [m] = await matchNeeds([need("sauce tomate", 500)], { preferOrganic: false, unprocessed: true }, { connector, novaLookup });
    expect(m.chosen?.product).toBe(raw);
  });
});

describe("fetchOffInfo", () => {
  it("lit nova_group et nutriscore_grade", async () => {
    const fetchFn = vi.fn(async () => Response.json({ status: 1, product: { nova_group: 1, nutriscore_grade: "a" } }));
    await expect(fetchOffInfo("8005110170300", fetchFn)).resolves.toEqual({ nova: 1, nutriscore: "a" });
    expect(String(fetchFn.mock.calls[0][0])).toContain("/api/v2/product/8005110170300.json");
  });
  it("renvoie des null si le produit est inconnu", async () => {
    const fetchFn = vi.fn(async () => Response.json({ status: 0 }));
    await expect(fetchOffInfo("0", fetchFn)).resolves.toEqual({ nova: null, nutriscore: null });
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run : `npx vitest run src/lib/matching/match.test.ts`
Expected : FAIL (modules introuvables)

- [ ] **Step 3 : `src/lib/matching/off.ts`**

```ts
export async function fetchOffInfo(
  ean: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ nova: number | null; nutriscore: string | null }> {
  const res = await fetchFn(
    `https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=nova_group,nutriscore_grade`,
    { headers: { "User-Agent": "MyFresh/0.1 (usage personnel)" } },
  );
  if (!res.ok) return { nova: null, nutriscore: null };
  const data = (await res.json()) as { status?: number; product?: { nova_group?: number; nutriscore_grade?: string } };
  if (data.status !== 1 || !data.product) return { nova: null, nutriscore: null };
  return { nova: data.product.nova_group ?? null, nutriscore: data.product.nutriscore_grade ?? null };
}
```

- [ ] **Step 4 : `src/lib/matching/arbiter.ts`**

```ts
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { RECIPE_MODEL, unwrapParsed } from "../recipes/generate";

export interface ArbiterItem {
  key: string;
  ingredient: string;
  candidates: { name: string; brand: string | null; pack: string; price: number }[];
}

export type Arbiter = (items: ArbiterItem[]) => Promise<Map<string, number>>;

const ChoicesSchema = z.object({
  choices: z.array(z.object({ key: z.string(), index: z.number().int() })),
});

export function createClaudeArbiter(client: Anthropic): Arbiter {
  return async (items) => {
    const response = await client.messages.parse({
      model: RECIPE_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodOutputFormat(ChoicesSchema) },
      messages: [
        {
          role: "user",
          content: `Pour chaque ingrédient de recette, choisis parmi les produits Auchan proposés celui qui EST cet ingrédient, à acheter pour cuisiner (pas un plat préparé, une sauce ou un dérivé, sauf si l'ingrédient en est un).
Réponds avec l'index (0 = premier produit) ; -1 si aucun ne convient. Les produits sont déjà triés du meilleur rapport qualité-prix au moins bon : à pertinence égale, prends le plus petit index.

${JSON.stringify(items)}`,
        },
      ],
    });
    const { choices } = unwrapParsed(response);
    return new Map(choices.map((c) => [c.key, c.index]));
  };
}
```

- [ ] **Step 5 : `src/lib/matching/match.ts`**

```ts
import { isRelevant } from "../text";
import type { Product, StoreConnector } from "../types";
import type { Arbiter } from "./arbiter";
import type { IngredientNeed } from "./needs";
import { type MatchCandidate, type ScoreOptions, scoreCandidate } from "./score";

export interface IngredientMatch {
  need: IngredientNeed;
  chosen: MatchCandidate | null;
  alternatives: MatchCandidate[];
}

export interface MatchDeps {
  connector: StoreConnector;
  arbiter?: Arbiter;
  novaLookup?: (p: Product) => Promise<number | null>;
  onProgress?: (done: number, total: number) => void;
}

const MAX_CANDIDATES = 8;
const ARBITER_CANDIDATES = 5;
const MAX_NOVA_CHECKS = 3;

export async function matchNeeds(needs: IngredientNeed[], opts: ScoreOptions, deps: MatchDeps): Promise<IngredientMatch[]> {
  const ranked: MatchCandidate[][] = [];
  for (const [i, need] of needs.entries()) {
    const results = await deps.connector.searchProducts(need.searchQuery);
    ranked.push(
      results
        .filter((p) => p.stock !== 0)
        .filter((p) => isRelevant(need.searchQuery, p.name) || isRelevant(need.name, p.name))
        .slice(0, MAX_CANDIDATES)
        .map((p) => scoreCandidate(need, p, opts))
        .sort((a, b) => a.score - b.score),
    );
    deps.onProgress?.(i + 1, needs.length);
  }

  const choices = new Map<string, number>();
  if (deps.arbiter) {
    const items = needs
      .map((need, i) => ({ need, cands: ranked[i] }))
      .filter(({ cands }) => cands.length > 1)
      .map(({ need, cands }) => ({
        key: need.key,
        ingredient: need.name,
        candidates: cands.slice(0, ARBITER_CANDIDATES).map((c) => ({
          name: c.product.name,
          brand: c.product.brand,
          pack: c.product.pack ? `${c.product.pack.value}${c.product.pack.unit}` : "?",
          price: c.product.price,
        })),
      }));
    if (items.length) for (const [k, v] of await deps.arbiter(items)) choices.set(k, v);
  }

  const matches: IngredientMatch[] = [];
  for (const [i, need] of needs.entries()) {
    const cands = ranked[i];
    const idx = choices.get(need.key) ?? 0;
    let chosen = idx >= 0 && idx < Math.min(cands.length, ARBITER_CANDIDATES) ? cands[idx] : idx === -1 ? null : (cands[0] ?? null);

    if (chosen && opts.unprocessed && deps.novaLookup) {
      const ordered = [chosen, ...cands.filter((c) => c !== chosen)].slice(0, MAX_NOVA_CHECKS);
      chosen = null;
      for (const c of ordered) {
        if ((await deps.novaLookup(c.product)) !== 4) {
          chosen = c;
          break;
        }
      }
    }
    matches.push({ need, chosen, alternatives: cands.filter((c) => c !== chosen) });
  }
  return matches;
}
```

- [ ] **Step 6 : Lancer**

Run : `npx vitest run src/lib/matching && npx tsc --noEmit`
Expected : PASS ; pas d'erreur de type.

- [ ] **Step 7 : Commit**

```bash
git add src/lib/matching
git commit -m "feat(matching): choix des produits avec arbitrage Claude et filtre NOVA"
```

---

### Task 11 : Panier final, sélection des recettes, lignes panier

**Files:**
- Create: `src/lib/budget/basket.ts`, `src/lib/budget/basket.test.ts`

**Interfaces:**
- Consumes : `IngredientMatch` (Task 10), `packsNeeded` (Task 9), `round2` (Task 2), `CartLine`, `Product` (Task 1)
- Produces :
  - `interface BasketLine { key: string; name: string; product: Product; quantityNeeded: number; unit: QtyUnit; packs: number; cost: number; uncertainQuantity: boolean }`
  - `interface Basket { lines: BasketLine[]; total: number; missing: string[] }`
  - `computeBasket(matches: IngredientMatch[], selectedRecipeIds: string[], excludeKeys?: Set<string>): Basket`
  - `chooseSelection(recipeIds: string[], matches: IngredientMatch[], dinners: number, excludeKeys?: Set<string>): string[]`
  - `basketToCartLines(lines: BasketLine[]): CartLine[]`

- [ ] **Step 1 : Tests `src/lib/budget/basket.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { makeProduct } from "../../../tests/helpers/factories";
import type { IngredientMatch } from "../matching/match";
import { scoreCandidate } from "../matching/score";
import { basketToCartLines, chooseSelection, computeBasket } from "./basket";

const opts = { preferOrganic: false, unprocessed: false };

function match(key: string, perRecipe: Record<string, number>, price: number | null, packG = 250): IngredientMatch {
  const quantity = Object.values(perRecipe).reduce((a, b) => a + b, 0);
  const need = { key, name: key, searchQuery: key, unit: "g" as const, quantity, perRecipe, pantryStaple: false };
  const product = makeProduct({ name: key, price: price ?? 0, pack: { value: packG, unit: "g" } });
  return { need, chosen: price === null ? null : scoreCandidate(need, product, opts), alternatives: [] };
}

describe("computeBasket", () => {
  const matches = [
    match("tomates", { a: 200, b: 200 }, 2), // 250 g à 2 €
    match("pates", { b: 500, c: 500 }, 1, 500),
    match("truffe", { c: 10 }, null),
  ];

  it("recalcule les paquets pour les seules recettes retenues", () => {
    const basket = computeBasket(matches, ["a", "b"]);
    expect(basket.lines.map((l) => [l.key, l.quantityNeeded, l.packs, l.cost])).toEqual([
      ["tomates", 400, 2, 4],
      ["pates", 500, 1, 1],
    ]);
    expect(basket.total).toBe(5);
    expect(basket.missing).toEqual([]);
  });

  it("signale les ingrédients sans produit et respecte les exclusions", () => {
    const basket = computeBasket(matches, ["c"], new Set(["pates"]));
    expect(basket.lines).toEqual([]);
    expect(basket.missing).toEqual(["truffe"]);
  });
});

describe("chooseSelection", () => {
  it("garde les N recettes les moins chères, dans l'ordre d'origine", () => {
    const matches = [match("x", { a: 250 }, 9), match("y", { b: 250 }, 1), match("z", { c: 250 }, 3)];
    expect(chooseSelection(["a", "b", "c"], matches, 2)).toEqual(["b", "c"]);
  });
});

describe("basketToCartLines", () => {
  it("convertit en lignes panier", () => {
    const [line] = computeBasket([match("tomates", { a: 400 }, 2)], ["a"]).lines;
    expect(basketToCartLines([line])).toEqual([
      { productId: line.product.productId, offerId: line.product.offerId, sellerId: "seller-1", sellerType: "GROCERY", quantity: 2 },
    ]);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run : `npx vitest run src/lib/budget`
Expected : FAIL (module introuvable)

- [ ] **Step 3 : `src/lib/budget/basket.ts`**

```ts
import type { IngredientMatch } from "../matching/match";
import { packsNeeded } from "../matching/score";
import type { CartLine, Product, QtyUnit } from "../types";
import { round2 } from "../units";

export interface BasketLine {
  key: string;
  name: string;
  product: Product;
  quantityNeeded: number;
  unit: QtyUnit;
  packs: number;
  cost: number;
  uncertainQuantity: boolean;
}

export interface Basket {
  lines: BasketLine[];
  total: number;
  missing: string[];
}

export function computeBasket(
  matches: IngredientMatch[],
  selectedRecipeIds: string[],
  excludeKeys: Set<string> = new Set(),
): Basket {
  const lines: BasketLine[] = [];
  const missing: string[] = [];
  for (const m of matches) {
    if (excludeKeys.has(m.need.key)) continue;
    const quantity = selectedRecipeIds.reduce((sum, id) => sum + (m.need.perRecipe[id] ?? 0), 0);
    if (quantity === 0) continue;
    if (!m.chosen) {
      missing.push(m.need.name);
      continue;
    }
    const { packs, uncertain } = packsNeeded({ quantity, unit: m.need.unit }, m.chosen.product);
    lines.push({
      key: m.need.key,
      name: m.need.name,
      product: m.chosen.product,
      quantityNeeded: quantity,
      unit: m.need.unit,
      packs,
      cost: round2(packs * m.chosen.product.price),
      uncertainQuantity: uncertain,
    });
  }
  return { lines, total: round2(lines.reduce((s, l) => s + l.cost, 0)), missing };
}

export function chooseSelection(
  recipeIds: string[],
  matches: IngredientMatch[],
  dinners: number,
  excludeKeys: Set<string> = new Set(),
): string[] {
  const cost = new Map(recipeIds.map((id) => [id, computeBasket(matches, [id], excludeKeys).total]));
  const keep = new Set([...recipeIds].sort((a, b) => cost.get(a)! - cost.get(b)!).slice(0, dinners));
  return recipeIds.filter((id) => keep.has(id));
}

export function basketToCartLines(lines: BasketLine[]): CartLine[] {
  return lines.map((l) => {
    if (!l.product.sellerId) throw new Error(`Magasin inconnu pour ${l.product.name} : relance la recherche.`);
    return {
      productId: l.product.productId,
      offerId: l.product.offerId,
      sellerId: l.product.sellerId,
      sellerType: l.product.sellerType,
      quantity: l.packs,
    };
  });
}
```

- [ ] **Step 4 : Lancer**

Run : `npx vitest run src/lib/budget`
Expected : PASS

- [ ] **Step 5 : Commit**

```bash
git add src/lib/budget
git commit -m "feat(budget): panier final, sélection des recettes et lignes panier"
```

---

### Task 12 : CLI de bout en bout `npm run week`

**Files:**
- Create: `scripts/week.ts`, `src/lib/pipeline.test.ts`

**Interfaces:**
- Consumes : tout ce qui précède.
- Produces : la commande `npm run week [-- --brief chemin.json] [--with-pantry] [--push]` ; les fichiers `data/cache/context.json` et `data/weeks/<AAAA-MM-JJ>.json`.

- [ ] **Step 1 : Test d'intégration du pipeline (sans réseau)** `src/lib/pipeline.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { makeProduct, makeRecipe } from "../../tests/helpers/factories";
import { FakeConnector } from "../../tests/helpers/fake-connector";
import { basketToCartLines, chooseSelection, computeBasket } from "./budget/basket";
import { mergeWithCart } from "./cart/merge";
import { matchNeeds } from "./matching/match";
import { aggregateNeeds } from "./matching/needs";

const ing = (q: string, quantity: number, pantryStaple = false) => ({
  name: q,
  searchQuery: q,
  quantity,
  unit: "g" as const,
  pantryStaple,
  fromPromo: false,
});

describe("pipeline recettes → panier", () => {
  it("produit des lignes panier cumulées avec le panier existant", async () => {
    const tomates = makeProduct({ name: "Tomates", price: 2, pack: { value: 500, unit: "g" } });
    const pates = makeProduct({ name: "Pâtes", price: 1, pack: { value: 500, unit: "g" } });
    const truffe = makeProduct({ name: "Truffe", price: 40, pack: { value: 20, unit: "g" } });
    const sel = makeProduct({ name: "Sel", price: 0.5, pack: { value: 1000, unit: "g" } });
    const connector = new FakeConnector({ tomates: [tomates], pates: [pates], truffe: [truffe], sel: [sel] });
    connector.cart.items = [{ productId: tomates.productId, offerId: tomates.offerId, quantity: 1 }];

    const recipes = [
      makeRecipe({ id: "a", ingredients: [ing("tomates", 400), ing("pates", 500), ing("sel", 5, true)] }),
      makeRecipe({ id: "b", ingredients: [ing("tomates", 300)] }),
      makeRecipe({ id: "luxe", ingredients: [ing("truffe", 20)] }),
    ];
    const needs = aggregateNeeds(recipes);
    const matches = await matchNeeds(needs, { preferOrganic: false, unprocessed: false }, { connector });
    const exclude = new Set(needs.filter((n) => n.pantryStaple).map((n) => n.key));
    const selected = chooseSelection(recipes.map((r) => r.id), matches, 2, exclude);
    expect(selected).toEqual(["a", "b"]);

    const basket = computeBasket(matches, selected, exclude);
    expect(basket.total).toBe(5); // 2 × tomates (700 g) + 1 × pâtes
    const lines = mergeWithCart(await connector.getCart(), basketToCartLines(basket.lines));
    expect(lines.find((l) => l.productId === tomates.productId)?.quantity).toBe(3);
  });
});
```

- [ ] **Step 2 : Lancer**

Run : `npx vitest run src/lib/pipeline.test.ts`
Expected : PASS (tous les modules existent déjà ; ce test verrouille leur assemblage)

- [ ] **Step 3 : `scripts/week.ts`**

```ts
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import Anthropic from "@anthropic-ai/sdk";
import { AuchanConnector } from "@/lib/auchan/connector";
import { AuchanHttp } from "@/lib/auchan/http";
import { loadSession } from "@/lib/auchan/session";
import { basketToCartLines, chooseSelection, computeBasket, type Basket } from "@/lib/budget/basket";
import { mergeWithCart } from "@/lib/cart/merge";
import { buildWeeklyContext, summarizeContext, type WeeklyContext } from "@/lib/context/build";
import { createClaudeArbiter } from "@/lib/matching/arbiter";
import { type IngredientMatch, matchNeeds } from "@/lib/matching/match";
import { aggregateNeeds } from "@/lib/matching/needs";
import { fetchOffInfo } from "@/lib/matching/off";
import { type Brief, BriefSchema } from "@/lib/recipes/brief";
import { generateMenu, reviseMenu } from "@/lib/recipes/generate";
import type { Recipe } from "@/lib/recipes/schema";

const CONTEXT_CACHE = "data/cache/context.json";
const DAY_MS = 86_400_000;

const argValue = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const step = (label: string) => console.log(`\n▶ ${label}`);

function loadBrief(briefPath: string): Brief {
  if (!fs.existsSync(briefPath)) {
    fs.mkdirSync(path.dirname(briefPath), { recursive: true });
    fs.copyFileSync("brief.example.json", briefPath);
    console.log(`Brief créé à partir de l'exemple : ${briefPath} (modifie-le si besoin)`);
  }
  return BriefSchema.parse(JSON.parse(fs.readFileSync(briefPath, "utf8")));
}

async function loadContext(connector: AuchanConnector): Promise<WeeklyContext> {
  if (fs.existsSync(CONTEXT_CACHE)) {
    const cached = JSON.parse(fs.readFileSync(CONTEXT_CACHE, "utf8")) as WeeklyContext;
    if (Date.now() - Date.parse(cached.generatedAt) < DAY_MS) return cached;
  }
  const ctx = await buildWeeklyContext(connector);
  fs.mkdirSync(path.dirname(CONTEXT_CACHE), { recursive: true });
  fs.writeFileSync(CONTEXT_CACHE, JSON.stringify(ctx));
  return ctx;
}

function printMenu(recipes: Recipe[], selected: string[]) {
  for (const r of recipes) {
    const mark = selected.includes(r.id) ? "✅" : "  ";
    console.log(`${mark} ${r.title} (${r.prepMinutes + r.cookMinutes} min) : ${r.whyThisWeek}`);
  }
}

function printBasket(basket: Basket, budget: number) {
  console.table(
    basket.lines.map((l) => ({
      ingrédient: `${l.name} (${l.quantityNeeded}${l.unit})`,
      produit: `${l.product.brand ? `${l.product.brand} ` : ""}${l.product.name}`,
      paquets: l.packs,
      coût: l.cost,
      infos: [l.product.isOrganic && "bio", l.product.promo?.label, l.uncertainQuantity && "⚠ quantité à vérifier"]
        .filter(Boolean)
        .join(" · "),
    })),
  );
  if (basket.missing.length) console.log(`Introuvables : ${basket.missing.join(", ")}`);
  const status = basket.total <= budget ? "✅" : "⚠ au-dessus du budget";
  console.log(`Total : ${basket.total} € / budget ${budget} € ${status}`);
}

async function main() {
  const brief = loadBrief(argValue("--brief") ?? "data/brief.json");
  const withPantry = process.argv.includes("--with-pantry");
  const session = loadSession();
  const connector = new AuchanConnector(new AuchanHttp(session), session);
  const client = new Anthropic();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string) => (await rl.question(`${q} (o/N) `)).trim().toLowerCase() === "o";

  step("Contexte de la semaine");
  const ctx = await loadContext(connector);
  console.log(summarizeContext(ctx));

  step("Génération des recettes (Claude)");
  let recipes = await generateMenu(client, brief, ctx);

  const scoreOpts = { preferOrganic: brief.preferOrganic, unprocessed: brief.filters.includes("unprocessed") };
  const deps = {
    connector,
    arbiter: createClaudeArbiter(client),
    novaLookup: async (p: { url: string }) => {
      const { ean } = await connector.getProductDetails(p.url);
      return ean ? (await fetchOffInfo(ean)).nova : null;
    },
    onProgress: (done: number, total: number) => process.stdout.write(`\r  produits : ${done}/${total}`),
  };

  const run = async () => {
    step("Recherche des produits Auchan");
    const needs = aggregateNeeds(recipes);
    const matches: IngredientMatch[] = await matchNeeds(needs, scoreOpts, deps);
    const exclude = withPantry ? new Set<string>() : new Set(needs.filter((n) => n.pantryStaple).map((n) => n.key));
    const selected = chooseSelection(recipes.map((r) => r.id), matches, brief.dinners, exclude);
    return { matches, selected, basket: computeBasket(matches, selected, exclude) };
  };

  let { matches, selected, basket } = await run();
  console.log();
  printMenu(recipes, selected);
  printBasket(basket, brief.budgetEur);

  if (basket.total > brief.budgetEur && (await ask("Demander à Claude des recettes moins chères ?"))) {
    const chosen = recipes.filter((r) => selected.includes(r.id)).map((r) => r.title);
    recipes = await reviseMenu(
      client,
      brief,
      ctx,
      recipes,
      `Le panier des recettes retenues (${chosen.join(", ")}) coûte ${basket.total} € pour un budget de ${brief.budgetEur} €. Remplace ou simplifie les recettes les plus chères pour passer sous le budget.`,
    );
    ({ matches, selected, basket } = await run());
    console.log();
    printMenu(recipes, selected);
    printBasket(basket, brief.budgetEur);
  }

  const weekFile = `data/weeks/${new Date().toISOString().slice(0, 10)}.json`;
  fs.mkdirSync(path.dirname(weekFile), { recursive: true });
  fs.writeFileSync(weekFile, JSON.stringify({ brief, context: summarizeContext(ctx), recipes, selected, matches, basket }, null, 2));
  console.log(`\nSemaine enregistrée : ${weekFile}`);

  if (process.argv.includes("--push") && (await ask(`Ajouter ${basket.lines.length} produits à ton panier Auchan ?`))) {
    step("Ajout au panier Auchan");
    const lines = mergeWithCart(await connector.getCart(), basketToCartLines(basket.lines));
    const failed: string[] = [];
    for (const line of lines) {
      const label = basket.lines.find((l) => l.product.productId === line.productId)?.product.name ?? line.productId;
      try {
        const { revised } = await connector.setCartQuantities([line]);
        for (const r of revised) console.log(`⚠ ${label} : ${r.actual} au lieu de ${r.requested} (stock)`);
      } catch (e) {
        failed.push(`${label} (${(e as Error).message})`);
      }
    }
    const cart = await connector.getCart();
    console.log(`Panier : ${cart.items.length} lignes, ${cart.totalPrice} €`);
    if (failed.length) console.log(`❌ Échecs : ${failed.join(", ")}`);
    console.log("Finalise ta commande (créneau et paiement) sur https://www.auchan.fr");
  }
  rl.close();
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}`);
  process.exit(1);
});
```

- [ ] **Step 4 : Vérifier types et tests**

Run : `npx tsc --noEmit && npm test`
Expected : pas d'erreur de type ; tous les tests PASS.

- [ ] **Step 5 : Vérification réelle, sans panier**

Run : `npm run week`
Expected : résumé du contexte ; 6 recettes dont 4 cochées ✅, avec une raison par recette ; un tableau produits aux prix cohérents avec le site ; un total comparé au budget ; le fichier `data/weeks/<date>.json` créé. Contrôler à la main 3 correspondances produit sur auchan.fr.

- [ ] **Step 6 : Vérification réelle avec le panier** (à faire avec l'utilisateur ; modifie son vrai panier)

Run : `npm run week -- --push`, puis répondre `o`.
Expected : sur auchan.fr, les produits ajoutés sont dans le panier en quantités cumulées avec l'existant ; les éventuelles révisions de stock sont affichées ; aucune commande n'est passée.

- [ ] **Step 7 : Commit**

```bash
git add scripts/week.ts src/lib/pipeline.test.ts
git commit -m "feat: CLI npm run week (contexte → recettes → produits → panier)"
```

---

## Hors de ce plan (plans suivants)

- **Plan 2 : web app et panier** : écrans brief, validation (changer de produit, décocher le placard, modifier une recette en texte libre, total en direct) et rapport panier ; SQLite + Drizzle pour les préférences et l'historique ; reconnexion Auchan quand la session expire.
- **Plan 3 : PDF et finitions** : fiches recettes et liste de courses personnalisables (rendu HTML → `page.pdf()`), favoris, pas deux fois le même plat.
