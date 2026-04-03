/**
 * HousingInventorySection — HUD Subsidized Housing Inventory per neighborhood.
 *
 * Shows HUD-assisted housing units in the selected neighborhood:
 *   - Total assisted units and property count
 *   - Breakdown by program type (Public Housing, Section 8, LIHTC, etc.)
 *   - Alert for any properties with contracts expiring within 5 years
 *   - Transparent data-gap notice when no data is available
 *
 * Data source: /data/hud_affordable_housing.json
 *   — pre-built by scripts/build_hud.py from the HUD Multifamily Properties
 *     Assisted ArcGIS FeatureServer (fully public, no auth required).
 *
 * TRANSPLANT NOTE: Self-contained — accepts `neighborhood` (display name) and
 * `nbhKey` (stripped key). To promote to its own tab, wrap in a tab shell.
 */

import { useState, useEffect } from 'react';
import { fetchNeighborhoodHUDStats, stripNeighborhoodName } from '../../utils/api';
import type { NeighborhoodHUDStats } from '../../types';
import { DataCard, DataAttribution } from '../../components/ui';

interface Props {
  neighborhood: string; // Display name, e.g. "Over-the-Rhine"
}

// ── HUD program code → plain-English labels ───────────────────────────────────
// Codes come from HUD's Multifamily Assisted Housing database.
// Reference: https://www.huduser.gov/portal/datasets/assthsg.html
const PROGRAM_LABELS: Record<string, { label: string; description: string }> = {
  // Section 8 — tenant-based and project-based rental assistance
  'Sec 8 NC':        { label: 'Section 8 – New Construction',             description: 'Project-based Section 8 contracts on newly built rental housing.' },
  'Sec 8 SR':        { label: 'Section 8 – Substantial Rehab',            description: 'Section 8 contracts tied to buildings that were substantially rehabilitated.' },
  'LMSA':            { label: 'Section 8 – Loan Management Set-Aside',    description: 'Section 8 assistance layered onto HUD-insured mortgages to keep rents affordable.' },
  'PD/8 Existing':   { label: 'Section 8 Property Disposition – Existing', description: 'Section 8 contracts on HUD-foreclosed properties sold to preserve affordability.' },
  'PD/8 SR':         { label: 'Section 8 Property Disposition – Substantial Rehab', description: 'Section 8 contracts on HUD-foreclosed properties that were substantially rehabilitated after sale.' },
  'HFDA/8 NC':       { label: 'HUD-Financed Section 8 – New Construction', description: 'HUD direct-loan financing combined with Section 8 contracts on new construction.' },
  'HFDA/8 SR':       { label: 'HUD-Financed Section 8 – Substantial Rehab', description: 'HUD direct-loan financing combined with Section 8 contracts on substantially rehabilitated housing.' },
  // Section 202 — housing for low-income elderly households
  '202/8 NC':        { label: 'Section 202 Elderly Housing – New Construction', description: 'HUD-financed housing for low-income seniors (62+) with attached Section 8 assistance.' },
  'PRAC/202':        { label: 'Section 202 Elderly Housing – Project Rental Assistance', description: 'Newer Section 202 elderly housing funded through Project Rental Assistance Contracts rather than Section 8.' },
  // Section 811 — housing for people with disabilities
  '811 PRA DEMO':    { label: 'Section 811 Disability Housing – PRA Demo', description: 'Rental assistance for people with disabilities, administered through a state-partnership demonstration program.' },
  'PRAC/811':        { label: 'Section 811 Disability Housing – Project Rental Assistance', description: 'HUD-funded rental housing for non-elderly people with disabilities.' },
  // RAD — Rental Assistance Demonstration (converts legacy public housing to Section 8)
  'RAD PH Conv':     { label: 'RAD Conversion – Public Housing',          description: 'Former public housing units converted to long-term Section 8 contracts under HUD\'s Rental Assistance Demonstration.' },
  'RAD Mod Rehab Conv': { label: 'RAD Conversion – Moderate Rehabilitation', description: 'Section 8 Moderate Rehab units converted to Project-Based Vouchers or Rental Assistance Contracts under RAD.' },
};

function hudProgramLabel(code: string): { label: string; description: string } {
  return PROGRAM_LABELS[code] ?? { label: code, description: '' };
}

// Program type color mapping — matches against the plain-English label so
// fuzzy checks like "section 8" and "public housing" actually fire.
function programColor(code: string): string {
  const p = hudProgramLabel(code).label.toLowerCase();
  if (p.includes('public housing')) return '#1A4A6B';
  if (p.includes('section 8'))      return '#C8861A';
  if (p.includes('lihtc') || p.includes('tax credit')) return '#16a34a';
  if (p.includes('202') || p.includes('elderly'))      return '#7c3aed';
  if (p.includes('811') || p.includes('disab'))        return '#0e7490';
  if (p.includes('rad'))            return '#be185d'; // RAD conversions — pink/rose
  return '#6b7280';
}

// ── Sub-component: expiry alert ───────────────────────────────────────────────

function ExpiryAlert({ properties }: { properties: NeighborhoodHUDStats['expiringProperties'] }) {
  if (!properties.length) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-900">
      <div className="flex items-start gap-2">
        <span className="text-base mt-0.5 shrink-0">⚠</span>
        <div>
          <strong>
            {properties.length} propert{properties.length > 1 ? 'ies' : 'y'} with
            subsidies expiring within 5 years
          </strong>
          <ul className="mt-1 space-y-1">
            {properties.map((p, i) => (
              <li key={i} className="text-xs text-amber-800">
                <span className="font-medium">{p.name}</span>
                {p.address ? ` · ${p.address}` : ''} —{' '}
                {p.units} unit{p.units !== 1 ? 's' : ''}, contract ends{' '}
                <span className="font-semibold">{p.contractEnd}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-700 mt-1.5">
            When subsidies expire without renewal, units may convert to market-rate,
            displacing low-income residents.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function HousingInventorySection({ neighborhood }: Props) {
  const [stats, setStats] = useState<NeighborhoodHUDStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buildNotice, setBuildNotice] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setBuildNotice(false);

    fetchNeighborhoodHUDStats()
      .then(map => {
        const key = stripNeighborhoodName(neighborhood);
        const data = map.get(key) ?? null;
        if (map.size === 0) {
          // JSON is a placeholder — build script hasn't been run yet
          setBuildNotice(true);
        }
        setStats(data);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load HUD data');
      })
      .finally(() => setLoading(false));
  }, [neighborhood]);

  const programEntries = stats
    ? Object.entries(stats.byProgram)
        .sort(([, a], [, b]) => b - a)
    : [];

  const maxUnits = programEntries[0]?.[1] ?? 1;

  return (
    <DataCard
      title="Subsidized Housing Inventory"
      loading={loading}
      error={error}
      empty={!buildNotice && !loading && !error && !stats}
    >
      {/* Build notice — shown when JSON hasn't been populated yet */}
      {buildNotice && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
          <p className="font-medium mb-1">Data not yet generated</p>
          <p>
            Run <code className="bg-gray-100 px-1 rounded text-xs">python3 scripts/build_hud.py</code>{' '}
            to populate the HUD subsidized housing inventory.
          </p>
        </div>
      )}

      {stats && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-[#1A4A6B]">
                {stats.totalAssistedUnits.toLocaleString()}
              </div>
              <div className="text-xs text-blue-400 font-semibold mt-1">Assisted Units</div>
              <div className="text-xs text-gray-400 mt-0.5">HUD-subsidized</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-gray-700">
                {stats.propertyCount}
              </div>
              <div className="text-xs text-gray-400 font-semibold mt-1">
                Propert{stats.propertyCount !== 1 ? 'ies' : 'y'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                as of {stats.asOf}
              </div>
            </div>
          </div>

          {/* Expiry alert */}
          <ExpiryAlert properties={stats.expiringProperties} />

          {/* Program breakdown */}
          {programEntries.length > 0 && (
            <>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                Units by program type
              </div>
              <div className="space-y-3">
                {programEntries.map(([program, units]) => {
                  const { label, description } = hudProgramLabel(program);
                  return (
                    <div key={program}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-gray-700 font-medium truncate max-w-[75%]" title={description || undefined}>
                          {label}
                        </span>
                        <span className="text-gray-400 font-semibold ml-2 shrink-0">
                          {units.toLocaleString()} unit{units !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {description && (
                        <p className="text-[10px] text-gray-400 mb-1 truncate" title={description}>
                          {description}
                        </p>
                      )}
                      <div className="h-2 bg-gray-100 rounded-full">
                        <div
                          className="h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${(units / maxUnits) * 100}%`,
                            backgroundColor: programColor(program),
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <p className="text-xs text-gray-400 mt-4">
            HUD Multifamily Properties — Assisted · Properties mapped to neighborhoods by
            coordinates. Contract expiry data may be incomplete for some programs.
          </p>
        </>
      )}

      <div className="mt-4 pt-3 border-t border-gray-100">
        <DataAttribution
          source="HUD Multifamily Properties – Assisted"
          uid="hud-multifamily-assisted"
        />
      </div>
    </DataCard>
  );
}
