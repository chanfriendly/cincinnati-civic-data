/**
 * CouncilPanel — "Who represents me" accountability panel.
 *
 * Displays all 9 Cincinnati City Council members with contact info.
 * Cincinnati is an at-large city — all 9 members represent every resident
 * citywide, regardless of address. There are no geographic council districts.
 *
 * Data source: public/data/cincinnati_council.json
 * Loaded once at module level (tiny static file, no async needed).
 */

import React, { useState } from 'react'
import councilData from '../../../public/data/cincinnati_council.json'
import type { CouncilMember, CincinnatiCouncil } from '../../types'
import DataAttribution from './DataAttribution'

const council = councilData as CincinnatiCouncil

// ── Icons ─────────────────────────────────────────────────────────────────────

const EnvelopeIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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

const PhoneIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 8V5z" />
  </svg>
)

// ── Member card ───────────────────────────────────────────────────────────────

interface MemberCardProps {
  member: CouncilMember
  compact?: boolean
}

const MemberCard: React.FC<MemberCardProps> = ({ member, compact = false }) => {
  const initials = member.name
    .split(' ')
    .filter((_, i, arr) => i === 0 || i === arr.length - 1)
    .map(n => n[0])
    .join('')

  if (compact) {
    return (
      <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Avatar */}
          <div className="w-7 h-7 rounded-full bg-[#1A4A6B] flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-white">{initials}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{member.name}</p>
            {member.title === 'Vice Mayor' && (
              <span className="text-[9px] font-bold uppercase tracking-wide text-[#C8861A]">Vice Mayor</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={`mailto:${member.email}`}
            title={`Email ${member.name}`}
            className="text-[#1A4A6B] hover:text-[#0d2e45] transition-colors p-1"
          >
            <EnvelopeIcon />
          </a>
          <a
            href={member.website}
            target="_blank"
            rel="noopener noreferrer"
            title={`${member.name}'s city page`}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <ExternalLinkIcon />
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 rounded-lg p-3 flex flex-col gap-2 hover:bg-gray-100 transition-colors">
      {/* Avatar + name */}
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full bg-[#1A4A6B] flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-white">{initials}</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 leading-tight">{member.name}</p>
          <p className="text-xs text-gray-500 leading-tight">
            {member.title}
            {!member.email_verified && (
              <span className="ml-1 text-[9px] text-amber-600 font-medium">(email unverified)</span>
            )}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-1 border-t border-gray-200">
        <a
          href={`mailto:${member.email}`}
          className="flex items-center gap-1 text-[11px] text-[#1A4A6B] hover:text-[#0d2e45] font-medium transition-colors"
        >
          <EnvelopeIcon />
          Email
        </a>
        <span className="text-gray-300">·</span>
        <a
          href={member.website}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ExternalLinkIcon />
          City page
        </a>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface CouncilPanelProps {
  /** compact=true: compact list (for Address Lookup sidebar). compact=false: grid (for Neighborhood Profiles) */
  compact?: boolean
}

const CouncilPanel: React.FC<CouncilPanelProps> = ({ compact = false }) => {
  const [expanded, setExpanded] = useState(!compact)
  const { _meta, members } = council
  const viceMaxyor = members.find(m => m.title === 'Vice Mayor')
  const regularMembers = members.filter(m => m.title !== 'Vice Mayor')

  if (compact) {
    return (
      <div className="space-y-3">
        {/* At-large explainer */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          <p className="text-xs text-blue-800 leading-snug">
            <span className="font-semibold">Cincinnati's council is at-large</span> — all 9 members are elected citywide and represent every resident, regardless of address.
          </p>
        </div>

        {/* Collapsible member list */}
        <div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center justify-between w-full text-left text-xs font-semibold text-gray-700 hover:text-gray-900 transition-colors mb-1"
          >
            <span>All 9 council members</span>
            <span className="text-gray-400 text-[10px]">{expanded ? '▲ hide' : '▼ show'}</span>
          </button>

          {expanded && (
            <div className="divide-y divide-gray-100">
              {viceMaxyor && <MemberCard key={viceMaxyor.id} member={viceMaxyor} compact />}
              {regularMembers.map(m => <MemberCard key={m.id} member={m} compact />)}
            </div>
          )}
        </div>

        {/* Clerk of Council */}
        <div className="border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <PhoneIcon />
          <div>
            <p className="text-[11px] font-semibold text-gray-700">Clerk of Council</p>
            <a href={`tel:${_meta.clerk_phone}`} className="text-[11px] text-[#1A4A6B] hover:underline">
              {_meta.clerk_phone}
            </a>
            <span className="text-[11px] text-gray-400"> · general inquiries</span>
          </div>
        </div>

        <DataAttribution
          source="Cincinnati City Council — Cincinnati.gov"
          url={_meta.verify_url}
        />
      </div>
    )
  }

  // Full grid variant
  return (
    <div className="space-y-4">
      {/* Header context */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
        <p className="text-sm text-blue-900 leading-snug">
          <span className="font-semibold">Cincinnati's council is elected at-large.</span> All 9 members represent every resident citywide — there are no geographic districts. You can contact any of them about issues in your neighborhood.
        </p>
      </div>

      {/* Vice Mayor first */}
      {viceMaxyor && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Vice Mayor</p>
          <div className="grid grid-cols-1">
            <MemberCard member={viceMaxyor} />
          </div>
        </div>
      )}

      {/* Council members grid */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Council Members</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {regularMembers.map(m => <MemberCard key={m.id} member={m} />)}
        </div>
      </div>

      {/* Clerk + data note */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 flex items-center gap-2">
          <PhoneIcon />
          <div>
            <p className="text-xs font-semibold text-gray-700">Clerk of Council — General Inquiries</p>
            <div className="flex items-center gap-3 mt-0.5">
              <a href={`tel:${_meta.clerk_phone}`} className="text-xs text-[#1A4A6B] hover:underline font-medium">
                {_meta.clerk_phone}
              </a>
              <a href={`mailto:${_meta.clerk_email}`} className="text-xs text-gray-500 hover:text-gray-700">
                {_meta.clerk_email}
              </a>
            </div>
          </div>
        </div>
        <a
          href={_meta.council_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-[#1A4A6B] hover:text-[#0d2e45] font-medium border border-[#1A4A6B] rounded-lg px-3 py-2.5 transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <ExternalLinkIcon />
          Full council website
        </a>
      </div>

      <DataAttribution
        source={`Cincinnati City Council — Cincinnati.gov · Elected Nov 2025 · Term ends Dec ${_meta.term_end}`}
        url={_meta.verify_url}
      />
    </div>
  )
}

export default CouncilPanel
