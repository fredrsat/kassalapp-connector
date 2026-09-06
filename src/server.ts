// MCP-server (stdio) som eksponerer kassal.app-API-et som verktøy for
// agenter. Verktøybeskrivelsene er på engelsk med hensikt — de leses av
// språkmodellen, ikke av mennesker.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { KassalappClient } from "./kassalapp-client.js";

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export async function runMcpServer(): Promise<void> {
  const client = new KassalappClient();
  const server = new McpServer({ name: "kassalapp-connector", version: "0.1.0" });

  server.registerTool(
    "search_products",
    {
      description:
        "Search Norwegian grocery products across stores (Meny, Kiwi, Rema 1000, Oda, Joker, Spar…) via kassal.app. " +
        "Norwegian terms work best (e.g. 'melk', 'brød'). Returns compact results with price, unit price, store and EAN. " +
        "To find where a product is cheapest: search for it here, then pass its EAN to compare_prices_by_ean. " +
        "Note: unique=true collapses duplicates but drops price/store info — leave it off when you need prices.",
      inputSchema: {
        search: z.string().describe("Search term, e.g. 'grandiosa'"),
        store: z.string().optional().describe("Filter by store chain, use store_code values from earlier results (e.g. 'MENY_NO', 'KIWI', 'ODA_NO')"),
        vendor: z.string().optional().describe("Filter by supplier/producer, e.g. 'TINE SA' (not the store — use store for that)"),
        brand: z.string().optional().describe("Filter by brand name"),
        price_min: z.number().optional(),
        price_max: z.number().optional(),
        unique: z.boolean().optional().describe("Collapse identical products from different stores into one result"),
        exclude_without_ean: z.boolean().optional().describe("Only products with an EAN (needed for price comparison)"),
        sort: z.enum(["date_asc", "date_desc", "name_asc", "name_desc", "price_asc", "price_desc"]).optional(),
        page: z.number().int().min(1).optional().describe("Result page, default 1"),
        size: z.number().int().min(1).max(100).optional().describe("Results per page, default 20"),
      },
    },
    async (options) => jsonResult(await client.searchProducts(options)),
  );

  server.registerTool(
    "get_product",
    {
      description:
        "Get full product details by kassal.app product id: description, ingredients, allergens, nutrition, weight and price history.",
      inputSchema: {
        product_id: z.number().int().describe("Product id from search_products"),
      },
    },
    async ({ product_id }) => jsonResult(await client.getProduct(product_id)),
  );

  server.registerTool(
    "compare_prices_by_ean",
    {
      description:
        "Compare the price of one product (by EAN/barcode) across all Norwegian stores kassal.app tracks. " +
        "Returns offers sorted cheapest first, plus cheapest/most expensive and the potential saving in NOK. " +
        "Each offer has price_age_days; offers whose price is >90 days old are marked stale and excluded " +
        "from cheapest/saving (stores stop updating prices for delisted products). " +
        "This is the main tool for finding which store sells a product cheapest.",
      inputSchema: {
        ean: z.string().min(8).describe("EAN/barcode, e.g. from search_products"),
      },
    },
    async ({ ean }) => jsonResult(await client.getProductByEan(ean)),
  );

  server.registerTool(
    "compare_prices_by_url",
    {
      description:
        "Look up a product from a store's product-page URL (e.g. a meny.no or oda.com link) and compare its price across stores. Sorted cheapest first.",
      inputSchema: {
        url: z.string().url().describe("Product page URL from a Norwegian grocery store"),
      },
    },
    async ({ url }) => jsonResult(await client.compareByUrl(url)),
  );

  server.registerTool(
    "get_product_by_url",
    {
      description: "Look up a single product's details from a store's product-page URL, without cross-store comparison.",
      inputSchema: {
        url: z.string().url(),
      },
    },
    async ({ url }) => jsonResult(await client.findByUrl(url)),
  );

  server.registerTool(
    "get_price_history",
    {
      description:
        "Get historical prices for up to 100 products (by EAN) across stores. Useful for spotting price trends and whether a 'sale' is genuine. Free tier covers up to 90 days.",
      inputSchema: {
        eans: z.array(z.string()).min(1).max(100).describe("EAN codes"),
        days: z.number().int().min(1).max(365).optional().describe("Days of history, default 30"),
        aggregation: z.enum(["min", "max", "avg"]).optional().describe("Daily aggregation, default min"),
      },
    },
    async ({ eans, days, aggregation }) => jsonResult(await client.priceHistory(eans, { days, aggregation })),
  );

  server.registerTool(
    "search_stores",
    {
      description:
        "Find physical grocery stores by name or near a location (lat/lng + km radius). Returns address, opening hours and contact info. " +
        "group filters by chain, e.g. 'MENY_NO', 'KIWI', 'REMA_1000', 'SPAR_NO', 'JOKER_NO'.",
      inputSchema: {
        search: z.string().optional().describe("Store name search, e.g. 'Meny Majorstuen'"),
        group: z.string().optional().describe("Chain code, e.g. 'KIWI'"),
        lat: z.number().optional().describe("Latitude for proximity search"),
        lng: z.number().optional().describe("Longitude for proximity search"),
        km: z.number().optional().describe("Radius in km around lat/lng"),
        page: z.number().int().min(1).optional(),
      },
    },
    async (options) => jsonResult(await client.searchStores(options)),
  );

  server.registerTool(
    "get_store",
    {
      description: "Get details for one physical store by its kassal.app store id.",
      inputSchema: {
        store_id: z.number().int(),
      },
    },
    async ({ store_id }) => jsonResult(await client.getStore(store_id)),
  );

  server.registerTool(
    "get_connector_settings",
    {
      description:
        "Show connector settings: whether a kassal.app API key is configured, where it comes from (env or config file), and the rate limit.",
      inputSchema: {},
    },
    async () => jsonResult(await client.getSettings()),
  );

  await server.connect(new StdioServerTransport());
}
