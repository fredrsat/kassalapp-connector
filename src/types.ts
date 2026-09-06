// Typer for kassal.app sine API-svar. Med vilje løst typet (valgfrie felter
// og indekssignaturer): API-et er ikke vårt, og ukjente felter skal passere
// uendret i stedet for å knekke connectoren.
export interface StoreRef {
  name?: string;
  code?: string;
  url?: string;
  logo?: string;
}

export interface PricePoint {
  price: number;
  date: string;
}

export interface CurrentPriceObject {
  price: number;
  unit_price?: number | null;
  date?: string;
}

/** Produkt slik kassal.app returnerer det. Formen varierer litt mellom
 *  endepunkter: /products har current_price som tall, /products/ean og
 *  /products/id som objekt. Ekstra felter passerer uendret gjennom. */
export interface Product {
  id: number;
  name: string;
  brand?: string | null;
  vendor?: string | null;
  ean?: string | null;
  url?: string;
  image?: string;
  description?: string | null;
  ingredients?: string | null;
  current_price?: number | CurrentPriceObject | null;
  current_unit_price?: number | null;
  weight?: number | null;
  weight_unit?: string | null;
  store?: StoreRef | null;
  price_history?: PricePoint[];
  allergens?: unknown[];
  nutrition?: unknown[];
  category?: unknown;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface Paginated<T> {
  data: T[];
  links?: unknown;
  meta?: { current_page?: number; [key: string]: unknown };
}

export interface EanResponse {
  ean: string;
  products: Product[];
  allergens?: unknown[];
  nutrition?: unknown[];
  [key: string]: unknown;
}

export interface PhysicalStore {
  id: number;
  group?: string;
  name?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  fax?: string | null;
  logo?: string | null;
  website?: string | null;
  detailUrl?: string | null;
  position?: { lat: string | number; lng: string | number } | null;
  openingHours?: unknown;
  [key: string]: unknown;
}

export interface ProductSearchOptions {
  search?: string;
  store?: string;
  vendor?: string;
  brand?: string;
  category?: string;
  price_min?: number;
  price_max?: number;
  unique?: boolean;
  exclude_without_ean?: boolean;
  sort?: "date_asc" | "date_desc" | "name_asc" | "name_desc" | "price_asc" | "price_desc";
  page?: number;
  size?: number;
}

export interface StoreSearchOptions {
  search?: string;
  group?: string;
  lat?: number;
  lng?: number;
  km?: number;
  page?: number;
  size?: number;
}

export interface PriceHistoryOptions {
  days?: number;
  aggregation?: "min" | "max" | "avg";
}
