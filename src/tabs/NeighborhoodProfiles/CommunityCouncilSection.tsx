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
import { C } from '../../components/ui/DesignAtoms';

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
        <p className="text-sm italic" style={{ color: C.muted }}>
          No community council found for {neighborhood}. This neighborhood may share a council with an adjacent area, or the council may be inactive.
        </p>
      )}

      {matched.map((council, i) => (
        <div key={i} className={i > 0 ? 'mt-5 pt-5' : ''} style={i > 0 ? { borderTop: `1px solid ${C.rule}` } : {}}>
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <h4 className="text-sm font-semibold" style={{ color: C.ink }}>{council.name}</h4>
              {council.sna_neighborhoods.length > 1 && (
                <p className="text-[11px] mt-0.5" style={{ color: C.muted }}>
                  Covers: {council.sna_neighborhoods.join(', ')}
                </p>
              )}
            </div>
            {council.inactive && (
              <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: C.brickLight, color: C.brick, border: '1px solid #e6c5b2' }}>
                Inactive
              </span>
            )}
          </div>

          <div className="space-y-2 text-sm">
            {council.meeting_time && (
              <div className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5" style={{ color: C.muted }}>📅</span>
                <div>
                  <span className="font-medium" style={{ color: C.ink }}>Meetings: </span>
                  <span style={{ color: C.muted }}>{council.meeting_time}</span>
                  {council.meeting_place && (
                    <div className="text-xs mt-0.5" style={{ color: C.muted }}>{council.meeting_place}</div>
                  )}
                </div>
              </div>
            )}
            {council.phone && (
              <div className="flex items-center gap-2">
                <span className="shrink-0" style={{ color: C.muted }}>📞</span>
                <a href={`tel:${council.phone}`} className="hover:underline" style={{ color: C.river }}>
                  {council.phone}
                </a>
              </div>
            )}
            {council.email && (
              <div className="flex items-center gap-2">
                <span className="shrink-0" style={{ color: C.muted }}>✉️</span>
                <a href={`mailto:${council.email}`} className="hover:underline text-xs break-all" style={{ color: C.river }}>
                  {council.email}
                </a>
              </div>
            )}
            {council.website && (
              <div className="flex items-center gap-2">
                <span className="shrink-0" style={{ color: C.muted }}>🌐</span>
                <a href={council.website} target="_blank" rel="noopener noreferrer"
                  className="hover:underline text-xs break-all" style={{ color: C.river }}>
                  {council.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
            {council.address && (
              <div className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5" style={{ color: C.muted }}>📍</span>
                <span className="text-xs" style={{ color: C.muted }}>{council.address}</span>
              </div>
            )}
            {council.notes && (
              <div className="rounded-md p-2 text-xs mt-2" style={{ background: C.brickLight, border: '1px solid #e6c5b2', color: C.brick }}>
                {council.notes}
              </div>
            )}
          </div>
        </div>
      ))}

      <div className="mt-4 pt-3 space-y-1" style={{ borderTop: `1px solid ${C.rule}` }}>
        <p className="text-[10px] italic" style={{ color: C.muted }}>
          Directory data from 2012 city records — contact details may have changed.
          <a href="https://github.com/chanfriendly/cincinnati-civic-data" target="_blank" rel="noopener noreferrer"
            className="hover:underline ml-1" style={{ color: C.river }}>Submit a correction on GitHub →</a>
        </p>
        <DataAttribution
          source="Community Council Information · Cincinnati Open Data"
          url="https://data.cincinnati-oh.gov/dataset/Community-Council-Information/h68y-9f7w"
        />
      </div>
    </DataCard>
  );
}
