import * as cheerio from "cheerio";
import type { Cart, Product, ProductDetails, Promo } from "../types";
import { parseFrNumber, parsePack, parseUnitPrice, round2 } from "../units";

export const BASE_URL = "https://www.auchan.fr";

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

/** Bannière thématique de la page d'accueil Auchan (ex. « Asie, faites voyager vos papilles »). */
export interface StoreTheme {
  label: string;
  /** chemin de la catégorie Auchan mise en avant, ex. « /produits-de-nos-regions-et-du-monde/asie/ca-b0801 » */
  path: string;
  /** date de fin affichée par Auchan (« 05/10/2026 ») ; null si absente */
  until: string | null;
}

const UNTIL_PREFIX = /^jusqu['’]au (\d{2}\/\d{2}\/\d{4}),\s*/i;

/** Thèmes de la semaine : bannières `a.hp-banner__link` dont l'aria-label vaut « Jusqu'au JJ/MM/AAAA, <thème> ». */
export function parseThemes(html: string): StoreTheme[] {
  const $ = cheerio.load(html);
  const themes: StoreTheme[] = [];
  $("a.hp-banner__link").each((_, el) => {
    const aria = cleanText($(el).attr("aria-label") ?? "");
    const until = UNTIL_PREFIX.exec(aria);
    const label = aria
      .slice(until ? until[0].length : 0)
      .replace(/\s*\*+$/, "")
      .trim();
    if (!label || themes.some((t) => t.label.toLowerCase() === label.toLowerCase())) return;
    themes.push({ label, path: ($(el).attr("href") ?? "").split("?")[0], until: until ? until[1] : null });
  });
  return themes;
}

/** Texte d'un thème pour le prompt et l'accueil : « Asie, faites voyager vos papilles (jusqu'au 05/10/2026) ». */
export function themeText(theme: StoreTheme): string {
  return theme.until ? `${theme.label} (jusqu'au ${theme.until})` : theme.label;
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
