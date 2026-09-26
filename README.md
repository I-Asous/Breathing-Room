# Where it lands

A neighborhood atlas for Columbia DivHacks, Hack the City. It puts three public records on one map of New York’s 42 United Hospital Fund neighborhoods:

- **Air** — annual PM2.5 and NO2 from the NYC Community Air Survey, through 2024
- **Rent** — one-bedroom asking rents from the FirstMover listing extracts (Feb 2025–Aug 2026), plus the Zillow Observed Rent Index where a ZIP joins the neighborhood
- **Housing equity** — extremely-low and very-low income units in HPD affordable projects started since 2014

The annual air model stops the year before congestion pricing. This map does not score the toll.

The field desk at `/home` is a shared margin: signed-in teammates pin notes to a neighborhood and see who else is in the room. That layer needs a DeepSpace account. The atlas itself does not.

## Run it

Node 22.15+ (or 24 or 26) and npm 11.6+.

```bash
npm install
npx vite --config vite.preview.config.ts
```

Open http://127.0.0.1:44731.

## Deploy on DeepSpace

DeepSpace accounts are GitHub or Google sign-in. From a machine with a browser:

```bash
npx deepspace auth login
npx deepspace app init
npx deepspace dev start
npx deepspace deploy
```

The app is registered on first use. After deploy it is served at `https://where-it-lands.app.space` unless that name is already taken — rename `name` in `wrangler.toml` and deploy again if it is.

## Ask Grok

Neighborhood briefs call the xAI Responses API (`grok-4.6`) from `POST /api/brief`. Without a key, the same route returns a brief computed only from the numbers on the page.

```bash
npx deepspace secrets set XAI_API_KEY
```

Grok Bot, the teammate product, does not expose a separate HTTP API. This app uses the Grok model API at `https://api.x.ai`.

## iMessage desk

`POST /api/agent` is the rental desk. It answers with one-bedroom asking rent, 2024 air, and how the MTA congestion toll applies in that neighborhood. The air record ends in 2024, so the reply does not score the toll. The on-page form calls the same route.

iMessage goes through [Photon](https://photon.codes/). Spectrum sends on a live connection, so a small Node process holds that connection and calls the desk:

```bash
npm install
npx vite --config vite.preview.config.ts
```

In another terminal, with a Photon project that has iMessage enabled:

```bash
export SPECTRUM_PROJECT_ID="your-project-id"
export SPECTRUM_PROJECT_SECRET="your-project-secret"
export ATLAS_ORIGIN="http://127.0.0.1:44731"
export PUBLIC_ORIGIN="https://where-it-lands.app.space"
node scripts/imessage-desk.mjs
```

Text the project's iMessage number a neighborhood name. A follow-up such as "what about the toll?" stays on that neighborhood for as long as this process is running. `PUBLIC_ORIGIN` is the map link the reply includes.

## Data

The snapshot in `src/data/` was built from:

- [Air Quality and Health Impacts](https://data.cityofnewyork.us/Environment/Air-Quality-and-Health-Impacts/c3uy-2p5r) (NYC Open Data)
- [Zillow Observed Rent Index](https://www.zillow.com/research/data/)
- [Affordable Housing Production by Building](https://data.cityofnewyork.us/Housing-Development/Affordable-Housing-Production-by-Building/hg8x-zxpr)
- [FirstMover NYC listing extracts](https://www.firstmovernyc.com/open-data)
- [UHF42 boundaries](https://github.com/nychealth/EHDP-data) (NYC Health)

ZIP codes are placed in a neighborhood by the centroid of listings in that ZIP. A few ZIPs fall in the river or an airport cutout and are assigned to the nearest neighborhood within a short distance. Asthma emergency-department estimates in this extract end in 2017–2019.

Rebuild the snapshot (it re-downloads the public extracts into `/tmp/citydata`):

```bash
python3 scripts/build_city.py
```
