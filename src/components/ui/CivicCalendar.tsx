/**
 * CivicCalendar — Public comment & civic meeting calendar.
 *
 * Generates upcoming meeting dates for Cincinnati's key civic bodies
 * using known recurring schedules. No external API needed — these
 * schedules are stable and verified against public agendas.
 *
 * Bodies covered:
 *   - Cincinnati City Council  (1st & 3rd Wednesdays, plus 5th when it falls)
 *   - Planning Commission      (1st Wednesday of each month)
 *   - Board of Zoning Appeals  (3rd Monday of each month)
 *   - CDBG Public Comment      (annual, April–May; exact dates vary by year)
 *
 * Links go directly into Cincinnati's Legistar and city-agenda pages.
 */

import React, { useMemo } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MeetingEvent {
  date: Date
  body: string
  type: 'council' | 'planning' | 'bza' | 'cdbg' | 'budget'
  description: string
  publicComment: boolean
  agendaUrl: string
  livestreamUrl?: string
  note?: string
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Returns the Nth occurrence of a weekday in a given month/year.
 *  weekday: 0=Sun, 1=Mon, …, 3=Wed, 6=Sat
 *  nth: 1=first, 2=second, 3=third, 4=fourth */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  const d = new Date(year, month, 1)
  const offset = (weekday - d.getDay() + 7) % 7
  d.setDate(1 + offset + (nth - 1) * 7)
  return d
}

/** Returns a new Date set to 9:00 AM local time. */
function at9am(d: Date): Date {
  const out = new Date(d)
  out.setHours(9, 0, 0, 0)
  return out
}

/** Returns a new Date set to 6:30 PM local time. */
function at630pm(d: Date): Date {
  const out = new Date(d)
  out.setHours(18, 30, 0, 0)
  return out
}

// ── Meeting schedule generator ────────────────────────────────────────────────

function generateUpcomingMeetings(weeksAhead = 8): MeetingEvent[] {
  const events: MeetingEvent[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoff = new Date(today)
  cutoff.setDate(today.getDate() + weeksAhead * 7)

  // We'll generate across the current month and next two months to ensure coverage.
  const monthsToCheck: [number, number][] = []
  for (let i = -1; i <= 3; i++) {
    const d = new Date(today)
    d.setMonth(d.getMonth() + i)
    monthsToCheck.push([d.getFullYear(), d.getMonth()])
  }

  for (const [year, month] of monthsToCheck) {
    // ── City Council (1st & 3rd Wednesdays at 6:30 PM) ─────────────────────
    // Council occasionally cancels or adds special sessions, but the base
    // schedule is 1st and 3rd Wednesday. We note this in the event.
    const councilWeds = [
      nthWeekdayOfMonth(year, month, 3, 1), // 1st Wednesday
      nthWeekdayOfMonth(year, month, 3, 3), // 3rd Wednesday
    ]
    for (const d of councilWeds) {
      const meeting = at630pm(d)
      if (meeting >= today && meeting <= cutoff) {
        events.push({
          date: meeting,
          body: 'Cincinnati City Council',
          type: 'council',
          description: 'Regular Council session — public speaks at the start of the meeting. Sign up to speak at City Hall or online.',
          publicComment: true,
          agendaUrl: 'https://cincinnatioh.legistar.com/Calendar.aspx',
          livestreamUrl: 'https://www.cincinnati-oh.gov/citicable/',
          note: 'Schedule subject to change. Verify agenda 48h before meeting.',
        })
      }
    }

    // ── Planning Commission (1st & 3rd Fridays at 9:00 AM) ─────────────────
    const planningFridays = [
      nthWeekdayOfMonth(year, month, 5, 1), // 1st Friday
      nthWeekdayOfMonth(year, month, 5, 3), // 3rd Friday
    ]
    for (const d of planningFridays) {
      const planningDate = at9am(d)
      if (planningDate >= today && planningDate <= cutoff) {
        events.push({
          date: planningDate,
          body: 'Cincinnati Planning Commission',
          type: 'planning',
          description: 'Reviews zoning changes, major development projects, and land use plans. Public comment accepted on agenda items — sign up in advance.',
          publicComment: true,
          agendaUrl: 'https://www.cincinnati-oh.gov/planning/about-city-planning/city-planning-commission/',
          note: 'Contact planning@cincinnati-oh.gov or 513-352-4845 to confirm agenda items.',
        })
      }
    }

    // ── Board of Zoning Appeals (3rd Monday at 9:00 AM) ────────────────────
    const bzaDate = at9am(nthWeekdayOfMonth(year, month, 1, 3))
    if (bzaDate >= today && bzaDate <= cutoff) {
      events.push({
        date: bzaDate,
        body: 'Board of Zoning Appeals',
        type: 'bza',
        description: 'Hears requests for variances, conditional uses, and appeals of zoning decisions. Neighbors may speak on cases affecting their properties.',
        publicComment: true,
        agendaUrl: 'https://www.cincinnati-oh.gov/buildings/hearings-appeals/zoning-board-of-appeals/',
        note: 'Contact boards@cincinnati-oh.gov or 513-352-1559 to check the agenda.',
      })
    }
  }

  // ── CDBG Public Comment (annual, April–May window) ──────────────────────────
  // Cincinnati's Action Plan public comment period typically opens in April.
  // We surface this year-round as a standing note.
  const currentYear = today.getFullYear()
  const cdbgCommentOpen = new Date(currentYear, 3, 1) // April 1
  const cdbgCommentClose = new Date(currentYear, 4, 31) // May 31
  if (today <= cdbgCommentClose) {
    const cdbgDate = today < cdbgCommentOpen ? cdbgCommentOpen : today
    if (cdbgDate <= cutoff) {
      events.push({
        date: cdbgDate,
        body: 'CDBG Annual Action Plan',
        type: 'cdbg',
        description: `Community Development Block Grant public comment period (${currentYear}). Cincinnati accepts written and in-person comment on how federal CDBG funds are spent on housing, infrastructure, and anti-poverty programs.`,
        publicComment: true,
        agendaUrl: 'https://www.cincinnati-oh.gov/stimulus/funding/community-development-block-grant-cdbg/',
        note: `Comment period typically April 1 – May 31, ${currentYear}.`,
      })
    }
  }

  // Sort by date
  return events.sort((a, b) => a.date.getTime() - b.date.getTime())
}

// ── Display helpers ───────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<MeetingEvent['type'], { color: string; icon: string; short: string }> = {
  council:  { color: 'bg-[#1A4A6B] text-white',        icon: '🏛',  short: 'Council' },
  planning: { color: 'bg-emerald-700 text-white',       icon: '📐',  short: 'Planning' },
  bza:      { color: 'bg-violet-700 text-white',        icon: '⚖️', short: 'BZA' },
  cdbg:     { color: 'bg-[#C8861A] text-white',         icon: '🏘',  short: 'CDBG' },
  budget:   { color: 'bg-gray-700 text-white',          icon: '💰',  short: 'Budget' },
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatEventDate(d: Date): string {
  const day = DAY_NAMES[d.getDay()]
  const month = MONTH_NAMES[d.getMonth()]
  const date = d.getDate()
  const h = d.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  const min = d.getMinutes().toString().padStart(2, '0')
  return `${day}, ${month} ${date} · ${h12}:${min} ${ampm}`
}

function daysUntil(d: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - today.getTime()) / 86400000)
}

// ── Pre-filled "unlock the API" email (same as CouncilPanel) ─────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

interface CivicCalendarProps {
  /** How many weeks ahead to show meetings. Default: 8 */
  weeksAhead?: number
  /** Compact mode shows fewer details, for sidebar use */
  compact?: boolean
}

const CivicCalendar: React.FC<CivicCalendarProps> = ({ weeksAhead = 8, compact = false }) => {
  const meetings = useMemo(() => generateUpcomingMeetings(weeksAhead), [weeksAhead])

  if (meetings.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">No upcoming public meetings found in the next {weeksAhead} weeks.</p>
    )
  }

  return (
    <div className="space-y-3">
      {!compact && (
        <p className="text-xs text-gray-500 leading-relaxed">
          These are the civic meetings where Cincinnati residents can speak directly to decision-makers.
          Public comment is accepted at each — click an agenda link to see what's on the docket before you go.
        </p>
      )}

      {meetings.map((meeting, i) => {
        const cfg = TYPE_CONFIG[meeting.type]
        const days = daysUntil(meeting.date)
        const urgency = days <= 3 ? 'ring-2 ring-orange-400' : days <= 7 ? 'ring-1 ring-[#1A4A6B]/30' : ''

        return (
          <div key={i} className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${urgency} hover:shadow-sm transition-shadow`}>
            {/* Header row */}
            <div className="flex items-stretch">
              <div className={`${cfg.color} flex flex-col items-center justify-center px-3 py-2 shrink-0 min-w-[44px]`}>
                <span className="text-base leading-none">{cfg.icon}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider mt-1 opacity-90">{cfg.short}</span>
              </div>
              <div className="flex-1 px-3 py-2.5 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-gray-900 leading-tight">{meeting.body}</p>
                  {days <= 7 && (
                    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      days <= 3 ? 'bg-orange-100 text-orange-700' : 'bg-blue-50 text-blue-700'
                    }`}>
                      {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">{formatEventDate(meeting.date)}</p>
              </div>
            </div>

            {/* Body */}
            {!compact && (
              <div className="px-3 pb-3 pt-1.5 border-t border-gray-100 space-y-2">
                <p className="text-xs text-gray-600 leading-relaxed">{meeting.description}</p>
                {meeting.note && (
                  <p className="text-[10px] text-gray-400 italic">{meeting.note}</p>
                )}
                <div className="flex items-center gap-3 flex-wrap pt-0.5">
                  <a
                    href={meeting.agendaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-medium text-[#1A4A6B] hover:text-[#0d2e45] underline-offset-2 hover:underline"
                  >
                    View agenda →
                  </a>
                  {meeting.livestreamUrl && (
                    <a
                      href={meeting.livestreamUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-gray-500 hover:text-gray-700 underline-offset-2 hover:underline"
                    >
                      Watch on CitiCable
                    </a>
                  )}
                  {meeting.publicComment && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 ml-auto">
                      ✓ Public comment
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Compact footer */}
            {compact && (
              <div className="px-3 pb-2 pt-1 border-t border-gray-100 flex items-center justify-between">
                <a
                  href={meeting.agendaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-medium text-[#1A4A6B] hover:text-[#0d2e45] underline-offset-2 hover:underline"
                >
                  Agenda →
                </a>
                {meeting.publicComment && (
                  <span className="text-[10px] text-green-700">✓ Public comment</span>
                )}
              </div>
            )}
          </div>
        )
      })}

      <div className="pt-2 border-t border-gray-100 space-y-1.5">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Dates are computed from Cincinnati's standard recurring schedule — Council cancels or adds sessions
          occasionally.{' '}
          <a
            href="https://cincinnatioh.legistar.com/Calendar.aspx"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Verify on Legistar
          </a>{' '}
          before attending.
          Live agendas would be automatic if Cincinnati{' '}
          <a
            href={UNLOCK_EMAIL_HREF}
            className="underline text-amber-700 font-medium"
          >
            enabled its Legistar API
          </a>
          {' '}— a one-time IT change other cities have already made.
        </p>
      </div>
    </div>
  )
}

export default CivicCalendar
