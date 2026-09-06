import { describe, expect, it } from "vitest";
import { compactListItem, compactProduct, comparePrices, extractPrice } from "../src/format.js";
import type { EanResponse, Product } from "../src/types.js";

const listProduct: Product = {
  id: 1,
  name: "Tine Helmelk 1l",
  brand: "Tine",
  vendor: "MENY_NO",
  ean: "7038010001642",
  url: "https://meny.no/helmelk",
  current_price: 24.9,
  current_unit_price: 24.9,
  weight: 1,
  weight_unit: "l",
  store: { name: "Meny", code: "MENY_NO" },
};

const eanProduct = (store: string, price: number): Product => ({
  id: price,
  name: "Tine Helmelk 1l",
  ean: "7038010001642",
  current_price: { price, unit_price: price, date: "2026-09-01" },
  store: { name: store, code: store.toUpperCase() },
});

describe("extractPrice", () => {
  it("handles numeric current_price from /products", () => {
    expect(extractPrice(listProduct)).toEqual({ price: 24.9, unit_price: 24.9 });
  });

  it("handles object current_price from /products/ean", () => {
    expect(extractPrice(eanProduct("Kiwi", 22.4))).toEqual({
      price: 22.4,
      unit_price: 22.4,
      date: "2026-09-01",
    });
  });

  it("handles missing price", () => {
    expect(extractPrice({ id: 1, name: "x" }).price).toBeUndefined();
  });
});

describe("compactProduct", () => {
  it("keeps the fields an agent needs and formats weight", () => {
    const compact = compactProduct(listProduct);
    expect(compact).toMatchObject({
      id: 1,
      name: "Tine Helmelk 1l",
      price: 24.9,
      weight: "1l",
      store: "Meny",
      store_code: "MENY_NO",
    });
    expect(compact).not.toHaveProperty("description");
  });
});

const NOW = new Date("2026-09-06T12:00:00Z");

describe("comparePrices", () => {
  it("sorts offers cheapest first and computes the saving", () => {
    const response: EanResponse = {
      ean: "7038010001642",
      products: [eanProduct("Meny", 26.9), eanProduct("Kiwi", 22.4), eanProduct("Rema", 23.9)],
    };
    const result = comparePrices(response, NOW);
    expect(result.offers.map((o) => o.store)).toEqual(["Kiwi", "Rema", "Meny"]);
    expect(result.cheapest?.store).toBe("Kiwi");
    expect(result.most_expensive?.store).toBe("Meny");
    expect(result.potential_saving).toBe(4.5);
    expect(result.stale_offers_excluded).toBe(0);
    expect(result.offers[0]?.price_age_days).toBe(5);
  });

  it("marks prices older than 90 days stale and excludes them from cheapest", () => {
    const staleKiwi: Product = {
      ...eanProduct("Kiwi", 15.9),
      current_price: { price: 15.9, date: "2023-04-14T07:00:00Z" },
    };
    const result = comparePrices(
      { ean: "1", products: [staleKiwi, eanProduct("Meny", 26.9), eanProduct("Rema", 23.9)] },
      NOW,
    );
    expect(result.offers[0]?.store).toBe("Kiwi");
    expect(result.offers[0]?.stale).toBe(true);
    expect(result.cheapest?.store).toBe("Rema");
    expect(result.potential_saving).toBe(3);
    expect(result.stale_offers_excluded).toBe(1);
  });

  it("puts unpriced offers last and skips saving when nothing is priced", () => {
    const unpriced: Product = { id: 9, name: "x", current_price: null, store: { name: "Joker" } };
    const result = comparePrices({ ean: "1", products: [unpriced] });
    expect(result.cheapest).toBeUndefined();
    expect(result.potential_saving).toBeUndefined();
  });
});

describe("compactListItem", () => {
  it("reduserer produktkoblede varer til billigste butikk og besparelse", () => {
    const item = {
      id: 7,
      text: "Helmelk",
      checked: false,
      product: {
        ean: "7038010000065",
        products: [eanProduct("Meny", 26.9), eanProduct("Kiwi", 22.4)],
      },
    };
    const compact = compactListItem(item, NOW);
    expect(compact).toEqual({
      id: 7,
      text: "Helmelk",
      checked: false,
      ean: "7038010000065",
      cheapest: { store: "Kiwi", price: 22.4 },
      potential_saving: 4.5,
      offer_count: 2,
    });
  });

  it("lar tekstvarer uten produkt passere uten prisfelter", () => {
    const compact = compactListItem({ id: 8, text: "Gjærbakst", checked: true, product: null }, NOW);
    expect(compact).toEqual({ id: 8, text: "Gjærbakst", checked: true });
  });
});
