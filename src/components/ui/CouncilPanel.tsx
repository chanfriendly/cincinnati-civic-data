/**
 * CouncilPanel — "Who represents me" accountability panel.
 *
 * Displays all 9 Cincinnati City Council members with contact info.
 * Cincinnati is an at-large city — all 9 members represent every resident
 * citywide, regardless of address. There are no geographic council districts.
 *
 * Data source: public/data/cincinnati_council.json
 * Loaded at module level (tiny static file, no async needed).
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

const LockIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean)
  return [parts[0], parts[parts.length - 1]]
    .map(p => p[0])
    .join('')
}

function titleBadgeColor(title: string): string {
  if (title === 'Vice Mayor') return 'text-[#C8861A]'
  if (title === 'President Pro Tem') return 'text-[#1A4A6B]'
  return ''
}

// ── Member card ───────────────────────────────────────────────────────────────

const MemberCard: React.FC<{ member: CouncilMember; compact?: boolean }> = ({
  member,
  compact = false,
}) => {
  const initials = getInitials(member.name)
  const isSpecialTitle = member.title !== 'Councilmember'

  if (compact) {
    return (
      <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-[#1A4A6B] flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-white">{initials}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{member.name}</p>
            {isSpecialTitle && (
              <span className={`text-[9px] font-bold uppercase tracking-wide ${titleBadgeColor(member.title)}`}>
                {member.title}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {member.phone && (
            <a href={`tel:${member.phone}`} title={`Call ${member.name}`}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1">
              <PhoneIcon />
            </a>
          )}
          <a href={`mailto:${member.email}`} title={`Email ${member.name}`}
            className="text-[#1A4A6B] hover:text-[#0d2e45] transition-colors p-1">
            <EnvelopeIcon />
          </a>
          <a href={member.website} target="_blank" rel="noopener noreferrer"
            title={`${member.name}'s city page`}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <ExternalLinkIcon />
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 rounded-lg p-3 flex flex-col gap-2 hover:bg-gray-100 transition-colors">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full bg-[#1A4A6B] flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-white">{initials}</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 leading-tight">{member.name}</p>
          <p className={`text-xs leading-tight ${isSpecialTitle ? titleBadgeColor(member.title) + ' font-semibold' : 'text-gray-500'}`}>
            {member.title}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-auto pt-1 border-t border-gray-200 flex-wrap">
        <a href={`mailto:${member.email}`}
          className="flex items-center gap-1 text-[11px] text-[#1A4A6B] hover:text-[#0d2e45] font-medium transition-colors">
          <EnvelopeIcon />Email
        </a>
        {member.phone && (
          <>
            <span className="text-gray-300">·</span>
            <a href={`tel:${member.phone}`}
              className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-800 transition-colors">
              <PhoneIcon />{member.phone}
            </a>
          </>
        )}
        <span className="text-gray-300">·</span>
        <a href={member.website} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 transition-colors">
          <ExternalLinkIcon />City page
        </a>
      </div>
    </div>
  )
}

// ── Legistar callout ──────────────────────────────────────────────────────────

const LegistarCallout: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div className={`border border-amber-200 bg-amber-50 rounded-lg flex gap-2.5 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
    <span className="text-amber-500 mt-0.5 shrink-0"><LockIcon /></span>
    <div>
      <p className={`font-semibold text-amber-900 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        Voting records not yet available
      </p>
      <p className={`text-amber-800 mt-0.5 leading-snug ${compact ? 'text-[10px]' : 'text-xs'}`}>
        Cincinnati City Council uses{' '}
        <a href="https://cincinnatioh.legistar.com/Calendar.aspx" target="_blank" rel="noopener noreferrer"
          className="underline hover:text-amber-900">Legistar</a>{' '}
        for legislation and votes, but has not enabled public API access. Enabling it is a simple
        configuration change. Ask your council members to open this data.
      </p>
    </div>
  </div>
)

// ── Main component ────────────────────────────────────────────────────────────

interface CouncilPanelProps {
  /** compact=true: collapsible list (Address Lookup). false: full grid (Neighborhood Profiles) */
  compact?: boolean
}

const CouncilPanel: React.FC<CouncilPanelProps> = ({ compact = false }) => {
  const [expanded, setExpanded] = useState(!compact)
  const { _meta, members } = council

  const specialMembers = members.filter(m => m.title !== 'Councilmember')
  const regularMembers = members.filter(m => m.title === 'Councilmember')

  // ── Compact variant ────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="space-y-3">
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          <p className="text-xs text-blue-800 leading-snug">
            <span className="font-semibold">Cincinnati's council is at-large</span> — all 9 members
            are elected citywide and represent every resident, regardless of address.
          </p>
        </div>

        <div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center justify-between w-full text-left text-xs font-semibold text-gray-700 hover:text-gray-900 transition-colors mb-1"
          >
            <span>All 9 council members</span>
            <span className="text-gray-400 text-[10px]">{expanded ? '▲ hide' : '▼ show'}</span>
          </button>

          {expanded && (
            <div>
              {specialMembers.map(m => <MemberCard key={m.id} member={m} compact />)}
              {regularMembers.map(m => <MemberCard key={m.id} member={m} compact />)}
            </div>
          )}
        </div>

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

        <LegistarCallout compact />

        <DataAttribution source="Cincinnati City Council — Cincinnati.gov" url={_meta.verify_url} />
      </div>
    )
  }

  // ── Full grid variant ──────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
        <p className="text-sm text-blue-900 leading-snug">
          <span className="font-semibold">Cincinnati's council is elected at-large.</span> All 9
          members represent every resident citywide — there are no geographic districts. You can
          contact any of them about issues in your neighborhood.
        </p>
      </div>

      {specialMembers.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Leadership</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {specialMembers.map(m => <MemberCard key={m.id} member={m} />)}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Council Members</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {regularMembers.map(m => <MemberCard key={m.id} member={m} />)}
        </div>
      </div>

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
        <a href={_meta.council_url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-[#1A4A6B] hover:text-[#0d2e45] font-medium border border-[#1A4A6B] rounded-lg px-3 py-2.5 transition-colors whitespace-nowrap self-start sm:self-auto">
          <ExternalLinkIcon />Full council website
        </a>
      </div>

      <LegistarCallout />

      <DataAttribution
        source={`Cincinnati City Council — Cincinnati.gov · Elected Nov 2025 · Term ends Dec ${_meta.term_end}`}
        url={_meta.verify_url}
      />
    </div>
  )
}

export default CouncilPanel
