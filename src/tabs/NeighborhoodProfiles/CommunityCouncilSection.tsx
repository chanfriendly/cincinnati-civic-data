/**
 * CommunityCouncilSection — Displays the community council(s) for a neighborhood.
 *
 * Source: /data/community_councils.json (manually curated from city directory,
 * originally sourced from the Cincinnati Community Council Directory Google Sheet).
 * Data reflects the 2012 city directory — contact details may have changed.
 * File is PR-editable on GitHub for corrections.
 *
 * SNA vs CCB note: Cincinnati's Community Council Boundaries (CCBs) sometimes
 * differ from SNA neighborhood boundaries. CUF covers Clifton Heights, Fairview,
 * and University Heights. O'Bryonville and Queensgate have no separate CCB.
 */

import { useState, useEffect, useMemo } from 'react';
import { stripNeighborhoodName } from '../../utils/api';
import { DataCard, DataAttribution } from '../../components/ui';

interface Props {
  neighborhood: string;
}

interface CouncilRecord {
  name: string;
  sna_neighborhoods: string[];
  address: string | null;
  email: string | null;
  website: string | null;
  phone: string | null;
  meeting_place: string | null;
  meeting_time: string | null;
  inactive: boolean | null;
  notes: string | null;
}

export default function CommunityCouncilSection({ neighborhood }: Props) {
  const [councils, setCouncils] = useState<CouncilRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/community_councils.json')
      .then(r => r.json())
      .then(setCouncils)
      .catch(() => setError('Failed to load community council data'))
      .finally(() => setLoading(false));
  }, []);

  const key = stripNeighborhoodName(neighborhood);

  // Match councils whose sna_neighborhoods include this neighborhood
  const matched = useMemo(() =>
    councils.filter(c =>
      c.sna_neighborhoods.some(n => stripNeighborhoodName(n) === key)
    ),
    [councils, key]
  );

  return (
    <DataCard
      title="Community Council"
      loading={loading}
      error={error}
      empty={!loading && !error && matched.length === 0}
    >
      {matched.length === 0 && !loading && (
        <p className="text-sm text-gray-500 italic">
          No community council found for {neighborhood}. This neighborhood may share a council with an adjacent area, or the council may be inactive.
        </p>
      )}

      {matched.map((council, i) => (
        <div key={i} className={`${i > 0 ? 'mt-5 pt-5 border-t border-gray-100' : ''}`}>
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">{council.name}</h4>
              {council.sna_neighborhoods.length > 1 && (
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Covers: {council.sna_neighborhoods.join(', ')}
                </p>
              )}
            </div>
            {council.inactive && (
              <span className="shrink-0 text-[10px] bg-red-50 text-red-600 font-semibold px-2 py-0.5 rounded-full border border-red-200">
                Inactive
              </span>
            )}
          </div>

          <div className="space-y-2 text-sm">
            {council.meeting_time && (
              <div className="flex items-start gap-2">
                <span className="text-gray-400 shrink-0 mt-0.5">📅</span>
                <div>
                  <span className="font-medium text-gray-700">Meetings: </span>
                  <span className="text-gray-600">{council.meeting_time}</span>
                  {council.meeting_place && (
                    <div className="text-xs text-gray-500 mt-0.5">{council.meeting_place}</div>
                  )}
                </div>
              </div>
            )}
            {council.phone && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400 shrink-0">📞</span>
                <a href={`tel:${council.phone}`} className="text-[#1A4A6B] hover:underline">
                  {council.phone}
                </a>
              </div>
            )}
            {council.email && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400 shrink-0">✉️</span>
                <a href={`mailto:${council.email}`} className="text-[#1A4A6B] hover:underline text-xs break-all">
                  {council.email}
                </a>
              </div>
            )}
            {council.website && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400 shrink-0">🌐</span>
                <a href={council.website} target="_blank" rel="noopener noreferrer"
                  className="text-[#1A4A6B] hover:underline text-xs break-all">
                  {council.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
            {council.address && (
              <div className="flex items-start gap-2">
                <span className="text-gray-400 shrink-0 mt-0.5">📍</span>
                <span className="text-gray-600 text-xs">{council.address}</span>
              </div>
            )}
            {council.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800 mt-2">
                {council.notes}
              </div>
            )}
          </div>
        </div>
      ))}

      <div className="mt-4 pt-3 border-t border-gray-100 space-y-1">
        <p className="text-[10px] text-gray-400 italic">
          Directory data from 2012 city records — contact details may have changed.
          <a href="https://github.com/chanfriendly/cincinnati-civic-data" target="_blank" rel="noopener noreferrer"
            className="text-[#1A4A6B] hover:underline ml-1">Submit a correction on GitHub →</a>
        </p>
        <DataAttribution
          source="Cincinnati Community Council Directory · City of Cincinnati"
          uid="community-councils-directory"
        />
      </div>
    </DataCard>
  );
}
