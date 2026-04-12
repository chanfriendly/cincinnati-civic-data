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

import React, { useState, useEffect } from 'react'
import councilData from '../../../public/data/cincinnati_council.json'
import type { CouncilMember, CincinnatiCouncil } from '../../types'
import CivicOrgsPanel from './CivicOrgsPanel'
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

const DocumentIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

const CalendarIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const SpeakerIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
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

// ── Pre-filled "unlock the API" email ─────────────────────────────────────────

const UNLOCK_EMAIL_HREF =
  'mailto:councilclerk@cincinnati-oh.gov' +
  '?subject=' + encodeURIComponent('Request: Enable Legistar Public API Access') +
  '&body=' + encodeURIComponent(
    'Dear Clerk of Council,\n\n' +
    'I am writing to request that Cincinnati City Council enable public API access to its ' +
    'Legistar legislative records system (webapi.legistar.com).\n\n' +
    'The Cincinnati Civic Data platform (cincinnati-civic-data.vercel.app) uses open public ' +
    'data to help residents understand their city. Enabling the Legistar API would allow the ' +
    'platform to surface council voting records and legislation alongside neighborhood data — ' +
    'connecting policy decisions to their real-world effects on Cincinnati residents.\n\n' +
    'This is a simple configuration change that many other Legistar-using cities have already ' +
    'made. I ask that City Council direct IT to enable public access.\n\n' +
    'Thank you for your consideration.'
  )

// ── Legistar email counter hook ────────────────────────────────────────────────
// Fetches the live count of residents who have sent the Legistar unlock email.
// If the Worker isn't configured, count stays null and the counter is hidden.

const WORKER_URL = import.meta.env.VITE_WORKER_URL as string | undefined
const COUNTER_KEY = 'legistar-emails'

function useLegistarCounter() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!WORKER_URL) return
    fetch(`${WORKER_URL}/api/counter/${COUNTER_KEY}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { count: number | null } | null) => {
        if (d && typeof d.count === 'number') setCount(d.count)
      })
      .catch(() => {/* graceful: counter stays hidden */})
  }, [])

  const increment = () => {
    if (!WORKER_URL) return
    fetch(`${WORKER_URL}/api/counter/${COUNTER_KEY}`, { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { count: number | null } | null) => {
        if (d && typeof d.count === 'number') setCount(d.count)
      })
      .catch(() => {/* silent */})
  }

  return { count, increment }
}

// ── Legistar bridge section ───────────────────────────────────────────────────

interface LegistarBridgeProps { compact?: boolean }

const LegistarBridge: React.FC<LegistarBridgeProps> = ({ compact = false }) => {
  const { count, increment } = useLegistarCounter()
  const links = [
    {
      label: 'Browse legislation',
      sub: 'Ordinances, resolutions, amendments',
      href: 'https://cincinnatioh.legistar.com/Legislation.aspx',
      Icon: DocumentIcon,
    },
    {
      label: 'Meeting calendar',
      sub: 'Upcoming council & committee meetings',
      href: 'https://cincinnatioh.legistar.com/Calendar.aspx',
      Icon: CalendarIcon,
    },
    {
      label: 'Meeting minutes & video',
      sub: 'Past meeting records and recordings',
      href: 'https://cincinnatioh.legistar.com/DepartmentDetail.aspx?ID=28923&GUID=5D0B8ED4-4C4B-4BE2-812D-4AE3640DECB0',
      Icon: SpeakerIcon,
    },
  ]

  if (compact) {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2.5 space-y-2">
        <div className="flex gap-2 items-start">
          <span className="text-amber-500 mt-0.5 shrink-0"><LockIcon /></span>
          <div>
            <p className="text-[11px] font-semibold text-amber-900">Voting records locked</p>
            <p className="text-[10px] text-amber-800 mt-0.5 leading-snug">
              Council uses Legistar but hasn't enabled the public API.
              Browse records directly, or ask them to open it.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 pl-5">
          {links.map(({ label, href, Icon }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-[#1A4A6B] hover:underline font-medium">
              <Icon />{label}
            </a>
          ))}
        </div>
        <a href={UNLOCK_EMAIL_HREF} onClick={increment}
          className="flex items-center gap-1.5 pl-5 text-[10px] text-amber-700 hover:text-amber-900 font-semibold">
          <EnvelopeIcon />
          Ask Council to unlock voting records →
          {count !== null && (
            <span className="ml-1 text-[9px] font-normal text-amber-600">({count.toLocaleString()} sent)</span>
          )}
        </a>
      </div>
    )
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex gap-2.5 items-start">
        <span className="text-amber-500 mt-0.5 shrink-0"><LockIcon /></span>
        <div>
          <p className="text-sm font-semibold text-amber-900">Voting records not yet integrated</p>
          <p className="text-xs text-amber-800 mt-0.5 leading-snug">
            Cincinnati City Council uses{' '}
            <a href="https://cincinnatioh.legistar.com" target="_blank" rel="noopener noreferrer"
              className="underline hover:text-amber-900 font-medium">Legistar</a>{' '}
            for all legislation and votes. The records are public on their website, but the city
            has not enabled API access — which would let this platform surface voting records
            alongside neighborhood data. It's a simple configuration change.
          </p>
        </div>
      </div>

      {/* Quick links */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1.5">
          Browse public records directly
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {links.map(({ label, sub, href, Icon }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer"
              className="flex items-start gap-2 bg-white border border-amber-200 rounded-md px-3 py-2 hover:border-amber-400 hover:shadow-sm transition-all group">
              <span className="text-amber-500 mt-0.5 shrink-0 group-hover:text-amber-700"><Icon /></span>
              <div>
                <p className="text-xs font-semibold text-gray-800 group-hover:text-[#1A4A6B] leading-tight">{label}</p>
                <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{sub}</p>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Unlock CTA */}
      <div className="border-t border-amber-200 pt-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Help open this data:</span>{' '}
            Enabling the Legistar API is a one-time IT configuration. Other cities have done it.
          </p>
          {count !== null && (
            <p className="text-[10px] text-amber-600 mt-0.5">
              {count.toLocaleString()} {count === 1 ? 'resident has' : 'residents have'} sent this request.
            </p>
          )}
        </div>
        <a href={UNLOCK_EMAIL_HREF} onClick={increment}
          className="shrink-0 flex items-center gap-1.5 text-xs font-semibold bg-amber-700 text-white px-3 py-1.5 rounded-md hover:bg-amber-800 transition-colors whitespace-nowrap">
          <EnvelopeIcon />
          Email Council to unlock →
        </a>
      </div>
    </div>
  )
}

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

        <LegistarBridge compact />

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

      <LegistarBridge />

      {/* Civic engagement orgs — contextually relevant alongside the council panel */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
          Civic Engagement Organizations
        </p>
        <CivicOrgsPanel categories={['civic-engagement']} />
      </div>

      <DataAttribution
        source={`Cincinnati City Council — Cincinnati.gov · Elected Nov 2025 · Term ends Dec ${_meta.term_end}`}
        url={_meta.verify_url}
      />
    </div>
  )
}

export default CouncilPanel
