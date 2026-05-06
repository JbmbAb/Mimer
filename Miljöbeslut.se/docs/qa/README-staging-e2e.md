# Staging E2E (P3) — webbläsare mot riktig staging

Målet är **funktionsstabilitet**: samma kommandon ska kunna köras mot **staging** (inte bara enhetstester) och ge spårbara resultat för [production-readiness-checklist.md](production-readiness-checklist.md).

## Förkrav

1. Deployad **staging**-URL med API och frontend (samma origin eller CORS korrekt konfigurerad).
2. Miljövariabler i shell eller CI:
  - `**PLAYWRIGHT_BASE_URL`** — bas-URL till **frontend** (t.ex. `https://staging.example.com`).
  - `**PLAYWRIGHT_API_BASE_URL`** — om API ligger på annan host än default (valfritt).
  - `**E2E_ADMIN_USERNAME**` / `**E2E_ADMIN_PASSWORD**` (eller `ADMIN_CONSOLE_*`) — staging admin.
3. Playwright installerat: `npx playwright install` (första gången).

## Kommando (kärnflöden)

```bash
cd Miljöbeslut.se
set PLAYWRIGHT_BASE_URL=https://din-staging-url
set E2E_ADMIN_USERNAME=...
set E2E_ADMIN_PASSWORD=...
npx playwright test tests/e2e/staging-core-flows.spec.ts
```

På macOS/Linux:

```bash
export PLAYWRIGHT_BASE_URL=https://din-staging-url
export E2E_ADMIN_USERNAME=...
export E2E_ADMIN_PASSWORD=...
npx playwright test tests/e2e/staging-core-flows.spec.ts
```

### Valfria flaggor


| Variabel                        | Betydelse                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `E2E_INCLUDE_VERTEX_FLOWS=true` | Kör även AI-tunga steg (t.ex. tillstånds-generering) som kan ta lång tid och kräva Vertex i staging. |


## Förväntat resultat

- Exit code **0** och rapporten visar att `staging-core-flows` passerat.
- Vid fel: öppna Playwright HTML-rapport (`npx playwright show-report`) eller CI-artefakter.

## Koppling till checklista

Fyll i raden **P3-E2E-staging** i tabellen överst i `production-readiness-checklist.md` med datum, kommando, utfall och ansvarig.