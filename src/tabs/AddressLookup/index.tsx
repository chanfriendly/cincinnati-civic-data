import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { renderMarkdown } from '../../utils/markdown';
import { useTranslation } from 'react-i18next';
import { useSODA } from '../../hooks/useSODA';
import { useLanguage } from '../../context/LanguageContext';
import {
  callClaude, formatDate, distanceMiles,
  fetchZoning, fetchFloodZone, fetchHistoricDistrict, fetchNearbyParks,
  fetchOHGOIncidents, fetchOHGOCameras, fetchOHGOConstruction, ohgoEnabled,
} from '../../utils/api';
import type { OHGOIncident, OHGOCamera, OHGOConstruction } from '../../types';
import { DataCard, EmptyState, DataAttribution, CouncilPanel, CivicOrgsPanel, CivicCalendar } from '../../components/ui';
import { stripNeighborhoodName } from '../../utils/api';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface GeocodedAddress {
  lat: number;
  lng: number;
  formatted: string;
  street?: string;
  streetNum?: string;
  streetName?: string;
  neighborhood?: string;
}

interface TransitStop {
  stop_lat: number;
  stop_lon: number;
  stop_name: string;
  routes: string[];
}

interface CrimeRecord {
  id: string;
  stars_category?: string; // STARS dataset
  offense_type?: string;
  offense?: string;
  date_reported?: string;
  datereported?: string; // STARS dataset field name
  // Socrata returns lat/lng as top-level fields (not nested under "location")
  latitude_x?: string | number;
  longitude_x?: string | number;
  address?: string;
}

interface NearbyStop {
  stop_name: string;
  distance: number;
  routes: string[];
}

interface SchoolRecord {
  name: string;
  type: string;   // "Elementary School", "Middle School", "High School", etc.
  grade: string;  // "K-6", "7-12", etc.
  fund: string;   // "Public" | "Private"
  district: string;
  address: string;
  lat: number;
  lon: number;
}

interface NearbySchool extends SchoolRecord {
  distance: number; // miles
}

// Healthcare facility record (from public/data/healthcare_facilities.json)
interface HealthcareFacilityRecord {
  name: string;
  type: string;   // 'hospital' | 'urgent_care' | 'clinic' | 'mental_health' | 'substance_use' | 'dentist' | 'pharmacy'
  category: string;
  address: string;
  phone?: string;
  website?: string;
  lat: number;
  lon: number;
  source: string;
  fqhc: boolean;
}

interface NearbyFacility extends HealthcareFacilityRecord {
  distance: number; // miles
}

// Mapbox geocoding feature — includes context array for neighborhood extraction
interface MapboxContext {
  id: string;   // e.g. "neighborhood.1234", "place.5678"
  text: string; // e.g. "Over-the-Rhine"
}

interface MapboxFeature {
  place_name: string;
  center: [number, number];
  context?: MapboxContext[];
}

// Voting precinct data from CAGIS FeatureServer layer 44
interface VotingPrecinct {
  precinct: string;   // e.g. "WARD 1-A"
  pct: string;        // precinct number
  prcName: string;    // full precinct name
  location: string;   // polling place name
  address: string;    // polling place address
  city: string;
  zip: string;
}

// Lead service line data shape (from public/data/lead_service_lines.json)
interface LeadNeighborhoodRecord {
  name: string;
  total: number;
  lead: number;
  unknown: number;
  galvanized: number;
  copper: number;
  replaced: number;
  asOf: string;
}
type LeadServiceData = Record<string, LeadNeighborhoodRecord>;

type CAGISStatus = 'idle' | 'loading' | 'done' | 'error';

export default function AddressLookup() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [selectedAddress, setSelectedAddress] = useState<GeocodedAddress | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── SODA queries — use skip=true when no address is selected ─────────────────
  // NOTE: Cincinnati's Socrata datasets do not expose a point-typed "location"
  // column, so within_circle() does not work. Instead we use a bounding box
  // on the separate latitude/longitude (number) columns.
  // For the legacy PDI crime dataset those columns are stored as text, so we
  // use string-literal comparison (safe for Cincinnati's "39.xxx" / "-84.xxx"
  // values because lexicographic order equals numeric order at that prefix).
  const noAddress = !selectedAddress;
  const lat = selectedAddress?.lat ?? 0;
  const lng = selectedAddress?.lng ?? 0;

  // Returns a SoQL WHERE clause for a numeric lat/lon bounding box.
  const bboxWhere = (latCol: string, lonCol: string, radiusM: number): string => {
    const dLat = radiusM / 111320;
    const dLon = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
    return (
      `${latCol} IS NOT NULL AND ${lonCol} IS NOT NULL AND ` +
      `${latCol} >= ${(lat - dLat).toFixed(6)} AND ${latCol} <= ${(lat + dLat).toFixed(6)} AND ` +
      `${lonCol} >= ${(lng - dLon).toFixed(6)} AND ${lonCol} <= ${(lng + dLon).toFixed(6)}`
    );
  };

  // Same but wraps the bounds in single-quoted strings for text-typed columns.
  const bboxWhereText = (latCol: string, lonCol: string, radiusM: number): string => {
    const dLat = radiusM / 111320;
    const dLon = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
    return (
      `${latCol} IS NOT NULL AND ${lonCol} IS NOT NULL AND ` +
      `${latCol} >= '${(lat - dLat).toFixed(6)}' AND ${latCol} <= '${(lat + dLat).toFixed(6)}' AND ` +
      `${lonCol} >= '${(lng - dLon).toFixed(6)}' AND ${lonCol} <= '${(lng + dLon).toFixed(6)}'`
    );
  };

  // NOTE: Building permits (uhjb-xac9) removed from Address Lookup.
  // That dataset has no geocoordinates, so the bounding box query returned
  // unfiltered city-wide permits. Permit data is available by neighborhood in Tab 2.

  const inspections = useSODA(
    'ivda-umw7',
    selectedAddress
      ? { $where: bboxWhere('latitude', 'longitude', 200), $limit: 50 }
      : {},
    noAddress
  );

  const taxAbatements = useSODA(
    'tkp7-yf64',
    selectedAddress
      ? { $where: bboxWhere('latitude', 'longitude', 200), $limit: 50 }
      : {},
    noAddress
  );

  // One year ago in ISO format for crime date filters
  const oneYearAgo = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  // PDI crime: latitude_x/longitude_x are text columns — use string comparison
  const crimeOld = useSODA(
    'k59e-2pvf',
    selectedAddress
      ? {
          $where: `${bboxWhereText('latitude_x', 'longitude_x', 400)} AND date_reported >= '${oneYearAgo}'`,
          $limit: 500,
          $order: 'date_reported DESC',
        }
      : {},
    noAddress
  );

  // STARS crime: latitude_x/longitude_x are numeric columns
  const crimeNew = useSODA(
    '7aqy-xrv9',
    selectedAddress
      ? {
          $where: `${bboxWhere('latitude_x', 'longitude_x', 400)} AND datereported >= '${oneYearAgo}'`,
          $limit: 500,
          $order: 'datereported DESC',
        }
      : {},
    noAddress
  );

  const blight = useSODA(
    'pk9w-99n6',
    selectedAddress
      ? { $where: bboxWhere('latitude', 'longitude', 200), $limit: 50 }
      : {},
    noAddress
  );

  // Merge crime data
  const mergedCrime = useMemo(() => {
    const allCrime: CrimeRecord[] = [
      ...((crimeOld.data || []) as CrimeRecord[]),
      ...((crimeNew.data || []) as CrimeRecord[]),
    ];
    return allCrime.sort((a, b) => {
      const dateA = new Date(a.date_reported || a.datereported || 0).getTime();
      const dateB = new Date(b.date_reported || b.datereported || 0).getTime();
      return dateB - dateA;
    });
  }, [crimeOld.data, crimeNew.data]);

  // Transit stops
  const [transitStops, setTransitStops] = useState<NearbyStop[]>([]);
  const [loadingTransit, setLoadingTransit] = useState(false);

  useEffect(() => {
    if (!selectedAddress) return;

    setLoadingTransit(true);
    fetch('/data/sorta_stops.json')
      .then((res) => res.json())
      .then((stops: TransitStop[]) => {
        const nearby = stops
          .map((stop) => ({
            stop_name: stop.stop_name,
            distance: distanceMiles(
              selectedAddress.lat,
              selectedAddress.lng,
              stop.stop_lat,
              stop.stop_lon
            ),
            routes: stop.routes,
          }))
          .filter((s) => s.distance <= 0.5)
          .sort((a, b) => a.distance - b.distance);
        setTransitStops(nearby);
      })
      .catch(() => setTransitStops([]))
      .finally(() => setLoadingTransit(false));
  }, [selectedAddress]);

  // ── Nearby schools (static JSON — same pattern as transit stops) ─────────────
  const [nearbySchools, setNearbySchools] = useState<NearbySchool[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);

  useEffect(() => {
    if (!selectedAddress) return;

    setLoadingSchools(true);
    fetch('/data/schools.json')
      .then((res) => res.json())
      .then((schools: SchoolRecord[]) => {
        const nearby = schools
          .map((school) => ({
            ...school,
            distance: distanceMiles(
              selectedAddress.lat,
              selectedAddress.lng,
              school.lat,
              school.lon
            ),
          }))
          .filter((s) => s.distance <= 1.0)
          .sort((a, b) => a.distance - b.distance);
        setNearbySchools(nearby);
      })
      .catch(() => setNearbySchools([]))
      .finally(() => setLoadingSchools(false));
  }, [selectedAddress]);

  // ── Nearby healthcare facilities (static JSON) ───────────────────────────────
  const [nearbyHealthcare, setNearbyHealthcare] = useState<NearbyFacility[]>([]);
  const [loadingHealthcare, setLoadingHealthcare] = useState(false);

  useEffect(() => {
    if (!selectedAddress) return;
    setLoadingHealthcare(true);
    fetch('/data/healthcare_facilities.json')
      .then((res) => res.json())
      .then((facilities: HealthcareFacilityRecord[]) => {
        const nearby = facilities
          .map((f) => ({
            ...f,
            distance: distanceMiles(selectedAddress.lat, selectedAddress.lng, f.lat, f.lon),
          }))
          .filter((f) => f.distance <= 1.0)
          .sort((a, b) => a.distance - b.distance);
        setNearbyHealthcare(nearby);
      })
      .catch(() => setNearbyHealthcare([]))
      .finally(() => setLoadingHealthcare(false));
  }, [selectedAddress]);

  // ── Voting precinct lookup (CAGIS FeatureServer layer 44) ───────────────────
  const [votingPrecinct, setVotingPrecinct] = useState<VotingPrecinct | null>(null);
  const [precinctStatus, setPrecinctStatus] = useState<CAGISStatus>('idle');

  useEffect(() => {
    if (!selectedAddress) {
      setVotingPrecinct(null);
      setPrecinctStatus('idle');
      return;
    }
    const { lat, lng } = selectedAddress;
    setPrecinctStatus('loading');

    const url =
      `https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/Open_Data/FeatureServer/44/query` +
      `?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326` +
      `&spatialRel=esriSpatialRelWithin&outFields=PRECINCT,PCT,PRC_NAME,LOCATION,ADDRESS,CITY,ZIP&f=json`;

    fetch(url, { signal: AbortSignal.timeout(8000) })
      .then(r => r.json())
      .then((res: { features?: { attributes: Record<string, string> }[] }) => {
        const feat = res.features?.[0]?.attributes;
        if (!feat) { setVotingPrecinct(null); setPrecinctStatus('done'); return; }
        setVotingPrecinct({
          precinct: feat.PRECINCT ?? '',
          pct:      feat.PCT ?? '',
          prcName:  feat.PRC_NAME ?? '',
          location: feat.LOCATION ?? '',
          address:  feat.ADDRESS ?? '',
          city:     feat.CITY ?? '',
          zip:      feat.ZIP ?? '',
        });
        setPrecinctStatus('done');
      })
      .catch(() => setPrecinctStatus('error'));
  }, [selectedAddress]);

  // ── Lead service line lookup by neighborhood ─────────────────────────────────
  const [leadRecord, setLeadRecord] = useState<LeadNeighborhoodRecord | null>(null);

  useEffect(() => {
    if (!selectedAddress?.neighborhood) {
      setLeadRecord(null);
      return;
    }
    const key = stripNeighborhoodName(selectedAddress.neighborhood);
    fetch('/data/lead_service_lines.json')
      .then((res) => res.json())
      .then((data: LeadServiceData) => {
        // Try exact stripped key first, then scan all keys for closest match
        const directMatch = data[key];
        if (directMatch) { setLeadRecord(directMatch); return; }
        // Fallback: scan all keys
        const entry = Object.entries(data).find(([k]) => k === key || stripNeighborhoodName(k) === key);
        setLeadRecord(entry ? entry[1] : null);
      })
      .catch(() => setLeadRecord(null));
  }, [selectedAddress?.neighborhood]);

  // ── CAGIS geographic context ─────────────────────────────────────────────────
  const [zoning, setZoning] = useState<Record<string, unknown>[]>([]);
  const [zoningStatus, setZoningStatus] = useState<CAGISStatus>('idle');

  const [floodZone, setFloodZone] = useState<Record<string, unknown>[]>([]);
  const [floodStatus, setFloodStatus] = useState<CAGISStatus>('idle');

  const [historicDistrict, setHistoricDistrict] = useState<Record<string, unknown>[]>([]);
  const [historicStatus, setHistoricStatus] = useState<CAGISStatus>('idle');

  const [nearbyParks, setNearbyParks] = useState<Record<string, unknown>[]>([]);
  const [parksStatus, setParksStatus] = useState<CAGISStatus>('idle');

  // ── OHGO traffic data ─────────────────────────────────────────────────────────
  const [ohgoIncidents, setOhgoIncidents] = useState<OHGOIncident[]>([]);
  const [ohgoCameras, setOhgoCameras] = useState<OHGOCamera[]>([]);
  const [ohgoConstruction, setOhgoConstruction] = useState<OHGOConstruction[]>([]);
  const [ohgoStatus, setOhgoStatus] = useState<CAGISStatus>('idle');

  useEffect(() => {
    if (!selectedAddress) return;
    const { lat, lng } = selectedAddress;

    // Fire all four CAGIS queries in parallel
    setZoningStatus('loading');
    setFloodStatus('loading');
    setHistoricStatus('loading');
    setParksStatus('loading');

    fetchZoning(lat, lng)
      .then((d) => { setZoning(d); setZoningStatus('done'); })
      .catch(() => setZoningStatus('error'));

    fetchFloodZone(lat, lng)
      .then((d) => { setFloodZone(d); setFloodStatus('done'); })
      .catch(() => setFloodStatus('error'));

    fetchHistoricDistrict(lat, lng)
      .then((d) => { setHistoricDistrict(d); setHistoricStatus('done'); })
      .catch(() => setHistoricStatus('error'));

    fetchNearbyParks(lat, lng, 0.5)
      .then((d) => { setNearbyParks(d); setParksStatus('done'); })
      .catch(() => setParksStatus('error'));
  }, [selectedAddress]);

  // ── OHGO traffic data ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAddress || !ohgoEnabled) {
      setOhgoStatus('done'); // no key → skip without error
      return;
    }
    const { lat, lng } = selectedAddress;
    setOhgoStatus('loading');

    Promise.all([
      fetchOHGOIncidents(lat, lng, 1),
      fetchOHGOCameras(lat, lng, 1),
      fetchOHGOConstruction(lat, lng, 2),
    ]).then(([incidents, cameras, construction]) => {
      setOhgoIncidents(incidents);
      setOhgoCameras(cameras);
      setOhgoConstruction(construction);
      setOhgoStatus('done');
    }).catch(() => setOhgoStatus('error'));
  }, [selectedAddress]);

  // ── Geocoding — pure React, no native DOM listeners ──────────────────────────
  // Debounce: wait 300ms after the user stops typing before hitting Mapbox.
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.length < 3) {
      setSuggestions([]);
      return;
    }

    const apiKey = import.meta.env.VITE_GEOCODING_API_KEY as string;
    if (!apiKey) return;

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json` +
          `?country=US&bbox=-84.82,39.03,-84.26,39.35&types=address&access_token=${apiKey}`
        );
        const data = await res.json();
        // Keep full feature so handleAddressSelect can read .context for neighborhood
        setSuggestions((data.features ?? []).slice(0, 6) as MapboxFeature[]);
      } catch {
        setSuggestions([]);
      }
    }, 300);
  }, []);

  // When a suggestion is clicked: geocode is already done (Mapbox returns center in the feature)
  const handleAddressSelect = useCallback(
    (feature: MapboxFeature) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const addr = feature.place_name.split(',')[0].trim();
      const parts = addr.split(/\s+/);
      const streetNum = parts[0];
      const streetName = parts.slice(1).join(' ');

      // Extract neighborhood from Mapbox context (id prefix "neighborhood.")
      const neighborhoodCtx = feature.context?.find((c) => c.id.startsWith('neighborhood.'));
      // Fall back to locality (e.g. "Cincinnati") if no neighborhood in context
      const neighborhood = neighborhoodCtx?.text ?? undefined;

      setSelectedAddress({
        lat: feature.center[1],
        lng: feature.center[0],
        formatted: feature.place_name,
        street: addr,
        streetNum,
        streetName,
        neighborhood,
      });
      setSearchInput(feature.place_name);
      setSuggestions([]);
    },
    []
  );

  // Destroy the map when the tab is unmounted (user switches away).
  // Without this, map.current still holds the old Leaflet instance when the
  // component remounts, but mapContainer.current will be a NEW DOM element —
  // causing the "map already initialized" error or an invisible map.
  useEffect(() => {
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Initialize map + update markers whenever address or crime data changes.
  useEffect(() => {
    if (!selectedAddress || !mapContainer.current) return;

    // Detect stale map: after a remount the container element changes but
    // map.current still points to the old (detached) Leaflet instance.
    if (map.current) {
      try {
        const existingContainer = map.current.getContainer();
        if (existingContainer !== mapContainer.current) {
          map.current.remove();
          map.current = null;
        }
      } catch {
        map.current = null; // map was already removed
      }
    }

    if (!map.current) {
      map.current = L.map(mapContainer.current).setView(
        [selectedAddress.lat, selectedAddress.lng],
        15
      );
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map.current);
    } else {
      map.current.setView([selectedAddress.lat, selectedAddress.lng], 15);
    }

    // Force Leaflet to recalculate container size (needed if container was
    // invisible when the map was first created)
    map.current.invalidateSize();

    // Clear existing markers
    map.current.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
        map.current?.removeLayer(layer);
      }
    });

    // Add address marker
    L.marker([selectedAddress.lat, selectedAddress.lng])
      .bindPopup(`<strong>${selectedAddress.formatted}</strong>`)
      .addTo(map.current)
      .openPopup();

    // Add crime markers with privacy offset
    // Socrata returns coordinates as latitude_x / longitude_x at the top level
    mergedCrime.forEach((crime) => {
      const clat = parseFloat(String(crime.latitude_x ?? ''));
      const clng = parseFloat(String(crime.longitude_x ?? ''));
      if (!isNaN(clat) && !isNaN(clng) && clat !== 0 && clng !== 0) {
        const offset = (Math.random() - 0.5) * 0.002;
        L.circleMarker(
          [clat + offset, clng + offset],
          {
            radius: 5,
            fillColor: '#C8861A',
            color: '#1A4A6B',
            weight: 1,
            opacity: 0.7,
            fillOpacity: 0.6,
          }
        )
          .bindPopup(
            `<div class="text-sm"><strong>${crime.offense_type || crime.offense}</strong><br>${
              crime.date_reported || crime.datereported
            }</div>`
          )
          .addTo(map.current!);
      }
    });
  }, [selectedAddress, mergedCrime]);

  // TODO(reassess-ai-summary): The AI summary prompt and output quality need a deliberate review
  // pass. Questions to address:
  //   1. Is the model's framing (factual, not alarmist) producing outputs residents actually trust?
  //   2. Should we show the raw data points being sent so users can verify the summary?
  //   3. Is 2-3 paragraphs the right length, or is a bullet-point format more scannable?
  //   4. Should we add a "this summary is AI-generated" disclosure in the UI?
  // See CLAUDE.md "Known Issues" for context. — flagged April 2026
  const handleAiSummary = useCallback(async () => {
    if (!selectedAddress) return;

    setLoadingAi(true);
    setAiError(null);
    setAiSummary(null);
    try {
      const summary = {
        address: selectedAddress.formatted,
        inspections: inspections.data?.length || 0,
        violations: inspections.data?.filter((i: any) => i.result?.toLowerCase() === 'failed')
          .length,
        taxAbatements: taxAbatements.data?.length || 0,
        nearbyCrime: mergedCrime.length,
        blight: blight.data?.length || 0,
        transitStops: transitStops.length,
      };

      const systemPrompt =
        'You are a civic data assistant for Cincinnati. Summarize this property\'s public record in 2-3 paragraphs for a resident or tenant. Highlight notable issues: open violations, active tax abatement, high nearby crime. Be factual, not alarmist.';
      const userMessage = JSON.stringify(summary);

      const response = await callClaude(systemPrompt, userMessage, language);
      setAiSummary(response);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('AI summary error:', msg);
      setAiError(`Summary unavailable: ${msg}`);
    } finally {
      setLoadingAi(false);
    }
  }, [selectedAddress, inspections.data, taxAbatements.data, mergedCrime, blight.data, transitStops, language]);

  const crimeLoading = crimeOld.loading || crimeNew.loading;
  const crimeError = crimeOld.error || crimeNew.error;

  // ── UI tab state ──────────────────────────────────────────────────────────────
  const [propertyTab, setPropertyTab] = useState<'overview' | 'violations' | 'abatements'>('overview');
  const [amenitiesTab, setAmenitiesTab] = useState<'parks' | 'schools' | 'transit' | 'healthcare'>('parks');

  // Group crime by category for a quick breakdown chart
  const crimeByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const crime of mergedCrime) {
      const cat = String(crime.stars_category || crime.offense_type || crime.offense || 'Unknown');
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 6);
  }, [mergedCrime]);

  // Violations — inspections that failed
  const violations = (inspections.data || []).filter(
    (i: any) => /fail|viol|notice/i.test(String(i.data_status ?? ''))
  );

  // Lead risk level derived from neighborhood data
  const leadRiskLevel: 'high' | 'moderate' | 'low' | null = useMemo(() => {
    if (!leadRecord) return null;
    const { total, lead, unknown, galvanized } = leadRecord;
    if (total === 0) return null;
    const riskLines = lead + galvanized; // galvanized can leach lead
    const unknownLines = unknown;
    const riskPct = riskLines / total;
    const unknownPct = unknownLines / total;
    if (riskPct > 0.15 || (riskPct > 0 && unknownPct > 0.4)) return 'high';
    if (riskPct > 0 || unknownPct > 0.3) return 'moderate';
    return 'low';
  }, [leadRecord]);

  return (
    <div className="space-y-6">
      {/* Address Search */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('addressLookup.searchLabel', 'Enter Cincinnati Address')}
        </label>
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t('addressLookup.placeholder', 'Enter a Cincinnati street address…')}
            autoComplete="off"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A4A6B] focus:border-transparent text-base"
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-300 rounded-lg shadow-lg mt-1 overflow-hidden">
              {suggestions.map((feature, idx) => (
                <li key={idx}>
                  <button
                    onMouseDown={(e) => {
                      // Use onMouseDown to fire before onBlur dismisses the list
                      e.preventDefault();
                      handleAddressSelect(feature);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0"
                  >
                    <span className="font-medium">{feature.place_name.split(',')[0]}</span>
                    <span className="text-gray-500 ml-1 text-xs">
                      {feature.place_name.split(',').slice(1).join(',').trim()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Type at least 3 characters to search — results are limited to Cincinnati addresses.</p>
      </div>

      {/* ── Empty state: mission statement + preview ─────────────────────────── */}
      {!selectedAddress && (
        <div className="space-y-4">
          {/* Mission statement */}
          <div className="bg-[#1A4A6B] text-white rounded-xl p-6">
            <p className="text-base font-semibold mb-2">What you'll find for any Cincinnati address</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm text-blue-100">
              {[
                '🏘️ Zoning & property record',
                '🚨 Crime incidents (last 12 mo.)',
                '💧 Lead pipe risk level',
                '🌊 FEMA flood zone status',
                '🚌 Nearby bus stops',
                '🏫 Nearby schools',
                '🌳 Parks within ¾ mile',
                '🔧 311 & inspection history',
                '🚦 Live traffic incidents',
              ].map(item => (
                <span key={item} className="flex items-center gap-1.5">{item}</span>
              ))}
            </div>
            <p className="text-xs text-blue-200 mt-4">
              Data sourced from Cincinnati Open Data, CAGIS, FEMA, Census ACS, and SORTA — updated daily.
            </p>
          </div>

          {/* Preview cards — example data with clear labeling */}
          <div className="relative">
            {/* "Example data" watermark banner */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 px-2">
                Example · search your address to see real results
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <div className="opacity-60 pointer-events-none select-none space-y-3">
              {/* At a Glance bar preview */}
              <div className="bg-white rounded-lg shadow-sm px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">At a Glance · 4247 Edwards Rd, Hyde Park</p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[
                    { emoji: '🏘️', label: 'Zoning',   value: 'R-1A' },
                    { emoji: '🌊', label: 'Flood',    value: 'Zone X' },
                    { emoji: '🚨', label: 'Crime',    value: '4 incidents' },
                    { emoji: '💧', label: 'Lead',     value: 'Low risk' },
                    { emoji: '🚌', label: 'Transit',  value: '11 stops' },
                    { emoji: '🏫', label: 'Schools',  value: '3 nearby' },
                  ].map(({ emoji, label, value }) => (
                    <div key={label} className="flex flex-col items-center bg-gray-50 rounded-lg px-2 py-2.5 text-center">
                      <span className="text-base mb-0.5">{emoji}</span>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</span>
                      <span className="text-xs font-bold text-[#1A4A6B] mt-0.5">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sample data cards row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Property Record</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Zoning</span><span className="font-medium">R-1A Single Family</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Neighborhood</span><span className="font-medium">Hyde Park</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Historic</span><span className="font-medium text-amber-700">Hyde Park Historic Dist.</span></div>
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Lead Safety</p>
                  <div className="bg-green-50 rounded p-2 text-center">
                    <p className="text-green-700 font-semibold text-sm">Low Risk</p>
                    <p className="text-xs text-gray-500 mt-1">84% copper lines in this neighborhood</p>
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">AI Summary</p>
                  <p className="text-xs text-gray-500 italic leading-relaxed">
                    "This address is in the Hyde Park Historic District with low flood risk, 4 reported incidents nearby in the past year, and 11 bus stops within walking distance…"
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map container — always in DOM so mapContainer ref is always set.
          Hidden when no address selected. Same pattern as ChoroplethMap fix. */}
      <div className={selectedAddress ? 'bg-white rounded-lg shadow-sm p-6' : 'hidden'}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {t('addressLookup.mapLabel', 'Location & Nearby Crime')}
        </h3>
        <div
          ref={mapContainer}
          className="h-64 rounded-lg border border-gray-200"
        />
        <p className="text-xs text-gray-600 mt-2">
          {t(
            'addressLookup.crimeDisclaimer',
            'Crime locations shown at approximate block level for privacy.'
          )}
        </p>
      </div>

      {selectedAddress && (
        <>
          {/* ── Quick Status Bar ─────────────────────────────────────────────── */}
          <div className="bg-white rounded-lg shadow-sm px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">At a Glance</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {/* Zoning */}
              <div className="flex flex-col items-center bg-gray-50 rounded-lg px-2 py-2.5 text-center">
                <span className="text-base mb-0.5">🏙</span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">Zoning</span>
                {zoningStatus === 'loading' ? (
                  <span className="h-4 w-10 bg-gray-200 animate-pulse rounded mt-0.5" />
                ) : (
                  <span className="text-xs font-bold text-[#1A4A6B] mt-0.5 truncate max-w-full">
                    {zoning[0] ? String(zoning[0].ZONING ?? 'See card') : 'Outside'}
                  </span>
                )}
              </div>
              {/* Flood Zone */}
              <div className="flex flex-col items-center bg-gray-50 rounded-lg px-2 py-2.5 text-center">
                <span className="text-base mb-0.5">🌊</span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">Flood</span>
                {floodStatus === 'loading' ? (
                  <span className="h-4 w-10 bg-gray-200 animate-pulse rounded mt-0.5" />
                ) : (() => {
                  const zone = floodZone[0] ? String(floodZone[0].FLD_ZONE ?? 'X') : 'X';
                  const isHigh = ['AE','A','AO','AH','VE','V'].includes(zone);
                  return (
                    <span className={`text-xs font-bold mt-0.5 ${isHigh ? 'text-orange-600' : 'text-green-600'}`}>
                      Zone {zone}
                    </span>
                  );
                })()}
              </div>
              {/* Crime */}
              <div className="flex flex-col items-center bg-gray-50 rounded-lg px-2 py-2.5 text-center">
                <span className="text-base mb-0.5">🚨</span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">Crime</span>
                {crimeLoading ? (
                  <span className="h-4 w-8 bg-gray-200 animate-pulse rounded mt-0.5" />
                ) : (
                  <span className={`text-xs font-bold mt-0.5 ${mergedCrime.length > 10 ? 'text-orange-600' : mergedCrime.length > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {mergedCrime.length} nearby
                  </span>
                )}
              </div>
              {/* Transit */}
              <div className="flex flex-col items-center bg-gray-50 rounded-lg px-2 py-2.5 text-center">
                <span className="text-base mb-0.5">🚌</span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">Stops</span>
                {loadingTransit ? (
                  <span className="h-4 w-8 bg-gray-200 animate-pulse rounded mt-0.5" />
                ) : (
                  <span className="text-xs font-bold text-[#1A4A6B] mt-0.5">{transitStops.length} stops</span>
                )}
              </div>
              {/* Schools */}
              <div className="flex flex-col items-center bg-gray-50 rounded-lg px-2 py-2.5 text-center">
                <span className="text-base mb-0.5">🏫</span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">Schools</span>
                {loadingSchools ? (
                  <span className="h-4 w-8 bg-gray-200 animate-pulse rounded mt-0.5" />
                ) : (
                  <span className="text-xs font-bold text-[#1A4A6B] mt-0.5">{nearbySchools.length} nearby</span>
                )}
              </div>
              {/* Parks */}
              <div className="flex flex-col items-center bg-gray-50 rounded-lg px-2 py-2.5 text-center">
                <span className="text-base mb-0.5">🌳</span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">Parks</span>
                {parksStatus === 'loading' ? (
                  <span className="h-4 w-8 bg-gray-200 animate-pulse rounded mt-0.5" />
                ) : (
                  <span className="text-xs font-bold text-[#1A4A6B] mt-0.5">{nearbyParks.length} nearby</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Plain English Summary ─────────────────────────────────────────── */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-semibold text-gray-900">
                {t('addressLookup.aiSummary', 'Plain English Summary')}
              </h3>
              <button
                onClick={handleAiSummary}
                disabled={loadingAi}
                className="px-4 py-2 bg-[#1A4A6B] text-white rounded-lg hover:bg-[#143850] disabled:opacity-50 text-sm"
              >
                {loadingAi
                  ? t('addressLookup.generating', 'Generating...')
                  : t('addressLookup.explainRecord', 'Explain This Record')}
              </button>
            </div>
            {aiSummary ? (
              <div className="prose prose-sm max-w-none">{renderMarkdown(aiSummary)}</div>
            ) : aiError ? (
              <p className="text-sm text-red-600">{aiError}</p>
            ) : (
              <p className="text-sm text-gray-500 italic">
                {t('addressLookup.aiHint', 'Click "Explain This Record" to get a plain-language summary of all data found for this address.')}
              </p>
            )}
          </div>

          {/* ── Section: Property Record ──────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Property Record</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            {/* Tab switcher */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5 self-start w-fit">
              {(['overview', 'violations', 'abatements'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setPropertyTab(tab)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                    propertyTab === tab ? 'bg-white text-[#1A4A6B] shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {tab === 'violations' ? 'Inspections' : tab === 'abatements' ? 'Abatements & Blight' : 'Overview'}
                </button>
              ))}
            </div>

            {/* Overview tab */}
            {propertyTab === 'overview' && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className={`text-2xl font-bold ${inspections.loading ? 'text-gray-300' : inspections.data?.length ? 'text-[#C8861A]' : 'text-gray-400'}`}>
                      {inspections.loading ? '—' : inspections.data?.length ?? 0}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">Inspections</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className={`text-2xl font-bold ${inspections.loading ? 'text-gray-300' : violations.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {inspections.loading ? '—' : violations.length}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">Violations</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className={`text-2xl font-bold ${taxAbatements.loading ? 'text-gray-300' : taxAbatements.data?.length ? 'text-[#1A4A6B]' : 'text-gray-400'}`}>
                      {taxAbatements.loading ? '—' : taxAbatements.data?.length ?? 0}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">Abatements</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className={`text-2xl font-bold ${blight.loading ? 'text-gray-300' : blight.data?.length ? 'text-red-600' : 'text-green-600'}`}>
                      {blight.loading ? '—' : blight.data?.length ?? 0}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">Blight Flags</div>
                  </div>
                </div>
                {violations.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800">
                    ⚠ {violations.length} inspection violation{violations.length > 1 ? 's' : ''} found — see the Inspections tab for details.
                  </div>
                )}
                {blight.data && blight.data.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-800 mt-2">
                    🏚 {blight.data.length} blight flag{blight.data.length > 1 ? 's' : ''} nearby — see Abatements & Blight tab.
                  </div>
                )}
                {!inspections.loading && !taxAbatements.loading && !blight.loading &&
                  !inspections.data?.length && !taxAbatements.data?.length && !blight.data?.length && (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    ✓ No inspections, abatements, or blight records found for this address.
                  </p>
                )}

                {/* Contextual orgs — surface when property issues are found */}
                {!inspections.loading && !blight.loading &&
                  (violations.length > 0 || (blight.data && blight.data.length > 0)) && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Organizations that can help</p>
                    <CivicOrgsPanel
                      categories={['housing-eviction']}
                      intro="These organizations provide free legal aid, tenant advocacy, and housing services to Cincinnati residents dealing with violations or blight."
                    />
                  </div>
                )}
              </>
            )}

            {/* Inspections tab */}
            {propertyTab === 'violations' && (
              <>
                <p className="text-xs text-gray-500 italic mb-3">
                  Building and code enforcement inspection records within 200m.
                </p>
                {inspections.loading ? (
                  <p className="text-sm text-gray-400">Loading…</p>
                ) : inspections.data && inspections.data.length > 0 ? (
                  <div className="space-y-3">
                    {inspections.data.slice(0, 10).map((inspection: any, idx: number) => {
                      const status = inspection.data_status ?? '';
                      const isFailed = /fail|viol|notice/i.test(status);
                      return (
                        <div key={idx} className={`border-b border-gray-200 pb-2 last:border-b-0 ${isFailed ? 'bg-yellow-50 px-2 py-1 rounded' : ''}`}>
                          <div className={`text-sm font-medium ${isFailed ? 'text-red-900' : 'text-gray-900'}`}>
                            {inspection.comp_type_desc || 'Unknown'}
                          </div>
                          <div className="text-xs text-gray-600">{formatDate(inspection.entered_date)} — {status}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState message="No inspections found nearby" />
                )}
                <DataAttribution source="Inspections & Violations" uid="ivda-umw7" />
              </>
            )}

            {/* Abatements & Blight tab */}
            {propertyTab === 'abatements' && (
              <>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Tax Abatements</div>
                {taxAbatements.loading ? (
                  <p className="text-sm text-gray-400">Loading…</p>
                ) : taxAbatements.data && taxAbatements.data.length > 0 ? (
                  <div className="space-y-2 mb-5">
                    {taxAbatements.data.slice(0, 8).map((ab: any, idx: number) => (
                      <div key={idx} className="border-b border-gray-100 pb-2 last:border-b-0">
                        <div className="text-sm font-medium text-gray-900">{ab.type || 'Unknown'}</div>
                        <div className="text-xs text-gray-500">Neighborhood: {ab.neighborhood}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 mb-5">No tax abatements found nearby.</p>
                )}
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Blight & Property Maintenance</div>
                <p className="text-xs text-gray-500 italic mb-3">
                  Properties flagged under Cincinnati's PLAP program — vacant buildings, overgrown lots, structural hazards.
                </p>
                {blight.loading ? (
                  <p className="text-sm text-gray-400">Loading…</p>
                ) : blight.data && blight.data.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-lg font-bold text-[#C8861A]">{blight.data.length}</div>
                    <div className="text-sm text-gray-600">blight records found nearby</div>
                    {blight.data.slice(0, 5).map((record: any, idx: number) => (
                      <div key={idx} className="text-xs text-gray-600 border-t pt-2">
                        {record.sr_sub_type} — {formatDate(record.sr_recd_date)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No blight records found nearby.</p>
                )}
                <DataAttribution source="Tax Abatements · PLAP Blight" uid="tkp7-yf64" />
              </>
            )}
          </div>

          {/* ── Section: Safety & Environment ────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Safety &amp; Environment</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Nearby Crime — improved with category breakdown */}
            <DataCard
              title={t('addressLookup.crime', 'Nearby Crime (400m)')}
              loading={crimeLoading}
              error={crimeError}
              empty={mergedCrime.length === 0}
            >
              {mergedCrime.length > 0 ? (
                <>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className={`text-3xl font-bold ${mergedCrime.length > 15 ? 'text-red-600' : mergedCrime.length > 5 ? 'text-yellow-600' : 'text-gray-700'}`}>
                      {mergedCrime.length}
                    </span>
                    <span className="text-sm text-gray-500">incidents in the past year</span>
                  </div>
                  {crimeByCategory.length > 0 && (
                    <div className="mb-4 space-y-1.5">
                      {crimeByCategory.map(([cat, count]) => (
                        <div key={cat}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-gray-700 truncate max-w-[80%]">{cat}</span>
                            <span className="text-gray-400 font-medium ml-1">{count}</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full">
                            <div
                              className="h-1.5 rounded-full bg-[#C8861A]"
                              style={{ width: `${(count / crimeByCategory[0][1]) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Recent incidents</div>
                  <div className="space-y-2">
                    {mergedCrime.slice(0, 5).map((crime: any, idx: number) => (
                      <div key={idx} className="border-b border-gray-100 pb-1.5 last:border-0">
                        <div className="text-xs font-medium text-gray-900">
                          {crime.stars_category || crime.offense_type || crime.offense || 'Unknown'}
                        </div>
                        <div className="text-[10px] text-gray-400">{formatDate(crime.date_reported || crime.datereported)}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState message={t('addressLookup.noCrime', 'No crime records found nearby')} />
              )}
              <DataAttribution source="CPD STARS + PDI Crime" uid="7aqy-xrv9" />
              {/* Contextual orgs for high crime areas */}
              {!crimeLoading && mergedCrime.length > 10 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Community resources</p>
                  <CivicOrgsPanel
                    categories={['police-accountability']}
                    intro="Organizations working on public safety, police accountability, and community advocacy in Cincinnati."
                  />
                </div>
              )}
            </DataCard>

            {/* FEMA Flood Zone */}
            <DataCard
              title={t('addressLookup.flood', 'FEMA Flood Hazard Zone')}
              loading={floodStatus === 'loading'}
              error={floodStatus === 'error' ? 'Flood data unavailable (FEMA NFHL)' : null}
            >
              {floodStatus === 'done' && floodZone.length > 0 ? (() => {
                const highRiskZones = ['AE', 'A', 'AO', 'AH', 'VE', 'V'];
                const isAnyHighRisk = floodZone.some(f => highRiskZones.includes(String(f.FLD_ZONE ?? '')));
                return (
                  <div className="space-y-3">
                    {floodZone.map((f, i) => {
                      const zone = String(f.FLD_ZONE ?? 'Unknown');
                      const isHighRisk = highRiskZones.includes(zone);
                      return (
                        <div key={i} className="flex items-start gap-3">
                          <span className={`mt-0.5 px-2 py-0.5 rounded text-sm font-bold shrink-0 ${isHighRisk ? 'bg-orange-600 text-white' : 'bg-green-600 text-white'}`}>
                            Zone {zone}
                          </span>
                          <div>
                            <p className="text-sm text-gray-700">
                              {isHighRisk
                                ? 'Special Flood Hazard Area — at least a 1% annual chance of flooding. Flood insurance is required for federally-backed mortgages.'
                                : 'Minimal flood hazard — outside the special flood hazard area.'}
                            </p>
                            {String(f.ZONE_SUBTY ?? '') && (
                              <p className="text-xs text-gray-500 mt-1">{String(f.ZONE_SUBTY)}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Mill Creek infrastructure context — shown for high-risk properties */}
                    {isAnyHighRisk && (
                      <div className="pt-2 border-t border-gray-100 space-y-3">
                        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                          <p className="text-xs font-semibold text-blue-800 mb-1.5">Cincinnati Flood Infrastructure</p>
                          <p className="text-xs text-blue-700 leading-relaxed">
                            Most of Cincinnati&apos;s flood risk comes from the <strong>Mill Creek watershed</strong>, a 30-mile
                            corridor running from Butler County through Norwood, Westwood, and Lower Price Hill before
                            joining the Ohio River. MSDGC operates the <strong>Mill Creek Barrier</strong> — a movable flood
                            gate near the river confluence — along with several miles of levees that protect portions of
                            the lower watershed. However, large sections upstream (including Roselawn, Norwood, and
                            communities north of I-74) are outside the protected zone.
                          </p>
                        </div>
                        <div className="rounded-lg bg-orange-50 border border-orange-100 p-3">
                          <p className="text-xs font-semibold text-orange-800 mb-2">What to do if you&apos;re in a flood zone</p>
                          <div className="space-y-2">
                            <div className="flex items-start gap-2">
                              <span className="text-orange-500 font-bold text-xs mt-0.5 shrink-0">1.</span>
                              <p className="text-xs text-orange-700">
                                <strong>Get flood insurance.</strong> Your homeowner&apos;s policy does not cover flooding.
                                Purchase through the National Flood Insurance Program (NFIP) — federally-backed mortgages
                                (FHA, VA, Fannie Mae) require it in SFHA zones.
                              </p>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="text-orange-500 font-bold text-xs mt-0.5 shrink-0">2.</span>
                              <p className="text-xs text-orange-700">
                                <strong>Check your elevation certificate.</strong> If your structure is elevated above
                                the base flood elevation, your NFIP premium can be significantly lower. Contact Hamilton
                                County or your insurance agent for records.
                              </p>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="text-orange-500 font-bold text-xs mt-0.5 shrink-0">3.</span>
                              <p className="text-xs text-orange-700">
                                <strong>Think you&apos;re mismapped?</strong> You can apply for a{' '}
                                <a
                                  href="https://hazards.fema.gov/femaportal/onlinelomc/signin"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline text-orange-800"
                                >
                                  Letter of Map Amendment (LOMA)
                                </a>{' '}
                                through FEMA to correct your flood zone designation at no cost.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Low-risk note */}
                    {!isAnyHighRisk && (
                      <p className="text-xs text-gray-500 pt-1">
                        Zone X properties can still flood from local drainage issues — 25% of NFIP claims come
                        from outside high-risk zones. Flood insurance is available and affordable for lower-risk
                        properties through the{' '}
                        <a href="https://www.floodsmart.gov" target="_blank" rel="noopener noreferrer" className="underline">
                          NFIP
                        </a>.
                      </p>
                    )}
                  </div>
                );
              })() : floodStatus === 'done' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-sm font-bold bg-green-600 text-white">Zone X</span>
                    <p className="text-sm text-gray-700">Minimal flood hazard area.</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    Zone X properties can still flood from local drainage issues — 25% of NFIP claims come
                    from outside high-risk zones. Flood insurance is available and affordable for lower-risk
                    properties through the{' '}
                    <a href="https://www.floodsmart.gov" target="_blank" rel="noopener noreferrer" className="underline">
                      NFIP
                    </a>.
                  </p>
                </div>
              ) : null}
              <DataAttribution source="FEMA National Flood Hazard Layer (NFHL)" url="https://msc.fema.gov/portal/home" />
            </DataCard>
          </div>

          {/* ── Lead Service Line Risk ─────────────────────────────────────────── */}
          {selectedAddress?.neighborhood && leadRecord && leadRiskLevel !== null && (
            <DataCard title="Lead Service Line Risk">
              {(() => {
                const { name, total, lead, unknown, galvanized, replaced, asOf } = leadRecord;
                const riskLines = lead + galvanized;
                const riskColor =
                  leadRiskLevel === 'high'     ? 'text-red-600'    :
                  leadRiskLevel === 'moderate' ? 'text-orange-600' : 'text-green-600';
                const riskBg =
                  leadRiskLevel === 'high'     ? 'bg-red-50 border-red-200'    :
                  leadRiskLevel === 'moderate' ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200';
                const riskLabel =
                  leadRiskLevel === 'high'     ? 'Elevated Risk' :
                  leadRiskLevel === 'moderate' ? 'Moderate Risk' : 'Lower Risk';

                return (
                  <div className="space-y-4">
                    {/* Summary banner */}
                    <div className={`rounded-lg border px-4 py-3 ${riskBg}`}>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className={`text-2xl font-bold ${riskColor}`}>{riskLabel}</span>
                        <span className="text-xs text-gray-500">{name}</span>
                      </div>
                      <p className={`text-xs leading-relaxed ${leadRiskLevel === 'high' ? 'text-red-800' : leadRiskLevel === 'moderate' ? 'text-orange-800' : 'text-green-800'}`}>
                        {leadRiskLevel === 'high'
                          ? `${riskLines} of ${total} service lines in ${name} are lead or galvanized — materials that can leach lead into drinking water. GCWW's free replacement program covers the service line to your home; contact them to find out when your neighborhood is scheduled.`
                          : leadRiskLevel === 'moderate'
                          ? `${riskLines > 0 ? `${riskLines} lead/galvanized lines detected.` : ''} ${unknown > 0 ? `${unknown} lines have unknown material — may warrant testing.` : ''} Getting your water tested is a free, low-effort first step.`
                          : `${replaced} lines replaced, ${lead + galvanized === 0 ? 'no known lead/galvanized lines' : `${riskLines} may still need attention`} in ${name}. Even a lower-risk service line doesn't rule out lead from interior plumbing in older homes.`}
                      </p>
                    </div>

                    {/* Breakdown */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: 'Total', value: total, color: 'text-gray-700' },
                        { label: 'Lead/Galv.', value: riskLines, color: riskLines > 0 ? 'text-red-600' : 'text-gray-400' },
                        { label: 'Unknown', value: unknown, color: unknown > 0 ? 'text-orange-600' : 'text-gray-400' },
                        { label: 'Replaced', value: replaced, color: replaced > 0 ? 'text-green-600' : 'text-gray-400' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="bg-gray-50 rounded-lg py-2">
                          <div className={`text-lg font-bold ${color}`}>{value}</div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
                        </div>
                      ))}
                    </div>

                    {leadRiskLevel !== 'low' && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-semibold text-blue-800">What you can do now</p>
                        <ul className="text-xs text-blue-700 space-y-1.5 list-none">
                          <li>→ <strong>Get your water tested first</strong> — it's free and immediate. GCWW offers <a href="https://la.mygcww.org/lead/" target="_blank" rel="noopener noreferrer" className="underline">free lead test kits</a>. This tells you what's actually in your tap water regardless of service line status.</li>
                          <li>→ <strong>Contact GCWW at (513) 591-7700</strong> to find out when your neighborhood is scheduled for the replacement program and to make sure your address is on their list. You can't request immediate replacement — the program works neighborhood by neighborhood.</li>
                          <li>→ <strong>Use an NSF-certified lead filter</strong> (pitcher or faucet-mount) on drinking taps in the meantime — especially if children or pregnant residents are in the home.</li>
                          <li>→ <strong>If your home was built before 1986</strong>, interior pipes and solder joints may also contain lead. Service line replacement won't address this — a water test and certified filter are your best protection for interior plumbing.</li>
                        </ul>
                      </div>
                    )}

                    {/* Contextual orgs */}
                    <div className="pt-2 border-t border-gray-100">
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Contact these programs directly</p>
                      <CivicOrgsPanel
                        categories={['environmental-health']}
                        intro={`GCWW and the Cincinnati Health Department both have free lead programs. Data shown is for ${name} (as of ${asOf}).`}
                      />
                    </div>
                  </div>
                );
              })()}
              <DataAttribution source="Cincinnati Health Dept. Lead Service Line Inventory" url="https://www.cincinnati-oh.gov/health/health-lived-here/lead-poisoning-prevention/" />
            </DataCard>
          )}

          {/* ── Section: Location Context ─────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Location Context</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Zoning */}
            <DataCard
              title={t('addressLookup.zoning', 'Zoning Designation')}
              loading={zoningStatus === 'loading'}
              error={zoningStatus === 'error' ? 'Zoning data unavailable (CAGIS)' : null}
            >
              {zoningStatus === 'done' && zoning.length > 0 ? (
                <div>
                  {zoning.map((z, i) => {
                    const code = String(z.ZONING ?? z.NAME ?? z.ZONE ?? z.ZONING_CODE ?? 'Unknown');
                    const desc = String(z.DIS_NAME ?? z.DESCRIPTION ?? z.ZONE_CLASS ?? z.FULL_NAME ?? '');
                    const zoneType = String(z.ZONE_TYPE ?? '');
                    return (
                      <div key={i} className="flex items-start gap-3">
                        <span className="mt-0.5 px-2 py-0.5 rounded text-sm font-bold bg-[#1A4A6B] text-white shrink-0">{code}</span>
                        <div>
                          {desc && <p className="text-sm text-gray-700">{desc}</p>}
                          {zoneType && <p className="text-xs text-gray-500">{zoneType}</p>}
                          <p className="text-xs text-gray-500 mt-1">Affects what can be built, renovated, or operated at this address.</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : zoningStatus === 'done' ? (
                <EmptyState message="Address outside Cincinnati zoning boundary" />
              ) : null}
              <DataAttribution source="Zoning — CAGIS" url="https://cagis.hamilton-co.org/" />
            </DataCard>

            {/* Historic District */}
            <DataCard
              title={t('addressLookup.historic', 'Historic District')}
              loading={historicStatus === 'loading'}
              error={historicStatus === 'error' ? 'Historic district data unavailable (CAGIS)' : null}
            >
              {historicStatus === 'done' && historicDistrict.length > 0 ? (
                <div className="space-y-2">
                  {historicDistrict.map((h, i) => {
                    const name = String(h.NAME ?? h.DIST_NAME ?? h.DISTRICT_NAME ?? 'Historic District');
                    const year = h.YEAR_DESG ?? h.DESIG_YEAR ?? '';
                    const cls = String(h.DIST_CLASS ?? h.CLASS ?? '');
                    return (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-[#C8861A] text-lg shrink-0">🏛</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{name}</p>
                          {(cls || year) && (
                            <p className="text-xs text-gray-500">{[cls, year ? `Designated ${year}` : ''].filter(Boolean).join(' · ')}</p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">Renovation and exterior work may require Historic Preservation approval.</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : historicStatus === 'done' ? (
                <EmptyState message="Not in a Cincinnati historic district" />
              ) : null}
              <DataAttribution source="Cincinnati Historic Districts — CAGIS" url="https://cagis.hamilton-co.org/" />
            </DataCard>
          </div>

          {/* ── Section: Amenities & Access ───────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Amenities &amp; Access</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            {/* Tab switcher */}
            <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1 mb-5 self-start w-fit">
              {(['parks', 'schools', 'transit', 'healthcare'] as const).map((tab) => {
                const counts = {
                  parks:      nearbyParks.length,
                  schools:    nearbySchools.length,
                  transit:    transitStops.length,
                  healthcare: nearbyHealthcare.length,
                };
                const loading = {
                  parks:      parksStatus === 'loading',
                  schools:    loadingSchools,
                  transit:    loadingTransit,
                  healthcare: loadingHealthcare,
                };
                const icons = { parks: '🌳', schools: '🏫', transit: '🚌', healthcare: '🏥' };
                const labels = { parks: 'Parks', schools: 'Schools', transit: 'Transit', healthcare: 'Healthcare' };
                return (
                  <button
                    key={tab}
                    onClick={() => setAmenitiesTab(tab)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors flex items-center gap-1.5 ${
                      amenitiesTab === tab ? 'bg-white text-[#1A4A6B] shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {icons[tab]}
                    {labels[tab]}
                    {!loading[tab] && (
                      <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${
                        amenitiesTab === tab ? 'bg-[#1A4A6B] text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {counts[tab]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Parks tab */}
            {amenitiesTab === 'parks' && (
              <>
                {parksStatus === 'loading' ? (
                  <p className="text-sm text-gray-400">Loading parks…</p>
                ) : nearbyParks.length > 0 ? (
                  <div className="space-y-2">
                    {nearbyParks.slice(0, 6).map((p, i) => {
                      const name = String(p.PARK_NAME ?? `Park ${i + 1}`);
                      const acres = p.PARK_SIZE_ACRES != null ? `${Number(p.PARK_SIZE_ACRES).toFixed(1)} ac` : '';
                      const designation = String(p.PARK_DESIGNATION ?? '');
                      return (
                        <div key={i} className="flex items-center justify-between border-b border-gray-100 pb-1.5 last:border-0">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{name}</p>
                            {designation && <p className="text-xs text-gray-500">{designation}</p>}
                          </div>
                          {acres && <span className="text-xs text-[#1A4A6B] font-medium shrink-0 ml-2">{acres}</span>}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState message="No parks found within 0.5 miles" />
                )}
                <DataAttribution source="Cincinnati Parks & Greenspace — CAGIS" url="https://cagis.hamilton-co.org/" />
              </>
            )}

            {/* Schools tab */}
            {amenitiesTab === 'schools' && (
              <>
                {loadingSchools ? (
                  <p className="text-sm text-gray-400">Loading schools…</p>
                ) : nearbySchools.length > 0 ? (
                  <div className="space-y-3">
                    {nearbySchools.slice(0, 8).map((school, idx) => {
                      const typeLC = school.type.toLowerCase();
                      const badgeClass =
                        typeLC.includes('elementary') ? 'bg-green-100 text-green-800' :
                        typeLC.includes('middle')     ? 'bg-blue-100 text-blue-800'   :
                        typeLC.includes('high')       ? 'bg-purple-100 text-purple-800' :
                                                        'bg-gray-100 text-gray-700';
                      const isPublic = school.fund?.toLowerCase() === 'public';
                      return (
                        <div key={idx} className="border-b border-gray-100 pb-2 last:border-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-gray-900 leading-tight">{school.name}</p>
                            <span className="text-xs text-gray-400 shrink-0 mt-0.5">{school.distance.toFixed(2)} mi</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {school.type && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badgeClass}`}>{school.type}</span>
                            )}
                            {school.grade && <span className="text-[10px] text-gray-500">Grades {school.grade}</span>}
                            <span className={`text-[10px] font-medium ${isPublic ? 'text-[#1A4A6B]' : 'text-gray-500'}`}>
                              {isPublic ? '● Public' : '○ Private'}
                            </span>
                          </div>
                          {school.district && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{school.district}</p>}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState message="No schools found within 1 mile" />
                )}
                <DataAttribution source="Countywide School Locations — CAGIS" url="https://cagis.hamilton-co.org/" />
              </>
            )}

            {/* Transit tab */}
            {amenitiesTab === 'transit' && (
              <>
                {loadingTransit ? (
                  <p className="text-sm text-gray-400">Loading transit stops…</p>
                ) : transitStops.length > 0 ? (
                  <div className="space-y-3">
                    {transitStops.map((stop, idx) => (
                      <div key={idx} className="border-b border-gray-200 pb-2 last:border-b-0">
                        <div className="text-sm font-medium text-gray-900">{stop.stop_name}</div>
                        <div className="text-xs text-gray-600">
                          {stop.distance.toFixed(2)} mi{stop.routes.length > 0 ? ` · Routes: ${stop.routes.join(', ')}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState message={t('addressLookup.noTransit', 'No stops within 0.5 miles')} />
                )}
                <DataAttribution source="SORTA GTFS Bus Stops" uid="sorta-stops" />
              </>
            )}

            {/* Healthcare tab */}
            {amenitiesTab === 'healthcare' && (() => {
              // Type labels and ordering
              const TYPE_ORDER = ['hospital', 'urgent_care', 'mental_health', 'substance_use', 'clinic', 'dentist', 'pharmacy'];
              const TYPE_LABELS: Record<string, string> = {
                hospital:      'Hospital',
                urgent_care:   'Urgent Care',
                clinic:        'Clinic / Health Center',
                mental_health: 'Mental Health',
                substance_use: 'Substance Use Treatment',
                dentist:       'Dental',
                pharmacy:      'Pharmacy',
              };
              const TYPE_ICONS: Record<string, string> = {
                hospital:      '🏥',
                urgent_care:   '🚑',
                clinic:        '🏨',
                mental_health: '🧠',
                substance_use: '💊',
                dentist:       '🦷',
                pharmacy:      '💊',
              };
              // Group by type, sorted by TYPE_ORDER
              const grouped = TYPE_ORDER
                .map((type) => ({
                  type,
                  facilities: nearbyHealthcare.filter((f) => f.type === type),
                }))
                .filter((g) => g.facilities.length > 0);

              const fqhcs = nearbyHealthcare.filter((f) => f.fqhc);

              return (
                <>
                  {loadingHealthcare ? (
                    <p className="text-sm text-gray-400">Loading healthcare facilities…</p>
                  ) : nearbyHealthcare.length > 0 ? (
                    <div className="space-y-4">
                      {/* FQHC highlight banner */}
                      {fqhcs.length > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <p className="text-xs font-semibold text-green-800 mb-1">
                            🏅 Federally Qualified Health Centers nearby ({fqhcs.length})
                          </p>
                          <p className="text-[10px] text-green-700">
                            FQHCs provide sliding-scale care regardless of ability to pay or insurance status.
                          </p>
                          {fqhcs.slice(0, 3).map((f, i) => (
                            <div key={i} className="mt-1.5 text-xs text-green-900 font-medium">
                              {f.name} · {f.distance.toFixed(2)} mi
                            </div>
                          ))}
                        </div>
                      )}

                      {grouped.map(({ type, facilities }) => (
                        <div key={type}>
                          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                            {TYPE_ICONS[type]} {TYPE_LABELS[type] ?? type} ({facilities.length})
                          </div>
                          <div className="space-y-2">
                            {facilities.slice(0, 6).map((f, idx) => (
                              <div key={idx} className="border-b border-gray-100 pb-2 last:border-b-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-900 flex items-center gap-1">
                                      {f.name}
                                      {f.fqhc && (
                                        <span className="text-[9px] bg-green-100 text-green-700 font-bold px-1 py-0.5 rounded">FQHC</span>
                                      )}
                                    </div>
                                    {f.address && (
                                      <div className="text-[11px] text-gray-500 truncate">{f.address}</div>
                                    )}
                                    {f.phone && (
                                      <a href={`tel:${f.phone}`} className="text-[11px] text-[#1A4A6B] hover:underline">
                                        {f.phone}
                                      </a>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500 shrink-0">{f.distance.toFixed(2)} mi</div>
                                </div>
                              </div>
                            ))}
                            {facilities.length > 6 && (
                              <p className="text-[10px] text-gray-400 italic">
                                + {facilities.length - 6} more within 1 mile
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="No healthcare facilities found within 1 mile" />
                  )}
                  <DataAttribution source="OpenStreetMap / Overpass API · HRSA Health Center Finder" uid="healthcare-facilities" />
                </>
              );
            })()}
          </div>

          {/* ── Section: Your Representatives ─────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Politics &amp; Government</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Voting Precinct */}
          <DataCard
            title="Your Voting Precinct"
            loading={precinctStatus === 'loading'}
            error={precinctStatus === 'error' ? 'Could not load precinct data' : null}
          >
            {precinctStatus === 'done' && !votingPrecinct && (
              <p className="text-sm text-gray-500 italic">No precinct found for this address. Verify the address is within Cincinnati city limits.</p>
            )}
            {votingPrecinct && (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">🗳️</span>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{votingPrecinct.precinct}</div>
                    {votingPrecinct.prcName && votingPrecinct.prcName !== votingPrecinct.precinct && (
                      <div className="text-xs text-gray-500 mt-0.5">{votingPrecinct.prcName}</div>
                    )}
                  </div>
                </div>
                {votingPrecinct.location && (
                  <div className="flex items-start gap-3">
                    <span className="text-lg shrink-0">📍</span>
                    <div>
                      <div className="text-xs font-semibold text-gray-700 uppercase tracking-widest mb-0.5">Polling Place</div>
                      <div className="text-sm text-gray-900">{votingPrecinct.location}</div>
                      {votingPrecinct.address && (
                        <div className="text-xs text-gray-500">
                          {votingPrecinct.address}{votingPrecinct.city ? `, ${votingPrecinct.city}` : ''}{votingPrecinct.zip ? ` ${votingPrecinct.zip}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="pt-2 border-t border-gray-100 flex flex-wrap gap-3 text-xs">
                  <a
                    href="https://voterlookup.ohiosos.gov/voterlookup.aspx"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1A4A6B] hover:underline"
                  >
                    Verify registration →
                  </a>
                  <a
                    href="https://www.votehamiltoncountyohio.gov/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1A4A6B] hover:underline"
                  >
                    Hamilton County Board of Elections →
                  </a>
                </div>
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <DataAttribution source="Hamilton County CAGIS · Voting Precincts" url="https://cagis.hamilton-co.org/" />
            </div>
          </DataCard>

          <DataCard title="Cincinnati City Council">
            <CouncilPanel compact />
          </DataCard>

          {/* ── Section: Civic Action Windows ─────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Civic Action Windows</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-lg font-semibold text-gray-900">Upcoming Public Meetings</h3>
              <a
                href="https://cincinnatioh.legistar.com/Calendar.aspx"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#1A4A6B] hover:underline shrink-0 ml-3"
              >
                Full calendar →
              </a>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              These are the meetings where Cincinnati residents can speak directly to the people making decisions
              about your neighborhood — zoning, development, policing, housing, and budget.
            </p>
            <CivicCalendar weeksAhead={8} />
          </div>

          {/* ── Section: Traffic & Infrastructure ────────────────────────────── */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Traffic &amp; Infrastructure</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <p className="text-xs text-gray-500 -mt-3">
            Coverage note: OHGO data comes from the Ohio Dept. of Transportation and covers state-managed roads only — interstates (I-71, I-75, I-74) and state routes. Incidents on Cincinnati city streets are not included.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── OHGO: Traffic & Road Conditions ──────────────────────────── */}
            <DataCard
              title="Active Traffic Incidents (1 mi)"
              loading={ohgoStatus === 'loading'}
              error={ohgoStatus === 'error' ? 'OHGO traffic data unavailable' : null}
            >
              {!ohgoEnabled ? (
                <div className="text-xs text-gray-500 space-y-1">
                  <p className="font-medium text-gray-700">Enable live traffic data</p>
                  <p>Register for a free API key at <span className="text-[#1A4A6B] font-mono">ohgo.com</span>, then add <span className="font-mono">VITE_OHGO_API_KEY=your_key</span> to <span className="font-mono">.env.local</span>.</p>
                </div>
              ) : ohgoStatus === 'done' && ohgoIncidents.length > 0 ? (
                <div className="space-y-2">
                  {ohgoIncidents.slice(0, 6).map((inc) => {
                    const isBlock = /clos|block/i.test(inc.roadStatus);
                    return (
                      <div key={inc.id} className={`border-b border-gray-100 pb-2 last:border-0 ${isBlock ? 'bg-orange-50 px-2 py-1 rounded' : ''}`}>
                        <div className={`text-sm font-medium ${isBlock ? 'text-orange-900' : 'text-gray-900'}`}>
                          {inc.category || 'Incident'}{inc.routeName ? ` — ${inc.routeName}` : ''}
                        </div>
                        <div className="text-xs text-gray-600">{inc.location}</div>
                        {inc.description && inc.description !== inc.location && (
                          <div className="text-xs text-gray-500 italic">{inc.description}</div>
                        )}
                        {isBlock && (
                          <span className="inline-block mt-1 text-xs bg-orange-600 text-white px-1.5 py-0.5 rounded">Road affected</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : ohgoStatus === 'done' ? (
                <EmptyState message="No active incidents within 1 mile" />
              ) : null}
              <DataAttribution source="OHGO — Ohio Dept of Transportation" url="https://www.ohgo.com/" />
            </DataCard>

            <DataCard
              title="Construction & Work Zones (2 mi)"
              loading={ohgoStatus === 'loading'}
              error={null}
            >
              {!ohgoEnabled ? (
                <p className="text-xs text-gray-500">Requires OHGO API key (see Active Traffic Incidents card).</p>
              ) : ohgoStatus === 'done' && ohgoConstruction.length > 0 ? (
                <div className="space-y-2">
                  {ohgoConstruction.slice(0, 5).map((c) => (
                    <div key={c.id} className="border-b border-gray-100 pb-2 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-600 text-sm shrink-0">🚧</span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{c.routeName || 'Work Zone'}</p>
                          <p className="text-xs text-gray-600">{c.location}</p>
                          {c.description && c.description !== c.location && (
                            <p className="text-xs text-gray-500">{c.description}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : ohgoStatus === 'done' ? (
                <EmptyState message="No active work zones within 2 miles" />
              ) : null}
              <DataAttribution source="OHGO — Ohio Dept of Transportation" url="https://www.ohgo.com/" />
            </DataCard>

            <DataCard
              title="Nearby Traffic Cameras (1 mi)"
              loading={ohgoStatus === 'loading'}
              error={null}
            >
              {!ohgoEnabled ? (
                <p className="text-xs text-gray-500">Requires OHGO API key (see Active Traffic Incidents card).</p>
              ) : ohgoStatus === 'done' && ohgoCameras.length > 0 ? (
                <div className="space-y-3">
                  {ohgoCameras.slice(0, 3).map((cam) => {
                    const view = cam.views[0];
                    return (
                      <div key={cam.id}>
                        <p className="text-sm font-medium text-gray-900 mb-1">
                          {cam.location}{view?.direction ? ` — ${view.direction}` : ''}
                        </p>
                        {view?.smallUrl && view.smallUrl !== 'undefined' ? (
                          <a href={view.largeUrl || view.smallUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={view.smallUrl}
                              alt={`Traffic camera: ${cam.location}`}
                              className="w-full rounded border border-gray-200 hover:opacity-90 transition-opacity"
                              loading="lazy"
                            />
                          </a>
                        ) : (
                          <p className="text-xs text-gray-500 italic">No snapshot available</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : ohgoStatus === 'done' ? (
                <EmptyState message="No traffic cameras within 1 mile" />
              ) : null}
              <DataAttribution source="OHGO — Ohio Dept of Transportation" url="https://www.ohgo.com/" />
            </DataCard>

          </div>

        </>
      )}
    </div>
  );
}
