# Cincinnati Civic Data Platform

## Project Overview

The Cincinnati Civic Data Platform is a React-based web application that empowers residents and civic organizations to explore and understand Cincinnati's neighborhoods through aggregated open data. The platform combines demographics, housing, crime, police accountability, displacement risk, landlord activity, and transportation data into an accessible interface designed for civic participation, research, and community engagement.

The platform serves community organizers, researchers, residents, journalists, and local government staff by providing a single source of truth for Cincinnati's civic and demographic data, updated in near real-time from official city, county, and federal sources.

**Live site:** [cincinnati-civic-data.vercel.app](https://cincinnati-civic-data.vercel.app)

---

## Tab-by-Tab Overview

| Tab | Purpose | Primary Data Sources |
|-----|---------|----------------------|
| **Address Lookup** | Search any Cincinnati address to see nearby crime, zoning, flood zone, historic district, parks, transit stops, and live traffic — plus an AI-generated summary | Socrata (crime), Hamilton County CAGIS (zoning/parks/historic), OHGO (traffic), SORTA (transit), OpenRouter AI |
| **Neighborhood Profiles** | Select a neighborhood to view crime trends, building permits, property inspections, blight complaints, and Census demographics side by side | Socrata (crime, permits, inspections, blight), U.S. Census ACS |
| **Police Accountability** | Explore CPD traffic stops, pedestrian stops, use-of-force incidents, officer-involved shootings, and crime — broken down by race, district, and year — with an AI Q&A interface | Socrata (CPD datasets), OpenRouter AI |
| **Neighborhood Explorer** | Choropleth map ranking all Cincinnati neighborhoods across housing, crime, and economic dimensions | Socrata, Census ACS, CAGIS neighborhood boundaries |
| **Displacement Risk** | Track gentrification and displacement pressure across neighborhoods using permit activity, tax abatements, PLAP listings, and unit loss | Socrata (permits, abatements, PLAP, demolitions), Census ACS |
| **Owner Activity** | Search a landlord or developer name to surface their permit history, CRA subsidies, PLAP listings, and unit changes across all Cincinnati neighborhoods | Socrata (permits, unit activity, CRA, PLAP, abatements) |
| **Roadmap** | Public roadmap of planned features and known limitations | Static |

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
   VITE_GEOCODING_API_KEY=your_key
   VITE_GEOCODING_PROVIDER=google
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
| `VITE_GEOCODING_API_KEY` | Google Maps or Mapbox | Convert addresses to lat/lon for Address Lookup | Low | Browser bundle / Vercel env var |
| `VITE_GEOCODING_PROVIDER` | — | Set to `google` or `mapbox` | — | Browser bundle / Vercel env var |
| `VITE_OHGO_API_KEY` | OHGO (Ohio ODOT) | Live traffic incidents, construction zones, cameras | Low | Browser bundle / Vercel env var |
| `OPENROUTER_API_KEY` | OpenRouter | AI summaries and Q&A (routed through Vercel serverless function) | **High** | Vercel env var only — never use `VITE_` prefix |
| `CENSUS_API_KEY` | U.S. Census Bureau | ACS demographic data by neighborhood and tract | **High** | Vercel env var only — never use `VITE_` prefix |

### Getting Each Key

**Socrata App Token**
1. Visit https://data.cincinnati-oh.gov
2. Sign up or log in → **Developer Settings** → **App Tokens** → **Create Token**
3. Add to `.env.local`: `VITE_SOCRATA_APP_TOKEN=your_token`

**Google Maps Geocoding Key**
1. Visit https://console.cloud.google.com
2. Enable the **Geocoding API** and **Maps JavaScript API**
3. Create an API key and restrict it to your domain
4. Add to `.env.local`: `VITE_GEOCODING_API_KEY=your_key` and `VITE_GEOCODING_PROVIDER=google`

**OHGO Traffic Key**
1. Visit https://ohgo.com → **Developer** → **API Key**
2. Register for a free key
3. Add to `.env.local`: `VITE_OHGO_API_KEY=your_key`

**OpenRouter API Key** *(AI features — high sensitivity)*
1. Visit https://openrouter.ai → **Keys** → **Create Key**
2. Add funds or use a free model
3. Add to **Vercel project settings** as `OPENROUTER_API_KEY` (no `VITE_` prefix)
4. Do **not** add this to `.env.local` or any browser-facing variable

**Census API Key** *(high sensitivity)*
1. Visit https://api.census.gov/data/key_signup.html
2. Enter your email and org name; key arrives by email
3. Add to **Vercel project settings** as `CENSUS_API_KEY` (no `VITE_` prefix)

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

## SORTA Transit Data

The platform includes a seed transit dataset at `public/data/sorta_stops.json` containing Cincinnati bus stops. This file powers the transit proximity cards in Address Lookup.

### Updating from the Live GTFS Feed

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
| Crime Reports — STARS (current) | `7aqy-xrv9` | Address Lookup, Neighborhood Profiles |
| Crime Reports — PDI (legacy) | `k59e-2pvf` | Address Lookup, Neighborhood Profiles, Police Accountability, Displacement |
| Traffic Stops (CPD) | `ktgf-4sjh` | Police Accountability |
| Pedestrian Stops (CPD) | `jx3x-rh6i` | Police Accountability |
| Use of Force (CPD) | `748b-sht4` | Police Accountability |
| Officer-Involved Shootings | `r6q4-muts` | Police Accountability |
| Community Perceptions Survey | `gdf4-fqik` | Police Accountability |
| Building Permits | `uhjb-xac9` | Displacement, Owner Activity, Neighborhood Profiles |
| Unit Activity (additions/removals) | `xedz-tk7q` | Owner Activity |
| Tax Abatements | `tkp7-yf64` | Displacement, Owner Activity |
| PLAP (Problem Landlord List) | `pk9w-99n6` | Displacement, Owner Activity, Neighborhood Profiles |
| Demolition Permits | `cncm-znd6` | Displacement |
| CRA Loans & Subsidies | `m76i-p5p9` | Owner Activity |
| Property Inspections / Violations | `ivda-umw7` | Address Lookup, Neighborhood Profiles |
| Fire & EMS Incidents | `vnsz-a3wp` | Neighborhood Profiles |
| Food Safety Inspections | `rg6p-b3h3` | Neighborhood Profiles |

### Other Sources

| Source | Used In |
|--------|---------|
| U.S. Census ACS 5-Year Estimates | Neighborhood Profiles, Neighborhood Explorer, Displacement |
| Hamilton County CAGIS (ArcGIS Online, org: `JyZag7oO4NteHGiq`) | Address Lookup — zoning, parks, historic districts |
| OHGO / Ohio ODOT | Address Lookup — live traffic incidents, construction, cameras |
| SORTA GTFS | Address Lookup — nearby bus stops |
| OpenRouter (AI) | Address Lookup — address summary; Police Accountability — Q&A |

---

## Development Notes

### AI features in local dev

The `/api/openrouter/*` serverless function only runs on Vercel. To test AI features locally, either:
- Run `vercel dev` instead of `npm run dev` (requires Vercel CLI and linked project)
- Or temporarily set `VITE_OPENROUTER_API_KEY` in `.env.local` and adjust the fetch target in `src/utils/api.ts` to call OpenRouter directly (revert before committing)

### CAGIS Endpoints

All CAGIS spatial queries use the ArcGIS Online-hosted Open Data layers (`services.arcgis.com/JyZag7oO4NteHGiq`), which return `Access-Control-Allow-Origin: *` and are safe for direct browser requests. The on-premises `cagisonline.hamilton-co.org` server does **not** support CORS and cannot be queried from a browser.

### TypeScript

Run the type checker separately from the build:
```bash
npx tsc --noEmit
```

The build command (`npm run build`) runs `tsc && vite build` — both must pass for a successful deployment.

---

## Known Limitations

- **SORTA route associations:** `routes: []` is empty for all stops in the seed data. The UI handles this gracefully (no "Routes:" label shown). Fixing requires updating the GTFS conversion script.
- **Census tract alignment:** Neighborhood-to-tract mapping uses a pre-computed lookup. Tracts that straddle neighborhood boundaries are assigned to the neighborhood with the largest overlap.
- **Police data lag:** CPD datasets on Socrata are updated on varying schedules; some may lag by 30–90 days.
- **OHGO coverage:** OHGO only covers Ohio-managed roads (interstates, state routes). Local Cincinnati streets are not included.

---

## Contributing

This platform is built in the spirit of open civic data and non-commercial public benefit. Contributions are welcome:

- **Data:** If you have verified Cincinnati civic datasets, open an issue or pull request
- **Code:** Bug fixes, performance improvements, and new visualizations are encouraged
- **Design:** Accessibility and mobile improvements are priorities

Please ensure all contributions align with the non-commercial, public-benefit mission of the platform.

For questions or feedback, open a [GitHub issue](https://github.com/chanfriendly/cincinnati-civic-data/issues).
