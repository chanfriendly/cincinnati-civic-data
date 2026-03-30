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
import { DataCard, EmptyState, DataAttribution } from '../../components/ui';
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

type CAGISStatus = 'idle' | 'loading' | 'done' | 'error';

export default function AddressLookup() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [selectedAddress, setSelectedAddress] = useState<GeocodedAddress | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<{ place_name: string; center: [number, number] }[]>([]);
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

  // PDI crime: latitude_x/longitude_x are text columns — use string comparison
  const crimeOld = useSODA(
    'k59e-2pvf',
    selectedAddress
      ? {
          $where: bboxWhereText('latitude_x', 'longitude_x', 400),
          $limit: 100,
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
          $where: bboxWhere('latitude_x', 'longitude_x', 400),
          $limit: 100,
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
        setSuggestions((data.features ?? []).slice(0, 6));
      } catch {
        setSuggestions([]);
      }
    }, 300);
  }, []);

  // When a suggestion is clicked: geocode is already done (Mapbox returns center in the feature)
  const handleAddressSelect = useCallback(
    (feature: { place_name: string; center: [number, number] }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const addr = feature.place_name.split(',')[0].trim();
      const parts = addr.split(/\s+/);
      const streetNum = parts[0];
      const streetName = parts.slice(1).join(' ');

      setSelectedAddress({
        lat: feature.center[1],
        lng: feature.center[0],
        formatted: feature.place_name,
        street: addr,
        streetNum,
        streetName,
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
      </div>

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
          {/* Plain English Summary — shown right under the address selector */}
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
              <div className="prose prose-sm max-w-none">
                {renderMarkdown(aiSummary)}
              </div>
            ) : aiError ? (
              <p className="text-sm text-red-600">{aiError}</p>
            ) : (
              <p className="text-sm text-gray-500 italic">
                {t('addressLookup.aiHint', 'Click "Explain This Record" to get a plain-language summary of all data found for this address.')}
              </p>
            )}
          </div>

          {/* Two-column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Inspections & Violations */}
            <DataCard
              title={t('addressLookup.inspections', 'Inspections & Violations')}
              loading={inspections.loading}
              error={inspections.error}
              empty={!inspections.data || inspections.data.length === 0}
            >
              {inspections.data && inspections.data.length > 0 ? (
                <div className="space-y-3">
                  {inspections.data.slice(0, 10).map((inspection: any, idx: number) => {
                    const status = inspection.data_status ?? '';
                    const isFailed = /fail|viol|notice/i.test(status);
                    return (
                      <div
                        key={idx}
                        className={`border-b border-gray-200 pb-2 last:border-b-0 ${
                          isFailed ? 'bg-yellow-50 px-2 py-1 rounded' : ''
                        }`}
                      >
                        <div className={`text-sm font-medium ${
                          isFailed ? 'text-red-900' : 'text-gray-900'
                        }`}>
                          {inspection.comp_type_desc || t('addressLookup.unknown', 'Unknown')}
                        </div>
                        <div className="text-xs text-gray-600">
                          {formatDate(inspection.entered_date)} — {status}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState message={t('addressLookup.noInspections', 'No inspections found')} />
              )}
              <DataAttribution
                source={t('addressLookup.attributionInspections', 'Inspections & Violations')}
                uid="ivda-umw7"
              />
            </DataCard>

            {/* Tax Abatements */}
            <DataCard
              title={t('addressLookup.taxAbatements', 'Tax Abatements')}
              loading={taxAbatements.loading}
              error={taxAbatements.error}
              empty={!taxAbatements.data || taxAbatements.data.length === 0}
            >
              {taxAbatements.data && taxAbatements.data.length > 0 ? (
                <div className="space-y-3">
                  {taxAbatements.data.slice(0, 10).map((abatement: any, idx: number) => (
                    <div key={idx} className="border-b border-gray-200 pb-2 last:border-b-0">
                      <div className="text-sm font-medium text-gray-900">
                        {abatement.type || t('addressLookup.unknown', 'Unknown')}
                      </div>
                      <div className="text-xs text-gray-600">
                        Neighborhood: {abatement.neighborhood}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message={t('addressLookup.noAbatements', 'No abatements found')} />
              )}
              <DataAttribution
                source={t('addressLookup.attributionAbatements', 'Tax Abatements')}
                uid="tkp7-yf64"
              />
            </DataCard>

            {/* Nearby Crime */}
            <DataCard
              title={t('addressLookup.crime', 'Nearby Crime (400m)')}
              loading={crimeLoading}
              error={crimeError}
              empty={mergedCrime.length === 0}
            >
              {mergedCrime.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-sm text-gray-900 font-medium">
                    {t('addressLookup.crimeCount', `Total: ${mergedCrime.length} incidents`)}
                  </div>
                  {mergedCrime.slice(0, 8).map((crime: any, idx: number) => (
                    <div key={idx} className="border-b border-gray-200 pb-2 last:border-b-0">
                      <div className="text-sm font-medium text-gray-900">
                        {crime.stars_category || crime.offense_type || crime.offense || t('addressLookup.unknown', 'Unknown')}
                      </div>
                      <div className="text-xs text-gray-600">
                        {formatDate(crime.date_reported || crime.datereported)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message={t('addressLookup.noCrime', 'No crime records found nearby')} />
              )}
              <DataAttribution
                source={t('addressLookup.attributionCrime', 'PDI Crime Incidents + STARS')}
                uid="k59e-2pvf"
              />
            </DataCard>

            {/* PLAP Blight */}
            <DataCard
              title={t('addressLookup.blight', 'Blight & Property Maintenance')}
              loading={blight.loading}
              error={blight.error}
              empty={!blight.data || blight.data.length === 0}
            >
              <p className="text-xs text-gray-500 italic mb-3">
                {t('addressLookup.blightDef', '"Blight" refers to properties flagged under Cincinnati\'s PLAP program for code violations — vacant buildings, overgrown lots, structural hazards, or public nuisances.')}
              </p>
              {blight.data && blight.data.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-lg font-bold text-[#C8861A]">
                    {blight.data.length}
                  </div>
                  <div className="text-sm text-gray-600">
                    {t('addressLookup.blightRecords', 'blight records found nearby')}
                  </div>
                  {blight.data.slice(0, 5).map((record: any, idx: number) => (
                    <div key={idx} className="text-xs text-gray-600 border-t pt-2">
                      {record.sr_sub_type} — {formatDate(record.sr_recd_date)}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message={t('addressLookup.noBlight', 'No blight records found nearby')} />
              )}
              <DataAttribution
                source={t('addressLookup.attributionBlight', 'PLAP Blight')}
                uid="pk9w-99n6"
              />
            </DataCard>

            {/* Transit Proximity */}
            <DataCard
              title={t('addressLookup.transit', 'Transit Stops (within 0.5 mi)')}
              loading={loadingTransit}
              error={null}
              empty={transitStops.length === 0}
            >
              {transitStops.length > 0 ? (
                <div className="space-y-3">
                  {transitStops.map((stop, idx) => (
                    <div key={idx} className="border-b border-gray-200 pb-2 last:border-b-0">
                      <div className="text-sm font-medium text-gray-900">
                        {stop.stop_name}
                      </div>
                      <div className="text-xs text-gray-600">
                        {stop.distance.toFixed(2)} mi{stop.routes.length > 0 ? ` • Routes: ${stop.routes.join(', ')}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message={t('addressLookup.noTransit', 'No stops within 0.5 miles')} />
              )}
            </DataCard>

            {/* ── CAGIS: Zoning ───────────────────────────────────────────── */}
            <DataCard
              title={t('addressLookup.zoning', 'Zoning Designation')}
              loading={zoningStatus === 'loading'}
              error={zoningStatus === 'error' ? 'Zoning data unavailable (CAGIS)' : null}
            >
              {zoningStatus === 'done' && zoning.length > 0 ? (
                <div>
                  {zoning.map((z, i) => {
                    // Layer 4 attrs: ZONING (code), ZONE_TYPE (class), DIS_NAME (description)
                    const code = String(z.ZONING ?? z.NAME ?? z.ZONE ?? z.ZONING_CODE ?? 'Unknown');
                    const desc = String(z.DIS_NAME ?? z.DESCRIPTION ?? z.ZONE_CLASS ?? z.FULL_NAME ?? '');
                    const zoneType = String(z.ZONE_TYPE ?? '');
                    return (
                      <div key={i} className="flex items-start gap-3">
                        <span className="mt-0.5 px-2 py-0.5 rounded text-sm font-bold bg-[#1A4A6B] text-white shrink-0">
                          {code}
                        </span>
                        <div>
                          {desc && <p className="text-sm text-gray-700">{desc}</p>}
                          {zoneType && <p className="text-xs text-gray-500">{zoneType}</p>}
                          <p className="text-xs text-gray-500 mt-1">
                            Affects what can be built, renovated, or operated at this address.
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : zoningStatus === 'done' ? (
                <EmptyState message="Address outside Cincinnati zoning boundary" />
              ) : null}
              <DataAttribution source="Zoning Designation — CAGIS" url="https://www.hamiltoncountyohio.gov/government/departments/county_gis_cagis" />
            </DataCard>

            {/* ── CAGIS: FEMA Flood Zone ───────────────────────────────────── */}
            <DataCard
              title={t('addressLookup.flood', 'FEMA Flood Hazard Zone')}
              loading={floodStatus === 'loading'}
              error={floodStatus === 'error' ? 'Flood data unavailable (FEMA NFHL)' : null}
            >
              {floodStatus === 'done' && floodZone.length > 0 ? (
                <div>
                  {floodZone.map((f, i) => {
                    const zone = String(f.FLD_ZONE ?? 'Unknown');
                    const isHighRisk = ['AE', 'A', 'AO', 'AH', 'VE', 'V'].includes(zone);
                    return (
                      <div key={i} className="flex items-start gap-3">
                        <span className={`mt-0.5 px-2 py-0.5 rounded text-sm font-bold shrink-0 ${
                          isHighRisk ? 'bg-orange-600 text-white' : 'bg-green-600 text-white'
                        }`}>
                          Zone {zone}
                        </span>
                        <div>
                          <p className="text-sm text-gray-700">
                            {isHighRisk
                              ? 'Special Flood Hazard Area — flood insurance may be required for federally-backed mortgages.'
                              : 'Minimal flood hazard — outside the special flood hazard area.'}
                          </p>
                          {String(f.ZONE_SUBTY ?? '') && (
                            <p className="text-xs text-gray-500 mt-1">{String(f.ZONE_SUBTY)}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : floodStatus === 'done' ? (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-sm font-bold bg-green-600 text-white">Zone X</span>
                  <p className="text-sm text-gray-700">Minimal flood hazard area.</p>
                </div>
              ) : null}
              <DataAttribution source="FEMA National Flood Hazard Layer (NFHL)" url="https://msc.fema.gov/portal/home" />
            </DataCard>

            {/* ── CAGIS: Historic District ─────────────────────────────────── */}
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
                            <p className="text-xs text-gray-500">
                              {[cls, year ? `Designated ${year}` : ''].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            Renovation and exterior work may require Historic Preservation approval.
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : historicStatus === 'done' ? (
                <EmptyState message="Not in a Cincinnati historic district" />
              ) : null}
              <DataAttribution source="Cincinnati Historic Districts — CAGIS" url="https://www.hamiltoncountyohio.gov/government/departments/county_gis_cagis" />
            </DataCard>

            {/* ── CAGIS: Nearby Parks ──────────────────────────────────────── */}
            <DataCard
              title={t('addressLookup.parks', 'Nearby Parks (within 0.5 mi)')}
              loading={parksStatus === 'loading'}
              error={parksStatus === 'error' ? 'Parks data unavailable (CAGIS)' : null}
            >
              {parksStatus === 'done' && nearbyParks.length > 0 ? (
                <div className="space-y-2">
                  {nearbyParks.slice(0, 5).map((p, i) => {
                    // Confirmed layer attrs: NAME, SHORT_NAME, PARKTYPE, SHAPE__Area
                    const name = String(p.SHORT_NAME ?? p.NAME ?? `Park ${i + 1}`);
                    const acres = '';  // SHAPE__Area units unknown; omit display
                    const type = String(p.PARKTYPE ?? '');
                    const nbhd = '';
                    return (
                      <div key={i} className="flex items-center justify-between border-b border-gray-100 pb-1 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{name}</p>
                          {(type || nbhd) && (
                            <p className="text-xs text-gray-500">
                              {[type, nbhd].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        {acres && (
                          <span className="text-xs text-[#1A4A6B] font-medium shrink-0 ml-2">{acres}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : parksStatus === 'done' ? (
                <EmptyState message="No parks found within 0.5 miles" />
              ) : null}
              <DataAttribution source="Parks and Greenspace — CAGIS" url="https://www.hamiltoncountyohio.gov/government/departments/county_gis_cagis" />
            </DataCard>

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
