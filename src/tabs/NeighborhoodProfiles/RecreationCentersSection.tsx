/**
 * RecreationCentersSection — Shows nearby Cincinnati Recreation Commission (CRC)
 * centers for the selected neighborhood, matched by SNA neighborhood name.
 *
 * Source: /data/recreation_centers.json (pre-built from Socrata vset-45gc,
 * geocoded via OSM Nominatim, neighborhood assigned by nearest SNA centroid).
 */

import { useState, useEffect, useMemo } from 'react';
import { stripNeighborhoodName } from '../../utils/api';
import { DataCard, DataAttribution } from '../../components/ui';

interface Props {
  neighborhood: string;
}

interface RecCenter {
  name: string;
  address: string;
  zip: string;
  phone: string;
  neighborhood: string;
  lat: number;
  lon: number;
}

export default function RecreationCentersSection({ neighborhood }: Props) {
  const [centers, setCenters] = useState<RecCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/recreation_centers.json')
      .then(r => r.json())
      .then(setCenters)
      .catch(() => setError('Failed to load recreation center data'))
      .finally(() => setLoading(false));
  }, []);

  const key = stripNeighborhoodName(neighborhood);

  const local = useMemo(
    () => centers.filter(c => stripNeighborhoodName(c.neighborhood) === key),
    [centers, key]
  );

  return (
    <DataCard
      title="Recreation Centers (CRC)"
      loading={loading}
      error={error}
      empty={!loading && !error && centers.length === 0}
    >
      {local.length > 0 ? (
        <div className="space-y-3">
          {local.map((c, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-2xl shrink-0">🏋️</span>
              <div>
                <div className="text-sm font-semibold text-gray-900">{c.name}</div>
                <div className="text-xs text-gray-500">{c.address}, Cincinnati OH {c.zip}</div>
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="text-xs text-[#1A4A6B] hover:underline">
                    {c.phone}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-500 italic mb-4">
            No CRC recreation center is assigned to {neighborhood}. The nearest centers are listed below.
          </p>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">All CRC Recreation Centers</div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {centers.filter(c => !['Leonard Shore Senior Center'].includes(c.name)).slice(0, 12).map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-sm shrink-0">🏋️</span>
                <div>
                  <div className="text-xs font-medium text-gray-800">{c.name}</div>
                  <div className="text-[10px] text-gray-500">{c.neighborhood} · {c.phone}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-3">
        <a
          href="https://www.cincinnati-oh.gov/crc/find-a-facility/recreation-center/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#1A4A6B] hover:underline"
        >
          All CRC facilities & programs →
        </a>
        <DataAttribution source="Cincinnati Recreation Commission · data.cincinnati-oh.gov" uid="crc-vset-45gc" />
      </div>
    </DataCard>
  );
}
