// Komprimerer kassal.app-svar til det en agent faktisk trenger — fulle
// API-svar med beskrivelser, næringsinnhold osv. er unødvendig store når
// målet bare er å sammenligne priser.
import type { EanResponse, Paginated, Product, ShoppingList, ShoppingListItem } from "./types.js";

export interface CompactProduct {
  id: number;
  name: string;
  brand?: string;
  vendor?: string;
  ean?: string;
  price?: number;
  unit_price?: number;
  price_date?: string;
  weight?: string;
  store?: string;
  store_code?: string;
  url?: string;
  price_age_days?: number;
  stale?: boolean;
}

/** Butikker slutter å oppdatere prisen på varer de har utgått; priser eldre
 *  enn dette vises fortsatt, men holdes utenfor billigst-beregningen. */
const STALE_AFTER_DAYS = 90;

/** current_price er et tall på /products, men et objekt på /products/ean og /products/id. */
export function extractPrice(product: Product): {
  price?: number;
  unit_price?: number;
  date?: string;
} {
  const cp = product.current_price;
  if (typeof cp === "number") {
    return { price: cp, unit_price: product.current_unit_price ?? undefined };
  }
  if (cp && typeof cp === "object") {
    return {
      price: cp.price,
      unit_price: cp.unit_price ?? undefined,
      date: cp.date,
    };
  }
  return { unit_price: product.current_unit_price ?? undefined };
}

export function compactProduct(product: Product): CompactProduct {
  const { price, unit_price, date } = extractPrice(product);
  const weight =
    product.weight != null ? `${product.weight}${product.weight_unit ?? ""}` : undefined;
  return {
    id: product.id,
    name: product.name,
    brand: product.brand ?? undefined,
    vendor: product.vendor ?? undefined,
    ean: product.ean ?? undefined,
    price,
    unit_price,
    price_date: date,
    weight,
    store: product.store?.name,
    store_code: product.store?.code,
    url: product.url,
  };
}

export function compactSearchResult(result: Paginated<Product>): {
  products: CompactProduct[];
  page?: number;
  meta?: unknown;
} {
  return {
    products: (result.data ?? []).map(compactProduct),
    page: result.meta?.current_page,
    meta: result.meta,
  };
}

/** Gjør et EAN-oppslag om til en prissammenligning per butikk, billigst først.
 *  Tilbud der prisen sist ble observert for mer enn STALE_AFTER_DAYS siden
 *  markeres stale og holdes utenfor cheapest/most_expensive/potential_saving. */
export function comparePrices(
  response: EanResponse,
  now: Date = new Date(),
): {
  ean: string;
  offers: CompactProduct[];
  cheapest?: CompactProduct;
  most_expensive?: CompactProduct;
  potential_saving?: number;
  stale_offers_excluded: number;
  allergens?: unknown[];
  nutrition?: unknown[];
} {
  const offers = (response.products ?? [])
    .map(compactProduct)
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  for (const offer of offers) {
    if (!offer.price_date) continue;
    const observed = Date.parse(offer.price_date);
    if (Number.isNaN(observed)) continue;
    offer.price_age_days = Math.max(0, Math.floor((now.getTime() - observed) / 86_400_000));
    if (offer.price_age_days > STALE_AFTER_DAYS) offer.stale = true;
  }
  const priced = offers.filter((o) => o.price != null && !o.stale);
  const cheapest = priced[0];
  const mostExpensive = priced[priced.length - 1];
  const saving =
    cheapest?.price != null && mostExpensive?.price != null
      ? Number((mostExpensive.price - cheapest.price).toFixed(2))
      : undefined;
  return {
    ean: response.ean,
    offers,
    cheapest,
    most_expensive: mostExpensive,
    potential_saving: saving,
    stale_offers_excluded: offers.filter((o) => o.stale).length,
    allergens: response.allergens,
    nutrition: response.nutrition,
  };
}

export interface CompactListItem {
  id: number;
  text: string;
  checked?: boolean;
  ean?: string;
  cheapest?: { store?: string; price?: number };
  potential_saving?: number;
  offer_count?: number;
}

/** Handleliste-items kommer med en full kryssbutikk-sammenligning innebygd
 *  per vare — her kokes den ned til billigste butikk og besparelse, så en
 *  liste på 30 varer ikke sprenger konteksten. Detaljer hentes ved behov
 *  med compare_prices_by_ean. */
export function compactListItem(item: ShoppingListItem, now: Date = new Date()): CompactListItem {
  const compact: CompactListItem = { id: item.id, text: item.text, checked: item.checked };
  if (item.product) {
    const comparison = comparePrices(item.product, now);
    compact.ean = comparison.ean;
    if (comparison.cheapest) {
      compact.cheapest = { store: comparison.cheapest.store, price: comparison.cheapest.price };
    }
    compact.potential_saving = comparison.potential_saving;
    compact.offer_count = comparison.offers.length;
  }
  return compact;
}

export function compactShoppingList(list: ShoppingList, now: Date = new Date()) {
  return {
    id: list.id,
    title: list.title,
    items: list.items?.map((item) => compactListItem(item, now)),
    updated_at: list.updated_at,
  };
}
