# Cincinnati Civic Data Platform

## Project Overview

The Cincinnati Civic Data Platform is a React-based web application that empowers residents and civic organizations to explore and understand Cincinnati's neighborhoods through aggregated open data. The platform combines demographics, housing, crime, police accountability, displacement risk, transportation, environmental health, and racial equity data into an accessible interface designed for civic participation, research, and community engagement.

The platform serves community organizers, researchers, residents, journalists, and local government staff by providing a single source of truth for Cincinnati's civic and demographic data, updated in near real-time from official city, county, and federal sources.

**Live site:** [cincinnati-civic-data.vercel.app](https://cincinnati-civic-data.vercel.app)

---

## Tab-by-Tab Overview

| Tab | Status | Purpose | Primary Data Sources |
|-----|--------|---------|----------------------|
| **Address Lookup** | ✅ Working | Search any Cincinnati address to see nearby crime, zoning, flood zone, historic district, parks, transit stops, schools, and live traffic — plus an AI-generated summary | Socrata (crime, inspections, abatements, blight), Hamilton County CAGIS (zoning/parks/historic), FEMA NFHL (flood), OHGO (traffic), SORTA (transit), static schools JSON, OpenRouter AI |
| **Neighborhood Profiles** | ✅ Working | Select a neighborhood to view crime trends, 311 service requests, building permits, property inspections, blight, Census demographics, racial equity metrics, mortgage lending by race, affordable housing inventory, transit equity, and food safety | Socrata (crime, permits, inspections, blight, 311, fire/EMS, food safety), U.S. Census ACS, CFPB HMDA (2022), HUD, SORTA GTFS |
| **Police Accountability** | ✅ Working | Explore CPD traffic stops, pedestrian stops, use-of-force incidents, and officer-involved shootings — broken down by race, district, and year — with an AI Q&A interface | Socrata (CPD datasets), OpenRouter AI |
| **Neighborhood Explorer** | ✅ Working | Choropleth map ranking all 52 Cincinnati neighborhoods across 9 scored dimensions (affordability, income, safety, transit, investment, blight, parks, flood risk, food access, air quality) with a side-by-side comparison tool | Socrata, Census ACS, CAGIS, FEMA NFHL, SORTA GTFS, USDA FARA, EPA AirToxScreen |
| **Displacement Risk** | ✅ Working | Track displacement pressure, zoning reform activity (Connected Communities), permit trends, and demolitions across neighborhoods | Socrata (permits, abatements, PLAP, demolitions), Census ACS |
| **Lead Safety** | ✅ Working | Neighborhood-level lead service line inventory, risk ratings, address lookup, and resident guidance | Cincinnati Health Dept. lead service line data |
| **Owner Activity** | 🔄 Stub | Landlord/developer search — not yet implemented | — |
| **Roadmap** | ✅ Working | Public roadmap of planned features and known limitations | Static |

---

## Prerequisites

- **Node.js 18+** and **npm**
- **Vercel account** (free tier sufficient; required for the serverless API proxy)
- **API keys** (see [API Keys Guide](#api-keys-guide) below)

---

## Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/chanfriendly/cincinnati-civic-data.git
   cd cincinnati-civic-data
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   ```

4. **Fill in your API keys** in `.env.local` (see [API Keys Guide](#api-keys-guide)):
   ```
   VITE_SOCRATA_APP_TOKEN=your_token
   VITE_GEOCODING_API_KEY=your_mapbox_token
   VITE_GEOCODING_PROVIDER=mapbox
   VITE_OHGO_API_KEY=your_key
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```
   The app will open at `http://localhost:5173`.

> **Note:** The AI features (Address Lookup summary, Police Accountability Q&A) call `/api/openrouter/*`, which is a Vercel serverless function. This route is not available in local dev unless you run `vercel dev` or mock the endpoint. The rest of the app works fully without it.

---

## API Keys Guide

| Key | Service | Purpose | Sensitivity | Where It Lives |
|-----|---------|---------|-------------|----------------|
| `VITE_SOCRATA_APP_TOKEN` | Socrata (City of Cincinnati) | Authenticate all Socrata dataset requests | Low | Browser bundle / Vercel env var |
| `VITE_GEOCODING_API_KEY` | Mapbox | Convert addresses to lat/lon for Address Lookup | Low | Browser bundle / Vercel env var |
| `VITE_GEOCODING_PROVIDER` | — | Set to `mapbox` | — | Browser bundle / Vercel env var |
| `VITE_OHGO_API_KEY` | OHGO (Ohio ODOT) | Live traffic incidents, construction zones, cameras | Low | Browser bundle / Vercel env var |
| `OPENROUTER_API_KEY` | OpenRouter | AI summaries and Q&A (routed through Vercel serverless function) | **High** | Vercel env var only — never use `VITE_` prefix |
| `CENSUS_API_KEY` | U.S. Census Bureau | ACS demographic data — only needed to regenerate `neighborhood_acs.json` | **High** | Vercel env var only — never use `VITE_` prefix |

### Getting Each Key

**Socrata App Token**
1. Visit https://data.cincinnati-oh.gov
2. Sign up or log in → **Developer Settings** → **App Tokens** → **Create Token**
3. Add to `.env.local`: `VITE_SOCRATA_APP_TOKEN=your_token`

> Note: The registered Socrata token is currently invalid. Public datasets work without one. Leave blank or omit.

**Mapbox Geocoding Token**
1. Visit https://account.mapbox.com → **Tokens** → **Create a token**
2. Scope it to your domain for production use
3. Add to `.env.local`: `VITE_GEOCODING_API_KEY=pk.eyJ1...` and `VITE_GEOCODING_PROVIDER=mapbox`

**OHGO Traffic Key**
1. Visit https://ohgo.com → **Developer** → **API Key**
2. Register for a free key
3. Add to `.env.local`: `VITE_OHGO_API_KEY=your_key`

> Note: OHGO covers Ohio-managed roads only (interstates, state routes) — not Cincinnati city streets.

**OpenRouter API Key** *(AI features — high sensitivity)*
1. Visit https://openrouter.ai → **Keys** → **Create Key**
2. The platform uses `minimax/minimax-m2.5`
3. Add to **Vercel project settings** as `OPENROUTER_API_KEY` (no `VITE_` prefix)
4. Do **not** add this to `.env.local` or any browser-facing variable

**Census API Key** *(only needed to regenerate pre-built data files)*
1. Visit https://api.census.gov/data/key_signup.html
2. Enter your email and org name; key arrives by email
3. Add to **Vercel project settings** as `CENSUS_API_KEY` (no `VITE_` prefix)
4. Most contributors will never need this — `public/data/neighborhood_acs.json` is pre-built

---

## Deployment to Vercel

The app is deployed as a static Vite build with a Vercel serverless function handling the sensitive API proxy.

### 1. Install Vercel CLI and link the project

```bash
npm install -g vercel
vercel link
```

### 2. Set environment variables in Vercel

In your Vercel project → **Settings** → **Environment Variables**, add:

**Browser-safe (all environments):**
```
VITE_SOCRATA_APP_TOKEN
VITE_GEOCODING_API_KEY
VITE_GEOCODING_PROVIDER
VITE_OHGO_API_KEY
```

**Server-only (never expose in browser):**
```
OPENROUTER_API_KEY
CENSUS_API_KEY
```

### 3. Deploy

```bash
vercel --prod
```

Or connect your GitHub repo to Vercel for automatic deploys on every push to `main`.

### How the AI proxy works

All AI requests go to `/api/openrouter/[...path]` — a Vercel serverless function defined in `api/openrouter/[...path].js`. This function injects the `OPENROUTER_API_KEY` server-side and forwards requests to `https://openrouter.ai/api/v1/`. The key is never exposed to the browser.

---

## Pre-Built Static Data Files

Several data sources are expensive to query at runtime and are instead pre-computed and committed to the repository. If you need to regenerate them, the relevant scripts are in `scripts/`.

| File | Source | Script | Notes |
|------|--------|--------|-------|
| `public/data/neighborhood_acs.json` | U.S. Census ACS 2022 | Requires `CENSUS_API_KEY` | 226 Hamilton County tracts, population-weighted to neighborhoods |
| `public/data/neighborhood_hmda.json` | CFPB HMDA 2022 | `scripts/build_hmda.py` | Mortgage approval rates by race, per neighborhood |
| `public/data/hud_affordable_housing.json` | HUD Subsidized Housing | `scripts/build_hud.py` | 28 neighborhoods, 114 properties, 8,191 assisted units |
| `public/data/neighborhood_ejscreen.json` | EPA AirToxScreen 2019 | — | Pre-built; EJScreen API has been offline since Feb 2025 |
| `public/data/cagis_neighborhood_parks.json` | Hamilton County CAGIS | `scripts/build_parks.py` | 49 neighborhoods; replaces 52 live CAGIS calls at load time |
| `public/data/neighborhood_transit_equity.json` | SORTA GTFS + Census ACS | — | 50 neighborhoods; stop count + income for transit equity scatter chart |
| `public/data/sorta_stops.json` | SORTA GTFS | `scripts/convert-gtfs.js` | 3,743 bus stops; see note below |
| `public/data/schools.json` | Hamilton County CAGIS layer 32 | — | 309 schools; used for Address Lookup "Nearby Schools" card |
| `public/data/lead_service_lines.json` | Cincinnati Health Dept. | — | Lead service line inventory by neighborhood |

### Updating SORTA transit data

```bash
# Download latest GTFS feed
curl -o google_transit.zip https://www.go-metro.com/transitdata/google_transit.zip
unzip google_transit.zip

# Convert to app format
node scripts/convert-gtfs.js

# Commit
git add public/data/sorta_stops.json
git commit -m "chore: update SORTA transit data"
```

> **Note:** Route associations (`routes: []`) are currently empty in the seed data — the GTFS conversion script needs to be updated to join `stop_times.txt` → `trips.txt` → `routes.txt` to populate them. The UI handles empty routes gracefully.

---

## Data Sources

### Socrata (data.cincinnati-oh.gov)

| Dataset | UID | Used In |
|---------|-----|---------|
| Crime Reports — STARS (current) | `7aqy-xrv9` | Address Lookup, Neighborhood Profiles, Neighborhood Explorer |
| Crime Reports — PDI (legacy) | `k59e-2pvf` | Address Lookup, Neighborhood Profiles |
| Traffic Stops (CPD) | `ktgf-4sjh` | Police Accountability |
| Pedestrian Stops (CPD) | `jx3x-rh6i` | Police Accountability |
| Use of Force (CPD) | `748b-sht4` | Police Accountability |
| Officer-Involved Shootings | `r6qu-muts` | Police Accountability |
| Community Perceptions Survey | `gdf4-fqik` | Neighborhood Profiles (city-wide averages only — no neighborhood field) |
| Building Permits | `uhjb-xac9` | Displacement, Neighborhood Profiles, Neighborhood Explorer |
| Tax Abatements | `tkp7-yf64` | Displacement, Address Lookup |
| PLAP (Problem Landlord List) | `pk9w-99n6` | Displacement, Address Lookup, Neighborhood Explorer |
| Property Inspections / Violations | `ivda-umw7` | Address Lookup, Neighborhood Profiles, Neighborhood Explorer |
| 311 Service Requests | `gcej-gmiw` | Neighborhood Profiles |
| Fire & EMS Incidents | `vnsz-a3wp` | Neighborhood Profiles |
| Food Safety Inspections | `rg6p-b3h3` | Neighborhood Profiles |

### Other Sources

| Source | Used In | Notes |
|--------|---------|-------|
| U.S. Census ACS 5-Year Estimates (2022) | Neighborhood Profiles, Neighborhood Explorer, Displacement | Pre-built as `neighborhood_acs.json` |
| CFPB HMDA (2022) | Neighborhood Profiles — racial equity / mortgage lending | Pre-built as `neighborhood_hmda.json` |
| HUD Subsidized Housing | Neighborhood Profiles — affordable housing inventory | Pre-built as `hud_affordable_housing.json` |
| EPA AirToxScreen 2019 | Neighborhood Explorer — air quality / environmental justice dimension | Pre-built as `neighborhood_ejscreen.json`; EJScreen API offline since Feb 2025 |
| USDA Food Access Research Atlas (2019) | Neighborhood Explorer — food access dimension | Queried via ArcGIS at runtime |
| FEMA National Flood Hazard Layer | Address Lookup (flood zone card), Neighborhood Explorer (flood dimension) | Queried at runtime; always current federal data |
| Hamilton County CAGIS (ArcGIS Online) | Address Lookup (zoning, parks, historic districts), Neighborhood Explorer (parks) | `services.arcgis.com/JyZag7oO4NteHGiq` — CORS-open |
| OHGO / Ohio ODOT | Address Lookup — live traffic incidents, construction zones, cameras | Interstates and state routes only; not city streets |
| SORTA GTFS | Address Lookup (nearby stops), Neighborhood Explorer (transit dimension), Neighborhood Profiles (transit equity) | Static file; 3,743 stops |
| Cincinnati Health Dept. | Lead Safety tab — lead service line inventory | Static file |
| Hamilton County CAGIS — Schools (layer 32) | Address Lookup — nearby schools | Static file; 309 Hamilton County schools |
| OpenRouter → MiniMax M2.5 | Address Lookup — address summary; Police Accountability — Q&A | Routed through Vercel serverless proxy |

---

## Development Notes

### AI features in local dev

The `/api/openrouter/*` serverless function only runs on Vercel. To test AI features locally, either:
- Run `vercel dev` instead of `npm run dev` (requires Vercel CLI and linked project)
- Or temporarily set a direct OpenRouter key and adjust the fetch target in `src/utils/api.ts` (revert before committing)

### CAGIS Endpoints

All CAGIS spatial queries use the ArcGIS Online-hosted Open Data layers (`services.arcgis.com/JyZag7oO4NteHGiq`), which return `Access-Control-Allow-Origin: *` and are safe for direct browser requests. The on-premises `cagisonline.hamilton-co.org` server does **not** support CORS and cannot be queried from a browser.

### Neighborhood Name Normalization

Neighborhood names vary across datasets (UPPER CASE in CPD data, Title Case in GeoJSON). All names are normalized via `stripNeighborhoodName()` which lowercases and strips non-alphanumeric characters. Both `OVER-THE-RHINE` and `Over-the-Rhine` normalize to `overtherine`.

### TypeScript

Run the type checker separately from the build:
```bash
npx tsc --noEmit
```

The build command (`npm run build`) runs `tsc && vite build` — both must pass for a successful deployment.

---

## Known Limitations

- **SORTA route associations:** `routes: []` is empty for all stops in the seed data. The UI handles this gracefully. Fixing requires updating the GTFS conversion script to join `stop_times.txt → trips.txt → routes.txt`.
- **EPA EJScreen offline:** The EPA's EJScreen tool was taken offline in February 2025. The environmental justice dimension in Neighborhood Explorer uses EPA AirToxScreen 2019 data, which is the most recent publicly available modeled estimate. This is disclosed in the UI.
- **OHGO coverage:** OHGO only covers Ohio-managed roads (interstates, state routes). Local Cincinnati streets are not included. A coverage note is shown above the Traffic & Infrastructure section in Address Lookup.
- **Census tract alignment:** Neighborhood-to-tract mapping uses closest centroid. Tracts straddling neighborhood boundaries are assigned to the nearest neighborhood centroid.
- **Police data lag:** CPD datasets on Socrata are updated on varying schedules; some may lag by 30–90 days.
- **Community Perceptions Survey:** Dataset `gdf4-fqik` has no neighborhood field — it is a city-wide survey only. Shown with a clear disclaimer in Neighborhood Profiles.
- **AI summary quality:** The AI-generated summaries in Address Lookup and Police Accountability have not been formally reviewed for framing, accuracy, or disclosure. This is a known pending item. See `TODO(reassess-ai-summary)` in `src/tabs/AddressLookup/index.tsx`.

---

## Contributing

This platform is built in the spirit of open civic data and non-commercial public benefit. Contributions are welcome:

- **Data:** If you have verified Cincinnati civic datasets, open an issue or pull request
- **Code:** Bug fixes, performance improvements, and new visualizations are encouraged
- **Design:** Accessibility and mobile improvements are priorities
- **Translation:** Spanish translations are machine-generated and need native speaker review

Please ensure all contributions align with the non-commercial, public-benefit mission of the platform.

For questions or feedback, open a [GitHub issue](https://github.com/chanfriendly/cincinnati-civic-data/issues).
