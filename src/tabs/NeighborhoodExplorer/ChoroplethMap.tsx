import React, { useRef, useEffect, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { NeighborhoodScore } from '../../types';

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
  colorblindMode,
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

    // Color scale
    function getColor(score: number | null): string {
      if (score === null || !anyDimensionEnabled) return '#CCCCCC';

      if (colorblindMode) {
        // Orange scale for colorblind
        if (score < 20) return '#FFF3E0';
        if (score < 40) return '#FFE0B2';
        if (score < 60) return '#FFCC80';
        if (score < 80) return '#FFB74D';
        return '#E65100';
      } else {
        // Blue scale
        if (score < 20) return '#E8F4F8';
        if (score < 40) return '#A8D8E8';
        if (score < 60) return '#6CA9C8';
        if (score < 80) return '#2C6A9A';
        return '#1A4A6B';
      }
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
          color: selectedNeighborhood?.toUpperCase() === neighName ? '#C8861A' : '#999',
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
  }, [geojson, scores, colorblindMode, selectedNeighborhood, anyDimensionEnabled, onNeighborhoodClick]);

  // IMPORTANT: the map container div MUST always be in the DOM so that
  // mapContainer.current is set and Leaflet can initialize. If we conditionally
  // render a loading spinner *instead of* this div, mapContainer.current stays
  // null, the map never initializes, and setIsLoading(false) is never called —
  // resulting in a permanent loading state. Instead, overlay the spinner on top.
  return (
    <div className="relative w-full h-full" style={{ minHeight: '500px' }}>
      <div
        ref={mapContainer}
        className="w-full h-full rounded-lg overflow-hidden border border-gray-300"
        style={{ minHeight: '500px' }}
      />
      {(isLoading || !geojson) && (
        <div className="absolute inset-0 bg-gray-100 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <div className="animate-pulse mb-4">
              <div className="w-12 h-12 bg-civic-blue rounded-full mx-auto"></div>
            </div>
            <p className="text-gray-600">
              {!geojson ? 'Loading neighborhood map...' : 'Initializing map...'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
