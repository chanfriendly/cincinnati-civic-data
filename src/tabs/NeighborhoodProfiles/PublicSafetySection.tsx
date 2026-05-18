/**
 * PublicSafetySection — Combined Crime + Fire & EMS panel.
 *
 * Three selectable views:
 *   Overview     — side-by-side CPD vs CFD mini-rankings
 *   Crime Detail — full bar chart of offense categories
 *   Fire & EMS   — full bar chart of dispatch types
 *
 * TRANSPLANT NOTE: Self-contained — wrap in a tab shell to promote to own tab.
 */

import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { useSODA } from '../../hooks/useSODA';
import { DataCard, DataAttribution, EmptyState } from '../../components/ui';
import { C } from '../../components/ui/DesignAtoms';

interface Props {
  nbhSoQL: string;
  startDate: string;
  endDate: string;
}

// Mapping incident_type_id prefixes → human-readable labels for newer CFD records
const INCIDENT_ID_LABEL: Record<string, string> = {
  ABDOM: 'Abdominal Pain', ALLERGIC: 'Allergic Reaction', ASSAULT: 'Assault',
  BACK: 'Back Pain', BITE: 'Animal Bite', BREATH: 'Breathing Problems',
  BURN: 'Burns', CARDIAC: 'Cardiac Arrest', CHPN: 'Chest Pain',
  DIABETIC: 'Diabetic Emergency', DROWN: 'Drowning', EMS: 'Medical Emergency',
  FALL: 'Falls', FALLS: 'Falls', FAINT: 'Fainting / Unconscious',
  FIRE: 'Fire', FALARM: 'Fire Alarm', FALCID: 'False Alarm',
  HAZMAT: 'Hazmat', HEADACHE: 'Headache', HEMOR: 'Hemorrhage',
  INFOF: 'Administrative', OD: 'Overdose', OBSTETRIC: 'Obstetric',
  PAIN: 'Pain', PSYCH: 'Psychiatric', RESCUE: 'Rescue',
  SICK: 'Illness', STROKE: 'Stroke', STUCK: 'Stuck in Elevator',
  TRAUMATIC: 'Traumatic Injury', UNCONSCIOUS: 'Unconscious', VEHICLE: 'Vehicle Accident',
};

type Tab = 'overview' | 'crime' | 'ems';

// ── Sub-component: horizontal ranked bar list ─────────────────────────────────

function HBarList({ items, color }: { items: { type: string; count: number }[]; color: string }) {
  const max = items[0]?.count ?? 1;
  return (
    <div className="space-y-2.5">
      {items.map(({ type, count }) => (
        <div key={type}>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium truncate max-w-[75%]" style={{ color: C.ink }}>{type}</span>
            <span className="font-semibold ml-2 shrink-0" style={{ color: C.muted }}>{count.toLocaleString()}</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: C.limestone }}>
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

export default function PublicSafetySection({ nbhSoQL, startDate, endDate }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Crime — PDI legacy + STARS current
  const crimeOld = useSODA('k59e-2pvf', {
    $where: `cpd_neighborhood='${nbhSoQL}' AND date_reported >= '${startDate}' AND date_reported <= '${endDate}'`,
    $limit: 1000,
  });
  const crimeOldCount = useSODA('k59e-2pvf', {
    $where: `cpd_neighborhood='${nbhSoQL}' AND date_reported >= '${startDate}' AND date_reported <= '${endDate}'`,
    $select: 'count(*) as total',
  });
  const crimeNew = useSODA('7aqy-xrv9', {
    $where: `cpd_neighborhood='${nbhSoQL}' AND datereported >= '${startDate}' AND datereported <= '${endDate}'`,
    $limit: 1000,
  });
  const crimeNewCount = useSODA('7aqy-xrv9', {
    $where: `cpd_neighborhood='${nbhSoQL}' AND datereported >= '${startDate}' AND datereported <= '${endDate}'`,
    $select: 'count(*) as total',
  });

  // Fire & EMS
  const fireEms = useSODA('vnsz-a3wp', {
    $where: `neighborhood='${nbhSoQL}' AND create_time_incident >= '${startDate}' AND create_time_incident <= '${endDate}'`,
    $limit: 500,
  });
  const fireEmsCount = useSODA('vnsz-a3wp', {
    $where: `neighborhood='${nbhSoQL}' AND create_time_incident >= '${startDate}' AND create_time_incident <= '${endDate}'`,
    $select: 'count(*) as total',
  });

  const crimeByType = useMemo(() => {
    const combined = [...(crimeOld.data || []), ...(crimeNew.data || [])];
    const counts: Record<string, number> = {};
    combined.forEach((record: any) => {
      const type = record.stars_category || record.offense || 'Unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [crimeOld.data, crimeNew.data]);

  const fireEmsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    (fireEms.data || []).forEach((incident: any) => {
      let type: string = incident.cfd_incident_type_group || incident.incident_type_desc || '';
      if (!type && incident.incident_type_id) {
        const raw = String(incident.incident_type_id).replace(/^=/, '');
        const prefix = raw.split(/[\s-]/)[0].toUpperCase();
        type = INCIDENT_ID_LABEL[prefix] ?? raw;
      }
      counts[type || 'Other'] = (counts[type || 'Other'] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [fireEms.data]);

  const totalCrime =
    parseInt((crimeOldCount.data as any)?.[0]?.total || '0', 10) +
    parseInt((crimeNewCount.data as any)?.[0]?.total || '0', 10);
  const totalEms = parseInt((fireEmsCount.data as any)?.[0]?.total || '0', 10);

  const loading = crimeOld.loading || crimeNew.loading || fireEms.loading;
  const error = crimeOld.error || crimeNew.error || fireEms.error;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'crime', label: 'Crime Detail' },
    { id: 'ems', label: 'Fire & EMS Detail' },
  ];

  return (
    <DataCard
      title="Public Safety"
      loading={loading}
      error={error}
      empty={crimeByType.length === 0 && fireEmsByType.length === 0}
      className="print-page"
    >
      {/* Shared KPI row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="p-3 rounded-md" style={{ background: C.riverLight }}>
          <div className="text-2xl font-bold" style={{ color: C.river }}>{totalCrime.toLocaleString()}</div>
          <div className="text-xs font-semibold mt-1" style={{ color: C.river }}>CPD Incidents</div>
        </div>
        <div className="p-3 rounded-md" style={{ background: C.brickLight }}>
          <div className="text-2xl font-bold" style={{ color: C.ochre }}>{totalEms.toLocaleString()}</div>
          <div className="text-xs font-semibold mt-1" style={{ color: C.ochre }}>CFD Dispatches</div>
        </div>
        <div className="p-3 rounded-md" style={{ background: C.limestone }}>
          <div className="text-2xl font-bold" style={{ color: C.ink }}>
            {(totalCrime + totalEms).toLocaleString()}
          </div>
          <div className="text-xs font-semibold mt-1" style={{ color: C.muted }}>Total Incidents</div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5" style={{ borderBottom: `1px solid ${C.rule}` }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-3 py-2 text-xs font-semibold rounded-t border-b-2 -mb-px transition-colors"
            style={
              activeTab === tab.id
                ? { color: C.river, borderColor: C.river, background: C.riverLight }
                : { color: C.muted, borderColor: 'transparent', background: 'transparent' }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview — side-by-side CPD vs CFD */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 gap-5">
          <div className="rounded-md p-4" style={{ border: `1px solid ${C.rule}` }}>
            <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: C.river }}>
              Cincinnati Police
            </div>
            <div className="text-2xl font-bold mb-0.5" style={{ color: C.river }}>
              {totalCrime.toLocaleString()}
            </div>
            <div className="text-xs mb-4" style={{ color: C.muted }}>top 5 offense categories</div>
            {crimeByType.length > 0
              ? <HBarList items={crimeByType.slice(0, 5)} color={C.river} />
              : <p className="text-xs italic" style={{ color: C.muted }}>No records found</p>
            }
          </div>
          <div className="rounded-md p-4" style={{ border: `1px solid ${C.rule}` }}>
            <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: C.brick }}>
              Cincinnati Fire / EMS
            </div>
            <div className="text-2xl font-bold mb-0.5" style={{ color: C.brick }}>
              {totalEms.toLocaleString()}
            </div>
            <div className="text-xs mb-4" style={{ color: C.muted }}>top 5 dispatch types</div>
            {fireEmsByType.length > 0
              ? <HBarList items={fireEmsByType.slice(0, 5)} color={C.brick} />
              : <p className="text-xs italic" style={{ color: C.muted }}>No records found</p>
            }
          </div>
        </div>
      )}

      {/* Crime Detail */}
      {activeTab === 'crime' && (
        crimeByType.length > 0 ? (
          <>
            <p className="text-xs italic mb-3" style={{ color: C.muted }}>
              Incidents reported to Cincinnati Police Department, broken down by offense category.
              Sourced from the PDI legacy dataset and the current STARS system.
            </p>
            <div className="text-2xl font-bold mb-1" style={{ color: C.ochre }}>
              {totalCrime.toLocaleString()}
            </div>
            <div className="text-sm mb-4" style={{ color: C.muted }}>
              total incidents ({startDate} to {endDate})
              {totalCrime > 2000 && (
                <span className="ml-1 text-xs" style={{ color: C.muted }}>(chart shows sample of 2,000)</span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={crimeByType.slice(0, 10)} margin={{ bottom: 60, left: 10 }}>
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
                <Bar dataKey="count" fill={C.river} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        ) : <EmptyState message="No crime records found" />
      )}

      {/* Fire & EMS Detail */}
      {activeTab === 'ems' && (
        fireEmsByType.length > 0 ? (
          <>
            <p className="text-xs italic mb-3" style={{ color: C.muted }}>
              All incidents dispatched to Cincinnati Fire Department — including fires, medical
              emergencies, and rescue calls — within the selected date range.
            </p>
            <div className="text-2xl font-bold mb-1" style={{ color: C.river }}>
              {totalEms.toLocaleString()}
            </div>
            <div className="text-sm mb-4" style={{ color: C.muted }}>
              total dispatches
              {totalEms > 500 && (
                <span className="ml-1 text-xs" style={{ color: C.muted }}>(chart shows sample of 500)</span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={fireEmsByType.slice(0, 8)} margin={{ bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="type"
                  angle={-40}
                  textAnchor="end"
                  height={110}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => v.length > 20 ? v.slice(0, 18) + '…' : v}
                  interval={0}
                />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill={C.brick} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        ) : <EmptyState message="No incidents found" />
      )}

      <div className="mt-4 pt-3 flex flex-wrap gap-4" style={{ borderTop: `1px solid ${C.rule}` }}>
        <DataAttribution source="PDI Crime Incidents + STARS" uid="k59e-2pvf" />
        <DataAttribution source="Fire & EMS Incidents" uid="vnsz-a3wp" />
      </div>
    </DataCard>
  );
}
