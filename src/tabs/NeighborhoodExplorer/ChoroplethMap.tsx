import { useRef, useEffect, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { NeighborhoodScore } from '../../types';
import { C } from '../../components/ui/DesignAtoms';

// Inline GeoJSON types (avoids @types/geojson dependency)
type GeoJSONFeature = { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: string; coordinates: number[][][] | number[][][][] } };
type GeoJSONFeatureCollection = { type: 'FeatureCollection'; features: GeoJSONFeature[] };



interface ChoroplethMapProps {
  geojson: GeoJSONFeatureCollection | null;
  scores: NeighborhoodScore[];
  colorblindMode: boolean;
  onNeighborhoodClick: (name: string) => void;
  selectedNeighborhood: string | null;
  anyDimensionEnabled: boolean;
}

export default function ChoroplethMap({
  geojson,
  scores,
  colorblindMode: _colorblindMode,
  onNeighborhoodClick,
  selectedNeighborhood,
  anyDimensionEnabled,
}: ChoroplethMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const geojsonLayer = useRef<L.GeoJSON | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Initialize map once
    if (!map.current) {
      map.current = L.map(mapContainer.current).setView([39.1031, -84.512], 11);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CartoDB',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map.current);

      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!map.current || !geojson) return;

    // Remove old layer
    if (geojsonLayer.current) {
      map.current.removeLayer(geojsonLayer.current);
    }

    // Score map
    const scoreMap = new Map(scores.map((s) => [s.name.toUpperCase(), s]));

    // Color scale — river-based 5-stop gradient (single scheme for all modes)
    function getColor(score: number | null): string {
      if (score === null || !anyDimensionEnabled) return C.rule;
      if (score < 20) return C.limestone;
      if (score < 40) return C.riverLight;
      if (score < 60) return '#6CA9C8'; // midpoint — no exact token
      if (score < 80) return C.river;
      return C.riverDeep;
    }

    geojsonLayer.current = L.geoJSON(geojson, {
      style: (feature) => {
        const neighName = feature?.properties?.NEIGH?.toUpperCase();
        const score = scoreMap.get(neighName);
        const color = getColor(score?.compositeScore ?? null);

        return {
          fillColor: color,
          weight: selectedNeighborhood?.toUpperCase() === neighName ? 3 : 1,
          opacity: 1,
          color: selectedNeighborhood?.toUpperCase() === neighName ? C.ochre : C.muted,
          dashArray: '',
          fillOpacity: 0.7,
        };
      },
      onEachFeature: (feature, layer) => {
        const neighName = feature.properties?.NEIGH;
        const score = scoreMap.get(neighName?.toUpperCase());

        layer.bindPopup(`
          <div class="font-semibold">${neighName}</div>
          <div class="text-sm">Score: ${score?.compositeScore ?? 'N/A'}</div>
        `);

        layer.on('click', () => {
          if (neighName) {
            onNeighborhoodClick(neighName);
          }
        });

        layer.on('mouseover', () => {
          const leafletLayer = layer as L.Path;
          leafletLayer.setStyle({
            weight: 2,
            opacity: 0.9,
          });
        });

        layer.on('mouseout', () => {
          const leafletLayer = layer as L.Path;
          const neighUpper = neighName?.toUpperCase();
          leafletLayer.setStyle({
            weight: neighUpper === selectedNeighborhood?.toUpperCase() ? 3 : 1,
            opacity: 1,
          });
        });
      },
    }).addTo(map.current);

    return () => {
      if (geojsonLayer.current && map.current) {
        map.current.removeLayer(geojsonLayer.current);
      }
    };
  }, [geojson, scores, selectedNeighborhood, anyDimensionEnabled, onNeighborhoodClick]);

  // IMPORTANT: the map container div MUST always be in the DOM so that
  // mapContainer.current is set and Leaflet can initialize. If we conditionally
  // render a loading spinner *instead of* this div, mapContainer.current stays
  // null, the map never initializes, and setIsLoading(false) is never called —
  // resulting in a permanent loading state. Instead, overlay the spinner on top.
  return (
    <div className="relative w-full h-full" style={{ minHeight: '500px' }}>
      <div
        ref={mapContainer}
        className="w-full h-full rounded-md overflow-hidden"
        style={{ minHeight: '500px', border: `1px solid ${C.rule}` }}
      />
      {(isLoading || !geojson) && (
        <div className="absolute inset-0 rounded-md flex items-center justify-center" style={{ background: C.limestone }}>
          <div className="text-center">
            <div className="animate-pulse mb-4">
              <div className="w-12 h-12 rounded-full mx-auto" style={{ background: C.river }}></div>
            </div>
            <p style={{ color: C.muted }}>
              {!geojson ? 'Loading neighborhood map...' : 'Initializing map...'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
