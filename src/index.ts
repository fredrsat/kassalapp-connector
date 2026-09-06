#!/usr/bin/env node
// CLI-inngang: `kassalapp-connector mcp` starter MCP-serveren, resten er
// kommandoer for å teste API-et og sette opp nøkkelen fra terminalen.
import { KassalappClient } from "./kassalapp-client.js";
import { runMcpServer } from "./server.js";

const HELP = `kassalapp-connector — CLI and MCP server for the kassal.app grocery price API

Usage:
  kassalapp-connector mcp                       Start the MCP server (stdio)

  kassalapp-connector auth set-key <key>        Store API key in ~/.kassalapp-connector/
  kassalapp-connector auth set-key --stdin      Read API key from stdin
  kassalapp-connector auth status               Show whether a key is configured

  kassalapp-connector product search <query> [--store MENY_NO] [--vendor "TINE SA"] [--brand X] [--sort price_asc]
                                     [--unique] [--page N] [--size N]
  kassalapp-connector product id <product_id>   Full product details
  kassalapp-connector product ean <ean>         Compare prices across stores
  kassalapp-connector product url <url>         Look up product by store URL
  kassalapp-connector product compare <url>     Compare prices by store URL

  kassalapp-connector prices <ean...> [--days N] [--agg min|max|avg]

  kassalapp-connector store search [query] [--group KIWI] [--lat X --lng Y --km N]
  kassalapp-connector store get <store_id>

  kassalapp-connector settings                  Show connector settings

Get an API key at https://kassal.app/api (free for personal use, 60 req/min).
`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function numFlag(args: string[], name: string): number | undefined {
  const value = flag(args, name);
  return value !== undefined ? Number(value) : undefined;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
  const [cmd, sub, ...rest] = process.argv.slice(2);
  const client = new KassalappClient();

  switch (`${cmd} ${sub}`) {
    case "mcp undefined":
      await runMcpServer();
      return;

    case "auth set-key": {
      const key = rest.includes("--stdin") ? await readStdin() : rest[0];
      if (!key) throw new Error("Missing <key> (or use --stdin)");
      await client.setApiKey(key);
      print({ status: "api key saved" });
      return;
    }
    case "auth status":
      print(await client.getSettings());
      return;

    case "product search": {
      const query = rest.filter((a) => !a.startsWith("--"))[0];
      if (!query) throw new Error("Missing search query");
      print(
        await client.searchProducts({
          search: query,
          store: flag(rest, "--store"),
          vendor: flag(rest, "--vendor"),
          brand: flag(rest, "--brand"),
          sort: flag(rest, "--sort") as never,
          unique: rest.includes("--unique") || undefined,
          page: numFlag(rest, "--page"),
          size: numFlag(rest, "--size"),
        }),
      );
      return;
    }
    case "product id": {
      const id = Number(rest[0]);
      if (!Number.isInteger(id)) throw new Error("Missing <product_id>");
      print(await client.getProduct(id));
      return;
    }
    case "product ean": {
      if (!rest[0]) throw new Error("Missing <ean>");
      print(await client.getProductByEan(rest[0]));
      return;
    }
    case "product url": {
      if (!rest[0]) throw new Error("Missing <url>");
      print(await client.findByUrl(rest[0]));
      return;
    }
    case "product compare": {
      if (!rest[0]) throw new Error("Missing <url>");
      print(await client.compareByUrl(rest[0]));
      return;
    }

    case "store search": {
      const query = rest.filter((a) => !a.startsWith("--"))[0];
      print(
        await client.searchStores({
          search: query,
          group: flag(rest, "--group"),
          lat: numFlag(rest, "--lat"),
          lng: numFlag(rest, "--lng"),
          km: numFlag(rest, "--km"),
          page: numFlag(rest, "--page"),
        }),
      );
      return;
    }
    case "store get": {
      const id = Number(rest[0]);
      if (!Number.isInteger(id)) throw new Error("Missing <store_id>");
      print(await client.getStore(id));
      return;
    }

    case "settings undefined":
      print(await client.getSettings());
      return;

    default:
      if (cmd === "prices") {
        const eans = [sub, ...rest].filter((a): a is string => !!a && !a.startsWith("--"));
        if (eans.length === 0) throw new Error("Missing <ean...>");
        print(
          await client.priceHistory(eans, {
            days: numFlag(rest, "--days"),
            aggregation: flag(rest, "--agg") as never,
          }),
        );
        return;
      }
      console.log(HELP);
      process.exitCode = cmd && cmd !== "help" ? 1 : 0;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
