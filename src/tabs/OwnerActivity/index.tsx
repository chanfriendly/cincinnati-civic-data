import React, { useState, useMemo } from 'react'
import { fetchSODA } from '../../utils/api'

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface OwnerUnitRow {
  address: string
  neighborhood: string
  units_added: string
  units_removed: string
  title?: string
  permit_description?: string
  issued_date?: string
  number_key?: string
  sub_type?: string
}

interface OwnerCRARow {
  organization_legal_name?: string
  project_name?: string
  community_council_neighborhood?: string
  est_program_total_value?: string
  program_type?: string
  project_category?: string
  approved_by_city_council?: string
  site_street_address?: string
}

// Standard building permits dataset (uhjb-xac9) — different field names
interface UhjbPermitRow {
  originaladdress1?: string
  neighborhood?: string
  permittypemapped?: string
  applieddate?: string
  statuscurrent?: string
  permitnum?: string
  companyname?: string
}

// Unified permit row for display
interface NormalizedPermitRow {
  address: string
  neighborhood: string
  description: string
  date: string
  status: string
  permitNum: string
  source: 'unit_activity' | 'building_permit'
}

// ─── Example searches ─────────────────────────────────────────────────────────

// These are verified real names from the datasets — each returns results
const EXAMPLE_SEARCHES = [
  'LARKIN',         // Same owner under 4 different LLC spellings across Madisonville & Kennedy Heights
  'TREVARREN',      // CRA subsidies in Walnut Hills
  'F&C DEVELOPMENT',// CRA — Oakley Station Apartments
  'GREENUP DANA',   // Unit removal in CUF/OTR
  'VICAM',          // Unit removal in Evanston
]

// Strip embedded quotes Socrata sometimes includes in exported string fields
function cleanStr(s: string | undefined): string {
  return (s ?? '').replace(/^"|"$/g, '').trim()
}

function isRealNeighborhood(n: string | undefined): n is string {
  return !!n && n !== 'N/A' && n.trim() !== ''
}

// ─── Main component ────────────────────────────────────────────────────────────

const OwnerActivity: React.FC = () => {
  const [searchInput, setSearchInput] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [unitResults, setUnitResults] = useState<OwnerUnitRow[] | null>(null)
  const [craResults, setCraResults] = useState<OwnerCRARow[] | null>(null)
  // Permits from both datasets
  const [xedzPermits, setXedzPermits] = useState<OwnerUnitRow[] | null>(null)
  const [uhjbPermits, setUhjbPermits] = useState<UhjbPermitRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async () => {
    const q = searchInput.trim()
    if (!q || q.length < 3) return
    setSubmittedQuery(q)
    setLoading(true)
    setError(null)
    setUnitResults(null)
    setCraResults(null)
    setXedzPermits(null)
    setUhjbPermits(null)

    const upper = q.toUpperCase().replace(/'/g, "''")
    try {
      const [unitActivityRes, craRes, xedzRes, uhjbRes] = await Promise.all([
        // Housing unit activity — unit changes by permit applicant (title field)
        fetchSODA<OwnerUnitRow>('xedz-tk7q', {
          $where: `upper(title) LIKE '%${upper}%'`,
          $select: 'address,neighborhood,units_added,units_removed,title,permit_description,issued_date,number_key,sub_type',
          $limit: 500,
          $order: 'issued_date DESC',
        }),
        // Commercial CRA subsidies — by organization name
        fetchSODA<OwnerCRARow>('m76i-p5p9', {
          $where: `upper(organization_legal_name) LIKE '%${upper}%'`,
          $select: 'organization_legal_name,project_name,community_council_neighborhood,est_program_total_value,program_type,project_category,approved_by_city_council,site_street_address',
          $limit: 200,
          $order: 'approved_by_city_council DESC',
        }),
        // All housing unit activity permits (same as above — re-used for building permits panel)
        fetchSODA<OwnerUnitRow>('xedz-tk7q', {
          $where: `upper(title) LIKE '%${upper}%'`,
          $select: 'address,neighborhood,permit_description,issued_date,data_status,number_key,sub_type',
          $limit: 500,
          $order: 'issued_date DESC',
        }),
        // Standard building permits — search by companyname field
        fetchSODA<UhjbPermitRow>('uhjb-xac9', {
          $where: `upper(companyname) LIKE '%${upper}%'`,
          $select: 'originaladdress1,neighborhood,permittypemapped,applieddate,statuscurrent,permitnum,companyname',
          $limit: 300,
          $order: 'applieddate DESC',
        }),
      ])
      setUnitResults(unitActivityRes.data)
      setCraResults(craRes.data)
      setXedzPermits(xedzRes.data)
      setUhjbPermits(uhjbRes.data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // ─── Merge + normalize permit rows ──────────────────────────────────────────
  const allPermits = useMemo((): NormalizedPermitRow[] => {
    const rows: NormalizedPermitRow[] = []
    const seen = new Set<string>()

    for (const r of xedzPermits ?? []) {
      const key = r.number_key ?? `${r.address}__${r.issued_date}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        address: r.address || '—',
        neighborhood: r.neighborhood || '',
        description: r.permit_description || r.sub_type || '—',
        date: r.issued_date ? r.issued_date.slice(0, 10) : '—',
        status: (r as any).data_status || '—',
        permitNum: r.number_key || '—',
        source: 'unit_activity',
      })
    }

    for (const r of uhjbPermits ?? []) {
      const key = r.permitnum ?? `${r.originaladdress1}__${r.applieddate}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        address: cleanStr(r.originaladdress1),
        neighborhood: r.neighborhood || '',
        description: cleanStr(r.permittypemapped),
        date: r.applieddate ? r.applieddate.slice(0, 10) : '—',
        status: cleanStr(r.statuscurrent),
        permitNum: r.permitnum || '—',
        source: 'building_permit',
      })
    }

    // Sort combined list by date descending
    return rows.sort((a, b) => b.date.localeCompare(a.date))
  }, [xedzPermits, uhjbPermits])

  // ─── Unit removal rows ──────────────────────────────────────────────────────
  const unitRemovalRows = useMemo(() => {
    if (!unitResults) return []
    return unitResults.filter(r => (parseInt(r.units_removed, 10) || 0) > 0)
  }, [unitResults])

  const netUnitsChange = useMemo(() => {
    if (!unitResults) return 0
    const removed = unitResults.reduce((s, r) => s + (parseInt(r.units_removed, 10) || 0), 0)
    const added = unitResults.reduce((s, r) => s + (parseInt(r.units_added, 10) || 0), 0)
    return added - removed
  }, [unitResults])

  // ─── Summary stats ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (unitResults === null && craResults === null) return null
    const totalUnitsRemoved = (unitResults ?? []).reduce((s, r) => s + (parseInt(r.units_removed, 10) || 0), 0)
    const totalUnitsAdded = (unitResults ?? []).reduce((s, r) => s + (parseInt(r.units_added, 10) || 0), 0)
    const totalSubsidy = (craResults ?? []).reduce((s, r) => s + (parseFloat(r.est_program_total_value || '0') || 0), 0)

    const neighborhoodsSet = new Set<string>()
    for (const r of allPermits) {
      if (isRealNeighborhood(r.neighborhood)) neighborhoodsSet.add(r.neighborhood)
    }
    for (const r of craResults ?? []) {
      if (isRealNeighborhood(r.community_council_neighborhood)) neighborhoodsSet.add(r.community_council_neighborhood!)
    }
    const neighborhoods = [...neighborhoodsSet].sort()

    return { totalUnitsRemoved, totalUnitsAdded, totalSubsidy, neighborhoods, permitCount: allPermits.length }
  }, [unitResults, craResults, allPermits])

  const hasResults = unitResults !== null || craResults !== null
  const isEmpty = hasResults && allPermits.length === 0 && (craResults?.length ?? 0) === 0

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Owner / Developer Activity Tracker
        </h1>
        <p className="text-gray-600 text-sm max-w-3xl leading-relaxed mb-4">
          Cincinnati's version of JustFix NYC's "Who Owns What" — search for an owner name, LLC, or developer
          to see all their building permit activity, housing unit changes, and city subsidy receipts across
          every neighborhood.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-3xl space-y-2">
          <p className="text-sm text-amber-800 leading-relaxed">
            Search by owner name, LLC, or developer. Matches against two permit sources and one subsidy source:
          </p>
          <ul className="text-sm text-amber-800 space-y-1 pl-4 list-disc">
            <li><strong>Housing Unit Activity (xedz-tk7q)</strong> — permit applicant name (<code>title</code> field). This is where property owners and LLCs appear. Best for tracking who is removing or adding housing units.</li>
            <li><strong>Commercial CRA Abatements (m76i-p5p9)</strong> — developer organization name. Shows which companies received city tax abatements, TIF grants, or below-market land sales.</li>
            <li><strong>Standard Building Permits (uhjb-xac9)</strong> — contractor company name. This covers mechanical, plumbing, and construction contractors — less useful for owner research but included for completeness.</li>
          </ul>
          <p className="text-xs text-amber-700">
            Tip: LLCs often file under slightly different names. Try a short keyword (e.g. "LARKIN" instead of "Larkin Ventures LLC") to catch all variations.
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-6">
        <div className="flex gap-2 max-w-xl">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="e.g. TREVARREN, OVER-THE-RHINE COMMUNITY, USS REALTY"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A4A6B] focus:border-transparent"
          />
          <button
            onClick={handleSearch}
            disabled={loading || searchInput.trim().length < 3}
            className="px-5 py-2.5 bg-[#1A4A6B] text-white text-sm font-medium rounded-lg hover:bg-[#153d59] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>

        {/* Example searches */}
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-500">Try:</span>
          {EXAMPLE_SEARCHES.map(ex => (
            <span
              key={ex}
              onClick={() => setSearchInput(ex)}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1 rounded-full cursor-pointer transition-colors border border-gray-200"
            >
              {ex}
            </span>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700 font-medium">Search failed</p>
          <p className="text-xs text-red-600 mt-1">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-8 h-8 border-4 border-[#1A4A6B] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Searching across building permits, unit activity, and city subsidy databases…</p>
        </div>
      )}

      {/* No results */}
      {!loading && isEmpty && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-gray-700 font-semibold mb-1">No records found for "{submittedQuery}"</p>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Try a shorter name, check for LLC variations (e.g. "LLC" vs "INC"), or search just
            the first word. Company names may differ between permit filings and subsidy records.
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && hasResults && !isEmpty && stats && (
        <div className="flex flex-col gap-8">

          {/* Summary bar */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Results for "{submittedQuery}"
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 items-center">
              <span className="text-sm text-gray-700">
                <span className="font-bold text-gray-900">{stats.permitCount}</span> permits
              </span>
              {stats.totalUnitsRemoved > 0 && (
                <span className="text-sm text-red-700 font-medium">
                  −{stats.totalUnitsRemoved} units removed
                </span>
              )}
              {stats.totalUnitsAdded > 0 && (
                <span className="text-sm text-green-700 font-medium">
                  +{stats.totalUnitsAdded} units added
                </span>
              )}
              {stats.totalSubsidy > 0 && (
                <span className="text-sm text-blue-800 font-medium">
                  ${stats.totalSubsidy >= 1_000_000
                    ? `${(stats.totalSubsidy / 1_000_000).toFixed(2)}M`
                    : `${Math.round(stats.totalSubsidy / 1000)}K`} in city subsidies
                </span>
              )}
              {stats.neighborhoods.length > 0 && (
                <span className="text-xs text-gray-500">
                  Active in:{' '}
                  <span className="font-medium text-gray-700">
                    {stats.neighborhoods.slice(0, 6).join(', ')}
                    {stats.neighborhoods.length > 6 ? ` +${stats.neighborhoods.length - 6} more` : ''}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Two-column: Permits + Subsidies */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Permits panel */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="font-semibold text-gray-900 text-sm">Building Permit Activity</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {allPermits.length} permits — from Housing Unit Activity + standard Building Permits
                </p>
              </div>
              {allPermits.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm italic">No permit records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Address</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Neighborhood</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Type</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Date</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allPermits.slice(0, 60).map((r, i) => (
                        <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                          <td className="py-1.5 px-3 text-gray-700 max-w-[120px] truncate font-medium" title={r.address}>{r.address}</td>
                          <td className="py-1.5 px-3 text-gray-600 max-w-[90px] truncate" title={r.neighborhood}>
                            {isRealNeighborhood(r.neighborhood) ? r.neighborhood : '—'}
                          </td>
                          <td className="py-1.5 px-3 text-gray-500 max-w-[100px] truncate" title={r.description}>{r.description}</td>
                          <td className="py-1.5 px-3 text-gray-500 whitespace-nowrap">{r.date}</td>
                          <td className="py-1.5 px-3">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              r.source === 'building_permit'
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {r.source === 'building_permit' ? 'Permit' : 'Unit'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {allPermits.length > 60 && (
                    <div className="px-3 py-2 text-xs text-gray-400 bg-gray-50 border-t border-gray-100 text-center">
                      Showing 60 of {allPermits.length} permits
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* CRA Subsidies panel */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="font-semibold text-gray-900 text-sm">City Subsidies Received</h2>
                {(stats.totalSubsidy ?? 0) > 0 && (
                  <p className="text-xs text-blue-700 mt-0.5 font-medium">
                    Total: ${stats.totalSubsidy >= 1_000_000
                      ? `${(stats.totalSubsidy / 1_000_000).toFixed(2)}M`
                      : `${Math.round(stats.totalSubsidy / 1000)}K`}
                  </p>
                )}
              </div>
              {(craResults?.length ?? 0) === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm italic">No CRA subsidy records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Project</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Neighborhood</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Type</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600">Value</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Approved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(craResults ?? []).slice(0, 50).map((r, i) => {
                        const val = parseFloat(r.est_program_total_value || '0') || 0
                        return (
                          <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            <td className="py-1.5 px-3 text-gray-700 max-w-[120px] truncate font-medium" title={r.project_name ?? ''}>{r.project_name || '—'}</td>
                            <td className="py-1.5 px-3 text-gray-600 max-w-[100px] truncate" title={r.community_council_neighborhood ?? ''}>
                              {isRealNeighborhood(r.community_council_neighborhood) ? r.community_council_neighborhood : '—'}
                            </td>
                            <td className="py-1.5 px-3 text-gray-500">{r.program_type || '—'}</td>
                            <td className="py-1.5 px-3 text-right font-medium whitespace-nowrap">
                              {val > 0 ? (
                                <span className={val >= 1_000_000 ? 'text-red-700' : val >= 500_000 ? 'text-orange-700' : 'text-gray-800'}>
                                  ${val >= 1_000_000
                                    ? `${(val / 1_000_000).toFixed(2)}M`
                                    : val >= 1000
                                    ? `${Math.round(val / 1000)}K`
                                    : Math.round(val).toLocaleString()}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="py-1.5 px-3 text-gray-500 whitespace-nowrap">
                              {r.approved_by_city_council ? r.approved_by_city_council.slice(0, 10) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {(craResults?.length ?? 0) > 50 && (
                    <div className="px-3 py-2 text-xs text-gray-400 bg-gray-50 border-t border-gray-100 text-center">
                      Showing 50 of {craResults?.length} records
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Unit removal section (full-width, only when relevant) */}
          {unitRemovalRows.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-red-50">
                <h2 className="font-semibold text-gray-900 text-sm">Unit Removal Activity</h2>
                <p className="text-xs text-gray-600 mt-0.5">
                  Permits where this owner removed housing units — the most direct displacement signal.
                </p>
                {netUnitsChange < 0 && (
                  <div className="mt-2 inline-flex items-center gap-1.5 bg-red-100 border border-red-300 rounded-lg px-3 py-1 text-sm font-bold text-red-700">
                    NET: −{Math.abs(netUnitsChange)} units removed
                  </div>
                )}
                {netUnitsChange > 0 && (
                  <div className="mt-2 inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-1 text-sm font-bold text-green-700">
                    NET: +{netUnitsChange} units added
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-semibold text-gray-600">Address</th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-600">Neighborhood</th>
                      <th className="text-center py-2 px-3 font-semibold text-gray-600">Units −</th>
                      <th className="text-center py-2 px-3 font-semibold text-gray-600">Units +</th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-600">Permit Description</th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-600">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitRemovalRows.slice(0, 50).map((r, i) => {
                      const removed = parseInt(r.units_removed, 10) || 0
                      const added = parseInt(r.units_added, 10) || 0
                      return (
                        <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-red-50/30'}`}>
                          <td className="py-1.5 px-3 text-gray-700 max-w-[130px] truncate font-medium" title={r.address}>{r.address || '—'}</td>
                          <td className="py-1.5 px-3 text-gray-600 max-w-[100px] truncate">
                            {isRealNeighborhood(r.neighborhood) ? r.neighborhood : '—'}
                          </td>
                          <td className="py-1.5 px-3 text-center text-red-600 font-bold">−{removed}</td>
                          <td className="py-1.5 px-3 text-center text-green-600 font-semibold">{added > 0 ? `+${added}` : '—'}</td>
                          <td className="py-1.5 px-3 text-gray-500 max-w-[160px] truncate" title={r.permit_description ?? ''}>{r.permit_description || '—'}</td>
                          <td className="py-1.5 px-3 text-gray-500 whitespace-nowrap">{r.issued_date ? r.issued_date.slice(0, 10) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {unitRemovalRows.length > 50 && (
                  <div className="px-3 py-2 text-xs text-gray-400 bg-gray-50 border-t border-gray-100 text-center">
                    Showing 50 of {unitRemovalRows.length} unit removal records
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Data source note */}
          <div className="text-xs text-gray-400 pb-2 leading-relaxed">
            <strong>Sources:</strong> Cincinnati Open Data — Housing Unit Activity (xedz-tk7q) searched by permit applicant name,
            Building Permits (uhjb-xac9) searched by company name, Commercial CRA Abatements (m76i-p5p9) searched by organization name.
            Permit sources are labeled "Unit" or "Permit" in the table.
            Name variations (LLC vs Inc, abbreviations, filing agents) may cause incomplete results — try alternate spellings.
          </div>

        </div>
      )}

    </div>
  )
}

export default OwnerActivity
