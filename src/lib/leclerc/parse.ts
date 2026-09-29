import type { Cart, CartItem, Product, ProductDetails, Promo, Quantity } from "../types";
import { parseFrNumber, parsePack, round2 } from "../units";
import { decodeEntities, findWidget } from "./embedded";

/** Magasin Leclerc Drive : point de livraison et adresse de sa boutique. */
export interface LeclercStore {
  /** numéro du point de livraison, ex. « 274401 » */
  noPL: string;
  /** ex. « https://fd16-courses.leclercdrive.fr » (le serveur dépend du magasin) */
  origin: string;
  /** ex. « /magasin-274401-Orvault-Grand-Val » */
  storePath: string;
}

/** Champs communs aux produits des pages de recherche, de promotions et du panier. */
export interface RawProduct {
  iIdProduit: number;
  sNoPointLivraison?: string;
  sType?: string;
  sLibelleLigne1: string;
  sLibelleLigne2: string;
  /** prix hors promotion immédiate */
  nrPVUnitaireTTC: number;
  /** prix payé en cas d'avantage immédiat, « 0,00 € » sinon (recherche seulement) */
  sPrixPromo?: string;
  nrPVParUniteDeMesureTTC?: number;
  /** unité du prix au kilo / litre et de nrContenanceTotale : « kg », « l »… */
  sUniteMesureTotale?: string;
  nrContenanceTotale?: number;
  iQteDisponible?: number;
  /** 0 = disponible */
  eDisponibilite?: number;
  /** promotion immédiate (recherche) */
  sTexteLogoBRII?: string;
  /** Ticket E.Leclerc (recherche) */
  sTexteLogoTel?: string;
  /** promotion immédiate (page promotions) */
  objBrii?: { sLibelle1?: string } | null;
  /** Ticket E.Leclerc (page promotions) */
  objTel?: { sLibelle1?: string } | null;
  fEstAntiGaspi?: boolean;
  sUrlPageProduit?: string;
  iIdRayon?: number;
  iQuantitePanier?: number;
  rTotalAPayer?: number;
}

/** Mots d'emballage seuls, sans intérêt dans le nom du produit. */
const PACKAGING = /^(bouteilles?|briques?|sachets?|barquettes?|bo[iî]tes?|pots?|bocal|bocaux|filets?|paquets?|flacons?|lots?|packs?|[ée]tuis?|tubes?|bidons?|cartons?|vrac|poches?|seaux?|canettes?)$/i;

/**
 * Complément de nom tiré de la 2e ligne du libellé, de la forme « description - format »
 * (« Candia+ - 6x1L », « Panier du Primeur - 1kg ») ; null pour un format seul ou un emballage seul.
 * Leclerc n'a pas de champ marque : la description y ressemble parfois, mais pas toujours (« UHT Bouteille »).
 */
export function descriptionFrom(line2: string): string | null {
  const m = line2.match(/^(.+?)\s*[-–]\s+\S/) ?? line2.match(/^(.+?)\s+[-–]\s*\S/);
  if (!m) return null;
  const description = m[1].replace(/\s+[-–]\s*/g, " ").trim();
  return !description || PACKAGING.test(description) ? null : description;
}

const MEASURE: Record<string, { unit: Quantity["unit"]; factor: number; priceUnit: "kg" | "l" }> = {
  kg: { unit: "g", factor: 1000, priceUnit: "kg" },
  l: { unit: "ml", factor: 1000, priceUnit: "l" },
};

function packOf(raw: RawProduct, line2: string): Quantity | null {
  const m = MEASURE[(raw.sUniteMesureTotale ?? "").toLowerCase()];
  if (m && raw.nrContenanceTotale && raw.nrContenanceTotale > 0) {
    return { value: round2(raw.nrContenanceTotale * m.factor), unit: m.unit };
  }
  return parsePack(line2);
}

const IMMEDIATE = /avantage imm[ée]diat de (\d+(?:[.,]\d+)?)\s*%/i;

function promoOf(raw: RawProduct): Promo | null {
  const immediate = decodeEntities(raw.sTexteLogoBRII || raw.objBrii?.sLibelle1 || "").trim();
  const ticket = decodeEntities(raw.sTexteLogoTel || raw.objTel?.sLibelle1 || "").trim();
  const label = [immediate, ticket].filter(Boolean).join(" · ");
  if (!label) return null;
  return { label, kind: immediate ? "price" : "loyalty" };
}

/** Prix payé : le prix promo de la recherche, sinon le prix déduit d'un « Avantage immédiat de X % ». */
function paidPrice(raw: RawProduct, promo: Promo | null): number {
  const promoPrice = raw.sPrixPromo ? parseFrNumber(raw.sPrixPromo.replace(/€/g, "")) : 0;
  if (promoPrice > 0 && promoPrice < raw.nrPVUnitaireTTC) return promoPrice;
  const pct = promo?.label.match(IMMEDIATE);
  if (pct) return round2(raw.nrPVUnitaireTTC * (1 - parseFrNumber(pct[1]) / 100));
  return raw.nrPVUnitaireTTC;
}

export function toProduct(raw: RawProduct, store: LeclercStore): Product {
  const line1 = decodeEntities(raw.sLibelleLigne1).trim();
  const line2 = decodeEntities(raw.sLibelleLigne2 ?? "").trim();
  const description = descriptionFrom(line2);
  const name = description ? `${line1} ${description}` : line1;
  const promo = promoOf(raw);
  const price = paidPrice(raw, promo);
  const measure = MEASURE[(raw.sUniteMesureTotale ?? "").toLowerCase()];
  const regularUnitPrice = raw.nrPVParUniteDeMesureTTC ?? null;
  const unitPrice =
    regularUnitPrice !== null && raw.nrPVUnitaireTTC > 0 ? round2((regularUnitPrice * price) / raw.nrPVUnitaireTTC) : null;
  const available = raw.eDisponibilite === undefined || raw.eDisponibilite === 0;
  const id = String(raw.iIdProduit);
  return {
    productId: id,
    offerId: id,
    sellerId: raw.sNoPointLivraison ?? store.noPL,
    sellerType: "DRIVE",
    name,
    brand: null,
    price,
    unitPrice,
    unitPriceUnit: unitPrice === null ? null : (measure?.priceUnit ?? "pce"),
    pack: packOf(raw, line2),
    isOrganic: /\bbio\b/i.test(`${name} ${line2}`),
    isSeasonal: false,
    promo,
    stock: available ? (raw.iQteDisponible ?? null) : 0,
    url: raw.sUrlPageProduit || `${store.origin}${store.storePath}/fiche-produits-${id}-x.aspx`,
  };
}

interface SearchWidget {
  objContenu?: { lstElements?: { objElement?: RawProduct }[] };
}

/** Produits d'une page de recherche (`recherche.aspx`). */
export function parseSearchPage(html: string, store: LeclercStore): Product[] {
  const widget = findWidget<SearchWidget>(html, /_pnlElementProduit$/);
  return (widget?.objContenu?.lstElements ?? [])
    .map((e) => e.objElement)
    .filter((e): e is RawProduct => !!e && (e.sType ?? "Produit") === "Produit" && typeof e.iIdProduit === "number")
    .map((e) => toProduct(e, store));
}

interface ProductWidget {
  objProduit?: { sCodeEAN?: string; sComposition?: string };
}

/** EAN et composition d'une fiche produit. Attention : la fiche liste aussi d'autres produits, avec leur EAN. */
export function parseProductPage(html: string): ProductDetails {
  const produit = findWidget<ProductWidget>(html, /_pnlFicheProduit$/)?.objProduit;
  const ean = produit?.sCodeEAN?.trim();
  const ingredients = produit?.sComposition ? decodeEntities(produit.sComposition).trim() : "";
  return { ean: ean && /^\d{8,14}$/.test(ean) ? ean : null, ingredients: ingredients || null };
}

/** Rayons alimentaires de la page promotions (d'après leur libellé, les identifiants pouvant varier). */
const FOOD_AISLE = /laitier|[ée]picerie|fruits|l[ée]gumes|viandes|poissons|charcuterie|traiteur|surgel|saveurs du monde|boulangerie|p[aâ]tisserie/i;

interface PromotionsWidget {
  objContenu?: {
    objFiltres?: {
      lstProduits?: RawProduct[];
      lstFiltreValeurs?: { iIdBloc: number; iIdValeur: number; sLibelle: string }[];
    };
  };
}

/** Promotions alimentaires et produits anti-gaspi de la page `promotions.aspx`. */
export function parsePromotionsPage(html: string, store: LeclercStore): { promos: Product[]; antiGaspi: Product[] } {
  const filtres = findWidget<PromotionsWidget>(html, /_pnlElementProduitsPromos$/)?.objContenu?.objFiltres;
  const aisles = (filtres?.lstFiltreValeurs ?? []).filter((v) => v.iIdBloc === 4);
  const food = new Set(aisles.filter((v) => FOOD_AISLE.test(decodeEntities(v.sLibelle))).map((v) => v.iIdValeur));
  const raw = (filtres?.lstProduits ?? []).filter((p) => p.eDisponibilite === undefined || p.eDisponibilite === 0);
  // sans liste de rayons (format inattendu), on garde tout plutôt que rien
  const isFood = (p: RawProduct) => !aisles.length || (p.iIdRayon !== undefined && food.has(p.iIdRayon));
  const promos = raw.filter((p) => isFood(p)).map((p) => toProduct(p, store)).filter((p) => p.promo);
  const antiGaspi = raw.filter((p) => p.fEstAntiGaspi && isFood(p)).map((p) => toProduct(p, store));
  return { promos, antiGaspi };
}

/** Thèmes mis en avant sur l'accueil du magasin (liens « offres-<id>-<Nom>.aspx »). */
export function parseThemes(html: string): string[] {
  const names = [...html.matchAll(/\/offres-\d+-([A-Za-z0-9-]+)\.aspx/g)].map((m) =>
    m[1].replace(/-+/g, " ").trim(),
  );
  return [...new Set(names)].filter((n) => n && !/^promotions$/i.test(n));
}

interface CartNode {
  objElement?: RawProduct & { sType?: string };
  lstEnfants?: CartNode[];
}

/** Panier de la page `detail-panier.aspx` : arbre panier → rayon → … → produits. */
export function parseCartPage(html: string, store: LeclercStore): Cart {
  const widget = findWidget<{ objContenu?: { lstElements?: CartNode[] } }>(html, /_ucDetailPanier_pnlDetailPanier$/);
  const items: CartItem[] = [];
  let total = 0;
  const walk = (nodes: CartNode[] = []) => {
    for (const node of nodes) {
      const el = node.objElement;
      if (el?.sType === "Produit" && (el.iQuantitePanier ?? 0) > 0) {
        const id = String(el.iIdProduit);
        items.push({ productId: id, offerId: id, quantity: el.iQuantitePanier! });
        total += el.rTotalAPayer ?? 0;
      }
      walk(node.lstEnfants);
    }
  };
  walk(widget?.objContenu?.lstElements);
  return { id: store.noPL, items, totalPrice: round2(total) };
}

export interface CartEvent {
  eTypeEvenement: number;
  objElement?: {
    sType?: string;
    sTotalAPayer?: string;
    lstProduitsLight?: { iIdProduit: number; iQtePanier: number }[];
  };
}

/** Panier renvoyé par `panier.aspx?op=1` (événement « Panier » de la réponse). */
export function parseCartUpdate(events: CartEvent[], store: LeclercStore): Cart {
  const panier = events.find((e) => e.objElement?.sType === "Panier")?.objElement;
  if (!panier) throw new Error("Réponse du panier Leclerc inattendue (pas de panier).");
  const items = (panier.lstProduitsLight ?? [])
    .filter((p) => p.iQtePanier > 0)
    .map((p) => ({ productId: String(p.iIdProduit), offerId: String(p.iIdProduit), quantity: p.iQtePanier }));
  const total = panier.sTotalAPayer ? parseFrNumber(panier.sTotalAPayer.replace(/€/g, "")) : 0;
  return { id: store.noPL, items, totalPrice: Number.isFinite(total) ? total : 0 };
}
