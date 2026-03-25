import type { SODAQueryParams, OHGOIncident, OHGOCamera, OHGOConstruction, NeighborhoodDisabilityStats } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const SODA_BASE = 'https://data.cincinnati-oh.gov/resource';
// App token is VITE_ so it's in the client bundle (low sensitivity — just prevents rate-limiting)
const SOCRATA_TOKEN = import.meta.env.VITE_SOCRATA_APP_TOKEN ?? '';

// OpenRouter proxy route (key is injected server-side by Vite dev proxy / Cloudflare Worker)
const AI_ENDPOINT = '/api/openrouter/v1/chat/completions';
const AI_MODEL = 'minimax/minimax-m2.5';

// ─── SODA API ─────────────────────────────────────────────────────────────────

/**
 * Build a SODA API query string from a SODAQueryParams object.
 *
 * IMPORTANT: Socrata's query processor requires LITERAL parameter names like
 * $where, $limit, $order — it does NOT decode percent-encoded parameter names.
 * We encode only the VALUES (to handle spaces, quotes, etc.), not the keys.
 */
function buildSODAQuery(params: SODAQueryParams): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      // Key must be literal (e.g. "$where", not "%24where")
      // Value is encoded so spaces/special chars are safe
      parts.push(`${key}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length > 0 ? '?' + parts.join('&') : '';
}

export interface SODAResponse<T> {
  data: T[];
  lastUpdated: string | null;
}

/**
 * Fetch records from a Socrata dataset using the SODA 2.1 API.
 * Returns { data, lastUpdated } — lastUpdated comes from the X-SODA-Updated header.
 *
 * Auth note: We pass the app token as the $$app_token QUERY PARAMETER, not as
 * the X-App-Token header. The header approach triggers a CORS preflight OPTIONS
 * request that Cincinnati's Socrata portal rejects with 403. The query param is
 * a "simple request" — no preflight, no 403.
 */
export async function fetchSODA<T>(
  uid: string,
  params: SODAQueryParams = {}
): Promise<SODAResponse<T>> {
  // Merge app token into query params so it never goes in a header
  const allParams: SODAQueryParams = SOCRATA_TOKEN
    ? { '$$app_token': SOCRATA_TOKEN, ...params }
    : { ...params };

  const url = `${SODA_BASE}/${uid}.json${buildSODAQuery(allParams)}`;

  const response = await fetch(url); // no custom headers → no CORS preflight

  if (!response.ok) {
    // Try to surface the error message Socrata returns (often includes helpful detail)
    const body = await response.text().catch(() => '');
    throw new Error(
      `SODA API error for dataset ${uid}: HTTP ${response.status}${body ? ` — ${body.slice(0, 200)}` : ''}`
    );
  }

  const data: T[] = await response.json();
  // Socrata sometimes returns the last-modified date in this header
  const lastUpdated = response.headers.get('X-SODA-Updated') ?? null;

  return { data, lastUpdated };
}

// ─── OpenRouter / AI ──────────────────────────────────────────────────────────

/**
 * Call the AI via OpenRouter (proxied — key is never in the browser bundle).
 * Uses the OpenAI-compatible messages format.
 */
export async function callAI(
  userMessage: string,
  systemPrompt: string = 'You are a helpful civic data assistant.',
  maxTokens: number = 512
): Promise<string> {
  const response = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`AI API error ${response.status}: ${text}`);
  }

  const json = await response.json();
  // OpenAI-compatible response format
  return json?.choices?.[0]?.message?.content ?? '';
}

/**
 * Backward-compatible wrapper that matches the call sites in Tab 1 and Tab 3.
 * Signature: callClaude(systemPrompt, userMessage, language?)
 * Language ('en'|'es') is automatically appended to the system prompt.
 */
export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  language?: string
): Promise<string> {
  const langInstruction = language === 'es'
    ? ' Respond in Spanish.'
    : ' Respond in English.';
  return callAI(userMessage, systemPrompt + langInstruction);
}

// ─── Census ───────────────────────────────────────────────────────────────────

/**
 * Fetch ACS 5-Year data via the local proxy.
 * Key is injected server-side by the Vite dev proxy / Cloudflare Worker.
 */
export async function fetchCensus(
  year: number,
  variables: string,
  geoQuery: string
): Promise<string[][]> {
  const url = `/api/census/${year}/acs/acs5?get=${variables}&${geoQuery}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Census API error: HTTP ${response.status}`);
  }
  return response.json();
}

// ─── Geo utilities ────────────────────────────────────────────────────────────

/**
 * Haversine distance between two lat/lng points — returns miles.
 */
export function distanceMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate the centroid of a GeoJSON polygon ring (first ring of first poly).
 * Returns [lat, lng].
 */
export function calculateCentroid(coordinates: number[][][]): [number, number] {
  let sumLat = 0, sumLon = 0, count = 0;
  for (const ring of coordinates) {
    for (const [lon, lat] of ring) {
      sumLat += lat;
      sumLon += lon;
      count++;
    }
  }
  return [sumLat / count, sumLon / count];
}

/**
 * Normalize a neighborhood name to title case for cross-dataset comparison.
 */
export function normalizeNeighborhoodName(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatDate(dateString: string | Date | undefined | null): string {
  if (dateString === undefined || dateString === null) return 'Unknown';
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  if (isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatCurrency(
  value: number | string | undefined,
  opts: { decimals?: number; prefix?: string } = {}
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num === undefined || num === null || isNaN(num as number)) return 'N/A';
  const { decimals = 0, prefix = '$' } = opts;
  return (
    prefix +
    (num as number).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

export function formatPercent(value: number | string | undefined, decimals = 1): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num === undefined || num === null || isNaN(num as number)) return 'N/A';
  return (num as number).toFixed(decimals) + '%';
}

// ─── CAGIS / ArcGIS spatial queries ──────────────────────────────────────────

export interface CAGISFeature {
  attributes: Record<string, unknown>;
}

/**
 * Query an ArcGIS MapServer or FeatureServer layer with a single point
 * (point-in-polygon). Returns an array of matching features' attributes.
 *
 * @param serviceUrl  Full URL to the layer, e.g.
 *   https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/OpenData/FeatureServer/37
 * @param lat / lng   WGS-84 coordinates of the point to test
 */
export async function queryCAGISPoint(
  serviceUrl: string,
  lat: number,
  lng: number
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: '*',
    returnGeometry: 'false',
    f: 'json',
  });
  const url = `${serviceUrl}/query?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`CAGIS HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message ?? 'CAGIS error');
    return (data.features ?? []).map((f: CAGISFeature) => f.attributes ?? {});
  } catch {
    clearTimeout(timeout);
    throw new Error(`CAGIS query failed for ${serviceUrl}`);
  }
}

/**
 * Look up an ArcGIS item's hosted service URL via the public ArcGIS Portal
 * REST API, then run a point-in-polygon query.
 *
 * @param itemId    ArcGIS item GUID (from the CAGIS open data URL)
 * @param layerIdx  Layer index within that service (default 0)
 */
const _itemUrlCache = new Map<string, string>();

export async function queryCAGISItem(
  itemId: string,
  layerIdx: number,
  lat: number,
  lng: number
): Promise<Record<string, unknown>[]> {
  let serviceUrl = _itemUrlCache.get(itemId);
  if (!serviceUrl) {
    const resp = await fetch(
      `https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`
    );
    if (!resp.ok) throw new Error(`ArcGIS item lookup failed for ${itemId}`);
    const meta = await resp.json();
    serviceUrl = (meta.url as string)?.replace(/\/?$/, '') + `/${layerIdx}`;
    if (!serviceUrl) throw new Error(`No service URL for item ${itemId}`);
    _itemUrlCache.set(itemId, serviceUrl);
  }
  return queryCAGISPoint(serviceUrl, lat, lng);
}

// ─── Known CAGIS layer endpoints ─────────────────────────────────────────────
// All endpoints below use CAGIS Open Data hosted on ArcGIS Online (org: JyZag7oO4NteHGiq).
// These return Access-Control-Allow-Origin: * and are safe for browser requests.
// The cagisonline.hamilton-co.org on-premises server lacks CORS headers and cannot
// be queried directly from a browser.

/**
 * Cincinnati zoning designation for a given point.
 * Source: CAGIS "Cincinnati Zoning - Open Data" FeatureServer layer 37.
 *   https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/OpenData/FeatureServer/37
 * Key attributes vary by layer — use outFields=* and inspect attributes at runtime.
 */
export async function fetchZoning(lat: number, lng: number) {
  return queryCAGISPoint(
    'https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/OpenData/FeatureServer/37',
    lat, lng
  );
}

/**
 * FEMA Special Flood Hazard Area for a given point.
 * Source: FEMA National Flood Hazard Layer (always current, federal public service).
 * Key attributes: FLD_ZONE (e.g. "AE", "X", "AO"), ZONE_SUBTY, SFHA_TF
 * AE/A = Special Flood Hazard Area (100-year), X = minimal flood hazard
 */
export async function fetchFloodZone(lat: number, lng: number) {
  return queryCAGISPoint(
    'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28',
    lat, lng
  );
}

/**
 * Cincinnati historic district membership for a given point.
 * Source: CAGIS "Cincinnati Historic Districts - Open Data" FeatureServer layer 50.
 *   https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/OpenData/FeatureServer/50
 * Key attributes: NAME, DIST_CLASS, YEAR_DESG (inspect at runtime — field names may vary)
 */
export async function fetchHistoricDistrict(lat: number, lng: number) {
  return queryCAGISPoint(
    'https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/OpenData/FeatureServer/50',
    lat, lng
  );
}

/**
 * Cincinnati/Hamilton County parks within a given radius (miles) of a point.
 * Source: CAGIS "Hamilton County Parks and Greenspace - Open Data" FeatureServer layer 34.
 *   https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/OpenData/FeatureServer/34
 * Uses a bounding box envelope query to find parks within the radius.
 * Returns all fields (outFields=*); key attributes include NAME, ACREAGE, and TYPE.
 */
export async function fetchNearbyParks(lat: number, lng: number, radiusMiles = 0.5) {
  // ArcGIS envelope (bounding box) query — simpler than a true buffer
  const delta = radiusMiles / 69; // ~degrees per mile at Cincinnati's latitude
  const envelope = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  const params = new URLSearchParams({
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: '*',
    returnGeometry: 'false',
    resultRecordCount: '8',
    // Exclude school grounds — confirmed field name is PARKTYPE (not TYPE).
    // Schools-Private and Schools-Public appear in this greenspace layer.
    where: "PARKTYPE NOT IN ('Schools-Private', 'Schools-Public')",
    f: 'json',
  });
  try {
    const qResp = await fetch(
      `https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/OpenData/FeatureServer/34/query?${params.toString()}`
    );
    if (!qResp.ok) throw new Error(`Parks HTTP ${qResp.status}`);
    const data = await qResp.json();
    if (data.error) throw new Error(data.error.message ?? 'Parks error');
    return ((data.features ?? []) as CAGISFeature[]).map(f => f.attributes ?? {});
  } catch {
    return [];
  }
}

// ─── USDA Food Access Research Atlas (FARA 2019) ──────────────────────────────

/**
 * FARA record for a single Hamilton County census tract.
 * Source: USDA ERS FARA_2019 MapServer Layer 1
 * (Low Income and Low Access at 1 and 10 miles — urban definition).
 */
export interface FARARecord {
  geoid: string;
  lat: number | null;        // tract polygon centroid lat (from ArcGIS returnCentroid)
  lon: number | null;        // tract polygon centroid lng
  lila: number;              // 1 = food desert: low income AND low access (1mi/10mi)
  lilaHalf: number;          // 1 = food desert at stricter 0.5mi threshold
  lilaVehicle: number;       // 1 = low income + low vehicle access
  lowIncome: number;         // 1 = low income tract
  povertyRate: number;       // tract poverty rate (%)
  medianFamilyIncome: number | null;
  pop: number;               // POP2010
  noVehicle: number;         // 1 = HUNVFlag (low vehicle access)
}

/**
 * Fetch food access data for all Hamilton County census tracts from the USDA
 * Food Access Research Atlas 2019 ArcGIS REST service.
 *
 * The service is a public ERS GIS endpoint with CORS enabled.
 * Hamilton County, OH = FIPS 39061 — all tract GEOIDs start with "39061".
 * Layer 1 = the feature layer (layer 0 is a group layer with no geometry/fields).
 */
export async function fetchFARAHamilton(): Promise<FARARecord[]> {
  const params = new URLSearchParams({
    where: "GEOID10 LIKE '39061%'",
    outFields: 'GEOID10,LILATracts_1And10,LILATracts_halfAnd10,LILATracts_Vehicle,LowIncomeTracts,PovertyRate,MedianFamilyIncome,POP2010,HUNVFlag',
    f: 'json',
    // Request geometry so we can compute each tract's centroid locally.
    // This avoids the 2010-vs-2020 GEOID mismatch when joining with ACS 2022.
    // returnCentroid=true is NOT supported on ArcGIS Server 12.0 (USDA ERS).
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '1000',
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(
      `https://gisportal.ers.usda.gov/server/rest/services/FARA/FARA_2019/MapServer/1/query?${params.toString()}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`FARA HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message ?? 'FARA error');
    return ((data.features ?? []) as any[]).map((f: any) => {
    // Compute centroid from the first ring of the polygon geometry (esriGeometryPolygon).
    // ArcGIS returns rings as [[lon, lat], ...] pairs in outSR=4326.
    let lat: number | null = null;
    let lon: number | null = null;
    const rings: number[][] | undefined = f.geometry?.rings?.[0];
    if (rings && rings.length > 0) {
      let sumLat = 0, sumLon = 0;
      for (const [x, y] of rings) { sumLon += x; sumLat += y; }
      lat = sumLat / rings.length;
      lon = sumLon / rings.length;
    }
    return ({
      geoid: String(f.attributes.GEOID10),
      lat,
      lon,
      lila: f.attributes.LILATracts_1And10 ?? 0,
      lilaHalf: f.attributes.LILATracts_halfAnd10 ?? 0,
      lilaVehicle: f.attributes.LILATracts_Vehicle ?? 0,
      lowIncome: f.attributes.LowIncomeTracts ?? 0,
      povertyRate: f.attributes.PovertyRate ?? 0,
      medianFamilyIncome: f.attributes.MedianFamilyIncome ?? null,
      pop: f.attributes.POP2010 ?? 0,
      noVehicle: f.attributes.HUNVFlag ?? 0,
    });
  });
  } catch {
    clearTimeout(timeout);
    throw new Error('FARA food access data unavailable');
  }
}

// ─── OHGO Ohio Traffic API ────────────────────────────────────────────────────
// Developer docs: https://publicapi.ohgo.com/docs/v1/resources
// Auth: api-key query param or Authorization: APIKEY {key} header.
// Register free at ohgo.com to get a key. Store as VITE_OHGO_API_KEY in .env.local.
// Geographic filter: radius={lat},{lng},{miles} OR region=cincinnati.

const OHGO_BASE = 'https://publicapi.ohgo.com/api/v1';
const OHGO_KEY = (import.meta as any).env?.VITE_OHGO_API_KEY as string | undefined;

/**
 * Internal helper — fetches any OHGO endpoint with the API key and a
 * geographic radius filter. Returns empty array if no key is configured
 * or if the request fails (network, CORS, etc.).
 */
async function fetchOHGOResource<T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  if (!OHGO_KEY) return []; // no key → graceful empty
  const qp = new URLSearchParams({ 'api-key': OHGO_KEY, ...params });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(`${OHGO_BASE}/${endpoint}?${qp.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`OHGO ${endpoint}: HTTP ${resp.status}`);
    const json = await resp.json();
    // OHGO returns { data: [...] } or a plain array depending on endpoint version
    return (Array.isArray(json) ? json : (json.data ?? [])) as T[];
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

/** Active traffic incidents (accidents, flooding, road closures) within radius. */
export async function fetchOHGOIncidents(lat: number, lng: number, radiusMiles = 1): Promise<OHGOIncident[]> {
  const raw = await fetchOHGOResource<any>('incidents', {
    radius: `${lat},${lng},${radiusMiles}`,
  });
  return raw.map((r: any) => ({
    id: String(r.Id ?? r.id ?? ''),
    lat: parseFloat(String(r.Latitude ?? r.latitude ?? lat)),
    lng: parseFloat(String(r.Longitude ?? r.longitude ?? lng)),
    location: String(r.Location ?? r.location ?? ''),
    description: String(r.Description ?? r.description ?? ''),
    category: String(r.Category ?? r.category ?? ''),
    routeName: String(r.RouteName ?? r.route_name ?? ''),
    roadStatus: String(r.RoadStatus ?? r.road_status ?? ''),
  }));
}

/** ODOT traffic cameras within radius — includes snapshot thumbnail URLs. */
export async function fetchOHGOCameras(lat: number, lng: number, radiusMiles = 1): Promise<OHGOCamera[]> {
  const raw = await fetchOHGOResource<any>('cameras', {
    radius: `${lat},${lng},${radiusMiles}`,
  });
  return raw.map((r: any) => ({
    id: String(r.Id ?? r.id ?? ''),
    lat: parseFloat(String(r.Latitude ?? r.latitude ?? lat)),
    lng: parseFloat(String(r.Longitude ?? r.longitude ?? lng)),
    location: String(r.Location ?? r.location ?? ''),
    description: String(r.Description ?? r.description ?? ''),
    views: (r.CameraViews ?? r.camera_views ?? []).map((v: any) => ({
      direction: String(v.Direction ?? v.direction ?? ''),
      smallUrl: String(v.SmallUrl ?? v.small_url ?? ''),
      largeUrl: String(v.LargeUrl ?? v.large_url ?? ''),
      mainRoute: String(v.MainRoute ?? v.main_route ?? ''),
    })),
  }));
}

/** Active construction and work zones within radius. */
export async function fetchOHGOConstruction(lat: number, lng: number, radiusMiles = 1): Promise<OHGOConstruction[]> {
  const raw = await fetchOHGOResource<any>('construction', {
    radius: `${lat},${lng},${radiusMiles}`,
  });
  return raw.map((r: any) => ({
    id: String(r.Id ?? r.id ?? ''),
    lat: parseFloat(String(r.Latitude ?? r.latitude ?? lat)),
    lng: parseFloat(String(r.Longitude ?? r.longitude ?? lng)),
    location: String(r.Location ?? r.location ?? ''),
    description: String(r.Description ?? r.description ?? ''),
    routeName: String(r.RouteName ?? r.route_name ?? ''),
  }));
}

/** True if VITE_OHGO_API_KEY is configured. Used to show setup instructions. */
export const ohgoEnabled = !!OHGO_KEY;

// ─── Neighborhood Census Stats ────────────────────────────────────────────────

export interface NeighborhoodCensusStats {
  medianHouseholdIncome: number | null;
  medianGrossRent: number | null;
  /** Percentage (0–100) of renters paying >30% of income on rent */
  rentBurdenRate: number | null;
  population: number;
}

/**
 * Strip a neighborhood name to lowercase alphanumeric only.
 * Used as a fuzzy key when matching names across datasets that use
 * different conventions (hyphens, spaces, punctuation, case).
 *
 * Examples:
 *   "Columbia-Tusculum" → "columbiatusculum"
 *   "Mt. Lookout"       → "mtlookout"
 *   "Over-the-Rhine"    → "overtherhine"
 */
export function stripNeighborhoodName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Module-level cache — GeoJSON + ACS file are loaded once per page load.
let _censusCachePromise: Promise<Map<string, NeighborhoodCensusStats>> | null = null;

// Primary SNA GeoJSON URL (Cincinnati Neighborhood Statistical Areas).
const SNA_GEOJSON_URL =
  'https://opendata.arcgis.com/datasets/572561553c9e4d618d2d7939c5261d46_0.geojson';

/**
 * Load ACS 2022 census stats for every Cincinnati SNA neighborhood.
 * Returns a Map keyed by stripNeighborhoodName() output so callers can do
 * fuzzy lookups regardless of how the name is cased/punctuated.
 *
 * Data sources:
 *   - /data/neighborhood_acs.json  (pre-built static ACS 5-year tract file)
 *   - Cincinnati SNA GeoJSON        (neighborhood boundary centroids)
 *
 * Results are cached after the first call — subsequent calls return the
 * same promise, so the GeoJSON and ACS file are only fetched once.
 */
async function _buildCensusMap(): Promise<Map<string, NeighborhoodCensusStats>> {
  const [geoResp, acsResp] = await Promise.all([
    fetch(SNA_GEOJSON_URL),
    fetch('/data/neighborhood_acs.json'),
  ]);
  if (!geoResp.ok) throw new Error(`SNA GeoJSON ${geoResp.status}`);
  if (!acsResp.ok) throw new Error(`ACS static file ${acsResp.status}`);

  const geo: { features: any[] } = await geoResp.json();
  const tracts: any[] = await acsResp.json();

  // Build neighborhood centroid map (raw name → [lat, lon])
  const neighCentroids = new Map<string, [number, number]>();
  for (const f of geo.features) {
    const p = f.properties ?? {};
    const rawName: string = p.NEIGH || p.SNA_NAME || p.NAME || p.LABEL || '';
    if (!rawName || /^\d+$/.test(rawName)) continue;
    // Support both Polygon and MultiPolygon geometries.
    // 5 Cincinnati neighborhoods (California, Kennedy Heights, Mt. Washington,
    // Pleasant Ridge, West Price Hill) are MultiPolygon — use the first ring of
    // the first polygon for the centroid approximation.
    let ring: number[][] | null = null;
    if (f.geometry?.type === 'Polygon') {
      ring = f.geometry.coordinates[0];
    } else if (f.geometry?.type === 'MultiPolygon') {
      ring = f.geometry.coordinates[0][0];
    }
    if (!ring || ring.length === 0) continue;
    let sumLat = 0, sumLon = 0;
    for (const [lon, lat] of ring) { sumLon += lon; sumLat += lat; }
    neighCentroids.set(rawName, [sumLat / ring.length, sumLon / ring.length]);
  }

  // Accumulate ACS tract metrics → closest neighborhood
  const accMap = new Map<string, { pop: number; incomeW: number; rentW: number; renting: number; burdened: number }>();

  for (const tract of tracts) {
    let closestNeigh = '';
    let minDist = Infinity;
    for (const [neigh, [nLat, nLon]] of neighCentroids) {
      const dLat = ((tract.lat - nLat) * Math.PI) / 180;
      const dLon = ((tract.lon - nLon) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((nLat * Math.PI) / 180) * Math.cos((tract.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const d = 3959 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (d < minDist) { minDist = d; closestNeigh = neigh; }
    }
    if (!closestNeigh || minDist > 5) continue;

    const totalRenting  = (tract.rb as number[]).slice(1).reduce((a: number, b: number) => a + b, 0);
    const totalBurdened = (tract.rb as number[]).slice(5).reduce((a: number, b: number) => a + b, 0);
    const acc = accMap.get(closestNeigh) ?? { pop: 0, incomeW: 0, rentW: 0, renting: 0, burdened: 0 };
    acc.pop += tract.pop;
    if (tract.income && tract.income > 0 && tract.income < 999998) acc.incomeW += tract.income * tract.pop;
    if (tract.rent && tract.rent > 0 && tract.rent < 9999) acc.rentW += tract.rent * tract.pop;
    acc.renting  += totalRenting;
    acc.burdened += totalBurdened;
    accMap.set(closestNeigh, acc);
  }

  // Build result map keyed by stripped name
  const result = new Map<string, NeighborhoodCensusStats>();
  for (const [rawName, acc] of accMap) {
    result.set(stripNeighborhoodName(rawName), {
      medianHouseholdIncome: acc.pop > 0 && acc.incomeW > 0 ? Math.round(acc.incomeW / acc.pop) : null,
      medianGrossRent:       acc.pop > 0 && acc.rentW > 0   ? Math.round(acc.rentW / acc.pop)   : null,
      rentBurdenRate:        acc.renting > 0 ? (acc.burdened / acc.renting) * 100 : null,
      population:            acc.pop,
    });
  }
  return result;
}

export function fetchNeighborhoodCensusStats(): Promise<Map<string, NeighborhoodCensusStats>> {
  if (_censusCachePromise) return _censusCachePromise;
  _censusCachePromise = _buildCensusMap();
  return _censusCachePromise;
}

// ─── Neighborhood Disability Stats ────────────────────────────────────────────

let _disabilityCachePromise: Promise<Map<string, NeighborhoodDisabilityStats>> | null = null;

/**
 * Load pre-computed ACS disability statistics for every Cincinnati neighborhood.
 * Returns a Map keyed by stripNeighborhoodName() output (lowercase alphanumeric).
 *
 * Data source: /data/neighborhood_disability.json
 * Generated by: scripts/build_disability.py (run locally — Census API is blocked
 * from the Cowork sandbox due to network restrictions).
 *
 * If the file is empty ({}) — i.e., the build script has not been run yet —
 * the returned Map will be empty. The Accessibility tab handles this gracefully
 * by showing a "data not yet loaded" notice with build instructions.
 */
export async function fetchNeighborhoodDisabilityStats(): Promise<Map<string, NeighborhoodDisabilityStats>> {
  if (_disabilityCachePromise) return _disabilityCachePromise;

  _disabilityCachePromise = (async () => {
    const resp = await fetch('/data/neighborhood_disability.json');
    if (!resp.ok) throw new Error(`Disability data file not found: HTTP ${resp.status}`);
    const raw: Record<string, NeighborhoodDisabilityStats> = await resp.json();
    const result = new Map<string, NeighborhoodDisabilityStats>();
    for (const [key, value] of Object.entries(raw)) {
      result.set(key, value);
    }
    return result;
  })();

  return _disabilityCachePromise;
}
