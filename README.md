# Breathing Room

A neighborhood atlas for Hack the City at Columbia DivHacks. It puts New York’s air, asking rent, and deeply affordable housing on one map of the 42 United Hospital Fund neighborhoods, then names the step those numbers support.

The map is the record. A resident or a council staffer can:

- Read annual PM2.5 and NO2 beside new one-bedroom asking rents, on a street map or split across two panes.
- See where asking rents rose faster than the city while 2024 air is still above the city mean.
- Enter a monthly rent and get the neighborhoods that ask is enough for, ranked from cleanest air to worst.
- Compare two neighborhoods and, when the other place is ahead on rent, asthma, or financed deep housing, get one next step.
- Ask the desk, from the round button on the map or by iMessage, for the numbers and the action they support.
- Open a public forum for each neighborhood.

The neighborhood air model ends in 2024, the year before congestion pricing. Breathing Room does not score the toll from that record. Asking rent is for a new one-bedroom lease, not what a sitting tenant pays. Child asthma figures are 2017–2019. Financed deeply affordable units are homes started since 2014, not vacant listings.

## Tech stack

**App**

- TypeScript and React 19
- Vite 8
- React Router 7, with file routes from Generouted
- Tailwind CSS 4
- MapLibre GL 6, on OpenFreeMap’s Liberty style (OpenStreetMap streets, routes, and house numbers)

**Platform**

- [DeepSpace](https://www.npmjs.com/package/deepspace) SDK 0.33.1
- Cloudflare Workers, served with Wrangler
- Hono for Worker routes
- Durable Objects for records, Yjs rooms, presence, canvas, cron, and jobs
- Node 22, 24, or 26, and npm 11.6+

**Desk and messaging**

- xAI Grok (`grok-4.6`) rewrites a desk reply when `XAI_API_KEY` is set. Without the key, the reply is computed from the neighborhood record.
- Photon Spectrum (`spectrum-ts`) runs as a separate Node process for iMessage. The Worker does not send texts.
- Zod for record schemas

**Checks**

- Vitest for unit tests
- Playwright for end-to-end tests
- ESLint and `tsc` for lint and types

## Project layout

```
.
├── worker.ts                 Worker entry: API routes, then the app shell
├── wrangler.toml             Worker name, assets, Durable Object bindings
├── package.json
├── vite.config.ts            Dev and production build
├── vite.preview.config.ts    Local atlas preview on port 44731
├── public/                   Static files, including the MapLibre worker
├── scripts/
│   ├── build_city.py         Rebuild src/data/city.json from public extracts
│   ├── build_households.ts   Census households per neighborhood
│   └── imessage-desk.mjs     Photon bridge into POST /api/agent
├── src/
│   ├── pages/                Routes: the atlas (/) and forums (/home)
│   ├── components/
│   │   ├── city/             Map, layers, compare, equity gap, health premium, desk
│   │   └── messaging/        One public forum per neighborhood
│   ├── lib/                  Metrics, comparison, desk replies, map search
│   ├── data/                 The neighborhood snapshot the map reads
│   ├── server/               /api/agent and /api/brief
│   ├── schemas/              DeepSpace records, including forum messages
│   └── ai/                   Optional in-app agent tools
└── tests/                    Playwright smoke, API, and collab checks
```

`src/lib` is where a neighborhood becomes a sentence. `metrics.ts` reads the snapshot. `desk.ts` answers a question. `compare.ts` and `overlay.ts` build the comparison, the rising-rent set, and the rent-budget ranking. `src/data` is generated; edit the build scripts, not the JSON, when the extracts change.

## Run

```bash
npm install
npm run preview:city
```

Open http://127.0.0.1:44731.

Deploy, after `npx deepspace auth login` and `npx deepspace app init` on a machine with a browser:

```bash
npx deepspace dev start
npx deepspace secrets set XAI_API_KEY
npx deepspace deploy
```

`name` in `wrangler.toml` is the subdomain, so a deploy is served at `https://breathing-room.app.space`.

iMessage needs a Photon project with iMessage enabled, and the atlas reachable at `ATLAS_ORIGIN`:

```bash
export SPECTRUM_PROJECT_ID="your-project-id"
export SPECTRUM_PROJECT_SECRET="your-project-secret"
export ATLAS_ORIGIN="http://127.0.0.1:44731"
export PUBLIC_ORIGIN="https://breathing-room.app.space"
npm run desk:imessage
```

`PUBLIC_ORIGIN` is the map link in the text. A follow-up stays on the last neighborhood for as long as that process is running.

## Data

The snapshot in `src/data/` was built from:

- [Air Quality and Health Impacts](https://data.cityofnewyork.us/Environment/Air-Quality-and-Health-Impacts/c3uy-2p5r) (NYC Open Data) — NYCCAS annual means through 2024
- [Air Quality System](https://aqs.epa.gov/aqsweb/airdata/download_files.html) (US EPA) — monitor dots for 2025 certified and 2026 preliminary readings, not blended into the neighborhood means
- [FirstMover NYC listing extracts](https://www.firstmovernyc.com/open-data) — one-bedroom asking rents, February 2025–August 2026
- [Zillow Observed Rent Index](https://www.zillow.com/research/data/) — a separate rent measure, shown when the question asks for it
- [Affordable Housing Production by Building](https://data.cityofnewyork.us/Housing-Development/Affordable-Housing-Production-by-Building/hg8x-zxpr) (NYC HPD)
- [UHF42 boundaries](https://github.com/nychealth/EHDP-data) (NYC Health)
- [American Community Survey](https://www.census.gov/programs-surveys/acs/data/summary-file.html) households by ZIP (B11001), summed into neighborhoods
- [Congestion Relief Zone vehicle entries](https://data.ny.gov/Transportation/MTA-Congestion-Relief-Zone-Vehicle-Entries-Beginni/t6yz-b64h) (MTA) — the weekday curve for the day animation, not a count of cars on a block

A ZIP’s listings are counted in the neighborhood that holds their centroid. Asthma emergency-department estimates in this extract end in 2017–2019.

Rebuild the snapshot (it downloads the public extracts into `/tmp/citydata`):

```bash
python3 scripts/build_city.py
npx tsx scripts/build_households.ts
```

`build_city.py` also writes `src/data/cleaning.json`. The “How we cleaned this” section reads those counts. If Python reports `CERTIFICATE_VERIFY_FAILED` on macOS, run it with `SSL_CERT_FILE=/etc/ssl/cert.pem`.
