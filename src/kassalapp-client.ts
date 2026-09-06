// HTTP-klient mot kassal.app sitt API (https://kassal.app/api).
// Håndterer API-nøkkel, rate limiting og pakker svarene om til kompakte
// strukturer via format.ts.
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compactSearchResult, comparePrices } from "./format.js";
import type {
  EanResponse,
  Paginated,
  PhysicalStore,
  PriceHistoryOptions,
  Product,
  ProductSearchOptions,
  StoreSearchOptions,
} from "./types.js";

const BASE = "https://kassal.app/api/v1";
const CONFIG_DIR = join(homedir(), ".kassalapp-connector");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
// Prosjektroten, uavhengig av om vi kjører fra src/ (tsx) eller dist/ (bygget).
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export class KassalappApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`${message}: HTTP ${status} ${body.slice(0, 300)}`);
  }
}

interface Config {
  apiKey?: string;
}

/** Leser KASSALAPP_API_KEY fra en .env-fil i prosjektroten, om den finnes. */
async function readDotEnvKey(): Promise<string | undefined> {
  try {
    const content = await readFile(join(PROJECT_ROOT, ".env"), "utf8");
    const match = content.match(/^\s*KASSALAPP_API_KEY\s*=\s*"?([^"\n]+)"?\s*$/m);
    return match?.[1]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export class KassalappClient {
  private cachedKey: string | undefined;

  private async readConfig(): Promise<Config> {
    try {
      return JSON.parse(await readFile(CONFIG_FILE, "utf8")) as Config;
    } catch {
      return {};
    }
  }

  /** Lagrer nøkkelen i ~/.kassalapp-connector/config.json med chmod 600. */
  async setApiKey(apiKey: string): Promise<void> {
    await mkdir(CONFIG_DIR, { recursive: true });
    const config = await this.readConfig();
    config.apiKey = apiKey;
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    await chmod(CONFIG_FILE, 0o600);
    this.cachedKey = apiKey;
  }

  // Nøkkelkilder i prioritert rekkefølge:
  // 1. KASSALAPP_API_KEY-miljøvariabel  2. config-fil  3. .env i prosjektroten
  private async apiKey(): Promise<string> {
    if (this.cachedKey) return this.cachedKey;
    const key =
      process.env.KASSALAPP_API_KEY ??
      (await this.readConfig()).apiKey ??
      (await readDotEnvKey());
    if (!key) {
      throw new Error(
        "No API key. Create one at https://kassal.app/api (profile → API), then run " +
          "'kassalapp-connector auth set-key <key>' or set KASSALAPP_API_KEY.",
      );
    }
    this.cachedKey = key;
    return key;
  }

  async getSettings(): Promise<{
    api_key_configured: boolean;
    api_key_source: "env" | "config" | "dotenv" | "none";
    config_file: string;
    rate_limit: string;
  }> {
    const source = process.env.KASSALAPP_API_KEY
      ? "env"
      : (await this.readConfig()).apiKey
        ? "config"
        : (await readDotEnvKey())
          ? "dotenv"
          : "none";
    return {
      api_key_configured: source !== "none",
      api_key_source: source,
      config_file: CONFIG_FILE,
      rate_limit: "60 requests/min on the free tier",
    };
  }

  // Felles forespørselslogikk: bygger URL, setter Bearer-header, og prøver
  // én gang på nytt ved HTTP 429 (gratisnivået er begrenset til 60 req/min).
  private async request<T>(
    path: string,
    options: {
      query?: Record<string, string | number | boolean | undefined>;
      method?: "GET" | "POST";
      body?: unknown;
      retried?: boolean;
    } = {},
  ): Promise<T> {
    const url = new URL(BASE + path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined) continue;
      // API-ets boolean-validering godtar 1/0, ikke "true"/"false".
      url.searchParams.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
    }
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${await this.apiKey()}`,
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    if (response.status === 429 && !options.retried) {
      const retryAfter = Math.min(Number(response.headers.get("retry-after") ?? 2) || 2, 60);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      return this.request<T>(path, { ...options, retried: true });
    }
    if (!response.ok) {
      throw new KassalappApiError(`${options.method ?? "GET"} ${path} failed`, response.status, await response.text());
    }
    return (await response.json()) as T;
  }

  /** Produktsøk på tvers av butikker; svaret komprimeres til agentvennlig format. */
  async searchProducts(options: ProductSearchOptions) {
    const raw = await this.request<Paginated<Product>>("/products", {
      query: { size: 20, ...options },
    });
    return compactSearchResult(raw);
  }

  /** Full produktdetalj (ingredienser, allergener, næring, prishistorikk). */
  async getProduct(id: number): Promise<Product> {
    const raw = await this.request<{ data: Product }>(`/products/id/${id}`);
    return raw.data;
  }

  /** Prissammenligning på tvers av butikker for én strekkode. */
  async getProductByEan(ean: string) {
    const raw = await this.request<{ data: EanResponse }>(`/products/ean/${ean}`);
    return comparePrices(raw.data);
  }

  /** Slår opp én vare fra en butikk-URL (f.eks. en meny.no-lenke). */
  async findByUrl(url: string): Promise<Product> {
    const raw = await this.request<{ data: Product }>("/products/find-by-url/single", {
      query: { url },
    });
    return raw.data;
  }

  /** Som findByUrl, men sammenligner varen på tvers av butikker. */
  async compareByUrl(url: string) {
    const raw = await this.request<{ data: EanResponse }>("/products/find-by-url/compare", {
      query: { url },
    });
    return comparePrices(raw.data);
  }

  /** Prishistorikk i bulk for inntil 100 EAN-er (opptil 90 dager på gratisnivået). */
  async priceHistory(eans: string[], options: PriceHistoryOptions = {}) {
    if (eans.length === 0 || eans.length > 100) {
      throw new Error("Pass 1-100 EAN codes");
    }
    return this.request<unknown>("/products/prices-bulk", {
      method: "POST",
      body: {
        eans,
        days: options.days,
        aggregation: options.aggregation,
      },
    });
  }

  /** Fysiske butikker: søk på navn, kjede (group) eller posisjon (lat/lng + km). */
  async searchStores(options: StoreSearchOptions) {
    const raw = await this.request<Paginated<PhysicalStore>>("/physical-stores", {
      query: { size: 20, ...options },
    });
    return { stores: raw.data, meta: raw.meta };
  }

  async getStore(id: number): Promise<PhysicalStore> {
    const raw = await this.request<{ data: PhysicalStore }>(`/physical-stores/${id}`);
    return raw.data;
  }
}
