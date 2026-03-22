# Cincinnati Civic Data Platform

## Project Overview

The Cincinnati Civic Data Platform is a React-based web application that empowers residents and civic organizations to explore and understand Cincinnati's neighborhoods through aggregated open data. The platform combines population demographics, housing, economic indicators, transportation, and voting records into an accessible, map-based interface. It is designed for civic participation, research, and community engagement—helping residents make informed decisions about where to live, work, organize, or advocate.

The platform serves community organizers, researchers, residents, journalists, and local government staff by providing a single source of truth for Cincinnati's civic and demographic data, updated regularly from official city and federal sources.

## Prerequisites

- **Node.js 18+** and **npm** (for local development and building)
- **Cloudflare account** (free tier sufficient; required to deploy the Worker for API proxying)
- **API keys** (4 total; see [API Keys Guide](#api-keys-guide) below)
  - U.S. Census Bureau API key
  - Anthropic (Claude) API key
  - Socrata App Token
  - Google Maps / Mapbox geocoding API key

## Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/cincinnati-civic-data.git
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

4. **Fill in API keys** in `.env.local` (see [API Keys Guide](#api-keys-guide)):
   ```
   VITE_SOCRATA_APP_TOKEN=your_socrata_app_token
   VITE_GEOCODING_API_KEY=your_geocoding_key
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```
   The app will open at `http://localhost:5173`.

6. **For local testing with the Worker proxy:**
   See the [Development Notes](#development-notes) section on configuring Vite to proxy requests.

## API Keys Guide

All API keys must be acquired before the first run. The following table summarizes each key's purpose, sensitivity, and where it lives:

| Key | Service | Purpose | Sensitivity | Stored | Where to Get |
|-----|---------|---------|-------------|--------|--------------|
| `VITE_SOCRATA_APP_TOKEN` | Socrata (City of Cincinnati) | Authenticate all Socrata API requests (housing, permits, 311 calls, permits, violations) | **Low** | Browser bundle | https://data.cincinnati-oh.gov → Sign up → Developer Settings |
| `VITE_GEOCODING_API_KEY` | Google Maps or Mapbox | Convert addresses to lat/lon for Address Lookup and map markers | **Low** | Browser bundle | Google Cloud Console (Maps API) or Mapbox Dashboard |
| `CENSUS_API_KEY` | U.S. Census Bureau | Query decennial and ACS data at tract and block group level | **High** | Cloudflare Worker secret only | https://api.census.gov/data/key_signup.html |
| `ANTHROPIC_API_KEY` | Anthropic (Claude) | AI-powered neighborhood summary generation and trend analysis | **High** | Cloudflare Worker secret only | https://console.anthropic.com → API Keys |

### Creating Each Key

**Socrata App Token:**
1. Visit https://data.cincinnati-oh.gov
2. Click **Sign Up** (or log in if you have an account)
3. Go to **Developer Settings** → **App Tokens**
4. Click **Create Token**
5. Name it "Cincinnati Civic Platform Local"
6. Copy the token and add to `.env.local`:
   ```
   VITE_SOCRATA_APP_TOKEN=abc123def456...
   ```

**Google Maps / Mapbox Key:**
- **Google Cloud:** Visit https://console.cloud.google.com, enable Maps API, create API key, restrict to your domain
- **Mapbox:** Visit https://account.mapbox.com, create access token, restrict to your domain
- Add to `.env.local`:
  ```
  VITE_GEOCODING_API_KEY=your_key_here
  ```

**Census API Key:**
1. Visit https://api.census.gov/data/key_signup.html
2. Enter your email and org name
3. Agree to terms
4. Copy the key from the confirmation email
5. Deploy to Cloudflare Worker (see [Deployment](#deployment-to-cloudflare-pages))

**Anthropic API Key:**
1. Visit https://console.anthropic.com
2. Go to **API Keys**
3. Click **Create Key**
4. Copy the key and store in Cloudflare Worker secret (see deployment steps below)

## SORTA Transit Data

The platform includes a seed transit dataset at `/public/data/sorta_stops.json` containing ~30 bus stops and their routes. This file is used by the Neighborhood Explorer and Address Lookup to show transit proximity.

### Updating from Live GTFS Feed

To refresh SORTA data with the latest stops and routes:

1. Download the current GTFS feed:
   ```bash
   curl -o google_transit.zip https://www.go-metro.com/transitdata/google_transit.zip
   ```

2. Extract the zip file:
   ```bash
   unzip google_transit.zip
   ```

3. Convert stops and routes to the app format using the provided conversion script:
   ```bash
   node scripts/convert-gtfs.js
   ```
   This reads `stops.txt` and `routes.txt` and outputs JSON to `public/data/sorta_stops.json`.

4. Commit the updated file to version control:
   ```bash
   git add public/data/sorta_stops.json
   git commit -m "chore: update SORTA transit data"
   ```

Note: The seed file includes stops across major Cincinnati neighborhoods and covers primary SORTA routes. Update frequency depends on SORTA schedule changes (typically quarterly).

## Tab-by-Tab Overview

| Tab | Purpose | Primary Data Sources |
|-----|---------|----------------------|
| **Dashboard** | High-level city trends, population growth, housing costs, key metrics | Census ACS, Zillow/Redfin (housing prices), Socrata |
| **Neighborhood Explorer** | Map-based neighborhood profiles with demographics, transit, economic data | Census tracts, SORTA stops, Socrata datasets |
| **Address Lookup** | Search a specific address to see neighborhood data, nearby transit, closest services | Geocoding API, Census tract lookup, SORTA proximity |
| **Housing** | Rent trends, vacancy, affordability, permits, new construction | Socrata housing permits, ACS, property tax data |
| **Voting** | Council votes, legislative history, public comments | Socrata voting records, Cincinnati City Council API |
| **Economy** | Jobs, wages, business permits, economic indicators by neighborhood | ACS work-from-home, self-employment, Socrata permits |
| **Insights** | AI-powered narrative summaries and trend analysis | Claude API (proxied through Worker) |

## Deployment to Cloudflare Pages

Follow these steps to deploy the platform to production:

### 1. Create a Cloudflare Pages Project

1. Log into Cloudflare dashboard
2. Go to **Pages**
3. Click **Create a project**
4. Select **Connect to Git** and authorize GitHub
5. Select your `cincinnati-civic-data` repository
6. Choose a project name (e.g., `cincinnati-civic`)
7. Leave the framework as **None** (we use Vite)

### 2. Configure Build Settings

In the Pages project settings:
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Root directory:** `/` (or leave blank)

### 3. Set Environment Variables

In Pages project settings, go to **Settings** → **Environment Variables**:

Add these variables (these are **browser-safe**, so they're OK to expose):
```
VITE_SOCRATA_APP_TOKEN=your_token_here
VITE_GEOCODING_API_KEY=your_key_here
```

Do **NOT** add `CENSUS_API_KEY` or `ANTHROPIC_API_KEY` here—they go in the Worker.

### 4. Deploy the Worker

The Worker proxies sensitive Census and Claude API calls:

1. **Install Wrangler** (if not already installed):
   ```bash
   npm install -g wrangler
   ```

2. **Authenticate with Cloudflare:**
   ```bash
   wrangler login
   ```

3. **Set Worker secrets** (these are hidden from the browser):
   ```bash
   cd worker
   wrangler secret put CENSUS_API_KEY
   # Paste your Census API key when prompted

   wrangler secret put ANTHROPIC_API_KEY
   # Paste your Anthropic API key when prompted
   ```

4. **Update `wrangler.toml`** with your Pages domain:
   ```toml
   [env.production]
   routes = [
     { pattern = "your-pages-project.pages.dev/api/*", zone_name = "pages.dev" }
   ]
   ```

5. **Deploy the Worker:**
   ```bash
   wrangler deploy --env production
   ```

6. **Verify the routes** are active in Cloudflare Pages **Settings** → **Functions** → **Routes**

### 5. Verify Deployment

Visit your Pages URL (e.g., `https://cincinnati-civic.pages.dev`). The app should load and all tabs should function. Test Census and Claude endpoints via the Insights tab.

## Development Notes

### Local Development Proxy

When developing locally, requests to `/api/census` and `/api/claude` are proxied by Vite (configured in `vite.config.ts`). The dev server forwards these to a local mock server or directly to Cloudflare Workers if you've set up a tunnel.

For testing the live Worker without deploying:
1. Use Wrangler local mode: `wrangler dev` from the `worker/` directory
2. Update Vite proxy in `vite.config.ts` to `http://localhost:8787`

### CAGIS CORS Note

The CAGIS vector tile API (used for City of Cincinnati base maps) may not support CORS from localhost. **Test CORS early** in development:
```bash
curl -I -H "Origin: http://localhost:5173" \
  "https://map-api.cagis.org/..."
```
If CORS fails, add a route to the Cloudflare Worker to proxy CAGIS requests.

### Census Data Alignment

Census data is available at two geographies: **Census tract** (finer resolution, ~1,200 people per tract) and **block group** (coarser, ~1,500 people). The platform uses tracts and aligns them to Cincinnati neighborhoods using a pre-computed mapping table (`src/data/tract-to-neighborhood.json`). This mapping was created by manual GIS analysis and is stored in version control. To update it, regenerate from Census shapefiles and neighborhood boundaries.

## Data Sources

| Dataset | Socrata UID | Refresh Frequency | Used In |
|---------|-------------|-------------------|---------|
| Housing Permits | `n8v6-gdp6` | Daily | Housing, Insights |
| Property Tax | `asc4-hpy2` | Monthly | Housing, Neighborhood Explorer |
| Violations & Inspections | `a2nx-4u46` | Weekly | Housing, Neighborhood Explorer |
| Development Permits | `i67r-kfyq` | Daily | Housing, Insights |
| Voting Records | `vh3j-9tpq` | Per session | Voting, Council Votes |
| SORTA Bus Stops | `/public/data/sorta_stops.json` | Quarterly | Address Lookup, Neighborhood Explorer |
| Census Tracts (Decennial) | Federal Census Bureau | Every 10 years | All tabs |
| ACS Demographics (5-year) | Census Bureau | Annual | Dashboard, Neighborhood Explorer, Economy |

## Known Limitations (v1)

The following features are **out of scope** for v1 and planned for future releases:

- **Council Votes Detail:** The Voting tab shows vote counts and outcomes; drill-down into individual vote rationales and abstentions is deferred
- **Art & Culture Tab:** Planned for v2; requires integration with ArtsWave/Cultural Trails data
- **School Quality Metrics:** Deferred (requires Cincinnati Public Schools API and open data access)
- **User Accounts & Saved Neighborhoods:** Deferred (requires backend auth and database)
- **311 Service Requests Real-Time:** Only historical data shown; real-time 311 tracking is future work
- **GTFS-RT (Real-Time Transit):** Seed data only; live bus locations and delays require SORTA GTFS-RT API (not publicly available as of v1)
- **Historical Trend Charts:** Available for housing and voting; economic and demographic trends are future work

## Contributing

This platform is built in the spirit of open civic data and non-commercial public benefit. Contributions are welcome:

- **Data:** If you have verified Cincinnati civic datasets, open an issue or pull request
- **Code:** Bug fixes, performance improvements, and new visualizations are encouraged
- **Design:** Accessibility and mobile improvements are priorities

Please ensure all contributions align with the non-commercial, public-benefit mission of the platform. See the scoping document (`cincinnati_civic_platform_scope_v1.1.docx`) for the full project vision.

For questions or feedback, open a GitHub issue or contact the maintainers.
