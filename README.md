# kassalapp-connector

MCP-server og CLI for [kassal.app](https://kassal.app) sitt API. Gir
AI-agenter (Claude Desktop, Claude Code eller andre MCP-klienter) tilgang til
norske dagligvarepriser på tvers av kjeder — Meny, Kiwi, Rema 1000, Oda,
Joker, Spar, Coop, Bunnpris m.fl. — for prissammenligning og prishistorikk.

Typisk bruk: en handleagent slår opp varen, sammenligner prisen på tvers av
butikkene med `compare_prices_by_ean`, og legger varen i kurven der den er
billigst.

## Funksjoner

- Produktsøk på tvers av butikker, med filter på kjede, leverandør, merke og pris
- **Prissammenligning per EAN/strekkode** — billigste butikk, sortert liste og
  potensiell besparelse i kroner
- Prisers alder følger med (`price_age_days`); priser eldre enn 90 dager
  markeres `stale` og holdes utenfor billigst-beregningen, siden butikkene
  slutter å oppdatere priser på utgåtte varer
- Oppslag og sammenligning fra produkt-URL (f.eks. en meny.no-lenke)
- Prishistorikk i bulk for inntil 100 EAN-er (opptil 90 dager på gratisnivået)
- Fysiske butikker: søk på navn, kjede eller posisjon (lat/lng + radius)
- **Handlelister** — les, opprett og oppdater handlelistene på kassal.app-kontoen
  (synkroniseres med Kassalapp-mobilappen); varer koblet til produkt viser
  billigste butikk akkurat nå

Søkeresultater komprimeres til feltene en agent trenger (pris, enhetspris,
butikk, EAN, URL) for å spare tokens; full detalj hentes med `get_product`.

## Oppsett

1. Lag en konto på [kassal.app](https://kassal.app) og generer en API-nøkkel
   under profil → API (gratis for ikke-kommersiell bruk, 60 forespørsler/min).
2. Bygg og legg inn nøkkelen:

   ```sh
   npm install
   npm run build
   node dist/index.js auth set-key <nøkkel>
   ```

   Nøkkelen lagres i `~/.kassalapp-connector/config.json` (chmod 600).
   Alternativt kan du sette miljøvariabelen `KASSALAPP_API_KEY` eller legge
   `KASSALAPP_API_KEY=<nøkkel>` i en `.env`-fil i prosjektroten (ignorert av
   git). Prioritet: miljøvariabel → config-fil → `.env`.

3. Registrer MCP-serveren i klienten din, med absolutt sti:

   ```sh
   # Claude Code
   claude mcp add --scope user kassalapp -- node /sti/til/kassalapp-connector/dist/index.js mcp
   ```

   ```json
   // Claude Desktop (claude_desktop_config.json)
   {
     "mcpServers": {
       "kassalapp": {
         "command": "node",
         "args": ["/sti/til/kassalapp-connector/dist/index.js", "mcp"]
       }
     }
   }
   ```

## MCP-verktøy

| Verktøy | Gjør |
|---|---|
| `search_products` | Søk produkter (filter: kjede, leverandør, merke, pris; sortering) |
| `get_product` | Full produktdetalj (ingredienser, allergener, næring, prishistorikk) |
| `compare_prices_by_ean` | Sammenlign én vare på tvers av butikker, billigst først |
| `compare_prices_by_url` | Samme, men fra en butikk-URL |
| `get_product_by_url` | Slå opp én vare fra butikk-URL |
| `get_price_history` | Bulk prishistorikk for inntil 100 EAN-er |
| `search_stores` / `get_store` | Fysiske butikker (navn, kjede, posisjon) |
| `get_shopping_lists` / `get_shopping_list` | Les handlelister; produktkoblede varer viser billigste butikk |
| `create_shopping_list` / `rename_shopping_list` / `delete_shopping_list` | Administrer lister (`delete` krever bekreftelsesstreng) |
| `add_shopping_list_item` / `update_shopping_list_item` / `remove_shopping_list_item` | Varer: legg til (med valgfri produktkobling), huk av, fjern |
| `get_connector_settings` | Vis nøkkelstatus og rate limit |

## CLI

```sh
kassalapp-connector product search melk --store MENY_NO --sort price_asc
kassalapp-connector product ean 7038010000065      # prissammenligning
kassalapp-connector prices 7038010000065 --days 90
kassalapp-connector store search --group KIWI --lat 59.91 --lng 10.75 --km 3
kassalapp-connector list ls                        # handlelister
kassalapp-connector list add 12345 "Tine Helmelk 1l" --product 33529
```

Kjør uten argumenter for full hjelpetekst.

## Merknader

- API-et er rent lesende — ingen bestilling skjer via denne connectoren.
- Gratisnivået er begrenset til 60 forespørsler/min; connectoren venter og
  prøver én gang på nytt ved HTTP 429.
- `store`/`group` filtrerer på kjede (koder som `MENY_NO`, `KIWI` — se
  `store_code` i søkeresultater); `vendor` filtrerer på leverandør
  (f.eks. `TINE SA`). `unique=true` gir katalogtreff uten pris/butikk.
- Handleliste-endepunktene er ikke med i kassal.app sin API-dokumentasjon,
  men er verifisert mot API-et (september 2026). De kan endres uten varsel.
- Uoffisiell klient, ikke tilknyttet kassal.app. Se deres
  [API-vilkår](https://kassal.app/api) for bruksbetingelser.

## Lisens

[MIT](LICENSE)
