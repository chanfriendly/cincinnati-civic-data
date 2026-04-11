/**
 * CivicOrgsPanel — Contextual civic organizations directory.
 *
 * Accepts an optional list of categories to filter by. When categories are
 * provided, only orgs in those categories are shown and the section is
 * framed contextually ("Organizations working on this"). When no categories
 * are provided, all orgs are shown with a category filter tab bar.
 *
 * Data source: public/data/cincinnati_orgs.json
 */

import React, { useMemo, useState } from 'react'
import orgsData from '../../../public/data/cincinnati_orgs.json'
import type { CivicOrg, CivicOrgCategory, CincinnatiOrgsData } from '../../types'
import DataAttribution from './DataAttribution'

const data = orgsData as CincinnatiOrgsData

// ── Category config ────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<CivicOrgCategory, string> = {
  'housing-eviction':     'Housing & Eviction',
  'environmental-health': 'Environmental Health',
  'police-accountability':'Police & Civil Rights',
  'food-access':          'Food Access',
  'transit-equity':       'Transit',
  'economic-development': 'Economic Dev.',
  'civic-engagement':     'Civic Engagement',
}

const CATEGORY_COLORS: Record<CivicOrgCategory, string> = {
  'housing-eviction':     'bg-red-100 text-red-800',
  'environmental-health': 'bg-green-100 text-green-800',
  'police-accountability':'bg-purple-100 text-purple-800',
  'food-access':          'bg-orange-100 text-orange-800',
  'transit-equity':       'bg-blue-100 text-blue-800',
  'economic-development': 'bg-amber-100 text-amber-800',
  'civic-engagement':     'bg-gray-100 text-gray-700',
}

const SERVICE_LABELS = {
  direct_service: { label: 'Direct Service', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  organizing:     { label: 'Organizing',     color: 'bg-violet-50 text-violet-700 border-violet-200' },
  both:           { label: 'Service + Organizing', color: 'bg-sky-50 text-sky-700 border-sky-200' },
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const PhoneIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 8V5z" />
  </svg>
)

const EnvelopeIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)

const ExternalLinkIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
)

// ── Org card ──────────────────────────────────────────────────────────────────

const OrgCard: React.FC<{ org: CivicOrg; showCategories?: boolean }> = ({
  org,
  showCategories = false,
}) => {
  const svc = SERVICE_LABELS[org.service_type]

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow flex flex-col gap-3">
      {/* Name + service type */}
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900 leading-snug">{org.name}</h4>
        <span className={`shrink-0 text-[9px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 ${svc.color}`}>
          {svc.label}
        </span>
      </div>

      {/* Mission */}
      <p className="text-xs text-gray-600 leading-relaxed">{org.mission}</p>

      {/* Category tags (only in all-orgs view) */}
      {showCategories && (
        <div className="flex flex-wrap gap-1">
          {org.categories.map(cat => (
            <span key={cat} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${CATEGORY_COLORS[cat]}`}>
              {CATEGORY_LABELS[cat]}
            </span>
          ))}
        </div>
      )}

      {/* Contact links */}
      <div className="flex items-center gap-3 flex-wrap mt-auto pt-2 border-t border-gray-100">
        <a href={org.website} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] font-medium text-[#1A4A6B] hover:text-[#0d2e45] transition-colors">
          <ExternalLinkIcon />Website
        </a>
        {org.phone && (
          <a href={`tel:${org.phone.replace(/[^0-9+]/g, '')}`}
            className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-800 transition-colors">
            <PhoneIcon />{org.phone}
          </a>
        )}
        {org.phone_alt && (
          <a href={`tel:${org.phone_alt.replace(/[^0-9+]/g, '')}`}
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 transition-colors">
            <PhoneIcon />{org.phone_alt}
          </a>
        )}
        {org.email && (
          <a href={`mailto:${org.email}`}
            className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-800 transition-colors">
            <EnvelopeIcon />{org.email}
          </a>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface CivicOrgsPanelProps {
  /**
   * When provided, only orgs in these categories are shown and the section is
   * framed as "Organizations working on this issue" — no filter tabs.
   * When omitted, all orgs are shown with a category filter tab bar.
   */
  categories?: CivicOrgCategory[]
  /** Override the section intro text */
  intro?: string
}

const CivicOrgsPanel: React.FC<CivicOrgsPanelProps> = ({ categories, intro }) => {
  const allOrgs = data.organizations
  const isContextual = categories && categories.length > 0

  // Active filter tab — only used in the full (non-contextual) view
  const [activeFilter, setActiveFilter] = useState<CivicOrgCategory | 'all'>('all')

  const visibleOrgs = useMemo(() => {
    if (isContextual) {
      // Contextual: show orgs that match ANY of the provided categories,
      // deduped and sorted so direct-service orgs come first
      return allOrgs
        .filter(org => org.categories.some(c => categories.includes(c)))
        .sort((a, b) => {
          const order = { direct_service: 0, both: 1, organizing: 2 }
          return order[a.service_type] - order[b.service_type]
        })
    }
    // Full directory: filter by active tab
    if (activeFilter === 'all') return allOrgs
    return allOrgs.filter(org => org.categories.includes(activeFilter))
  }, [isContextual, categories, activeFilter, allOrgs])

  // Which categories actually have orgs (for filter tabs)
  const availableCategories = useMemo(() => {
    const seen = new Set<CivicOrgCategory>()
    allOrgs.forEach(org => org.categories.forEach(c => seen.add(c)))
    return Array.from(seen) as CivicOrgCategory[]
  }, [allOrgs])

  if (isContextual) {
    if (visibleOrgs.length === 0) return null

    return (
      <div className="space-y-3">
        {intro && (
          <p className="text-xs text-gray-500 italic">{intro}</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleOrgs.map(org => (
            <OrgCard key={org.id} org={org} showCategories={false} />
          ))}
        </div>
        <DataAttribution
          source="Cincinnati Civic Organizations Directory — maintained by Cincinnati Civic Data"
          url="https://cincinnati-civic-data.vercel.app"
        />
      </div>
    )
  }

  // Full directory view with category filter tabs
  return (
    <div className="space-y-4">
      {intro && (
        <p className="text-sm text-gray-600 leading-relaxed">{intro}</p>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            activeFilter === 'all'
              ? 'bg-[#1A4A6B] text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All ({allOrgs.length})
        </button>
        {availableCategories.map(cat => {
          const count = allOrgs.filter(o => o.categories.includes(cat)).length
          return (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeFilter === cat
                  ? 'bg-[#1A4A6B] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {CATEGORY_LABELS[cat]} ({count})
            </button>
          )
        })}
      </div>

      {/* Org grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visibleOrgs.map(org => (
          <OrgCard key={org.id} org={org} showCategories={activeFilter === 'all'} />
        ))}
      </div>

      <DataAttribution
        source={`Cincinnati Civic Organizations Directory · Last verified ${data._meta.last_updated}`}
        url="https://cincinnati-civic-data.vercel.app"
      />
    </div>
  )
}

export default CivicOrgsPanel
