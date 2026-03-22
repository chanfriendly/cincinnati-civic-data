import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../context/LanguageContext';
import { computeScores } from '../../utils/scoring';
import { fetchSODA, distanceMiles, normalizeNeighborhoodName, calculateCentroid, fetchNearbyParks, fetchFloodZone, fetchFARAHamilton } from '../../utils/api';
import type { Dimension, NeighborhoodRawMetrics, NeighborhoodScore, DimensionId } from '../../types';
import DimensionPanel from './DimensionPanel';
import ChoroplethMap from './ChoroplethMap';
import TopNeighborhoods from './TopNeighborhoods';
import DetailDrawer from './DetailDrawer';

// Inline GeoJSON types (avoids @types/geojson dependency)
type GeoJSONFeature = { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: string; coordinates: number[][][] | number[][][][] } };
type GeoJSONFeatureCollection = { type: 'FeatureCollection'; features: GeoJSONFeature[] };



const INITIAL_DIMENSIONS: Dimension[] = [
  {
    id: 'affordability',
    labelKey: 'explorer.dim.affordability.label',
    descriptionKey: 'explorer.dim.affordability.description',
    methodology: 'Source: U.S. Census ACS 5-Year Estimates (Hamilton County tracts → neighborhood). Metric: % of renter households spending >30% of gross income on rent (Census rent burden, B25070). Lower burden = higher score. Scores are min-max normalized across all Cincinnati neighborhoods.',
    enabled: false,
    weight: 3,
    available: true,
    higherIsBetter: false,
  },
  {
    id: 'income',
    labelKey: 'explorer.dim.income.label',
    descriptionKey: 'explorer.dim.income.description',
    methodology: 'Source: U.S. Census ACS 5-Year Estimates (B19013 — Median Household Income). Census tracts are assigned to the nearest neighborhood centroid; incomes are population-weighted. Use "Higher-income" to rank affluent areas first, or "Lower-cost" to surface more affordable neighborhoods.',
    enabled: false,
    weight: 3,
    available: true,
    higherIsBetter: true,
    incomeSub: 'higher',
  },
  {
    id: 'safety',
    labelKey: 'explorer.dim.safety.label',
    descriptionKey: 'explorer.dim.safety.description',
    methodology: 'Source: CPD STARS crime dataset (7aqy-xrv9), rolling 12-month window. Metric: reported incidents per 1,000 residents per year. Population denominator comes from Census ACS B01003. Fewer incidents per capita = higher score. Scores are min-max normalized.',
    enabled: false,
    weight: 3,
    available: true,
    higherIsBetter: false,
  },
  {
    id: 'transit',
    labelKey: 'explorer.dim.transit.label',
    descriptionKey: 'explorer.dim.transit.description',
    methodology: 'Source: SORTA GTFS stop locations (3,743 stops). Metric: number of bus stops within 0.4 miles of the neighborhood geographic centroid. More stops = higher score. Scores are min-max normalized. Note: route frequency data is not currently available in the feed.',
    enabled: false,
    weight: 3,
    available: true,
    higherIsBetter: true,
  },
  {
    id: 'investment',
    labelKey: 'explorer.dim.investment.label',
    descriptionKey: 'explorer.dim.investment.description',
    methodology: 'Source: Cincinnati Building Permits (uhjb-xac9). Metric: year-over-year % change in permit volume — comparing the most recent 3 years to the prior 3-year period. Positive growth = higher score. Neighborhoods with zero recent permits score neutral (50). Scores are min-max normalized.',
    enabled: false,
    weight: 3,
    available: true,
    higherIsBetter: true,
  },
  {
    id: 'blight',
    labelKey: 'explorer.dim.blight.label',
    descriptionKey: 'explorer.dim.blight.description',
    methodology: 'Source: PLAP (Proactive Landlord Accountability Program) dataset (pk9w-99n6) + Building Inspections (ivda-umw7). Metric: total PLAP violations logged per neighborhood (proxy for violation density). Fewer violations = higher score. Inspection closure rate (CODECOMP / CLOSE-NO statuses) is tracked in the detail view. Scores are min-max normalized.',
    enabled: false,
    weight: 3,
    available: true,
    higherIsBetter: false,
  },
  {
    id: 'parks',
    labelKey: 'explorer.dim.parks.label',
    descriptionKey: 'explorer.dim.parks.description',
    methodology: 'Source: CAGIS Parks and Greenspace layer (Hamilton County). Metric: total park acreage within 0.75 miles of the neighborhood centroid, divided by population per 1,000 residents. More park access per capita = higher score. Scores are min-max normalized across all neighborhoods.',
    enabled: false,
    weight: 3,
    available: true,
    higherIsBetter: true,
  },
  {
    id: 'flood',
    labelKey: 'explorer.dim.flood.label',
    descriptionKey: 'explorer.dim.flood.description',
    methodology: 'Source: FEMA National Flood Hazard Layer (NFHL) — always current federal data. Metric: whether the neighborhood centroid falls within a FEMA Special Flood Hazard Area (Zones AE, A, AO, AH, VE, V). Not in flood zone = higher score. Note: this is a centroid-based proxy — part of a neighborhood may still overlap a flood zone even if the centroid does not.',
    enabled: false,
    weight: 3,
    available: true,
    higherIsBetter: false,  // inFloodZone=true (1) is worse → lower score
  },
  {
    id: 'food',
    labelKey: 'explorer.dim.food.label',
    descriptionKey: 'explorer.dim.food.description',
    methodology: 'Source: USDA Economic Research Service — Food Access Research Atlas 2019 (FARA). Metric: % of neighborhood population living in a Low Income + Low Access (LILA) census tract, using the urban definition (supermarket more than 1 mile away). Lower food desert exposure = higher score. Scores are min-max normalized across all Cincinnati neighborhoods. LILA tracts signal that residents likely lack affordable, healthy food nearby — a key equity indicator.',
    enabled: false,
    weight: 3,
    available: true,
    higherIsBetter: false,
  },
  {
    id: 'schools',
    labelKey: 'explorer.dim.schools.label',
    descriptionKey: 'explorer.dim.schools.description',
    methodology: 'CPS school performance data is not currently available in a machine-readable open dataset. This dimension is disabled.',
    enabled: false,
    weight: 3,
    available: false,
    higherIsBetter: true,
  },
];

const UID_CRIME_OLD = 'k59e-2pvf';
const UID_CRIME_NEW = '7aqy-xrv9';
const UID_PERMITS = 'uhjb-xac9'; // corrected — tsjj-dcaf was a derived view with no columns
const UID_PLAP = 'pk9w-99n6';
const UID_INSPECTIONS = 'ivda-umw7';
// Multiple CAGIS URL candidates — tried in order until one succeeds.
// The service name and field names vary across Cincinnati's ArcGIS instances.
const CAGIS_URLS = [
  // Primary: SNA boundaries with all fields (more reliable than limiting outFields)
  'https://services1.arcgis.com/vdNDkVykv9vEWFX4/arcgis/rest/services/Cincinnati_Neighborhood_Statistical_Areas/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
  // Alternate service name used in some CAGIS exports
  'https://services1.arcgis.com/vdNDkVykv9vEWFX4/arcgis/rest/services/Cincinnati_Statistical_Neighborhood_Approximations__SNA_/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
  // ArcGIS Open Data direct download (map ID from CAGIS portal)
  'https://opendata.arcgis.com/datasets/572561553c9e4d618d2d7939c5261d46_0.geojson',
  // Community Council Boundaries as a fallback (ce3b96ceb3604c498090f77ae5199349_1)
  'https://opendata.arcgis.com/datasets/ce3b96ceb3604c498090f77ae5199349_1.geojson',
];

export default function NeighborhoodExplorer() {
  const { t } = useTranslation();
  const { language } = useLanguage();

  const [dimensions, setDimensions] = useState<Dimension[]>(INITIAL_DIMENSIONS);
  const [geojson, setGeojson] = useState<GeoJSONFeatureCollection | null>(null);
  const [rawDataMap, setRawDataMap] = useState<Map<string, NeighborhoodRawMetrics>>(new Map());
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null);
  const [colorblindMode, setColorblindMode] = useState(false);
  const [loadingState, setLoadingState] = useState<Record<string, boolean>>({
    geojson: true,
    crime: true,
    permits: true,
    plap: true,
    inspections: true,
    census: true,
    transit: true,
    parks: true,  // CAGIS parks acreage per neighborhood
    flood: true,  // FEMA flood zone per neighborhood centroid
    food: true,   // USDA FARA food desert % per neighborhood
  });

  // Load GeoJSON neighborhoods — try each CAGIS URL in order until one succeeds.
  // The NEIGH property holds the neighborhood name; fall back to NAME or SNA_NAME.
  useEffect(() => {
    const loadGeojson = async () => {
      for (const url of CAGIS_URLS) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout per URL
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeout);
          if (!response.ok) continue;
          const data: GeoJSONFeatureCollection = await response.json();
          // Normalize the neighborhood name property to always be at properties.NEIGH
          if (data.features?.length > 0) {
            data.features = data.features.map((f) => {
              const p = f.properties as Record<string, unknown>;
              // Try different property names used across CAGIS exports
              const name = (p.NEIGH || p.NAME || p.SNA_NAME || p.LABEL || p.sna_name || '') as string;
              return { ...f, properties: { ...p, NEIGH: name } };
            });
          }
          setGeojson(data);
          setLoadingState((prev) => ({ ...prev, geojson: false }));
          return; // success — stop trying
        } catch {
          continue; // try next URL
        }
      }
      // All URLs failed — map won't show but rest of tab still works
      console.warn('All CAGIS neighborhood GeoJSON URLs failed. Map disabled.');
      setLoadingState((prev) => ({ ...prev, geojson: false }));
    };
    loadGeojson();
  }, []);

  // ── Crime data ───────────────────────────────────────────────────────────────
  // Use server-side GROUP BY so we download counts-per-neighborhood, not 50k rows.
  // Field: cpd_neighborhood (NOT "neighborhood") — confirmed from dataset schema.
  // Date field in 7aqy-xrv9 is datereported (lowercase, from DateReported).
  useEffect(() => {
    const loadCrimeData = async () => {
      try {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const cutoff = oneYearAgo.toISOString().split('T')[0];

        const { data: crimeData } = await fetchSODA(UID_CRIME_NEW, {
          $select: 'cpd_neighborhood,count(*) as count',
          $where: `datereported >= '${cutoff}'`,
          $group: 'cpd_neighborhood',
          $limit: 100,
        });

        setRawDataMap((prev) => {
          const updated = new Map(prev);
          for (const record of crimeData as any[]) {
            const neigh = normalizeNeighborhoodName((record as any).cpd_neighborhood || '');
            // Skip blank entries, numeric-only codes (CPD district numbers like "15"),
            // and single-word entries that are clearly not neighborhood names
            if (!neigh) continue;
            if (/^\d+$/.test(neigh.trim())) continue; // pure number — skip
            const count = parseInt((record as any).count || '0', 10);
            const existing = updated.get(neigh) || {};
            // Population denominator is filled in by Census loader; default to 10000 so
            // crimeRatePer1000 is still directionally useful before census data arrives.
            const pop = (existing as any).population ?? 10000;
            updated.set(neigh, { ...existing, crimeCount: count, crimeRatePer1000: (count / pop) * 1000 });
          }
          return updated;
        });
      } catch (error) {
        console.error('Crime data loading error:', error);
      } finally {
        setLoadingState((prev) => ({ ...prev, crime: false }));
      }
    };
    loadCrimeData();
  }, []);

  // ── Building permits ──────────────────────────────────────────────────────────
  // Two server-side GROUP BYs for recent (last 3yr) vs prior (3–6yr ago) permit counts.
  // Field: neighborhood (civilian dataset — different from police cpd_neighborhood).
  useEffect(() => {
    const loadPermits = async () => {
      try {
        const now = new Date();
        const recentStart = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate())
          .toISOString().split('T')[0];
        const priorStart = new Date(now.getFullYear() - 6, now.getMonth(), now.getDate())
          .toISOString().split('T')[0];

        const [{ data: recentData }, { data: priorData }] = await Promise.all([
          fetchSODA(UID_PERMITS, {
            $select: 'neighborhood,count(*) as count',
            $where: `applieddate >= '${recentStart}'`,
            $group: 'neighborhood',
            $limit: 100,
          }),
          fetchSODA(UID_PERMITS, {
            $select: 'neighborhood,count(*) as count',
            $where: `applieddate >= '${priorStart}' AND applieddate < '${recentStart}'`,
            $group: 'neighborhood',
            $limit: 100,
          }),
        ]);

        const recentMap = new Map<string, number>();
        const priorMap = new Map<string, number>();
        for (const r of recentData as any[])
          recentMap.set(normalizeNeighborhoodName((r as any).neighborhood || ''), parseInt((r as any).count || '0', 10));
        for (const r of priorData as any[])
          priorMap.set(normalizeNeighborhoodName((r as any).neighborhood || ''), parseInt((r as any).count || '0', 10));

        setRawDataMap((prev) => {
          const updated = new Map(prev);
          const allNeighs = new Set([...recentMap.keys(), ...priorMap.keys()]);
          for (const neigh of allNeighs) {
            if (!neigh) continue;
            const recent = recentMap.get(neigh) ?? 0;
            const prior = priorMap.get(neigh) ?? 0;
            const yoyChange = prior > 0 ? ((recent - prior) / prior) * 100 : recent > 0 ? 100 : 0;
            const existing = updated.get(neigh) || {};
            updated.set(neigh, { ...existing, permitYoYChange: yoyChange, recentPermitCount: recent });
          }
          return updated;
        });
      } catch (error) {
        console.error('Permits data loading error:', error);
      } finally {
        setLoadingState((prev) => ({ ...prev, permits: false }));
      }
    };
    loadPermits();
  }, []);

  // ── PLAP / Blight ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const loadPlap = async () => {
      try {
        const { data: plapData } = await fetchSODA(UID_PLAP, {
          $select: 'neighborhood,count(*) as count',
          $group: 'neighborhood',
          $limit: 100,
        });

        setRawDataMap((prev) => {
          const updated = new Map(prev);
          for (const record of plapData as any[]) {
            const neigh = normalizeNeighborhoodName((record as any).neighborhood || '');
            if (!neigh) continue;
            const count = parseInt((record as any).count || '0', 10);
            const existing = updated.get(neigh) || {};
            // Approximate sq miles — will be refined once GeoJSON loads
            updated.set(neigh, { ...existing, plapPerSqMile: count / 1 });
          }
          return updated;
        });
      } catch (error) {
        console.error('PLAP data loading error:', error);
      } finally {
        setLoadingState((prev) => ({ ...prev, plap: false }));
      }
    };
    loadPlap();
  }, []);

  // ── Inspections (first-pass rate) ─────────────────────────────────────────────
  // Group by neighborhood + result so we can compute pass rate server-side.
  useEffect(() => {
    const loadInspections = async () => {
      try {
        // Field confirmed: data_status (not inspecresult), neighborhood (UPPER CASE in data)
        const { data: inspectionsData } = await fetchSODA(UID_INSPECTIONS, {
          $select: 'neighborhood,data_status,count(*) as count',
          $group: 'neighborhood,data_status',
          $limit: 300,
        });

        const inspectMap = new Map<string, { total: number; passed: number }>();
        for (const record of inspectionsData as any[]) {
          const neigh = normalizeNeighborhoodName((record as any).neighborhood || '');
          if (!neigh) continue;
          if (!inspectMap.has(neigh)) inspectMap.set(neigh, { total: 0, passed: 0 });
          const stats = inspectMap.get(neigh)!;
          const cnt = parseInt((record as any).count || '0', 10);
          stats.total += cnt;
          const status = ((record as any).data_status || '').toUpperCase();
          // PLAP-specific passing statuses: CODECOMP = code compliant,
          // CLOSE-NO / CLOS-NO = closed with no violation found.
          const isPassing = status === 'CODECOMP' || status === 'CLOSE-NO' ||
            status === 'CLOS-NO' || status === 'CLOS-OUT' ||
            status.includes('PASS') || status.includes('COMPLI');
          if (isPassing) stats.passed += cnt;
        }

        setRawDataMap((prev) => {
          const updated = new Map(prev);
          for (const [neigh, data] of inspectMap) {
            const existing = updated.get(neigh) || {};
            updated.set(neigh, {
              ...existing,
              firstPassRate: data.total > 0 ? (data.passed / data.total) * 100 : undefined,
            });
          }
          return updated;
        });
      } catch (error) {
        console.error('Inspections data loading error:', error);
      } finally {
        setLoadingState((prev) => ({ ...prev, inspections: false }));
      }
    };
    loadInspections();
  }, []);

  // Load census data — ACS 2022 5-year estimates pre-joined with CenPop2020
  // tract centroids and shipped as a static file so there are no CORS issues.
  // The file was generated by fetching:
  //   1) api.census.gov/data/2022/acs/acs5 for Hamilton County, OH
  //   2) www2.census.gov/geo/docs/reference/cenpop2020/tract/CenPop2020_Mean_TR39.txt
  // and joining by GEOID. Refresh by re-running scripts/build_acs.py.
  useEffect(() => {
    const loadCensus = async () => {
      if (!geojson) return;
      try {
        // ── Step 1: Build neighborhood centroids from GeoJSON ────────────────
        const neighCentroids = new Map<string, [number, number]>();
        for (const feature of geojson.features) {
          const neighName = normalizeNeighborhoodName(feature.properties?.NEIGH || '');
          if (!neighName) continue;
          if (feature.geometry.type === 'Polygon') {
            const coords = (feature.geometry as any).coordinates as number[][][];
            neighCentroids.set(neighName, calculateCentroid(coords));
          }
        }

        // ── Step 2: Load pre-built static ACS tract file ─────────────────────
        type TractRow = { geoid: string; lat: number; lon: number; income: number | null; rent: number | null; pop: number; rb: number[] };
        const resp = await fetch('/data/neighborhood_acs.json');
        if (!resp.ok) throw new Error(`ACS static file ${resp.status}`);
        const tracts: TractRow[] = await resp.json();

        // ── Step 3: Accumulate metrics per neighborhood ───────────────────────
        // Population-weighted averages for income/rent; straight sum for rent burden.
        type Acc = { pop: number; incomeW: number; rentW: number; renting: number; burdened: number };
        const accMap = new Map<string, Acc>();

        for (const tract of tracts) {
          // Find closest neighborhood centroid
          let closestNeigh = '';
          let minDist = Infinity;
          for (const [neigh, [nLat, nLon]] of neighCentroids) {
            const d = distanceMiles(nLat, nLon, tract.lat, tract.lon);
            if (d < minDist) { minDist = d; closestNeigh = neigh; }
          }
          // Exclude tracts far outside the city core (outer-county suburbs)
          if (!closestNeigh || minDist > 5) continue;

          const pop  = tract.pop;
          const inc  = tract.income;
          const rent = tract.rent;
          // rb[0] = total renter universe; rb[1..4] = <30% burden; rb[5..9] = ≥30% burden
          const totalRenting  = tract.rb.slice(1).reduce((a, b) => a + b, 0);
          const totalBurdened = tract.rb.slice(5).reduce((a, b) => a + b, 0);

          const acc = accMap.get(closestNeigh) ?? { pop: 0, incomeW: 0, rentW: 0, renting: 0, burdened: 0 };
          acc.pop += pop;
          if (inc && inc > 0 && inc < 999998) acc.incomeW += inc * pop;
          if (rent && rent > 0 && rent < 9999) acc.rentW  += rent * pop;
          acc.renting  += totalRenting;
          acc.burdened += totalBurdened;
          accMap.set(closestNeigh, acc);
        }

        // ── Step 4: Write to rawDataMap ───────────────────────────────────────
        setRawDataMap((prev) => {
          const updated = new Map(prev);
          for (const [neigh, acc] of accMap) {
            const existing = updated.get(neigh) ?? {};
            updated.set(neigh, {
              ...existing,
              population:            acc.pop > 0 ? acc.pop : undefined,
              medianHouseholdIncome: acc.pop > 0 && acc.incomeW > 0 ? Math.round(acc.incomeW / acc.pop) : undefined,
              medianGrossRent:       acc.pop > 0 && acc.rentW > 0   ? Math.round(acc.rentW / acc.pop)   : undefined,
              rentBurdenRate:        acc.renting > 0 ? (acc.burdened / acc.renting) * 100 : undefined,
            });
          }
          return updated;
        });

        setLoadingState((prev) => ({ ...prev, census: false }));
      } catch (error) {
        console.error('Census data loading error:', error);
        setLoadingState((prev) => ({ ...prev, census: false }));
      }
    };

    loadCensus();
  }, [geojson]); // static file is fixed to 2022 ACS — no year param needed

  // Load transit data
  useEffect(() => {
    const loadTransit = async () => {
      try {
        const response = await fetch('/data/sorta_stops.json');
        if (!response.ok) throw new Error('Failed to load transit data');
        const stops: Array<{ stop_lat: string; stop_lon: string; routes: string[] }> =
          await response.json();

        // Build neighborhood centroids
        const neighCentroids = new Map<string, [number, number]>();
        if (geojson) {
          for (const feature of geojson.features) {
            const neighName = normalizeNeighborhoodName(feature.properties?.NEIGH || '');
            if (feature.geometry.type === 'Polygon') {
              const coords = (feature.geometry as any).coordinates as number[][][];
              const centroid = calculateCentroid(coords);
              neighCentroids.set(neighName, centroid);
            }
          }
        }

        // For each neighborhood centroid, count ALL stops within 0.4 miles.
        // The original approach (assign each stop to ONE nearest centroid, count
        // unique routes) produced 50/100 for every neighborhood because the
        // stops file has routes:[] for all entries. Counting stops is robust and
        // gives meaningful variation across neighborhoods.
        const transitCounts = new Map<string, number>();
        for (const [neigh, [centLat, centLon]] of neighCentroids) {
          let count = 0;
          for (const stop of stops) {
            const stopLat = parseFloat(String(stop.stop_lat));
            const stopLon = parseFloat(String(stop.stop_lon));
            if (isNaN(stopLat) || isNaN(stopLon)) continue;
            if (distanceMiles(centLat, centLon, stopLat, stopLon) <= 0.4) {
              count++;
            }
          }
          transitCounts.set(neigh, count);
        }

        setRawDataMap((prev) => {
          const updated = new Map(prev);
          for (const [neigh, count] of transitCounts) {
            const existing = updated.get(neigh) || {};
            updated.set(neigh, {
              ...existing,
              stopCount: count,
              uniqueRouteCount: count, // keep legacy field in sync
            });
          }
          return updated;
        });
        setLoadingState((prev) => ({ ...prev, transit: false }));
      } catch (error) {
        console.error('Transit data loading error:', error);
        setLoadingState((prev) => ({ ...prev, transit: false }));
      }
    };

    if (geojson) {
      loadTransit();
    }
  }, [geojson]);

  // ── CAGIS: Park access per neighborhood ──────────────────────────────────────
  // Queries the CAGIS Parks and Greenspace feature service once per neighborhood
  // centroid (batched in groups of 8 to avoid overwhelming the service).
  // Metric: total park acres within 0.75 mi / (population / 1000).
  useEffect(() => {
    if (!geojson) return;
    const loadParks = async () => {
      try {
        // Build centroid map from GeoJSON
        const centroids = new Map<string, [number, number]>();
        for (const feature of geojson.features) {
          const name = normalizeNeighborhoodName(String(feature.properties?.NEIGH || ''));
          if (!name || /^\d+$/.test(name)) continue;
          if (feature.geometry.type === 'Polygon') {
            centroids.set(name, calculateCentroid((feature.geometry as any).coordinates));
          }
        }

        const neighborhoods = Array.from(centroids.keys());
        const parkMap = new Map<string, number>(); // neighborhood → total acres

        // Batch 8 at a time so we don't hammer CAGIS
        const BATCH = 8;
        for (let i = 0; i < neighborhoods.length; i += BATCH) {
          await Promise.allSettled(
            neighborhoods.slice(i, i + BATCH).map(async (name) => {
              const [centLat, centLon] = centroids.get(name)!;
              const parks = await fetchNearbyParks(centLat, centLon, 0.75);
              const totalAcres = parks.reduce((sum, p) => {
                const acres = parseFloat(String(p.ACREAGE ?? '0'));
                return sum + (isNaN(acres) ? 0 : acres);
              }, 0);
              parkMap.set(name, totalAcres);
            })
          );
        }

        setRawDataMap((prev) => {
          const updated = new Map(prev);
          for (const [name, acres] of parkMap) {
            const existing = updated.get(name) ?? {};
            const pop = (existing as any).population ?? 10000;
            updated.set(name, {
              ...existing,
              parkTotalAcres: acres,
              parkAcresPer1000: pop > 0 ? acres / (pop / 1000) : 0,
            });
          }
          return updated;
        });
      } catch (err) {
        console.error('Parks data loading error:', err);
      } finally {
        setLoadingState((prev) => ({ ...prev, parks: false }));
      }
    };
    loadParks();
  }, [geojson]);

  // ── FEMA: Flood zone per neighborhood centroid ────────────────────────────────
  // Queries the FEMA NFHL federal service (highly reliable, no auth needed).
  // Each neighborhood centroid is tested; result is stored as inFloodZone boolean.
  // High-risk zones: AE, A, AO, AH, VE, V, A99, AR.
  useEffect(() => {
    if (!geojson) return;
    const loadFlood = async () => {
      const HIGH_RISK = new Set(['AE', 'A', 'AO', 'AH', 'VE', 'V', 'A99', 'AR']);
      try {
        const centroids = new Map<string, [number, number]>();
        for (const feature of geojson.features) {
          const name = normalizeNeighborhoodName(String(feature.properties?.NEIGH || ''));
          if (!name || /^\d+$/.test(name)) continue;
          if (feature.geometry.type === 'Polygon') {
            centroids.set(name, calculateCentroid((feature.geometry as any).coordinates));
          }
        }

        const neighborhoods = Array.from(centroids.keys());
        const floodMap = new Map<string, boolean>();

        const BATCH = 10;
        for (let i = 0; i < neighborhoods.length; i += BATCH) {
          await Promise.allSettled(
            neighborhoods.slice(i, i + BATCH).map(async (name) => {
              const [centLat, centLon] = centroids.get(name)!;
              const zones = await fetchFloodZone(centLat, centLon);
              const inSFHA = zones.some((z) => HIGH_RISK.has(String(z.FLD_ZONE ?? '')));
              floodMap.set(name, inSFHA);
            })
          );
        }

        setRawDataMap((prev) => {
          const updated = new Map(prev);
          for (const [name, inFlood] of floodMap) {
            const existing = updated.get(name) ?? {};
            updated.set(name, { ...existing, inFloodZone: inFlood });
          }
          return updated;
        });
      } catch (err) {
        console.error('Flood data loading error:', err);
      } finally {
        setLoadingState((prev) => ({ ...prev, flood: false }));
      }
    };
    loadFlood();
  }, [geojson]);

  // ── USDA FARA: Food access per neighborhood ────────────────────────────────────
  // Fetches census-tract-level food desert data from the USDA ERS FARA 2019 ArcGIS
  // REST service (public, CORS-enabled). Joins with neighborhood_acs.json to get
  // tract centroids, then assigns each tract to the closest neighborhood centroid.
  // Metric: % of neighborhood population in a LILA (food desert) tract.
  useEffect(() => {
    if (!geojson) return;
    const loadFood = async () => {
      try {
        // ── Build neighborhood centroids from GeoJSON ──────────────────────────
        const neighCentroids = new Map<string, [number, number]>();
        for (const feature of geojson.features) {
          const name = normalizeNeighborhoodName(String(feature.properties?.NEIGH || ''));
          if (!name || /^\d+$/.test(name)) continue;
          if (feature.geometry.type === 'Polygon') {
            neighCentroids.set(name, calculateCentroid((feature.geometry as any).coordinates));
          }
        }

        // ── Fetch FARA tract data (centroids included via returnCentroid=true) ──
        // We use centroids returned directly by ArcGIS (2010 tract polygon centroids)
        // rather than joining with neighborhood_acs.json (2020 boundaries) to avoid
        // a GEOID mismatch for tracts split between 2010 and 2020.
        const faraTracts = await fetchFARAHamilton();

        // ── Assign each FARA tract to closest neighborhood; accumulate metrics ──
        type Acc = { pop: number; lilaWt: number; povertyWt: number };
        const accMap = new Map<string, Acc>();

        for (const tract of faraTracts) {
          if (tract.lat === null || tract.lon === null) continue;

          // Find closest neighborhood centroid (same 5-mile cap as ACS loader)
          let closestNeigh = '';
          let minDist = Infinity;
          for (const [neigh, [nLat, nLon]] of neighCentroids) {
            const d = distanceMiles(nLat, nLon, tract.lat!, tract.lon!);
            if (d < minDist) { minDist = d; closestNeigh = neigh; }
          }
          if (!closestNeigh || minDist > 5) continue;

          const pop = tract.pop > 0 ? tract.pop : 1000; // POP2010 fallback
          const acc = accMap.get(closestNeigh) ?? { pop: 0, lilaWt: 0, povertyWt: 0 };
          acc.pop     += pop;
          acc.lilaWt  += tract.lila * pop;   // 1 if food desert, else 0 — weighted
          acc.povertyWt += tract.povertyRate * pop;
          accMap.set(closestNeigh, acc);
        }

        // ── Write to rawDataMap ────────────────────────────────────────────────
        setRawDataMap((prev) => {
          const updated = new Map(prev);
          for (const [neigh, acc] of accMap) {
            if (acc.pop === 0) continue;
            const existing = updated.get(neigh) ?? {};
            updated.set(neigh, {
              ...existing,
              foodDesertPct: (acc.lilaWt / acc.pop) * 100,
              povertyRate: acc.povertyWt / acc.pop,
            });
          }
          return updated;
        });
      } catch (err) {
        console.error('Food access data loading error:', err);
      } finally {
        setLoadingState((prev) => ({ ...prev, food: false }));
      }
    };
    loadFood();
  }, [geojson]);

  // Compute scores — filter out blank or invalid neighborhood names that can
  // appear when GeoJSON features have empty/null NEIGH properties.
  const scores = useMemo(() => {
    return computeScores(rawDataMap, dimensions).filter(
      (s) => s.name && s.name.trim().length > 0 && s.name.toLowerCase() !== 'n/a'
    );
  }, [rawDataMap, dimensions]);

  // Handle dimension toggle
  const handleToggleDimension = useCallback((id: DimensionId) => {
    setDimensions((prev) =>
      prev.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d))
    );
  }, []);

  // Handle weight change
  const handleWeightChange = useCallback((id: DimensionId, weight: number) => {
    setDimensions((prev) =>
      prev.map((d) => (d.id === id ? { ...d, weight } : d))
    );
  }, []);

  // Handle income sub change
  const handleIncomeSubChange = useCallback((sub: 'higher' | 'lower') => {
    setDimensions((prev) =>
      prev.map((d) =>
        d.id === 'income' ? { ...d, incomeSub: sub } : d
      )
    );
  }, []);

  const anyDimensionEnabled = dimensions.some((d) => d.enabled && d.available);
  const selectedScore = scores.find(
    (s) => s.name.toLowerCase() === selectedNeighborhood?.toLowerCase()
  );

  // Check if still loading
  const isLoading = Object.values(loadingState).some((v) => v);

  return (
    <div className="w-full h-full bg-gray-100 p-4 lg:p-6">
      <div className="mb-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-3xl font-bold text-civic-blue">
            {t('explorer.title', 'Neighborhood Explorer')}
          </h1>

          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={colorblindMode}
                onChange={(e) => setColorblindMode(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span>{t('explorer.colorblindMode', 'Colorblind Mode')}</span>
            </label>
          </div>
        </div>

        {isLoading && (
          <p className="text-xs text-gray-500 mt-2">
            {t('explorer.loading', 'Loading data from multiple sources...')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left: Dimension Panel — sticky so it stays visible while scrolling */}
        <div className="lg:col-span-1 lg:sticky lg:top-4 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto">
          <DimensionPanel
            dimensions={dimensions}
            onToggle={handleToggleDimension}
            onWeightChange={handleWeightChange}
            onIncomeSubChange={handleIncomeSubChange}
          />
        </div>

        {/* Right: Map and Details */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Map — fixed height so TopNeighborhoods always has space below */}
          <div className="h-[500px]">
            {!anyDimensionEnabled ? (
              <div className="w-full h-full bg-white rounded-lg shadow-md flex items-center justify-center">
                <div className="text-center max-w-sm">
                  <div className="text-5xl mb-4">📍</div>
                  <p className="text-gray-600 mb-2">
                    {t('explorer.noEnabled', 'No dimensions enabled')}
                  </p>
                  <p className="text-sm text-gray-500">
                    {t('explorer.enableToStart', 'Enable at least one dimension in the left panel to see neighborhood scores and the map.')}
                  </p>
                </div>
              </div>
            ) : (
              <ChoroplethMap
                geojson={geojson}
                scores={scores}
                colorblindMode={colorblindMode}
                onNeighborhoodClick={setSelectedNeighborhood}
                selectedNeighborhood={selectedNeighborhood}
                anyDimensionEnabled={anyDimensionEnabled}
              />
            )}
          </div>

          {/* Top Neighborhoods */}
          <div>
            <TopNeighborhoods
              scores={scores}
              dimensions={dimensions}
              onSelect={setSelectedNeighborhood}
              selectedNeighborhood={selectedNeighborhood}
              anyDimensionEnabled={anyDimensionEnabled}
              language={language as 'en' | 'es'}
            />
          </div>
        </div>
      </div>

      {/* Detail Drawer for mobile */}
      <DetailDrawer
        score={selectedScore || null}
        dimensions={dimensions}
        onClose={() => setSelectedNeighborhood(null)}
      />

      {/* Desktop detail panel (hidden on mobile) */}
      {selectedScore && (
        <div className="hidden lg:block fixed right-6 bottom-6 w-96 bg-white rounded-lg shadow-lg p-6 max-h-96 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-civic-blue">{selectedScore.name}</h3>
            <button
              onClick={() => setSelectedNeighborhood(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          <div className="bg-gradient-to-r from-civic-blue to-civic-blue-light p-4 rounded text-white mb-4">
            <p className="text-xs opacity-90 mb-1">Composite Score</p>
            <p className="text-3xl font-bold">{selectedScore.compositeScore}/100</p>
          </div>
        </div>
      )}
    </div>
  );
}
