/**
 * Owner Activity Tab
 *
 * Primary question: "Who is responsible for what's happening at this address,
 * and what's their track record across Cincinnati?"
 *
 * Designed for advocates and organizers — not a data dump, but a briefing.
 *
 * Two modes:
 *   1. By Address (primary) — geocode an address, show enforcement record,
 *      surface permit filers, offer a one-click pivot to their full portfolio.
 *   2. By Owner Name — search by LLC / developer name, show city-wide portfolio,
 *      unit removals, and city subsidy receipts.
 *
 * Data sources:
 *   - PLAP blight records          pk9w-99n6  (bounding box)
 *   - Inspections / violations     ivda-umw7  (bounding box)
 *   - Building permits             uhjb-xac9  (address string + name search)
 *   - Housing unit activity        xedz-tk7q  (name search)
 *   - CRA commercial subsidies     m76i-p5p9  (name search)
 *
 * Limitation: Cincinnati Open Data has no "owner of record" field. The
 * companyname in permit records is the permit applicant — often the owner
 * or their LLC, but not always. The UI is explicit about this.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchSODA, formatDate } from '../../utils/api'
import { CivicOrgsPanel, DataAttribution } from '../../components/ui'

// ── Types ──────────────────────────────────────────────────────────────────────

interface MapboxFeature {
  place_name: string
  center: [number, number]
}

interface GeocodedAddress {
  lat: number
  lng: number
  formatted: string
  streetNum: string
  streetName: string // first word only — used in LIKE query
}

interface BlightRecord {
  full_address?: string
  sr_sub_type?: string
  enf_sub_type?: string
  sr_recd_date?: string
  enf_recd_date?: string
  sr_status?: string
  enf_status?: string
  latitude?: string
  longitude?: string
}

interface InspectionRecord {
  full_address?: string
  comp_type_desc?: string
  data_status?: string
  entered_date?: string
  latitude?: string
  longitude?: string
}

interface PermitRecord {
  originaladdress1?: string
  neighborhood?: string
  companyname?: string
  permittypemapped?: string
  applieddate?: string
  statuscurrent?: string
  permitnum?: string
  estprojectcostdec?: string
}

interface UnitActivityRecord {
  address?: string
  neighborhood?: string
  title?: string
  units_added?: string
  units_removed?: string
  permit_description?: string
  issued_date?: string
  number_key?: string
}

interface CRARecord {
  organization_legal_name?: string
  project_name?: string
  community_council_neighborhood?: string
  est_program_total_value?: string
  program_type?: string
  approved_by_city_council?: string
  site_street_address?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clean(s: string | undefined): string {
  return (s ?? '').replace(/^"|"$/g, '').trim()
}

function isReal(n: string | undefined): n is string {
  return !!n && n !== 'N/A' && n.trim() !== ''
}

function bboxWhere(
  lat: number, lng: number, radiusM: number,
  latCol: string, lonCol: string
): string {
  const dLat = radiusM / 111320
  const dLon = radiusM / (111320 * Math.cos(lat * Math.PI / 180))
  return (
    `${latCol} IS NOT NULL AND ${lonCol} IS NOT NULL AND ` +
    `${latCol} >= ${(lat - dLat).toFixed(6)} AND ${latCol} <= ${(lat + dLat).toFixed(6)} AND ` +
    `${lonCol} >= ${(lng - dLon).toFixed(6)} AND ${lonCol} <= ${(lng + dLon).toFixed(6)}`
  )
}

const EXAMPLE_NAMES = ['LARKIN', 'TREVARREN', 'GREENUP DANA', 'VICAM', 'USS REALTY']

// ── Sub-components ────────────────────────────────────────────────────────────

const SectionDivider: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-3 mt-2">
    <span className="text-xs font-bold uppercase tracking-widest text-gray-400">{label}</span>
    <div className="flex-1 h-px bg-gray-200" />
  </div>
)

const StatBox: React.FC<{
  value: React.ReactNode
  label: string
  color?: string
}> = ({ value, label, color = 'text-gray-800' }) => (
  <div className="bg-gray-50 rounded-lg p-3 text-center">
    <div className={`text-2xl font-bold ${color}`}>{value}</div>
    <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide leading-tight">{label}</div>
  </div>
)

// ── Main component ────────────────────────────────────────────────────────────

const OwnerActivity: React.FC = () => {
  const [mode, setMode] = useState<'address' | 'owner'>('address')

  // ── ADDRESS MODE state ────────────────────────────────────────────────────
  const [addrInput, setAddrInput] = useState('')
  const [addrSuggestions, setAddrSuggestions] = useState<MapboxFeature[]>([])
  const [selectedAddr, setSelectedAddr] = useState<GeocodedAddress | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [blightRecords, setBlightRecords] = useState<BlightRecord[] | null>(null)
  const [inspections, setInspections] = useState<InspectionRecord[] | null>(null)
  const [addrPermits, setAddrPermits] = useState<PermitRecord[] | null>(null)
  const [addrLoading, setAddrLoading] = useState(false)
  const [addrError, setAddrError] = useState<string | null>(null)

  // ── OWNER MODE state ──────────────────────────────────────────────────────
  const [ownerInput, setOwnerInput] = useState('')
  const [submittedOwner, setSubmittedOwner] = useState('')
  const [unitActivity, setUnitActivity] = useState<UnitActivityRecord[] | null>(null)
  const [craResults, setCraResults] = useState<CRARecord[] | null>(null)
  const [ownerPermits, setOwnerPermits] = useState<PermitRecord[] | null>(null)
  const [ownerLoading, setOwnerLoading] = useState(false)
  const [ownerError, setOwnerError] = useState<string | null>(null)

  // ── Address autocomplete ──────────────────────────────────────────────────
  const handleAddrChange = useCallback((value: string) => {
    setAddrInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.length < 3) { setAddrSuggestions([]); return }
    const apiKey = import.meta.env.VITE_GEOCODING_API_KEY as string
    if (!apiKey) return
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json` +
          `?country=US&bbox=-84.82,39.03,-84.26,39.35&types=address&access_token=${apiKey}`
        )
        const data = await res.json()
        setAddrSuggestions((data.features ?? []).slice(0, 6) as MapboxFeature[])
      } catch { setAddrSuggestions([]) }
    }, 300)
  }, [])

  const handleAddrSelect = useCallback((feature: MapboxFeature) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const addr = feature.place_name.split(',')[0].trim()
    const parts = addr.split(/\s+/)
    const streetNum = parts[0]
    // First word of street name only — LIKE query catches "MAIN ST" and "MAIN STREET"
    const streetNameFirst = parts[1] ?? ''
    setSelectedAddr({
      lat: feature.center[1],
      lng: feature.center[0],
      formatted: feature.place_name,
      streetNum,
      streetName: streetNameFirst,
    })
    setAddrInput(feature.place_name)
    setAddrSuggestions([])
    setBlightRecords(null)
    setInspections(null)
    setAddrPermits(null)
    setAddrError(null)
  }, [])

  // ── Address data fetch ────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAddr) return
    const { lat, lng, streetNum, streetName } = selectedAddr
    setAddrLoading(true)
    setAddrError(null)

    const bbox = (latCol: string, lonCol: string) => bboxWhere(lat, lng, 300, latCol, lonCol)
    const streetQuery = `upper(originaladdress1) LIKE '${streetNum.replace(/'/g, "''")} ${streetName.toUpperCase().replace(/'/g, "''")}%'`

    Promise.all([
      fetchSODA<BlightRecord>('pk9w-99n6', {
        $where: bbox('latitude', 'longitude'),
        $limit: 50,
        $order: 'sr_recd_date DESC',
      }),
      fetchSODA<InspectionRecord>('ivda-umw7', {
        $where: bbox('latitude', 'longitude'),
        $limit: 50,
        $order: 'entered_date DESC',
      }),
      fetchSODA<PermitRecord>('uhjb-xac9', {
        $where: streetQuery,
        $select: 'originaladdress1,companyname,permittypemapped,applieddate,statuscurrent,permitnum,estprojectcostdec',
        $limit: 100,
        $order: 'applieddate DESC',
      }),
    ])
      .then(([blight, insp, permits]) => {
        setBlightRecords(blight.data)
        setInspections(insp.data)
        setAddrPermits(permits.data)
      })
      .catch((e) => setAddrError(String(e)))
      .finally(() => setAddrLoading(false))
  }, [selectedAddr])

  // ── Owner name search ─────────────────────────────────────────────────────
  const handleOwnerSearch = useCallback(async (name?: string) => {
    const q = (name ?? ownerInput).trim()
    if (!q || q.length < 3) return
    setSubmittedOwner(q)
    setOwnerLoading(true)
    setOwnerError(null)
    setUnitActivity(null)
    setCraResults(null)
    setOwnerPermits(null)

    const upper = q.toUpperCase().replace(/'/g, "''")
    try {
      const [unitRes, craRes, permitsRes] = await Promise.all([
        fetchSODA<UnitActivityRecord>('xedz-tk7q', {
          $where: `upper(title) LIKE '%${upper}%'`,
          $select: 'address,neighborhood,title,units_added,units_removed,permit_description,issued_date,number_key',
          $limit: 500,
          $order: 'issued_date DESC',
        }),
        fetchSODA<CRARecord>('m76i-p5p9', {
          $where: `upper(organization_legal_name) LIKE '%${upper}%'`,
          $select: 'organization_legal_name,project_name,community_council_neighborhood,est_program_total_value,program_type,approved_by_city_council,site_street_address',
          $limit: 200,
          $order: 'approved_by_city_council DESC',
        }),
        fetchSODA<PermitRecord>('uhjb-xac9', {
          $where: `upper(companyname) LIKE '%${upper}%'`,
          $select: 'originaladdress1,neighborhood,companyname,permittypemapped,applieddate,statuscurrent,permitnum',
          $limit: 300,
          $order: 'applieddate DESC',
        }),
      ])
      setUnitActivity(unitRes.data)
      setCraResults(craRes.data)
      setOwnerPermits(permitsRes.data)
    } catch (e) {
      setOwnerError(String(e))
    } finally {
      setOwnerLoading(false)
    }
  }, [ownerInput])

  // Pivot: pre-fill owner search from address mode
  const pivotToOwner = useCallback((name: string) => {
    const cleaned = clean(name)
    setMode('owner')
    setOwnerInput(cleaned)
    handleOwnerSearch(cleaned)
  }, [handleOwnerSearch])

  // ── Address mode derived values ───────────────────────────────────────────
  const violations = useMemo(() =>
    (inspections ?? []).filter(i => /fail|viol|notice/i.test(String(i.data_status ?? ''))),
    [inspections])

  const permitFilers = useMemo(() => {
    const names = new Set<string>()
    for (const p of addrPermits ?? []) {
      const n = clean(p.companyname)
      if (n && n.length > 2) names.add(n)
    }
    return Array.from(names).slice(0, 6)
  }, [addrPermits])

  const addrHasData = blightRecords !== null && inspections !== null

  // ── Owner mode derived values ─────────────────────────────────────────────
  const unitRemovals = useMemo(() =>
    (unitActivity ?? []).filter(r => (parseInt(r.units_removed ?? '0', 10) || 0) > 0),
    [unitActivity])

  const totalRemoved = useMemo(() =>
    (unitActivity ?? []).reduce((s, r) => s + (parseInt(r.units_removed ?? '0', 10) || 0), 0),
    [unitActivity])

  const totalAdded = useMemo(() =>
    (unitActivity ?? []).reduce((s, r) => s + (parseInt(r.units_added ?? '0', 10) || 0), 0),
    [unitActivity])

  const totalSubsidy = useMemo(() =>
    (craResults ?? []).reduce((s, r) => s + (parseFloat(r.est_program_total_value ?? '0') || 0), 0),
    [craResults])

  const ownerNeighborhoods = useMemo(() => {
    const seen = new Set<string>()
    for (const r of unitActivity ?? []) if (isReal(r.neighborhood)) seen.add(r.neighborhood!)
    for (const r of ownerPermits ?? []) if (isReal(r.neighborhood)) seen.add(r.neighborhood!)
    for (const r of craResults ?? []) if (isReal(r.community_council_neighborhood)) seen.add(r.community_council_neighborhood!)
    return Array.from(seen).sort()
  }, [unitActivity, ownerPermits, craResults])

  const ownerHasResults = unitActivity !== null || craResults !== null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-4xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Owner &amp; Property Activity</h1>
        <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">
          For tenants, advocates, and organizers. Start with an address to see its enforcement record
          and who has been active there — then follow that name to their full portfolio across Cincinnati.
        </p>
      </div>

      {/* Mode switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(['address', 'owner'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === m ? 'bg-white text-[#1A4A6B] shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {m === 'address' ? '🏠 By Address' : '🔍 By Owner / LLC'}
          </button>
        ))}
      </div>

      {/* ── ADDRESS MODE ──────────────────────────────────────────────────── */}
      {mode === 'address' && (
        <div className="space-y-5">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter a Cincinnati address
            </label>
            <div className="relative max-w-xl">
              <input
                type="text"
                value={addrInput}
                onChange={e => handleAddrChange(e.target.value)}
                placeholder="e.g. 1600 Race Street, Cincinnati"
                autoComplete="off"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A4A6B] focus:border-transparent text-base"
              />
              {addrSuggestions.length > 0 && (
                <ul className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-300 rounded-lg shadow-lg mt-1 overflow-hidden">
                  {addrSuggestions.map((f, i) => (
                    <li key={i}>
                      <button
                        onMouseDown={e => { e.preventDefault(); handleAddrSelect(f) }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0"
                      >
                        <span className="font-medium">{f.place_name.split(',')[0]}</span>
                        <span className="text-gray-500 ml-1 text-xs">
                          {f.place_name.split(',').slice(1).join(',').trim()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Shows blight flags, inspection violations, and permit activity within 300m.
            </p>
          </div>

          {addrLoading && (
            <div className="flex items-center gap-3 py-6 px-6 bg-white rounded-lg shadow-sm">
              <div className="w-5 h-5 border-2 border-[#1A4A6B] border-t-transparent rounded-full animate-spin shrink-0" />
              <p className="text-sm text-gray-500">Checking enforcement records…</p>
            </div>
          )}

          {addrError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{addrError}</p>
            </div>
          )}

          {!addrLoading && addrHasData && (
            <div className="space-y-5">

              {/* Enforcement summary */}
              <SectionDivider label="Enforcement Record" />
              <div className="bg-white rounded-lg shadow-sm p-5 space-y-4">
                <p className="text-xs text-gray-500">
                  Blight flags and inspection records within 300m of{' '}
                  <span className="font-medium text-gray-700">{selectedAddr?.formatted?.split(',')[0]}</span>.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <StatBox
                    value={blightRecords?.length ?? 0}
                    label="Blight Flags"
                    color={(blightRecords?.length ?? 0) > 0 ? 'text-red-600' : 'text-gray-400'}
                  />
                  <StatBox
                    value={inspections?.length ?? 0}
                    label="Inspections"
                    color={(inspections?.length ?? 0) > 0 ? 'text-[#C8861A]' : 'text-gray-400'}
                  />
                  <StatBox
                    value={violations.length}
                    label="Violations"
                    color={violations.length > 0 ? 'text-red-600' : 'text-green-600'}
                  />
                </div>

                {(blightRecords?.length ?? 0) === 0 && violations.length === 0 && (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    ✓ No blight flags or violations found near this address.
                  </p>
                )}

                {(blightRecords?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Blight / PLAP Records</p>
                    <div className="space-y-2">
                      {blightRecords!.slice(0, 6).map((r, i) => (
                        <div key={i} className="flex items-start gap-2 border-b border-gray-100 pb-2 last:border-0">
                          <span className="text-red-400 shrink-0 mt-0.5">🏚</span>
                          <div>
                            <p className="text-xs font-medium text-gray-800">
                              {r.sr_sub_type || r.enf_sub_type || 'Blight flag'}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {r.full_address} · {formatDate(r.sr_recd_date || r.enf_recd_date)}
                              {r.sr_status ? ` · ${r.sr_status}` : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <DataAttribution source="PLAP Problem Properties" uid="pk9w-99n6" />
                  </div>
                )}

                {violations.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Inspection Violations</p>
                    <div className="space-y-2">
                      {violations.slice(0, 6).map((r, i) => (
                        <div key={i} className="bg-yellow-50 border border-yellow-100 rounded px-3 py-2">
                          <p className="text-xs font-medium text-yellow-900">{r.comp_type_desc || 'Violation'}</p>
                          <p className="text-[10px] text-yellow-700">{formatDate(r.entered_date)} · {r.data_status}</p>
                        </div>
                      ))}
                    </div>
                    <DataAttribution source="Building Inspections" uid="ivda-umw7" />
                  </div>
                )}
              </div>

              {/* Permit filers / owner signal */}
              <SectionDivider label="Who Has Been Active Here" />
              <div className="bg-white rounded-lg shadow-sm p-5 space-y-4">
                {(addrPermits?.length ?? 0) === 0 ? (
                  <p className="text-sm text-gray-400 italic">No permit records found at this address.</p>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      These companies filed permits at this address. For residential properties, the permit
                      applicant is often the owner or a related LLC. Search their name to see everything
                      they've filed across Cincinnati.
                    </p>

                    {permitFilers.length > 0 && (
                      <div className="space-y-2">
                        {permitFilers.map((name, i) => {
                          const count = addrPermits!.filter(p => clean(p.companyname) === name).length
                          return (
                            <div key={i} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">{name}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {count} permit{count !== 1 ? 's' : ''} at this address
                                </p>
                              </div>
                              <button
                                onClick={() => pivotToOwner(name)}
                                className="shrink-0 text-xs font-semibold bg-[#1A4A6B] text-white px-3 py-1.5 rounded-md hover:bg-[#143850] transition-colors whitespace-nowrap"
                              >
                                See all their properties →
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                        Recent Permits ({addrPermits!.length})
                      </p>
                      <div className="space-y-1.5">
                        {addrPermits!.slice(0, 8).map((p, i) => (
                          <div key={i} className="flex items-start gap-2 border-b border-gray-100 pb-1.5 last:border-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">
                                {p.permittypemapped || 'Permit'} · {clean(p.companyname) || '—'}
                              </p>
                              <p className="text-[10px] text-gray-500">
                                {formatDate(p.applieddate)} · {p.statuscurrent || '—'}
                                {p.estprojectcostdec && parseFloat(p.estprojectcostdec) > 0
                                  ? ` · $${Math.round(parseFloat(p.estprojectcostdec)).toLocaleString()}` : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <DataAttribution source="Building Permits" uid="uhjb-xac9" />
                  </>
                )}
              </div>

              {/* Orgs */}
              {((blightRecords?.length ?? 0) > 0 || violations.length > 0) && (
                <>
                  <SectionDivider label="Organizations That Can Help" />
                  <CivicOrgsPanel
                    categories={['housing-eviction']}
                    intro="Free legal aid, tenant advocacy, and housing services for Cincinnati residents dealing with problem properties."
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── OWNER / LLC MODE ──────────────────────────────────────────────── */}
      {mode === 'owner' && (
        <div className="space-y-5">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Owner name, LLC, or developer keyword
            </label>
            <div className="flex gap-2 max-w-xl">
              <input
                type="text"
                value={ownerInput}
                onChange={e => setOwnerInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleOwnerSearch()}
                placeholder="e.g. LARKIN, TREVARREN, OVER-THE-RHINE COMMUNITY"
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A4A6B] focus:border-transparent"
              />
              <button
                onClick={() => handleOwnerSearch()}
                disabled={ownerLoading || ownerInput.trim().length < 3}
                className="px-5 py-2.5 bg-[#1A4A6B] text-white text-sm font-medium rounded-lg hover:bg-[#153d59] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {ownerLoading ? 'Searching…' : 'Search'}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-400">Try:</span>
              {EXAMPLE_NAMES.map(ex => (
                <button
                  key={ex}
                  onClick={() => { setOwnerInput(ex); handleOwnerSearch(ex) }}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1 rounded-full transition-colors border border-gray-200"
                >
                  {ex}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              LLCs often file under slightly different names. Use a short keyword to catch all variations.
            </p>
          </div>

          {ownerLoading && (
            <div className="flex items-center gap-3 py-6 px-6 bg-white rounded-lg shadow-sm">
              <div className="w-5 h-5 border-2 border-[#1A4A6B] border-t-transparent rounded-full animate-spin shrink-0" />
              <p className="text-sm text-gray-500">Searching permits, unit activity, and city subsidies…</p>
            </div>
          )}

          {ownerError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{ownerError}</p>
            </div>
          )}

          {!ownerLoading && ownerHasResults &&
            (unitActivity?.length ?? 0) + (craResults?.length ?? 0) + (ownerPermits?.length ?? 0) === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
              <p className="text-gray-700 font-semibold mb-1">No records found for "{submittedOwner}"</p>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Try a shorter keyword, check LLC spelling variations, or search just the first word of the name.
              </p>
            </div>
          )}

          {!ownerLoading && ownerHasResults &&
            (unitActivity?.length ?? 0) + (craResults?.length ?? 0) + (ownerPermits?.length ?? 0) > 0 && (
            <div className="space-y-5">

              {/* Portfolio briefing */}
              <SectionDivider label="Portfolio Summary" />
              <div className="bg-white rounded-lg shadow-sm p-5">
                <p className="text-xs text-gray-500 mb-3">
                  All records matching "{submittedOwner}" across permit filings, unit activity, and city subsidies.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <StatBox
                    value={(unitActivity?.length ?? 0) + (ownerPermits?.length ?? 0)}
                    label="Total Permits"
                    color="text-[#1A4A6B]"
                  />
                  <StatBox
                    value={totalRemoved > 0 ? `−${totalRemoved}` : '0'}
                    label="Units Removed"
                    color={totalRemoved > 0 ? 'text-red-600' : 'text-gray-400'}
                  />
                  <StatBox
                    value={totalSubsidy > 0
                      ? (totalSubsidy >= 1_000_000
                          ? `$${(totalSubsidy / 1_000_000).toFixed(1)}M`
                          : `$${Math.round(totalSubsidy / 1000)}K`)
                      : '$0'}
                    label="City Subsidies"
                    color={totalSubsidy > 0 ? 'text-blue-700' : 'text-gray-400'}
                  />
                  <StatBox
                    value={ownerNeighborhoods.length}
                    label="Neighborhoods"
                    color="text-gray-700"
                  />
                </div>
                {ownerNeighborhoods.length > 0 && (
                  <p className="text-xs text-gray-500 mb-3">
                    Active in:{' '}
                    <span className="font-medium text-gray-700">
                      {ownerNeighborhoods.slice(0, 8).join(', ')}
                      {ownerNeighborhoods.length > 8 ? ` +${ownerNeighborhoods.length - 8} more` : ''}
                    </span>
                  </p>
                )}

                {totalRemoved > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <p className="text-xs font-semibold text-red-800 mb-1">Displacement signal</p>
                    <p className="text-xs text-red-700 leading-relaxed">
                      {totalRemoved} housing unit{totalRemoved !== 1 ? 's' : ''} removed across{' '}
                      {unitRemovals.length} permit{unitRemovals.length !== 1 ? 's' : ''}.{' '}
                      {totalAdded > 0
                        ? `${totalAdded} units added — net change: ${totalAdded - totalRemoved >= 0 ? '+' : ''}${totalAdded - totalRemoved}.`
                        : 'No units were added — net housing loss.'}
                    </p>
                  </div>
                )}

                {totalRemoved > 0 && totalSubsidy > 0 && (totalAdded - totalRemoved) < 0 && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    <p className="text-xs text-amber-800 leading-relaxed">
                      ⚠ This owner received city subsidies while achieving a net reduction in housing units — a pattern
                      advocates document when making cases to council for subsidy reform.
                    </p>
                  </div>
                )}
              </div>

              {/* Unit removal detail */}
              {unitRemovals.length > 0 && (
                <>
                  <SectionDivider label="Unit Removal Activity" />
                  <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left py-2 px-3 font-semibold text-gray-600">Address</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600">Neighborhood</th>
                            <th className="text-center py-2 px-3 font-semibold text-red-600">Removed</th>
                            <th className="text-center py-2 px-3 font-semibold text-green-700">Added</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unitRemovals.slice(0, 40).map((r, i) => {
                            const removed = parseInt(r.units_removed ?? '0', 10) || 0
                            const added = parseInt(r.units_added ?? '0', 10) || 0
                            return (
                              <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-red-50/30'}`}>
                                <td className="py-1.5 px-3 font-medium text-gray-800 max-w-[140px] truncate" title={r.address}>{r.address || '—'}</td>
                                <td className="py-1.5 px-3 text-gray-600 max-w-[110px] truncate">{isReal(r.neighborhood) ? r.neighborhood : '—'}</td>
                                <td className="py-1.5 px-3 text-center font-bold text-red-600">−{removed}</td>
                                <td className="py-1.5 px-3 text-center font-semibold text-green-600">{added > 0 ? `+${added}` : '—'}</td>
                                <td className="py-1.5 px-3 text-gray-500 whitespace-nowrap">{r.issued_date?.slice(0, 10) ?? '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <DataAttribution source="Housing Unit Activity" uid="xedz-tk7q" />
                  </div>
                </>
              )}

              {/* City subsidies */}
              {(craResults?.length ?? 0) > 0 && (
                <>
                  <SectionDivider label="City Subsidies Received" />
                  <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left py-2 px-3 font-semibold text-gray-600">Project</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600">Neighborhood</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600">Program</th>
                            <th className="text-right py-2 px-3 font-semibold text-gray-600">Value</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600">Approved</th>
                          </tr>
                        </thead>
                        <tbody>
                          {craResults!.map((r, i) => {
                            const val = parseFloat(r.est_program_total_value ?? '0') || 0
                            return (
                              <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                <td className="py-1.5 px-3 font-medium text-gray-800 max-w-[130px] truncate" title={r.project_name ?? ''}>{r.project_name || '—'}</td>
                                <td className="py-1.5 px-3 text-gray-600 max-w-[110px] truncate">{isReal(r.community_council_neighborhood) ? r.community_council_neighborhood : '—'}</td>
                                <td className="py-1.5 px-3 text-gray-500">{r.program_type || '—'}</td>
                                <td className="py-1.5 px-3 text-right font-medium whitespace-nowrap">
                                  {val > 0
                                    ? <span className={val >= 1_000_000 ? 'text-red-700' : 'text-gray-800'}>
                                        ${val >= 1_000_000
                                          ? `${(val / 1_000_000).toFixed(2)}M`
                                          : val >= 1000
                                          ? `${Math.round(val / 1000)}K`
                                          : Math.round(val).toLocaleString()}
                                      </span>
                                    : '—'}
                                </td>
                                <td className="py-1.5 px-3 text-gray-500 whitespace-nowrap">{r.approved_by_city_council?.slice(0, 10) ?? '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <DataAttribution source="Commercial CRA Abatements" uid="m76i-p5p9" />
                  </div>
                </>
              )}

              {/* Permit history */}
              {(ownerPermits?.length ?? 0) > 0 && (
                <>
                  <SectionDivider label="Permit History" />
                  <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left py-2 px-3 font-semibold text-gray-600">Address</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600">Type</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600">Status</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ownerPermits!.slice(0, 50).map((p, i) => (
                            <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                              <td className="py-1.5 px-3 font-medium text-gray-800 max-w-[140px] truncate" title={p.originaladdress1}>{p.originaladdress1 || '—'}</td>
                              <td className="py-1.5 px-3 text-gray-600">{p.permittypemapped || '—'}</td>
                              <td className="py-1.5 px-3 text-gray-500">{clean(p.statuscurrent) || '—'}</td>
                              <td className="py-1.5 px-3 text-gray-500 whitespace-nowrap">{p.applieddate?.slice(0, 10) ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                        {(ownerPermits?.length ?? 0) > 50 && (
                          <tfoot>
                            <tr>
                              <td colSpan={4} className="px-3 py-2 text-xs text-gray-400 text-center border-t border-gray-100">
                                Showing 50 of {ownerPermits?.length} permits
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                    <DataAttribution source="Building Permits" uid="uhjb-xac9" />
                  </div>
                </>
              )}

              {/* Orgs */}
              <SectionDivider label="Organizations Working on This" />
              <CivicOrgsPanel
                categories={['housing-eviction']}
                intro="These organizations document problem landlords, represent tenants, and advocate for housing policy — the right people to bring this research to."
              />
            </div>
          )}
        </div>
      )}

    </div>
  )
}

export default OwnerActivity
