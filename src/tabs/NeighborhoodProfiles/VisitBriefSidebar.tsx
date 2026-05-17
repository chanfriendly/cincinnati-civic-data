/**
 * Visit Brief sidebar — the "six things to know before a home visit" rail.
 *
 * Sticky left column in the Neighborhood Profiles redesign. Loads data from
 * static JSON files so it renders instantly without waiting for API calls.
 */
import React, { useMemo } from 'react'
import { stripNeighborhoodName } from '../../utils/api'
import { Chip, StackedBar, Tag, BriefItem, C } from '../../components/ui/DesignAtoms'

// Static data imports
import lifeExpData from '../../../public/data/neighborhood_life_expectancy.json'
import leadData from '../../../public/data/lead_service_lines.json'
import transitData from '../../../public/data/neighborhood_transit_equity.json'
import healthData from '../../../public/data/neighborhood_health_outcomes.json'
import demographicsData from '../../../public/data/neighborhood_demographics.json'
import facilitiesData from '../../../public/data/healthcare_facilities.json'

type LeadEntry   = { name: string; total: number; lead: number; unknown: number; copper: number; replaced: number }
type TransitEntry = { name: string; stopCount: number; lat: number; lon: number; medianIncome: number }
type HealthEntry  = Record<string, number | string>
type DemoEntry    = { name: string; over65Pct: number; livingAlonePct: number; totalPopulation: number }
type Facility     = { name: string; type: string; lat: number; lon: number; fqhc: boolean }

const lifeExp    = lifeExpData    as Record<string, { name: string; lifeExpectancy: number }>
const lead       = leadData       as Record<string, LeadEntry>
const transit    = transitData    as TransitEntry[]
const health     = healthData     as Record<string, HealthEntry>
const demographics = demographicsData as Record<string, DemoEntry>
const facilities = facilitiesData as Facility[]

function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8 // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

interface VisitBriefSidebarProps {
  neighborhood: string
  topRequests?: Array<{ label: string; count: number }>
  cityLifeExpectancy?: number
}

const CITY_LIFE_EXP = 77.1

export const VisitBriefSidebar: React.FC<VisitBriefSidebarProps> = ({
  neighborhood,
  topRequests = [],
  cityLifeExpectancy = CITY_LIFE_EXP,
}) => {
  const key = stripNeighborhoodName(neighborhood)

  // Life expectancy
  const lifeExpEntry = lifeExp[key]
  const lifeYrs      = lifeExpEntry?.lifeExpectancy
  const lifeGap      = lifeYrs != null ? (cityLifeExpectancy - lifeYrs).toFixed(1) : null

  // Lead service lines
  const leadEntry = lead[key]
  const leadPct    = leadEntry && leadEntry.total > 0
    ? Math.round((leadEntry.lead / leadEntry.total) * 100)
    : null
  const unknownPct = leadEntry && leadEntry.total > 0
    ? Math.round((leadEntry.unknown / leadEntry.total) * 100)
    : null
  const copperPct  = leadEntry && leadEntry.total > 0
    ? Math.round((leadEntry.copper / leadEntry.total) * 100)
    : null
  const replacedPct = leadEntry && leadEntry.total > 0
    ? Math.round((leadEntry.replaced / leadEntry.total) * 100)
    : null
  const leadRisky = (leadPct ?? 0) + (unknownPct ?? 0)

  // Transit
  const transitEntry = transit.find(
    (t) => stripNeighborhoodName(t.name) === key
  )
  const stopCount = transitEntry?.stopCount ?? null

  // Nearby healthcare (within 1.5 mi of neighborhood centroid)
  const nearbyFacilities = useMemo(() => {
    if (!transitEntry) return []
    return facilities
      .filter((f) => f.lat && f.lon)
      .map((f) => ({
        ...f,
        dist: distanceMiles(transitEntry.lat, transitEntry.lon, f.lat, f.lon),
      }))
      .filter((f) => f.dist <= 1.5)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 4)
  }, [transitEntry])

  const hasFQHC = nearbyFacilities.some((f) => f.fqhc)

  // Demographics
  const demo = demographics[key]
  const over65Pct = demo?.over65Pct

  // Health — diabetes and highBloodPressure for context
  const healthEntry = health[key]
  const diabetes  = healthEntry?.diabetes  as number | undefined
  const hbp       = healthEntry?.highBloodPressure as number | undefined

  const hasEnoughData = lifeYrs != null || leadPct != null || stopCount != null

  if (!hasEnoughData) {
    return (
      <div className="page-paper rounded-md p-6 sticky top-4">
        <h2 className="serif text-[22px] font-medium leading-none mb-2" style={{ color: C.ink }}>
          Visit brief
        </h2>
        <p className="text-[13px]" style={{ color: C.muted }}>
          Limited pre-visit data available for {neighborhood}.
        </p>
      </div>
    )
  }

  return (
    <div className="page-paper rounded-md p-6 sticky top-4">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="serif text-[22px] font-medium leading-none" style={{ color: C.ink }}>
          Visit brief
        </h2>
        <span className="smallcaps" style={{ color: C.muted }}>1-min read</span>
      </div>
      <p className="text-[12px] mb-5 leading-snug" style={{ color: C.muted }}>
        Six things to know before a home visit in this neighborhood.
      </p>

      <ol className="space-y-5">

        {/* 01 — Life expectancy */}
        {lifeYrs != null && (
          <BriefItem n="01">
            <div
              className="serif tnum font-medium leading-none"
              style={{ fontSize: 28, color: lifeGap && parseFloat(lifeGap) >= 5 ? C.brick : C.ink }}
            >
              {lifeYrs}{' '}
              <span className="text-[14px] font-light" style={{ color: C.muted }}>yrs</span>
            </div>
            <div className="text-[13px] mt-1.5 leading-snug" style={{ color: C.ink }}>
              Avg. life expectancy
              {lifeGap && (
                <>
                  {' '}—{' '}
                  <strong className="font-semibold" style={{ color: parseFloat(lifeGap) >= 2 ? C.brick : C.muted }}>
                    {parseFloat(lifeGap) >= 0 ? `${lifeGap} yrs below` : `${Math.abs(parseFloat(lifeGap))} yrs above`}
                  </strong>{' '}
                  the city.
                </>
              )}
            </div>
            {diabetes != null && hbp != null && (
              <div className="mt-2 text-[11px]" style={{ color: C.muted }}>
                Diabetes <span className="tnum font-medium" style={{ color: C.ink }}>{diabetes.toFixed(1)}%</span>
                {' · '}
                High BP <span className="tnum font-medium" style={{ color: C.ink }}>{hbp.toFixed(1)}%</span>
              </div>
            )}
          </BriefItem>
        )}

        {/* 02 — Lead risk */}
        {leadPct != null && (
          <BriefItem n="02">
            <div className="flex items-baseline gap-2">
              <span
                className="serif tnum font-medium leading-none"
                style={{ fontSize: 22, color: leadRisky >= 50 ? C.brick : leadRisky >= 25 ? C.ochre : C.hill }}
              >
                {leadRisky >= 50 ? 'HIGH' : leadRisky >= 25 ? 'MED' : 'LOWER'}
              </span>
              <Tag tone={leadRisky >= 50 ? 'warn' : leadRisky >= 25 ? 'neutral' : 'good'}>lead risk</Tag>
            </div>
            <div className="text-[13px] mt-1.5 leading-snug" style={{ color: C.ink }}>
              <Chip tone="warn">{leadRisky}%</Chip> lead or unknown service lines.
            </div>
            {leadEntry && (
              <div className="mt-2">
                <StackedBar
                  segments={[
                    { label: 'Lead',     share: leadPct ?? 0,    color: C.brick },
                    { label: 'Unknown',  share: unknownPct ?? 0, color: C.ochre },
                    { label: 'Copper',   share: copperPct ?? 0,  color: C.hill },
                    { label: 'Replaced', share: replacedPct ?? 0, color: C.river },
                  ]}
                  height={8}
                  showLabels={false}
                />
              </div>
            )}
          </BriefItem>
        )}

        {/* 03 — Healthcare nearby */}
        <BriefItem n="03">
          {nearbyFacilities.length > 0 ? (
            <>
              <div
                className="serif text-[15px] leading-snug font-medium"
                style={{ color: C.hill }}
              >
                {nearbyFacilities.length} facilit{nearbyFacilities.length === 1 ? 'y' : 'ies'} within 1.5 mi
                {hasFQHC && <> · FQHC</>}
              </div>
              <ul className="mt-2 text-[12px] space-y-1">
                {nearbyFacilities.slice(0, 3).map((f, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2">
                    <span className="truncate" style={{ color: C.ink }}>{f.name}</span>
                    <span className="tnum shrink-0" style={{ color: C.muted }}>
                      {f.dist.toFixed(1)} mi
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="text-[13px] leading-snug" style={{ color: C.muted }}>
              No healthcare facilities mapped within 1.5 mi.
            </div>
          )}
        </BriefItem>

        {/* 04 — Transit */}
        {stopCount != null && (
          <BriefItem n="04">
            <div className="flex items-baseline gap-2">
              <span
                className="serif tnum font-medium leading-none"
                style={{ fontSize: 22, color: C.river }}
              >
                {stopCount}
              </span>
              <span className="text-[13px]" style={{ color: C.ink }}>bus stops, ½ mi</span>
            </div>
            <div className="text-[12px] mt-1.5" style={{ color: C.muted }}>
              {stopCount >= 20
                ? 'Good transit coverage in this area.'
                : stopCount >= 10
                ? 'Moderate transit access — confirm route timing.'
                : 'Limited transit — car access recommended.'}
            </div>
          </BriefItem>
        )}

        {/* 05 — Vulnerable populations */}
        {(over65Pct != null || demo) && (
          <BriefItem n="05">
            <div className="serif text-[14px] leading-snug font-medium" style={{ color: C.ink }}>
              {over65Pct != null && over65Pct >= 15
                ? 'Above-average senior population'
                : over65Pct != null && over65Pct <= 8
                ? 'Younger-than-average neighborhood'
                : 'Mixed age distribution'}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2 text-[12px]">
              {over65Pct != null && (
                <div>
                  <div
                    className="tnum serif font-medium leading-none"
                    style={{ fontSize: 20, color: C.ink }}
                  >
                    {over65Pct.toFixed(0)}%
                  </div>
                  <div style={{ color: C.muted }}>residents 65+</div>
                </div>
              )}
              {demo?.livingAlonePct != null && (
                <div>
                  <div
                    className="tnum serif font-medium leading-none"
                    style={{ fontSize: 20, color: C.ink }}
                  >
                    {demo.livingAlonePct.toFixed(0)}%
                  </div>
                  <div style={{ color: C.muted }}>living alone</div>
                </div>
              )}
            </div>
          </BriefItem>
        )}

        {/* 06 — Top 311 calls */}
        <BriefItem n="06">
          <div
            className="serif text-[14px] leading-snug font-medium mb-2"
            style={{ color: C.ink }}
          >
            Top 311 calls
          </div>
          {topRequests.length > 0 ? (
            <ul className="space-y-1 text-[12px]">
              {topRequests.slice(0, 3).map((r, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2">
                  <span style={{ color: C.ink }}>{r.label}</span>
                  <span className="tnum" style={{ color: C.muted }}>{r.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[12px]" style={{ color: C.muted }}>
              Loading 311 data…
            </div>
          )}
        </BriefItem>

      </ol>

      {/* Footer */}
      <div
        className="mt-6 pt-5 flex items-center justify-between text-[12px]"
        style={{ borderTop: `1px solid ${C.rule}`, color: C.muted }}
      >
        <span>Sources: CDC, GCWW, SORTA</span>
        <span className="serif italic">Updated 2025–2026</span>
      </div>
    </div>
  )
}

export default VisitBriefSidebar
