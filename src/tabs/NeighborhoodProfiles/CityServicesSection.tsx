/**
 * CityServicesSection — Combined 311 + Community Perceptions panel.
 *
 * Two-column layout:
 *   Left  — 311 KPIs (volume, open requests, resolution time) + top request types
 *   Right — Resident satisfaction survey bars, sorted descending by score
 *
 * Note: 311 data is per-neighborhood; Perceptions survey is city-wide (noted in UI).
 *
 * TRANSPLANT NOTE: Self-contained — wrap in a tab shell to promote to own tab.
 */

import { useMemo } from 'react';
import { useSODA } from '../../hooks/useSODA';
import { DataCard, DataAttribution, EmptyState } from '../../components/ui';

interface Props {
  nbhSoQL: string;
  startDate: string;
  endDate: string;
}

const PERCEPTION_METRICS = [
  { key: 'overall_quality_of_life_in', label: 'Overall Quality of Life' },
  { key: 'overall_feeling_of_safety',  label: 'Feeling of Safety' },
  { key: 'police_services',            label: 'Police Services' },
  { key: 'fire_and_ambulance_services',label: 'Fire & Ambulance' },
  { key: 'city_parks_and_recreation',  label: 'Parks & Recreation' },
  { key: 'the_maintenance_of_city',    label: 'City Maintenance' },
  { key: 'overall_quality_of_services',label: 'Quality of City Services' },
  { key: 'overall_image_of_the_city',  label: 'City Image' },
];

// ── Sub-component: horizontal ranked bar list ─────────────────────────────────

function HBarList({ items, color }: { items: { type: string; count: number }[]; color: string }) {
  const max = items[0]?.count ?? 1;
  return (
    <div className="space-y-2.5">
      {items.map(({ type, count }) => (
        <div key={type}>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium truncate max-w-[80%]" style={{ color: '#1a1410' }}>{type}</span>
            <span className="font-semibold ml-2 shrink-0" style={{ color: '#6b5f55' }}>{count.toLocaleString()}</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: '#f6f1ea' }}>
            <div
              className="h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${(count / max) * 100}%`, backgroundColor: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CityServicesSection({ nbhSoQL, startDate, endDate }: Props) {
  const requests311 = useSODA('gcej-gmiw', {
    $where: `neighborhood='${nbhSoQL}' AND date_created >= '${startDate}' AND date_created <= '${endDate}'`,
    $limit: 1000,
  });
  const requests311Count = useSODA('gcej-gmiw', {
    $where: `neighborhood='${nbhSoQL}' AND date_created >= '${startDate}' AND date_created <= '${endDate}'`,
    $select: 'count(*) as total',
  });

  // City-wide survey — no neighborhood filter; all rows are needed for averaging
  const perceptions = useSODA('gdf4-fqik', { $limit: 1000 });

  const requests311ByType = useMemo(() => {
    const counts: Record<string, number> = {};
    (requests311.data || []).forEach((req: any) => {
      const type = req.sr_type_desc || req.group_title || req.sr_type || 'Other';
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [requests311.data]);

  const avgResolutionDays = useMemo(() => {
    const closed = (requests311.data || []).filter(
      (req: any) => req.date_closed && req.date_created
    );
    if (closed.length === 0) return null;
    const totalDays = closed.reduce((sum: number, req: any) => {
      const created = new Date(req.date_created).getTime();
      const closedDate = new Date(req.date_closed).getTime();
      const days = (closedDate - created) / (1000 * 60 * 60 * 24);
      return sum + (days >= 0 ? days : 0);
    }, 0);
    return Math.round((totalDays / closed.length) * 10) / 10;
  }, [requests311.data]);

  const openRequestCount = useMemo(() => {
    return (requests311.data || []).filter((req: any) => {
      const status = (req.sr_status || '').toLowerCase();
      return status.includes('open') || status.includes('pending') || status.includes('assigned');
    }).length;
  }, [requests311.data]);

  // Perception averages — sorted descending by score so highest-rated services appear first
  const perceptionAverages = useMemo(() => {
    if (!perceptions.data || perceptions.data.length === 0) return [];
    return PERCEPTION_METRICS.map(({ key, label }) => {
      const values = (perceptions.data as any[])
        .map((r: any) => parseFloat(r[key]))
        .filter((v) => !isNaN(v) && v >= 1 && v <= 5);
      const avg =
        values.length > 0
          ? values.reduce((a: number, b: number) => a + b, 0) / values.length
          : null;
      return { label, avg: avg !== null ? Math.round(avg * 10) / 10 : null };
    })
      .filter((m) => m.avg !== null)
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0)); // ← descending by score
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perceptions.data]);

  const total311 = parseInt((requests311Count.data as any)?.[0]?.total || '0', 10);
  const loading = requests311.loading || perceptions.loading;

  return (
    <DataCard
      title="City Services"
      loading={loading}
      error={requests311.error || perceptions.error}
      empty={false}
      className="print-page"
    >
      <div className="grid grid-cols-2 gap-6">

        {/* ── Left: 311 ── */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#6b5f55' }}>
            311 Non-Emergency Requests
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="p-3 rounded text-center" style={{ background: '#e6efef' }}>
              <div className="text-xl font-bold" style={{ color: '#2f5d62' }}>{total311.toLocaleString()}</div>
              <div className="text-xs mt-1" style={{ color: '#6b5f55' }}>Total Requests</div>
            </div>
            <div className="p-3 rounded text-center" style={{ background: '#f5e8e1' }}>
              <div className="text-xl font-bold" style={{ color: '#c8861a' }}>
                {openRequestCount.toLocaleString()}
              </div>
              <div className="text-xs mt-1" style={{ color: '#6b5f55' }}>Still Open</div>
            </div>
            <div className="p-3 rounded text-center" style={{ background: '#ecefdf' }}>
              <div className="text-xl font-bold" style={{ color: '#5a7a3e' }}>
                {avgResolutionDays != null ? `${avgResolutionDays}d` : '—'}
              </div>
              <div className="text-xs mt-1" style={{ color: '#6b5f55' }}>Avg Resolution</div>
            </div>
          </div>

          {requests311ByType.length > 0 ? (
            <>
              <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#6b5f55' }}>
                Top request types
              </div>
              <HBarList items={requests311ByType.slice(0, 6)} color="#6366F1" />
            </>
          ) : (
            <EmptyState message="No service requests found" />
          )}

          <DataAttribution source="311 Non-Emergency Service Requests" uid="gcej-gmiw" />
        </div>

        {/* ── Right: Community Perceptions ── */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#6b5f55' }}>
            Resident Satisfaction Survey (1–5)
          </div>
          <p className="text-xs rounded px-2 py-1 mb-3" style={{ color: '#c8861a', background: '#f5e8e1', border: '1px solid #e6c5b2' }}>
            City-wide averages — not specific to {/* neighborhood name injected below if possible */}this neighborhood
          </p>

          {perceptionAverages.length > 0 ? (
            <div className="space-y-3">
              {perceptionAverages.map(({ label, avg }) => (
                <div key={label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span style={{ color: '#1a1410' }}>{label}</span>
                    <span className="font-semibold" style={{ color: '#2f5d62' }}>{avg} / 5</span>
                  </div>
                  <div className="w-full rounded-full h-2" style={{ background: '#e4ddd2' }}>
                    <div
                      className="rounded-full h-2 transition-all"
                      style={{ width: `${((avg ?? 0) / 5) * 100}%`, background: '#2f5d62' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No perception data found" />
          )}

          <DataAttribution source="Community Perceptions Survey" uid="gdf4-fqik" />
        </div>

      </div>
    </DataCard>
  );
}
