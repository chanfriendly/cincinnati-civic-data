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
import { DataCard, EmptyState, DataAttribution, CivicOrgsPanel, CivicCalendar } from '../../components/ui';
import { C } from '../../components/ui/DesignAtoms';
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

interface AddressLookupProps {
  onTabChange?: (tab: import('../../types').TabId) => void;
}

export default function AddressLookup({ onTabChange }: AddressLookupProps = {}) {
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
            fillColor: C.ochre,
            color: C.riverDeep,
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

  // TODO(reassess-ai-summary): Open follow-ups on this feature:
  //   - Should we show the raw JSON payload being sent so users can verify the summary?
  //   - Should we add an "AI-generated" disclosure badge in the UI itself (currently only
  //     implicit in the section title)?
  // See CLAUDE.md "Known Issues" for context.
  const handleAiSummary = useCallback(async () => {
    if (!selectedAddress) return;

    setLoadingAi(true);
    setAiError(null);
    setAiSummary(null);
    try {
      const HIGH_FLOOD_ZONES = ['AE', 'A', 'AO', 'AH', 'VE', 'V'];
      const failedInspectionsCount = (inspections.data || []).filter(
        (i: any) => /fail|viol|notice/i.test(String(i.data_status ?? ''))
      ).length;
      const floodCode = floodZone[0] ? String(floodZone[0].FLD_ZONE ?? 'X') : 'X';
      const isHighFlood = HIGH_FLOOD_ZONES.includes(floodCode);
      const topCrimeTypes = Object.entries(
        mergedCrime.reduce<Record<string, number>>((acc, c) => {
          const k = String(c.stars_category || c.offense_type || c.offense || 'Unknown');
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        }, {})
      )
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([category, count]) => ({ category, count }));

      let leadSummary:
        | { riskLevel: 'high' | 'moderate' | 'low'; totalLines: number; knownLeadLines: number; galvanizedLines: number; unknownLines: number; replaced: number }
        | null = null;
      if (leadRecord && leadRecord.total > 0) {
        const riskLines = leadRecord.lead + leadRecord.galvanized;
        const riskPct = riskLines / leadRecord.total;
        const unknownPct = leadRecord.unknown / leadRecord.total;
        const riskLevel: 'high' | 'moderate' | 'low' =
          riskPct > 0.15 || (riskPct > 0 && unknownPct > 0.4)
            ? 'high'
            : riskPct > 0 || unknownPct > 0.3
              ? 'moderate'
              : 'low';
        leadSummary = {
          riskLevel,
          totalLines: leadRecord.total,
          knownLeadLines: leadRecord.lead,
          galvanizedLines: leadRecord.galvanized,
          unknownLines: leadRecord.unknown,
          replaced: leadRecord.replaced,
        };
      }

      const payload = {
        address: selectedAddress.formatted,
        neighborhood: selectedAddress.neighborhood ?? null,
        place: {
          zoning: zoning[0]
            ? {
                code: String(zoning[0].ZONING ?? ''),
                description: String(zoning[0].ZONE_DESCRIPTION ?? zoning[0].ZONEDESC ?? ''),
              }
            : null,
          floodZone: { code: floodCode, isHighRisk: isHighFlood },
          historicDistrict: historicDistrict[0]
            ? String(historicDistrict[0].DISTNAME ?? historicDistrict[0].NAME ?? '')
            : null,
        },
        property: {
          inspectionsLast12mo: inspections.data?.length || 0,
          failedOrViolationInspections: failedInspectionsCount,
          activeTaxAbatement: (taxAbatements.data?.length || 0) > 0,
          taxAbatementCount: taxAbatements.data?.length || 0,
          problemLandlordOrBlightCases: blight.data?.length || 0,
        },
        publicSafety: {
          crimeIncidentsWithin400mLast12mo: mergedCrime.length,
          topCrimeTypes,
          activeFreewayIncidents: ohgoIncidents.length,
          activeFreewayConstruction: ohgoConstruction.length,
        },
        neighborhoodHealth: {
          leadServiceLines: leadSummary,
        },
        amenities: {
          parksWithinHalfMile: nearbyParks.length,
          transitStopsWithinHalfMile: transitStops.length,
          schoolsWithinOneMile: nearbySchools.length,
          healthcare: {
            withinOneMile: nearbyHealthcare.length,
            hasFederallyQualifiedHealthCenter: nearbyHealthcare.some((f) => f.fqhc),
          },
        },
        civic: {
          pollingPlace: votingPrecinct
            ? { name: votingPrecinct.location, address: votingPrecinct.address }
            : null,
        },
      };

      const systemPrompt = `You are a civic-data assistant for a Cincinnati public-records platform. The user has looked up a property address. They may be a homeowner checking on their own home, a nurse or social worker preparing for a home visit, a neighbor, or a community advocate. The JSON in the user message summarizes what the city's public datasets know about that property and the surrounding area.

Your job is to answer: "What should someone know about this address?" Not what to ask before signing a lease — what to understand about the place itself. The summary should stand on its own; someone who never looks at a single chart should still walk away with what matters.

FORMAT
- Three short paragraphs. No headings, no bullet lists, no bold, no markdown.
- Plain English, 8th-grade reading level. Under 250 words total.
- Translate codes. "SF" or "R-SF" → "a single-family residential block." "Zone AE" → "a FEMA high-risk flood zone where standard homeowners insurance does not cover flood damage." Never leave a code unexplained.

PARAGRAPH STRUCTURE
1. Orient the reader. What kind of place is this — neighborhood character, zoning, flood zone, historic district status, and nearby amenities (transit, parks, schools, healthcare). 2–3 sentences that give a real sense of the location.
2. What stands out about this specific address. Lead with the most important finding. Possibilities: code violations or failed inspections on the building; high lead-service-line risk in the neighborhood (give the risk level and mention that old homes on this block are likely affected); a high-risk flood zone; an active tax abatement; a pattern in nearby crime worth naming. If there's nothing notable, say "no red flags in the public record" — that's a real and useful answer. Skip anything that's zero or ordinary.
3. What to do with this. Practical, address-specific next steps. For lead risk: homeowners can contact Greater Cincinnati Water Works (GCWW) for free service line testing; healthcare workers should note the risk for patients with children or who are pregnant. For code violations: look up the case at Cincinnati 311 or the Buildings & Inspections portal. For flood zone: check whether NFIP flood insurance is in place. Close every response with one sentence about what this does not cover: indoor hazards like mold or radon, eviction history, private disputes, and that the information here is only as current as the city's last data update.

TONE
- Direct, calm, practical. Speak about the place, not the spreadsheet.
- Never invent details not in the JSON. If a field is null or zero, skip it.
- No legal, medical, or financial advice — point to the right agency instead.`;

      const userMessage = JSON.stringify(payload);

      const response = await callClaude(systemPrompt, userMessage, language);
      setAiSummary(response);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('AI summary error:', msg);
      setAiError(`Summary unavailable: ${msg}`);
    } finally {
      setLoadingAi(false);
    }
  }, [
    selectedAddress,
    inspections.data,
    taxAbatements.data,
    mergedCrime,
    blight.data,
    transitStops,
    nearbyParks,
    nearbySchools,
    nearbyHealthcare,
    zoning,
    floodZone,
    historicDistrict,
    leadRecord,
    votingPrecinct,
    ohgoIncidents,
    ohgoConstruction,
    language,
  ]);

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
      <div className="rounded-md shadow-sm p-6" style={{ background: C.paper }}>
        <label className="block text-sm font-medium mb-2" style={{ color: C.ink }}>
          {t('addressLookup.searchLabel', 'Enter Cincinnati Address')}
        </label>
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t('addressLookup.placeholder', 'Enter a Cincinnati street address…')}
            autoComplete="off"
            className="w-full px-4 py-3 rounded-md text-base focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{ border: `1px solid ${C.rule}` }}
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-10 top-full left-0 right-0 rounded-md shadow-lg mt-1 overflow-hidden" style={{ background: C.paper, border: `1px solid ${C.rule}` }}>
              {suggestions.map((feature, idx) => (
                <li key={idx}>
                  <button
                    onMouseDown={(e) => {
                      // Use onMouseDown to fire before onBlur dismisses the list
                      e.preventDefault();
                      handleAddressSelect(feature);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm last:border-0"
                    style={{ borderBottom: `1px solid ${C.rule}` }}
                  >
                    <span className="font-medium">{feature.place_name.split(',')[0]}</span>
                    <span className="ml-1 text-xs" style={{ color: C.muted }}>
                      {feature.place_name.split(',').slice(1).join(',').trim()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs mt-1.5" style={{ color: C.muted }}>Type at least 3 characters to search — results are limited to Cincinnati addresses.</p>
      </div>

      {/* ── Empty state: mission statement + preview ─────────────────────────── */}
      {!selectedAddress && (
        <div className="space-y-4">
          {/* Mission statement */}
          <div className="rounded-md p-6" style={{ background: C.riverDeep, color: '#fff' }}>
            <p className="text-base font-semibold mb-2">What you'll find for any Cincinnati address</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>
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
            <p className="text-xs mt-4" style={{ color: 'rgba(255,255,255,0.65)' }}>
              Data sourced from Cincinnati Open Data, CAGIS, FEMA, Census ACS, and SORTA — updated daily.
            </p>
          </div>

          {/* Preview cards — example data with clear labeling */}
          <div className="relative">
            {/* "Example data" watermark banner */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px" style={{ background: C.rule }} />
              <span className="text-xs font-semibold uppercase tracking-widest px-2" style={{ color: C.muted }}>
                Example · search your address to see real results
              </span>
              <div className="flex-1 h-px" style={{ background: C.rule }} />
            </div>

            <div className="opacity-60 pointer-events-none select-none space-y-3">
              {/* At a Glance bar preview */}
              <div className="rounded-md shadow-sm px-5 py-4" style={{ background: C.paper }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: C.muted }}>At a Glance · 4247 Edwards Rd, Hyde Park</p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[
                    { emoji: '🏘️', label: 'Zoning',   value: 'R-1A' },
                    { emoji: '🌊', label: 'Flood',    value: 'Zone X' },
                    { emoji: '🚨', label: 'Crime',    value: '4 incidents' },
                    { emoji: '💧', label: 'Lead',     value: 'Low risk' },
                    { emoji: '🚌', label: 'Transit',  value: '11 stops' },
                    { emoji: '🏫', label: 'Schools',  value: '3 nearby' },
                  ].map(({ emoji, label, value }) => (
                    <div key={label} className="flex flex-col items-center rounded-md px-2 py-2.5 text-center" style={{ background: C.limestone }}>
                      <span className="text-base mb-0.5">{emoji}</span>
                      <span className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>{label}</span>
                      <span className="text-xs font-bold mt-0.5" style={{ color: C.riverDeep }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sample data cards row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-md shadow-sm p-4" style={{ background: C.paper }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.muted }}>Property Record</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm"><span style={{ color: C.muted }}>Zoning</span><span className="font-medium">R-1A Single Family</span></div>
                    <div className="flex justify-between text-sm"><span style={{ color: C.muted }}>Neighborhood</span><span className="font-medium">Hyde Park</span></div>
                    <div className="flex justify-between text-sm"><span style={{ color: C.muted }}>Historic</span><span className="font-medium" style={{ color: C.ochre }}>Hyde Park Historic Dist.</span></div>
                  </div>
                </div>
                <div className="rounded-md shadow-sm p-4" style={{ background: C.paper }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.muted }}>Lead Safety</p>
                  <div className="rounded p-2 text-center" style={{ background: C.hillLight }}>
                    <p className="font-semibold text-sm" style={{ color: C.hill }}>Low Risk</p>
                    <p className="text-xs mt-1" style={{ color: C.muted }}>84% copper lines in this neighborhood</p>
                  </div>
                </div>
                <div className="rounded-md shadow-sm p-4" style={{ background: C.paper }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.muted }}>AI Summary</p>
                  <p className="text-xs italic leading-relaxed" style={{ color: C.muted }}>
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
      <div className={selectedAddress ? 'rounded-md shadow-sm p-6' : 'hidden'} style={selectedAddress ? { background: C.paper } : {}}>
        <h3 className="text-lg font-semibold mb-4" style={{ color: C.ink }}>
          {t('addressLookup.mapLabel', 'Location & Nearby Crime')}
        </h3>
        <div
          ref={mapContainer}
          className="h-64 rounded-md"
          style={{ border: `1px solid ${C.rule}` }}
        />
        <p className="text-xs mt-2" style={{ color: C.muted }}>
          {t(
            'addressLookup.crimeDisclaimer',
            'Crime locations shown at approximate block level for privacy.'
          )}
        </p>
      </div>

      {selectedAddress && (
        <>
          {/* ── Quick Status Bar ─────────────────────────────────────────────── */}
          <div className="rounded-md shadow-sm px-5 py-4" style={{ background: C.paper }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: C.muted }}>At a Glance</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {/* Zoning */}
              <div className="flex flex-col items-center rounded-md px-2 py-2.5 text-center" style={{ background: C.limestone }}>
                <span className="text-base mb-0.5">🏙</span>
                <span className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Zoning</span>
                {zoningStatus === 'loading' ? (
                  <span className="h-4 w-10 animate-pulse rounded mt-0.5" style={{ background: C.rule }} />
                ) : (
                  <span className="text-xs font-bold mt-0.5 truncate max-w-full" style={{ color: C.riverDeep }}>
                    {zoning[0] ? String(zoning[0].ZONING ?? 'See card') : 'Outside'}
                  </span>
                )}
              </div>
              {/* Flood Zone */}
              <div className="flex flex-col items-center rounded-md px-2 py-2.5 text-center" style={{ background: C.limestone }}>
                <span className="text-base mb-0.5">🌊</span>
                <span className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Flood</span>
                {floodStatus === 'loading' ? (
                  <span className="h-4 w-10 animate-pulse rounded mt-0.5" style={{ background: C.rule }} />
                ) : (() => {
                  const zone = floodZone[0] ? String(floodZone[0].FLD_ZONE ?? 'X') : 'X';
                  const isHigh = ['AE','A','AO','AH','VE','V'].includes(zone);
                  return (
                    <span className="text-xs font-bold mt-0.5" style={{ color: isHigh ? C.brick : C.hill }}>
                      Zone {zone}
                    </span>
                  );
                })()}
              </div>
              {/* Crime */}
              <div className="flex flex-col items-center rounded-md px-2 py-2.5 text-center" style={{ background: C.limestone }}>
                <span className="text-base mb-0.5">🚨</span>
                <span className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Crime</span>
                {crimeLoading ? (
                  <span className="h-4 w-8 animate-pulse rounded mt-0.5" style={{ background: C.rule }} />
                ) : (
                  <span className="text-xs font-bold mt-0.5" style={{ color: mergedCrime.length > 10 ? C.brick : mergedCrime.length > 0 ? C.ochre : C.hill }}>
                    {mergedCrime.length} nearby
                  </span>
                )}
              </div>
              {/* Transit */}
              <div className="flex flex-col items-center rounded-md px-2 py-2.5 text-center" style={{ background: C.limestone }}>
                <span className="text-base mb-0.5">🚌</span>
                <span className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Stops</span>
                {loadingTransit ? (
                  <span className="h-4 w-8 animate-pulse rounded mt-0.5" style={{ background: C.rule }} />
                ) : (
                  <span className="text-xs font-bold mt-0.5" style={{ color: C.riverDeep }}>{transitStops.length} stops</span>
                )}
              </div>
              {/* Schools */}
              <div className="flex flex-col items-center rounded-md px-2 py-2.5 text-center" style={{ background: C.limestone }}>
                <span className="text-base mb-0.5">🏫</span>
                <span className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Schools</span>
                {loadingSchools ? (
                  <span className="h-4 w-8 animate-pulse rounded mt-0.5" style={{ background: C.rule }} />
                ) : (
                  <span className="text-xs font-bold mt-0.5" style={{ color: C.riverDeep }}>{nearbySchools.length} nearby</span>
                )}
              </div>
              {/* Parks */}
              <div className="flex flex-col items-center rounded-md px-2 py-2.5 text-center" style={{ background: C.limestone }}>
                <span className="text-base mb-0.5">🌳</span>
                <span className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Parks</span>
                {parksStatus === 'loading' ? (
                  <span className="h-4 w-8 animate-pulse rounded mt-0.5" style={{ background: C.rule }} />
                ) : (
                  <span className="text-xs font-bold mt-0.5" style={{ color: C.riverDeep }}>{nearbyParks.length} nearby</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Plain English Summary ─────────────────────────────────────────── */}
          <div className="rounded-md shadow-sm p-6" style={{ background: C.paper }}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-semibold" style={{ color: C.ink }}>
                {t('addressLookup.aiSummary', 'Plain English Summary')}
              </h3>
              <button
                onClick={handleAiSummary}
                disabled={loadingAi}
                className="px-4 py-2 rounded-md disabled:opacity-50 text-sm text-white"
                style={{ background: C.riverDeep }}
              >
                {loadingAi
                  ? t('addressLookup.generating', 'Generating...')
                  : t('addressLookup.explainRecord', 'Explain This Record')}
              </button>
            </div>
            {aiSummary ? (
              <div className="prose prose-sm max-w-none">{renderMarkdown(aiSummary)}</div>
            ) : aiError ? (
              <p className="text-sm" style={{ color: C.brick }}>{aiError}</p>
            ) : (
              <p className="text-sm italic" style={{ color: C.muted }}>
                {t('addressLookup.aiHint', 'Click "Explain This Record" to get a plain-language summary of all data found for this address.')}
              </p>
            )}
          </div>

          {/* ── Section: Property Record ──────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: C.muted }}>Property Record</span>
            <div className="flex-1 h-px" style={{ background: C.rule }} />
          </div>

          <div className="rounded-md shadow-sm p-6" style={{ background: C.paper }}>
            {/* Tab switcher */}
            <div className="flex gap-1 rounded-md p-1 mb-5 self-start w-fit" style={{ background: C.limestone }}>
              {(['overview', 'violations', 'abatements'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setPropertyTab(tab)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors"
                  style={propertyTab === tab
                    ? { background: C.paper, color: C.riverDeep, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
                    : { color: C.muted }}
                >
                  {tab === 'violations' ? 'Inspections' : tab === 'abatements' ? 'Abatements & Blight' : 'Overview'}
                </button>
              ))}
            </div>

            {/* Overview tab */}
            {propertyTab === 'overview' && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-md p-3 text-center" style={{ background: C.limestone }}>
                    <div className="text-2xl font-bold" style={{ color: inspections.loading ? C.rule : inspections.data?.length ? C.ochre : C.muted }}>
                      {inspections.loading ? '—' : inspections.data?.length ?? 0}
                    </div>
                    <div className="text-[10px] mt-0.5 uppercase tracking-wide" style={{ color: C.muted }}>Inspections</div>
                  </div>
                  <div className="rounded-md p-3 text-center" style={{ background: C.limestone }}>
                    <div className="text-2xl font-bold" style={{ color: inspections.loading ? C.rule : violations.length > 0 ? C.brick : C.hill }}>
                      {inspections.loading ? '—' : violations.length}
                    </div>
                    <div className="text-[10px] mt-0.5 uppercase tracking-wide" style={{ color: C.muted }}>Violations</div>
                  </div>
                  <div className="rounded-md p-3 text-center" style={{ background: C.limestone }}>
                    <div className="text-2xl font-bold" style={{ color: taxAbatements.loading ? C.rule : taxAbatements.data?.length ? C.riverDeep : C.muted }}>
                      {taxAbatements.loading ? '—' : taxAbatements.data?.length ?? 0}
                    </div>
                    <div className="text-[10px] mt-0.5 uppercase tracking-wide" style={{ color: C.muted }}>Abatements</div>
                  </div>
                  <div className="rounded-md p-3 text-center" style={{ background: C.limestone }}>
                    <div className="text-2xl font-bold" style={{ color: blight.loading ? C.rule : blight.data?.length ? C.brick : C.hill }}>
                      {blight.loading ? '—' : blight.data?.length ?? 0}
                    </div>
                    <div className="text-[10px] mt-0.5 uppercase tracking-wide" style={{ color: C.muted }}>Blight Flags</div>
                  </div>
                </div>
                {violations.length > 0 && (
                  <div className="rounded-md px-3 py-2 text-xs" style={{ background: C.brickLight, border: `1px solid ${C.brick}`, color: C.brick }}>
                    {violations.length} inspection violation{violations.length > 1 ? 's' : ''} found — see the Inspections tab for details.
                  </div>
                )}
                {blight.data && blight.data.length > 0 && (
                  <div className="rounded-md px-3 py-2 text-xs mt-2" style={{ background: C.brickLight, border: `1px solid ${C.brick}`, color: C.brick }}>
                    {blight.data.length} blight flag{blight.data.length > 1 ? 's' : ''} nearby — see Abatements & Blight tab.
                  </div>
                )}
                {!inspections.loading && !taxAbatements.loading && !blight.loading &&
                  !inspections.data?.length && !taxAbatements.data?.length && !blight.data?.length && (
                  <p className="text-sm rounded-md px-3 py-2" style={{ color: C.hill, background: C.hillLight, border: `1px solid ${C.hill}` }}>
                    No inspections, abatements, or blight records found for this address.
                  </p>
                )}

                {/* Contextual orgs — surface when property issues are found */}
                {!inspections.loading && !blight.loading &&
                  (violations.length > 0 || (blight.data && blight.data.length > 0)) && (
                  <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.rule}` }}>
                    <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: C.muted }}>Organizations that can help</p>
                    <CivicOrgsPanel
                      compact
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
                <p className="text-xs italic mb-3" style={{ color: C.muted }}>
                  Building and code enforcement inspection records within 200m.
                </p>
                {inspections.loading ? (
                  <p className="text-sm" style={{ color: C.muted }}>Loading…</p>
                ) : inspections.data && inspections.data.length > 0 ? (
                  <div className="space-y-3">
                    {inspections.data.slice(0, 10).map((inspection: any, idx: number) => {
                      const status = inspection.data_status ?? '';
                      const isFailed = /fail|viol|notice/i.test(status);
                      return (
                        <div key={idx} className="pb-2 last:border-b-0"
                          style={{
                            borderBottom: `1px solid ${C.rule}`,
                            ...(isFailed ? { background: C.brickLight, padding: '4px 8px', borderRadius: 4 } : {})
                          }}>
                          <div className="text-sm font-medium" style={{ color: isFailed ? C.brick : C.ink }}>
                            {inspection.comp_type_desc || 'Unknown'}
                          </div>
                          <div className="text-xs" style={{ color: C.muted }}>{formatDate(inspection.entered_date)} — {status}</div>
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
                <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: C.muted }}>Tax Abatements</div>
                {taxAbatements.loading ? (
                  <p className="text-sm" style={{ color: C.muted }}>Loading…</p>
                ) : taxAbatements.data && taxAbatements.data.length > 0 ? (
                  <div className="space-y-2 mb-5">
                    {taxAbatements.data.slice(0, 8).map((ab: any, idx: number) => (
                      <div key={idx} className="pb-2 last:border-b-0" style={{ borderBottom: `1px solid ${C.rule}` }}>
                        <div className="text-sm font-medium" style={{ color: C.ink }}>{ab.type || 'Unknown'}</div>
                        <div className="text-xs" style={{ color: C.muted }}>Neighborhood: {ab.neighborhood}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm mb-5" style={{ color: C.muted }}>No tax abatements found nearby.</p>
                )}
                <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: C.muted }}>Blight & Property Maintenance</div>
                <p className="text-xs italic mb-3" style={{ color: C.muted }}>
                  Properties flagged under Cincinnati's PLAP program — vacant buildings, overgrown lots, structural hazards.
                </p>
                {blight.loading ? (
                  <p className="text-sm" style={{ color: C.muted }}>Loading…</p>
                ) : blight.data && blight.data.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-lg font-bold" style={{ color: C.ochre }}>{blight.data.length}</div>
                    <div className="text-sm" style={{ color: C.muted }}>blight records found nearby</div>
                    {blight.data.slice(0, 5).map((record: any, idx: number) => (
                      <div key={idx} className="text-xs pt-2" style={{ color: C.muted, borderTop: `1px solid ${C.rule}` }}>
                        {record.sr_sub_type} — {formatDate(record.sr_recd_date)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: C.muted }}>No blight records found nearby.</p>
                )}
                <DataAttribution source="Tax Abatements · PLAP Blight" uid="tkp7-yf64" />
              </>
            )}
          </div>

          {/* ── Section: Safety & Environment ────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: C.muted }}>Safety &amp; Environment</span>
            <div className="flex-1 h-px" style={{ background: C.rule }} />
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
                    <span className="text-3xl font-bold" style={{ color: mergedCrime.length > 15 ? C.brick : mergedCrime.length > 5 ? C.ochre : C.ink }}>
                      {mergedCrime.length}
                    </span>
                    <span className="text-sm" style={{ color: C.muted }}>incidents in the past year</span>
                  </div>
                  {crimeByCategory.length > 0 && (
                    <div className="mb-4 space-y-1.5">
                      {crimeByCategory.map(([cat, count]) => (
                        <div key={cat}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="truncate max-w-[80%]" style={{ color: C.ink }}>{cat}</span>
                            <span className="font-medium ml-1" style={{ color: C.muted }}>{count}</span>
                          </div>
                          <div className="h-1.5 rounded-full" style={{ background: C.limestone }}>
                            <div
                              className="h-1.5 rounded-full"
                              style={{ width: `${(count / crimeByCategory[0][1]) * 100}%`, background: C.ochre }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: C.muted }}>Recent incidents</div>
                  <div className="space-y-2">
                    {mergedCrime.slice(0, 5).map((crime: any, idx: number) => (
                      <div key={idx} className="pb-1.5 last:border-0" style={{ borderBottom: `1px solid ${C.rule}` }}>
                        <div className="text-xs font-medium" style={{ color: C.ink }}>
                          {crime.stars_category || crime.offense_type || crime.offense || 'Unknown'}
                        </div>
                        <div className="text-[10px]" style={{ color: C.muted }}>{formatDate(crime.date_reported || crime.datereported)}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState message={t('addressLookup.noCrime', 'No crime records found nearby')} />
              )}
              <DataAttribution source="CPD STARS + PDI Crime" uid="7aqy-xrv9" />
              {onTabChange && selectedAddress?.neighborhood && (
                <button
                  onClick={() => onTabChange('neighborhoods')}
                  className="mt-3 text-xs font-medium hover:underline flex items-center gap-1"
                  style={{ color: C.river }}
                >
                  See full crime trends for {selectedAddress.neighborhood} →
                </button>
              )}
              {/* Contextual orgs for high crime areas */}
              {!crimeLoading && mergedCrime.length > 10 && (
                <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.rule}` }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: C.muted }}>Community resources</p>
                  <CivicOrgsPanel
                    compact
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
                          <span className="mt-0.5 px-2 py-0.5 rounded-md text-sm font-bold shrink-0 text-white" style={{ background: isHighRisk ? C.brick : C.hill }}>
                            Zone {zone}
                          </span>
                          <div>
                            <p className="text-sm" style={{ color: C.ink }}>
                              {isHighRisk
                                ? 'Special Flood Hazard Area — at least a 1% annual chance of flooding. Flood insurance is required for federally-backed mortgages.'
                                : 'Minimal flood hazard — outside the special flood hazard area.'}
                            </p>
                            {String(f.ZONE_SUBTY ?? '') && (
                              <p className="text-xs mt-1" style={{ color: C.muted }}>{String(f.ZONE_SUBTY)}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Mill Creek infrastructure context — shown for high-risk properties */}
                    {isAnyHighRisk && (
                      <div className="pt-2 space-y-3" style={{ borderTop: `1px solid ${C.rule}` }}>
                        <div className="rounded-md p-3" style={{ background: C.riverLight, border: `1px solid ${C.river}` }}>
                          <p className="text-xs font-semibold mb-1.5" style={{ color: C.riverDeep }}>Cincinnati Flood Infrastructure</p>
                          <p className="text-xs leading-relaxed" style={{ color: C.river }}>
                            Most of Cincinnati&apos;s flood risk comes from the <strong>Mill Creek watershed</strong>, a 30-mile
                            corridor running from Butler County through Norwood, Westwood, and Lower Price Hill before
                            joining the Ohio River. MSDGC operates the <strong>Mill Creek Barrier</strong> — a movable flood
                            gate near the river confluence — along with several miles of levees that protect portions of
                            the lower watershed. However, large sections upstream (including Roselawn, Norwood, and
                            communities north of I-74) are outside the protected zone.
                          </p>
                        </div>
                        <div className="rounded-md p-3" style={{ background: C.brickLight, border: `1px solid ${C.brick}` }}>
                          <p className="text-xs font-semibold mb-2" style={{ color: C.brick }}>What to do if you&apos;re in a flood zone</p>
                          <div className="space-y-2">
                            <div className="flex items-start gap-2">
                              <span className="font-bold text-xs mt-0.5 shrink-0" style={{ color: C.brick }}>1.</span>
                              <p className="text-xs" style={{ color: C.brick }}>
                                <strong>Get flood insurance.</strong> Your homeowner&apos;s policy does not cover flooding.
                                Purchase through the National Flood Insurance Program (NFIP) — federally-backed mortgages
                                (FHA, VA, Fannie Mae) require it in SFHA zones.
                              </p>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="font-bold text-xs mt-0.5 shrink-0" style={{ color: C.brick }}>2.</span>
                              <p className="text-xs" style={{ color: C.brick }}>
                                <strong>Check your elevation certificate.</strong> If your structure is elevated above
                                the base flood elevation, your NFIP premium can be significantly lower. Contact Hamilton
                                County or your insurance agent for records.
                              </p>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="font-bold text-xs mt-0.5 shrink-0" style={{ color: C.brick }}>3.</span>
                              <p className="text-xs" style={{ color: C.brick }}>
                                <strong>Think you&apos;re mismapped?</strong> You can apply for a{' '}
                                <a
                                  href="https://hazards.fema.gov/femaportal/onlinelomc/signin"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline"
                                  style={{ color: C.riverDeep }}
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
                      <p className="text-xs pt-1" style={{ color: C.muted }}>
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
                    <span className="px-2 py-0.5 rounded-md text-sm font-bold text-white" style={{ background: C.hill }}>Zone X</span>
                    <p className="text-sm" style={{ color: C.ink }}>Minimal flood hazard area.</p>
                  </div>
                  <p className="text-xs" style={{ color: C.muted }}>
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
                const riskTokenColor =
                  leadRiskLevel === 'high'     ? C.brick  :
                  leadRiskLevel === 'moderate' ? C.ochre  : C.hill;
                const riskTokenBg =
                  leadRiskLevel === 'high'     ? C.brickLight :
                  leadRiskLevel === 'moderate' ? C.limestone  : C.hillLight;
                const riskTokenBorder =
                  leadRiskLevel === 'high'     ? C.brick  :
                  leadRiskLevel === 'moderate' ? C.ochre  : C.hill;
                const riskLabel =
                  leadRiskLevel === 'high'     ? 'Elevated Risk' :
                  leadRiskLevel === 'moderate' ? 'Moderate Risk' : 'Lower Risk';

                return (
                  <div className="space-y-4">
                    {/* Summary banner */}
                    <div className="rounded-md px-4 py-3" style={{ background: riskTokenBg, border: `1px solid ${riskTokenBorder}` }}>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-2xl font-bold" style={{ color: riskTokenColor }}>{riskLabel}</span>
                        <span className="text-xs" style={{ color: C.muted }}>{name}</span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: riskTokenColor }}>
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
                        { label: 'Total', value: total, color: C.ink },
                        { label: 'Lead/Galv.', value: riskLines, color: riskLines > 0 ? C.brick : C.muted },
                        { label: 'Unknown', value: unknown, color: unknown > 0 ? C.ochre : C.muted },
                        { label: 'Replaced', value: replaced, color: replaced > 0 ? C.hill : C.muted },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="rounded-md py-2" style={{ background: C.limestone }}>
                          <div className="text-lg font-bold" style={{ color }}>{value}</div>
                          <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>{label}</div>
                        </div>
                      ))}
                    </div>

                    {leadRiskLevel !== 'low' && (
                      <div className="rounded-md p-3 space-y-2" style={{ background: C.riverLight, border: `1px solid ${C.river}` }}>
                        <p className="text-xs font-semibold" style={{ color: C.riverDeep }}>What you can do now</p>
                        <ul className="text-xs space-y-1.5 list-none" style={{ color: C.river }}>
                          <li>→ <strong>Get your water tested first</strong> — it's free and immediate. GCWW offers <a href="https://la.mygcww.org/lead/" target="_blank" rel="noopener noreferrer" className="underline">free lead test kits</a>. This tells you what's actually in your tap water regardless of service line status.</li>
                          <li>→ <strong>Contact GCWW at (513) 591-7700</strong> to find out when your neighborhood is scheduled for the replacement program and to make sure your address is on their list. You can't request immediate replacement — the program works neighborhood by neighborhood.</li>
                          <li>→ <strong>Use an NSF-certified lead filter</strong> (pitcher or faucet-mount) on drinking taps in the meantime — especially if children or pregnant residents are in the home.</li>
                          <li>→ <strong>If your home was built before 1986</strong>, interior pipes and solder joints may also contain lead. Service line replacement won't address this — a water test and certified filter are your best protection for interior plumbing.</li>
                        </ul>
                      </div>
                    )}

                    {/* Contextual orgs */}
                    <div className="pt-2" style={{ borderTop: `1px solid ${C.rule}` }}>
                      <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.muted }}>Contact these programs directly</p>
                      <CivicOrgsPanel
                        compact
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
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: C.muted }}>Location Context</span>
            <div className="flex-1 h-px" style={{ background: C.rule }} />
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
                        <span className="mt-0.5 px-2 py-0.5 rounded-md text-sm font-bold text-white shrink-0" style={{ background: C.riverDeep }}>{code}</span>
                        <div>
                          {desc && <p className="text-sm" style={{ color: C.ink }}>{desc}</p>}
                          {zoneType && <p className="text-xs" style={{ color: C.muted }}>{zoneType}</p>}
                          <p className="text-xs mt-1" style={{ color: C.muted }}>Affects what can be built, renovated, or operated at this address.</p>
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
                    const name = String(h.HD_NAME ?? h.NAME ?? h.DIST_NAME ?? h.DISTRICT_NAME ?? 'Historic District');
                    const year = h.YEAR_DESG ?? h.DESIG_YEAR ?? '';
                    const cls = String(h.DIST_CLASS ?? h.CLASS ?? h.TYPE ?? '');
                    return (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-lg shrink-0" style={{ color: C.ochre }}>🏛</span>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: C.ink }}>{name}</p>
                          {(cls || year) && (
                            <p className="text-xs" style={{ color: C.muted }}>{[cls, year ? `Designated ${year}` : ''].filter(Boolean).join(' · ')}</p>
                          )}
                          <p className="text-xs mt-1" style={{ color: C.muted }}>Renovation and exterior work may require Historic Preservation approval.</p>
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
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: C.muted }}>Amenities &amp; Access</span>
            <div className="flex-1 h-px" style={{ background: C.rule }} />
          </div>

          <div className="rounded-md shadow-sm p-6" style={{ background: C.paper }}>
            {/* Tab switcher */}
            <div className="flex flex-wrap gap-1 rounded-md p-1 mb-5 self-start w-fit" style={{ background: C.limestone }}>
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
                    className="px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors flex items-center gap-1.5"
                    style={amenitiesTab === tab
                      ? { background: C.paper, color: C.riverDeep, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
                      : { color: C.muted }}
                  >
                    {icons[tab]}
                    {labels[tab]}
                    {!loading[tab] && (
                      <span className="text-[10px] rounded-full px-1.5 py-0.5 font-bold"
                        style={amenitiesTab === tab
                          ? { background: C.riverDeep, color: '#fff' }
                          : { background: C.rule, color: C.muted }}>
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
                  <p className="text-sm" style={{ color: C.muted }}>Loading parks…</p>
                ) : nearbyParks.length > 0 ? (
                  <div className="space-y-2">
                    {nearbyParks.slice(0, 6).map((p, i) => {
                      const name = String(p.PARK_NAME ?? `Park ${i + 1}`);
                      const acres = p.PARK_SIZE_ACRES != null ? `${Number(p.PARK_SIZE_ACRES).toFixed(1)} ac` : '';
                      const designation = String(p.PARK_DESIGNATION ?? '');
                      return (
                        <div key={i} className="flex items-center justify-between pb-1.5 last:border-0" style={{ borderBottom: `1px solid ${C.rule}` }}>
                          <div>
                            <p className="text-sm font-medium" style={{ color: C.ink }}>{name}</p>
                            {designation && <p className="text-xs" style={{ color: C.muted }}>{designation}</p>}
                          </div>
                          {acres && <span className="text-xs font-medium shrink-0 ml-2" style={{ color: C.riverDeep }}>{acres}</span>}
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
                  <p className="text-sm" style={{ color: C.muted }}>Loading schools…</p>
                ) : nearbySchools.length > 0 ? (
                  <div className="space-y-3">
                    {nearbySchools.slice(0, 8).map((school, idx) => {
                      const typeLC = school.type.toLowerCase();
                      const badgeStyle: React.CSSProperties =
                        typeLC.includes('elementary') ? { background: C.hillLight, color: C.hill } :
                        typeLC.includes('middle')     ? { background: C.riverLight, color: C.riverDeep } :
                        typeLC.includes('high')       ? { background: C.brickLight, color: C.brick } :
                                                        { background: C.limestone, color: C.muted };
                      const isPublic = school.fund?.toLowerCase() === 'public';
                      return (
                        <div key={idx} className="pb-2 last:border-0" style={{ borderBottom: `1px solid ${C.rule}` }}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-tight" style={{ color: C.ink }}>{school.name}</p>
                            <span className="text-xs shrink-0 mt-0.5" style={{ color: C.muted }}>{school.distance.toFixed(2)} mi</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {school.type && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={badgeStyle}>{school.type}</span>
                            )}
                            {school.grade && <span className="text-[10px]" style={{ color: C.muted }}>Grades {school.grade}</span>}
                            <span className="text-[10px] font-medium" style={{ color: isPublic ? C.riverDeep : C.muted }}>
                              {isPublic ? '● Public' : '○ Private'}
                            </span>
                          </div>
                          {school.district && <p className="text-[10px] mt-0.5 truncate" style={{ color: C.muted }}>{school.district}</p>}
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
                  <p className="text-sm" style={{ color: C.muted }}>Loading transit stops…</p>
                ) : transitStops.length > 0 ? (
                  <div className="space-y-3">
                    {transitStops.map((stop, idx) => (
                      <div key={idx} className="pb-2 last:border-b-0" style={{ borderBottom: `1px solid ${C.rule}` }}>
                        <div className="text-sm font-medium" style={{ color: C.ink }}>{stop.stop_name}</div>
                        <div className="text-xs" style={{ color: C.muted }}>
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
                    <p className="text-sm" style={{ color: C.muted }}>Loading healthcare facilities…</p>
                  ) : nearbyHealthcare.length > 0 ? (
                    <div className="space-y-4">
                      {/* FQHC highlight banner */}
                      {fqhcs.length > 0 && (
                        <div className="rounded-md p-3" style={{ background: C.hillLight, border: `1px solid ${C.hill}` }}>
                          <p className="text-xs font-semibold mb-1" style={{ color: C.hill }}>
                            Federally Qualified Health Centers nearby ({fqhcs.length})
                          </p>
                          <p className="text-[10px]" style={{ color: C.hill }}>
                            FQHCs provide sliding-scale care regardless of ability to pay or insurance status.
                          </p>
                          {fqhcs.slice(0, 3).map((f, i) => (
                            <div key={i} className="mt-1.5 text-xs font-medium" style={{ color: C.river }}>
                              {f.name} · {f.distance.toFixed(2)} mi
                            </div>
                          ))}
                        </div>
                      )}

                      {grouped.map(({ type, facilities }) => (
                        <div key={type}>
                          <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: C.muted }}>
                            {TYPE_ICONS[type]} {TYPE_LABELS[type] ?? type} ({facilities.length})
                          </div>
                          <div className="space-y-2">
                            {facilities.slice(0, 6).map((f, idx) => (
                              <div key={idx} className="pb-2 last:border-b-0" style={{ borderBottom: `1px solid ${C.rule}` }}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium flex items-center gap-1" style={{ color: C.ink }}>
                                      {f.name}
                                      {f.fqhc && (
                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded-md" style={{ background: C.hillLight, color: C.hill }}>FQHC</span>
                                      )}
                                    </div>
                                    {f.address && (
                                      <div className="text-[11px] truncate" style={{ color: C.muted }}>{f.address}</div>
                                    )}
                                    {f.phone && (
                                      <a href={`tel:${f.phone}`} className="text-[11px] hover:underline" style={{ color: C.river }}>
                                        {f.phone}
                                      </a>
                                    )}
                                  </div>
                                  <div className="text-xs shrink-0" style={{ color: C.muted }}>{f.distance.toFixed(2)} mi</div>
                                </div>
                              </div>
                            ))}
                            {facilities.length > 6 && (
                              <p className="text-[10px] italic" style={{ color: C.muted }}>
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
                  <DataAttribution source="OpenStreetMap / Overpass API · HRSA Health Center Finder" url="https://www.openstreetmap.org/" />
                </>
              );
            })()}
          </div>

          {/* ── Section: Your Representatives ─────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: C.muted }}>Politics &amp; Government</span>
            <div className="flex-1 h-px" style={{ background: C.rule }} />
          </div>

          {/* Voting Precinct */}
          <DataCard
            title="Your Voting Precinct"
            loading={precinctStatus === 'loading'}
            error={precinctStatus === 'error' ? 'Could not load precinct data' : null}
          >
            {precinctStatus === 'done' && !votingPrecinct && (
              <p className="text-sm italic" style={{ color: C.muted }}>No precinct found for this address. Verify the address is within Cincinnati city limits.</p>
            )}
            {votingPrecinct && (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">🗳️</span>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: C.ink }}>{votingPrecinct.precinct}</div>
                    {votingPrecinct.prcName && votingPrecinct.prcName !== votingPrecinct.precinct && (
                      <div className="text-xs mt-0.5" style={{ color: C.muted }}>{votingPrecinct.prcName}</div>
                    )}
                  </div>
                </div>
                {votingPrecinct.location && (
                  <div className="flex items-start gap-3">
                    <span className="text-lg shrink-0">📍</span>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: C.muted }}>Polling Place</div>
                      <div className="text-sm" style={{ color: C.ink }}>{votingPrecinct.location}</div>
                      {votingPrecinct.address && (
                        <div className="text-xs" style={{ color: C.muted }}>
                          {votingPrecinct.address}{votingPrecinct.city ? `, ${votingPrecinct.city}` : ''}{votingPrecinct.zip ? ` ${votingPrecinct.zip}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="pt-2 flex flex-wrap gap-3 text-xs" style={{ borderTop: `1px solid ${C.rule}` }}>
                  <a
                    href="https://voterlookup.ohiosos.gov/voterlookup.aspx"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: C.river }}
                  >
                    Verify registration →
                  </a>
                  <a
                    href="https://www.votehamiltoncountyohio.gov/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: C.river }}
                  >
                    Hamilton County Board of Elections →
                  </a>
                </div>
              </div>
            )}
            <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.rule}` }}>
              <DataAttribution source="Hamilton County CAGIS · Voting Precincts" url="https://cagis.hamilton-co.org/" />
            </div>
          </DataCard>

          {/* ── Section: Civic Action Windows ─────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: C.muted }}>Civic Action Windows</span>
            <div className="flex-1 h-px" style={{ background: C.rule }} />
          </div>

          <div className="rounded-md shadow-sm p-6" style={{ background: C.paper }}>
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-lg font-semibold" style={{ color: C.ink }}>Upcoming Public Meetings</h3>
              <a
                href="https://cincinnatioh.legistar.com/Calendar.aspx"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs hover:underline shrink-0 ml-3"
                style={{ color: C.river }}
              >
                Full calendar →
              </a>
            </div>
            <p className="text-xs mb-4" style={{ color: C.muted }}>
              These are the meetings where Cincinnati residents can speak directly to the people making decisions
              about your neighborhood — zoning, development, policing, housing, and budget.
            </p>
            <CivicCalendar weeksAhead={8} />
          </div>

          {/* ── Section: Traffic & Infrastructure ────────────────────────────── */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: C.muted }}>Traffic &amp; Infrastructure</span>
            <div className="flex-1 h-px" style={{ background: C.rule }} />
          </div>
          <p className="text-xs -mt-3" style={{ color: C.muted }}>
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
                <div className="text-xs space-y-1" style={{ color: C.muted }}>
                  <p className="font-medium" style={{ color: C.ink }}>Enable live traffic data</p>
                  <p>Register for a free API key at <span className="font-mono" style={{ color: C.riverDeep }}>ohgo.com</span>, then add <span className="font-mono">VITE_OHGO_API_KEY=your_key</span> to <span className="font-mono">.env.local</span>.</p>
                </div>
              ) : ohgoStatus === 'done' && ohgoIncidents.length > 0 ? (
                <div className="space-y-2">
                  {ohgoIncidents.slice(0, 6).map((inc) => {
                    const isBlock = /clos|block/i.test(inc.roadStatus);
                    return (
                      <div key={inc.id} className="pb-2 last:border-0"
                        style={{
                          borderBottom: `1px solid ${C.rule}`,
                          ...(isBlock ? { background: C.brickLight, padding: '4px 8px', borderRadius: 4 } : {})
                        }}>
                        <div className="text-sm font-medium" style={{ color: isBlock ? C.brick : C.ink }}>
                          {inc.category || 'Incident'}{inc.routeName ? ` — ${inc.routeName}` : ''}
                        </div>
                        <div className="text-xs" style={{ color: C.muted }}>{inc.location}</div>
                        {inc.description && inc.description !== inc.location && (
                          <div className="text-xs italic" style={{ color: C.muted }}>{inc.description}</div>
                        )}
                        {isBlock && (
                          <span className="inline-block mt-1 text-xs text-white px-1.5 py-0.5 rounded-md" style={{ background: C.brick }}>Road affected</span>
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
                <p className="text-xs" style={{ color: C.muted }}>Requires OHGO API key (see Active Traffic Incidents card).</p>
              ) : ohgoStatus === 'done' && ohgoConstruction.length > 0 ? (
                <div className="space-y-2">
                  {ohgoConstruction.slice(0, 5).map((c) => (
                    <div key={c.id} className="pb-2 last:border-0" style={{ borderBottom: `1px solid ${C.rule}` }}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm shrink-0" style={{ color: C.ochre }}>🚧</span>
                        <div>
                          <p className="text-sm font-medium" style={{ color: C.ink }}>{c.routeName || 'Work Zone'}</p>
                          <p className="text-xs" style={{ color: C.muted }}>{c.location}</p>
                          {c.description && c.description !== c.location && (
                            <p className="text-xs" style={{ color: C.muted }}>{c.description}</p>
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
                <p className="text-xs" style={{ color: C.muted }}>Requires OHGO API key (see Active Traffic Incidents card).</p>
              ) : ohgoStatus === 'done' && ohgoCameras.length > 0 ? (
                <div className="space-y-3">
                  {ohgoCameras.slice(0, 3).map((cam) => {
                    const view = cam.views[0];
                    return (
                      <div key={cam.id}>
                        <p className="text-sm font-medium mb-1" style={{ color: C.ink }}>
                          {cam.location}{view?.direction ? ` — ${view.direction}` : ''}
                        </p>
                        {view?.smallUrl && view.smallUrl !== 'undefined' ? (
                          <a href={view.largeUrl || view.smallUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={view.smallUrl}
                              alt={`Traffic camera: ${cam.location}`}
                              className="w-full rounded-md hover:opacity-90 transition-opacity"
                              style={{ border: `1px solid ${C.rule}` }}
                              loading="lazy"
                            />
                          </a>
                        ) : (
                          <p className="text-xs italic" style={{ color: C.muted }}>No snapshot available</p>
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

      {/* ── Sources footnote ─────────────────────────────────────────────────── */}
      <p className="serif italic text-[12px] pt-6" style={{ color: C.muted, borderTop: `1px solid ${C.rule}` }}>
        Sources: Mapbox Geocoding API; CAGIS / Hamilton County ArcGIS; FEMA National Flood Hazard Layer (NFHL); Cincinnati Open Data — Crime STARS (7aqy-xrv9), Building Inspections (ivda-umw7), Tax Abatements (tkp7-yf64), PLAP Blight (pk9w-99n6); GCWW Lead Service Lines (public/data/lead_service_lines.json); SORTA bus stops (GTFS static); OpenStreetMap healthcare facilities; Hamilton County CAGIS — Voting Precincts (layer 44); OHGO — Ohio Dept. of Transportation (state-managed roads only).
      </p>
    </div>
  );
}
