/**
 * DevelopmentSection — Combined Building Permits + Tax Abatements + Blight panel.
 *
 * Single card with:
 *   - KPI row: permit count · abatement value · blight records
 *   - Demolition alert when demolitions are present
 *   - Permits-by-type bar chart (demolitions highlighted in red)
 *
 * TRANSPLANT NOTE: Self-contained — wrap in a tab shell to promote to own tab.
 */

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useSODA } from '../../hooks/useSODA';
import { formatCurrency } from '../../utils/api';
import { DataCard, DataAttribution, EmptyState } from '../../components/ui';

interface Props {
  nbhSoQL: string;      // UPPER CASE — used for permits and blight datasets
  neighborhood: string; // Title Case display name — used for tax abatements (ccd_neigh field)
}

// Exclude trade permits so only structural permits are counted
const PERMIT_TYPE_FILTER =
  " AND (permittypemapped IS NULL OR (" +
  "lower(permittypemapped) NOT LIKE '%mechanical%' AND " +
  "lower(permittypemapped) NOT LIKE '%plumbing%' AND " +
  "lower(permittypemapped) NOT LIKE '%electrical%' AND " +
  "lower(permittypemapped) NOT LIKE '%fire suppression%' AND " +
  "lower(permittypemapped) != 'hvac'))";

export default function DevelopmentSection({ nbhSoQL, neighborhood }: Props) {
  const permitsWhere = `neighborhood='${nbhSoQL}' AND neighborhood != 'N/A'${PERMIT_TYPE_FILTER}`;

  const permits = useSODA('uhjb-xac9', { $where: permitsWhere, $limit: 500 });
  const permitsCount = useSODA('uhjb-xac9', {
    $where: permitsWhere,
    $select: 'count(*) as total',
  });

  // Tax abatements use Title Case neighborhood name via ccd_neigh field
  const taxAbatements = useSODA('tkp7-yf64', {
    $where: `ccd_neigh='${neighborhood.replace(/'/g, "''")}'`,
    $limit: 500,
  });

  const blightCount = useSODA('pk9w-99n6', {
    $where: `neighborhood='${nbhSoQL}'`,
    $select: 'count(*) as total',
  });

  const permitsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    (permits.data || []).forEach((permit: any) => {
      const type = permit.permittypemapped || permit.permittype || 'Other';
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [permits.data]);

  const demolitionCount =
    permitsByType.find((p) => p.type.toLowerCase().includes('demolition'))?.count ?? 0;

  const abatementTotal = useMemo(() => {
    let total = 0;
    (taxAbatements.data || []).forEach((item: any) => {
      total += parseFloat(item.abatement_value || item.incentive_amount || 0);
    });
    return total;
  }, [taxAbatements.data]);

  const totalPermits = parseInt((permitsCount.data as any)?.[0]?.total || '0', 10);
  const totalBlight = parseInt((blightCount.data as any)?.[0]?.total || '0', 10);
  const activeAbatements = taxAbatements.data?.length ?? 0;

  const loading = permits.loading || taxAbatements.loading || blightCount.loading;

  return (
    <DataCard
      title="Development Activity"
      loading={loading}
      error={permits.error || taxAbatements.error || blightCount.error}
      empty={false}
      className="print-page"
    >
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-blue-50 p-4 rounded">
          <div className="text-2xl font-bold text-[#1A4A6B]">{totalPermits.toLocaleString()}</div>
          <div className="text-xs text-blue-400 font-semibold mt-1">Building Permits</div>
          <div className="text-xs text-gray-400 mt-0.5">structural only, excl. trade permits</div>
        </div>
        <div className="bg-green-50 p-4 rounded">
          <div className="text-2xl font-bold text-green-700">
            {abatementTotal > 0
              ? formatCurrency(abatementTotal)
              : activeAbatements > 0
              ? `${activeAbatements} active`
              : '—'}
          </div>
          <div className="text-xs text-green-500 font-semibold mt-1">Tax Abatement Value</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {activeAbatements} active abatement{activeAbatements !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="bg-amber-50 p-4 rounded">
          <div className="text-2xl font-bold text-[#C8861A]">{totalBlight.toLocaleString()}</div>
          <div className="text-xs text-amber-400 font-semibold mt-1">Blight Records</div>
          <div className="text-xs text-gray-400 mt-0.5">active PLAP complaints</div>
        </div>
      </div>

      {/* Demolition alert */}
      {demolitionCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5 flex items-start gap-2 text-sm text-red-800">
          <span className="text-base mt-0.5 shrink-0">⚠</span>
          <span>
            <strong>
              {demolitionCount} demolition permit{demolitionCount > 1 ? 's' : ''}
            </strong>{' '}
            issued in this period — flagged for displacement tracking.
          </span>
        </div>
      )}

      {/* Permits by type chart — demolitions highlighted in red */}
      {permitsByType.length > 0 ? (
        <>
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
            Permits by type
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={permitsByType.slice(0, 8)} margin={{ bottom: 60, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="type"
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + '…' : v}
              />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {permitsByType.slice(0, 8).map((entry) => (
                  <Cell
                    key={entry.type}
                    fill={entry.type.toLowerCase().includes('demolition') ? '#DC2626' : '#C8861A'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      ) : (
        <EmptyState message="No permits found" />
      )}

      <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-4">
        <DataAttribution source="Building Permits" uid="uhjb-xac9" />
        <DataAttribution source="Tax Abatements" uid="tkp7-yf64" />
        <DataAttribution source="PLAP Blight" uid="pk9w-99n6" />
      </div>
    </DataCard>
  );
}
