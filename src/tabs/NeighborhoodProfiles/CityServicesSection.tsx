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
            <span className="text-gray-700 font-medium truncate max-w-[80%]">{type}</span>
            <span className="text-gray-400 font-semibold ml-2 shrink-0">{count.toLocaleString()}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full">
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
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
            311 Non-Emergency Requests
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-blue-50 p-3 rounded text-center">
              <div className="text-xl font-bold text-[#1A4A6B]">{total311.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-1">Total Requests</div>
            </div>
            <div className="bg-amber-50 p-3 rounded text-center">
              <div className="text-xl font-bold text-amber-700">
                {openRequestCount.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">Still Open</div>
            </div>
            <div className="bg-green-50 p-3 rounded text-center">
              <div className="text-xl font-bold text-green-700">
                {avgResolutionDays != null ? `${avgResolutionDays}d` : '—'}
              </div>
              <div className="text-xs text-gray-500 mt-1">Avg Resolution</div>
            </div>
          </div>

          {requests311ByType.length > 0 ? (
            <>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
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
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
            Resident Satisfaction Survey (1–5)
          </div>

          {perceptionAverages.length > 0 ? (
            <div className="space-y-3">
              {perceptionAverages.map(({ label, avg }) => (
                <div key={label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700">{label}</span>
                    <span className="font-semibold text-[#1A4A6B]">{avg} / 5</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-[#1A4A6B] rounded-full h-2 transition-all"
                      style={{ width: `${((avg ?? 0) / 5) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray-400 italic mt-2 pt-2 border-t border-gray-100">
                Survey ratings are city-wide averages — not specific to this neighborhood.
              </p>
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
