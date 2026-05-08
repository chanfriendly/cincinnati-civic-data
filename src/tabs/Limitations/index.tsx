import React from 'react'
import { useLanguage } from '../../context/LanguageContext'
import CouncilPanel from '../../components/ui/CouncilPanel'

// ─── Icons ────────────────────────────────────────────────────────────────────

const MapIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
  </svg>
)

const DatabaseIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 7v10c0 2 2 3 8 3s8-1 8-3V7M4 7c0-2 2-3 8-3s8 1 8 3M4 7c0 2 2 3 8 3s8-1 8-3m-16 5c0 2 2 3 8 3s8-1 8-3" />
  </svg>
)

const ScaleIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
  </svg>
)

const BotIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)

const GovIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11m16-11v11M8 14v3m4-3v3m4-3v3" />
  </svg>
)

const GlobeIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

// ─── Section wrapper ──────────────────────────────────────────────────────────

interface SectionProps {
  id: string
  Icon: React.FC<{ className?: string }>
  iconBg: string
  heading: string
  subheading?: string
  children: React.ReactNode
}

const Section: React.FC<SectionProps> = ({ id, Icon, iconBg, heading, subheading, children }) => (
  <section id={id} className="mb-10 scroll-mt-40">
    <div className="flex items-center gap-3 mb-2">
      <span className={`p-2 rounded-lg ${iconBg}`}><Icon /></span>
      <h2 className="text-lg font-bold text-gray-900">{heading}</h2>
    </div>
    {subheading && <p className="text-sm text-gray-500 mb-4 ml-11">{subheading}</p>}
    <div className="ml-11">{children}</div>
  </section>
)

// ─── Reusable components ──────────────────────────────────────────────────────

const Caveat: React.FC<{ title: string; body: React.ReactNode; severity?: 'info' | 'warn' | 'gap' }>
  = ({ title, body, severity = 'info' }) => {
    const styles = {
      info: 'bg-blue-50 border-blue-200 text-blue-900',
      warn: 'bg-amber-50 border-amber-200 text-amber-900',
      gap:  'bg-red-50 border-red-200 text-red-900',
    }[severity]
    const dotColor = {
      info: 'bg-blue-500',
      warn: 'bg-amber-500',
      gap:  'bg-red-500',
    }[severity]
    return (
      <div className={`border ${styles} rounded-lg p-4 mb-3`}>
        <div className="flex items-start gap-2.5">
          <span className={`w-2 h-2 rounded-full ${dotColor} mt-1.5 shrink-0`} />
          <div className="flex-1">
            <p className="font-semibold text-sm mb-1">{title}</p>
            <div className="text-sm leading-relaxed opacity-90">{body}</div>
          </div>
        </div>
      </div>
    )
  }

// ─── Data vintage table rows ──────────────────────────────────────────────────

interface VintageRow {
  source: string
  usedIn: string
  vintage: string
  refresh: string
  notes?: string
}

const VINTAGE_ROWS: VintageRow[] = [
  { source: 'Cincinnati Crime (STARS)',           usedIn: 'Address Lookup, Neighborhood Profiles, Explorer',  vintage: '2017–present',      refresh: 'Near real-time (daily)',    notes: 'Locations approximated within block for privacy' },
  { source: 'Cincinnati Building Permits',        usedIn: 'Neighborhood Profiles, Displacement',               vintage: '2003–present',      refresh: 'Daily',                     notes: 'Trade permits filtered out of investment totals' },
  { source: 'Cincinnati 311 Service Requests',    usedIn: 'Neighborhood Profiles',                             vintage: '2010–present',      refresh: 'Daily',                     notes: '' },
  { source: 'Cincinnati Police Traffic/Ped Stops',usedIn: 'Police Accountability',                             vintage: '2009–present',      refresh: 'Periodic (monthly-ish)',    notes: '' },
  { source: 'Cincinnati Use of Force / OIS',      usedIn: 'Police Accountability',                             vintage: '2010–present',      refresh: 'Periodic',                  notes: '' },
  { source: 'U.S. Census ACS (neighborhood)',     usedIn: 'Profiles, Explorer, Displacement, Tax & Revenue',   vintage: '2023 5-year (built Apr 2026)', refresh: 'Rebuilt annually',   notes: 'Tract → neighborhood via nearest-centroid' },
  { source: 'HMDA Mortgage Data',                 usedIn: 'Neighborhood Profiles (Racial Equity)',             vintage: '2022',              refresh: 'Annual',                    notes: 'CFPB pre-built snapshot' },
  { source: 'HUD Affordable Housing Inventory',   usedIn: 'Neighborhood Profiles (Affordable Housing)',        vintage: '2023',              refresh: 'Annual',                    notes: 'Subsidy expiration flags computed from contract end dates' },
  { source: 'EPA AirToxScreen (EJ)',              usedIn: 'Neighborhood Explorer (EJ dimension)',              vintage: '2019',              refresh: 'Offline since Feb 2025',    notes: 'EJScreen API decommissioned; snapshot only' },
  { source: 'Cincinnati Lead Service Lines',      usedIn: 'Lead Safety',                                       vintage: '2024',              refresh: 'Annual',                    notes: 'Replacement progress updated rolling' },
  { source: 'CAGIS Parcels / Zoning / Parks',     usedIn: 'Address Lookup',                                    vintage: 'Current',           refresh: 'Live (ArcGIS REST)',        notes: 'Parks layer 46 (layer 34 was removed in 2026)' },
  { source: 'FEMA NFHL (flood)',                  usedIn: 'Address Lookup, Explorer',                          vintage: 'Current',           refresh: 'Live',                      notes: '' },
  { source: 'OHGO (Ohio ODOT traffic)',           usedIn: 'Address Lookup',                                    vintage: 'Live',              refresh: 'Live',                      notes: 'State-managed roads only; does not cover city streets' },
  { source: 'SORTA GTFS (bus stops)',             usedIn: 'Address Lookup, Transit Equity',                    vintage: '2024 static',       refresh: 'Rebuilt on GTFS update',    notes: 'Route-per-stop data not available in export' },
  { source: 'ITEP Ohio Who Pays (modeled)',       usedIn: 'Tax & Revenue',                                     vintage: '2024 7th edition',  refresh: 'Re-published every ~3 years', notes: 'Statewide model; applied to Cincinnati percentiles as an estimate' },
  { source: 'Cincinnati Revenue (Socrata)',       usedIn: 'Tax & Revenue',                                     vintage: 'FY 2014–present',   refresh: 'Daily',                     notes: 'Totals only; no per-payer breakdown' },
]

// ─── Main component ───────────────────────────────────────────────────────────

const Limitations: React.FC = () => {
  const { language } = useLanguage()

  return (
    <div className="max-w-5xl mx-auto">

      {/* Spanish AI-translation disclaimer */}
      {language === 'es' && (
        <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-amber-500 text-lg shrink-0 mt-0.5">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-amber-800 mb-1">Nota sobre la traducción al español</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Las traducciones al español en este sitio fueron generadas por inteligencia artificial y aún no
              han sido revisadas por un hablante nativo. Es posible que haya errores de redacción o terminología.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">About, Methodology &amp; Known Limitations</h1>
        <p className="text-gray-600 max-w-3xl leading-relaxed">
          Every civic data tool makes choices about which data to trust, how to aggregate it, and how to
          present it. Those choices are never neutral. This page documents what we know, what we don&rsquo;t,
          and where you should push back on our numbers.
        </p>
      </div>

      {/* What this site is / isn't */}
      <div className="mb-10 bg-[#1A4A6B] text-white rounded-xl p-6">
        <h2 className="text-base font-bold mb-4">What this is &mdash; and what it isn&rsquo;t</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
          <div>
            <p className="font-semibold text-white mb-2">This site is</p>
            <ul className="space-y-2 text-blue-100 leading-relaxed">
              <li>&bull; An independent, open-source aggregator of public civic data.</li>
              <li>&bull; A starting point for research, organizing, and accountability.</li>
              <li>&bull; Opinionated about which data matters and how to present it honestly.</li>
              <li>&bull; Community-maintained. Issues and pull requests welcome.</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white mb-2">This site is not</p>
            <ul className="space-y-2 text-blue-100 leading-relaxed">
              <li>&bull; An official City of Cincinnati product.</li>
              <li>&bull; A real-time operational system. Data refreshes are documented per dataset.</li>
              <li>&bull; A legal or financial record of anything. Always verify against source portals before acting.</li>
              <li>&bull; Free of mistakes. Please report them.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Jump links */}
      <nav aria-label="Sections on this page" className="mb-10 bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">On this page</p>
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            ['boundaries', 'Neighborhood boundaries'],
            ['vintages',   'Data vintages'],
            ['gaps',       'Known data gaps'],
            ['politics',   'City Council & political structure'],
            ['ai',         'AI-generated content'],
            ['tax-model',  'Tax modeling'],
            ['i18n',       'Language'],
            ['contribute', 'Report issues'],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`}
              className="px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-700 hover:border-[#1A4A6B] hover:text-[#1A4A6B] transition-colors">
              {label}
            </a>
          ))}
        </div>
      </nav>

      {/* ─── Section 1: Neighborhood boundaries ─────────────────────────────── */}
      <Section
        id="boundaries"
        Icon={MapIcon}
        iconBg="bg-blue-100 text-blue-700"
        heading="Neighborhood boundaries &mdash; the most important caveat"
        subheading="Cincinnati has two competing definitions of &lsquo;neighborhood.&rsquo; They don&rsquo;t match."
      >
        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed mb-4">
          <p>
            &ldquo;Neighborhood&rdquo; in Cincinnati means two different things depending on who&rsquo;s asking:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">What we use (mostly)</p>
            <p className="font-semibold text-gray-900 mb-1">Statistical Neighborhood Approximations (SNA)</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Defined by aggregating U.S. Census tracts. Used for almost all statistical reporting &mdash; including
              ACS income/rent, crime, permits, and most of the data on this site. Stable and comparable across years.
            </p>
          </div>
          <div className="bg-white border border-amber-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">What the city uses for decisions</p>
            <p className="font-semibold text-gray-900 mb-1">Community Council Boundaries</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              The political/administrative boundary. This is what the city uses roughly 90% of the time to determine
              which council claims a block, who has a voice in development decisions, and how funding is allocated.
              Boundaries are sometimes contested, with multiple councils claiming the same area.
            </p>
          </div>
        </div>

        <Caveat
          title="These two boundaries disagree, sometimes significantly."
          severity="warn"
          body={
            <>
              <p className="mb-2">
                Oakley is a commonly-cited example: the SNA and Community Council boundary shapes are noticeably
                different. For a block sitting near the edge of a neighborhood, those two definitions can produce
                different numbers on this site than the ones a council member or city planner would quote.
              </p>
              <p>
                <strong>Practical consequence:</strong> if you are using this site to argue about funding allocations,
                development approvals, or anything where the city&rsquo;s administrative boundary matters, verify the
                specific block against the Community Council map before citing a figure.
              </p>
            </>
          }
        />

        <Caveat
          title="Census tract → neighborhood mapping uses the nearest centroid."
          severity="info"
          body={
            <p>
              Census tracts do not align cleanly with SNAs. Where a tract straddles two neighborhoods, we assign it
              to whichever SNA centroid is closer. A proper point-in-polygon spatial join would require a server-side
              pipeline we haven&rsquo;t built yet. For most neighborhoods the effect is small, but interior-vs-boundary
              tracts can shift. Credits: this approximation affects Census, HMDA, and any ACS-derived number.
            </p>
          }
        />

        <Caveat
          title="Centroids are geographic, not population-weighted."
          severity="info"
          body={
            <p>
              When we compute &ldquo;nearest centroid&rdquo; or use a neighborhood as a map anchor, we use the geographic
              centroid of the boundary polygon. A population-weighted or employment-weighted centroid would place
              some neighborhoods differently (e.g. shifting toward the residential core rather than the industrial
              edge of a neighborhood like Queensgate). This is a known approximation.
            </p>
          }
        />

        <Caveat
          title="Contested / shared areas need &lsquo;contains&rsquo; logic, not exact match."
          severity="warn"
          body={
            <p>
              Some blocks are claimed by more than one Community Council. Any future lookup that maps
              address &rarr; Community Council correctly will need a spatial <code>contains</code> test, not a
              string equality check. We&rsquo;ve deferred this work; it&rsquo;s documented here so it doesn&rsquo;t get forgotten.
            </p>
          }
        />
      </Section>

      {/* ─── Section 2: Data vintages ──────────────────────────────────────── */}
      <Section
        id="vintages"
        Icon={DatabaseIcon}
        iconBg="bg-emerald-100 text-emerald-700"
        heading="How current is each dataset?"
        subheading="Not every number on this site is live. Here&rsquo;s what&rsquo;s fresh, what&rsquo;s a snapshot, and when each was captured."
      >
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Source</th>
                <th className="text-left px-3 py-2 font-semibold">Used in</th>
                <th className="text-left px-3 py-2 font-semibold">Vintage</th>
                <th className="text-left px-3 py-2 font-semibold">Refresh</th>
                <th className="text-left px-3 py-2 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {VINTAGE_ROWS.map((r) => (
                <tr key={r.source} className="text-gray-700">
                  <td className="px-3 py-2 font-medium text-gray-900 align-top">{r.source}</td>
                  <td className="px-3 py-2 align-top text-xs text-gray-600">{r.usedIn}</td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">{r.vintage}</td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">{r.refresh}</td>
                  <td className="px-3 py-2 align-top text-xs text-gray-500">{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ─── Section 3: Known data gaps ─────────────────────────────────────── */}
      <Section
        id="gaps"
        Icon={DatabaseIcon}
        iconBg="bg-red-100 text-red-700"
        heading="Known data gaps"
        subheading="Things we can&rsquo;t currently show &mdash; and why."
      >
        <Caveat
          title="EJScreen (EPA environmental justice) has been offline since February 2025."
          severity="gap"
          body={
            <p>
              The live EPA EJScreen API was decommissioned. We use a static 2019 snapshot for the EJ dimension in
              Neighborhood Explorer. It is labeled as such in the UI but you should treat it as historical, not current.
            </p>
          }
        />

        <Caveat
          title="Community Perceptions Survey is city-wide only."
          severity="gap"
          body={
            <p>
              The city&rsquo;s resident perceptions survey dataset (<code>gdf4-fqik</code>) has no neighborhood field. We
              show the city-wide average with a clear disclaimer. We cannot break it down by neighborhood with the
              current data release.
            </p>
          }
        />

        <Caveat
          title="OHGO traffic only covers Ohio-managed roads."
          severity="gap"
          body={
            <p>
              Live traffic on this site comes from the Ohio Department of Transportation. It covers interstates and
              state routes &mdash; not Cincinnati city streets. If a city-street incident isn&rsquo;t showing up, that&rsquo;s
              coverage, not an error.
            </p>
          }
        />

        <Caveat
          title="SORTA routes per stop are not available."
          severity="gap"
          body={
            <p>
              The public SORTA GTFS export does not include route assignments per stop. Transit proximity scoring uses
              the number of stops within walking distance, not the number of distinct routes serving those stops.
            </p>
          }
        />

        <Caveat
          title="No tract-level eviction data."
          severity="gap"
          body={
            <p>
              Hamilton County eviction filings are available via Eviction Lab in aggregate, but tract-level eviction
              data requires a partner (e.g. Legal Aid Society). We have chosen not to build this feature on aggregates
              alone &mdash; it would hide the neighborhoods where displacement is concentrated.
            </p>
          }
        />

        <Caveat
          title="No property-level flood probability."
          severity="gap"
          body={
            <p>
              First Street Foundation&rsquo;s property-level 30-year flood probability is behind a paid API. We show FEMA
              flood zones (regulatory, current) but not individual-property climate-adjusted probability.
            </p>
          }
        />

        <Caveat
          title="Address-level crime is intentionally approximated."
          severity="info"
          body={
            <p>
              The city&rsquo;s crime dataset replaces the last two digits of addresses and skews coordinates within a
              block for resident privacy. A specific address on this site can never be pinpointed to a specific unit.
            </p>
          }
        />
      </Section>

      {/* ─── Section 4: Political structure ─────────────────────────────────── */}
      <Section
        id="politics"
        Icon={GovIcon}
        iconBg="bg-purple-100 text-purple-700"
        heading="Cincinnati&rsquo;s political structure &amp; City Council"
        subheading="Accountability features have to account for how Cincinnati is actually governed."
      >
        <Caveat
          title="Cincinnati City Council has no geographic districts."
          severity="info"
          body={
            <p>
              All 9 council members are elected citywide (&ldquo;at-large&rdquo;). There is no &ldquo;my council member&rdquo; based
              on address. Every resident has the same 9 representatives. Contact info and direct links to their city
              pages are below.
            </p>
          }
        />

        <div className="mb-6">
          <CouncilPanel />
        </div>
      </Section>

      {/* ─── Section 5: AI-generated content ────────────────────────────────── */}
      <Section
        id="ai"
        Icon={BotIcon}
        iconBg="bg-indigo-100 text-indigo-700"
        heading="Where AI is used on this site"
        subheading="We use a language model for a narrow set of summaries and Q&amp;A. Raw data is always shown."
      >
        <Caveat
          title="Plain-English summaries (Address Lookup) and Q&A (Police Accountability) use MiniMax M2.5 via OpenRouter."
          severity="warn"
          body={
            <>
              <p className="mb-2">
                The model is prompted to be factual and non-alarmist. Outputs have not been formally audited for
                framing or bias. Raw data is always displayed alongside summaries so you can verify what the model said.
              </p>
              <p>
                If an AI summary contradicts the raw numbers, trust the raw numbers and please report the discrepancy.
                We track this as an open question (<code>TODO(reassess-ai-summary)</code>) and re-evaluating the prompt,
                the disclosure framing, and whether to keep AI summaries at all is on the roadmap.
              </p>
            </>
          }
        />

        <Caveat
          title="No AI is used for scoring, ranking, or classification."
          severity="info"
          body={
            <p>
              Neighborhood Explorer scores, HMDA approval-rate disparities, HUD subsidy counts, lead service-line risk
              ratings &mdash; none of these involve an AI model. They are deterministic calculations from the underlying
              data. The methodology for each is documented in-app (hover the methodology tooltip on each dimension).
            </p>
          }
        />
      </Section>

      {/* ─── Section 6: Tax modeling ────────────────────────────────────────── */}
      <Section
        id="tax-model"
        Icon={ScaleIcon}
        iconBg="bg-amber-100 text-amber-700"
        heading="Tax burden modeling"
        subheading="The Tax &amp; Revenue tab reports effective tax rates by income percentile. Here&rsquo;s what&rsquo;s measured vs. modeled."
      >
        <Caveat
          title="Cincinnati&rsquo;s local income tax rate is a measured fact."
          severity="info"
          body={
            <p>
              Cincinnati charges a flat municipal income tax. Current rate: 1.8% (effective October 2020).
              Previous rate: 2.1%. Because it is flat, the <em>nominal</em> local income-tax rate is the same
              at every income level. The rate schedule is sourced directly from the city&rsquo;s Finance Department.
            </p>
          }
        />

        <Caveat
          title="City revenue totals are measured."
          severity="info"
          body={
            <p>
              Totals of what Cincinnati collects by revenue type (income tax, property tax, fees, etc.) come from
              the city&rsquo;s open revenue dataset (<code>a9hy-bv25</code>), FY 2014&ndash;present. This shows
              how much the city takes in, not the distribution across taxpayers.
            </p>
          }
        />

        <Caveat
          title="Income percentile thresholds are measured from ACS."
          severity="info"
          body={
            <p>
              The dollar values that mark the 20th / 40th / 60th / 80th / 95th percentiles of Cincinnati household
              income come from the U.S. Census ACS (table B19080) for Cincinnati as a place. These are survey-based
              estimates with margins of error, but they are direct measurements.
            </p>
          }
        />

        <Caveat
          title="Effective STATE + LOCAL tax rate by income quintile is MODELED."
          severity="warn"
          body={
            <>
              <p className="mb-2">
                We apply the Institute on Taxation &amp; Economic Policy&rsquo;s (ITEP) &ldquo;Who Pays? 7th Edition&rdquo;
                (October 2024) Ohio state-and-local incidence analysis to Cincinnati&rsquo;s percentile thresholds. ITEP
                models how sales, property, and income taxes fall across income quintiles &mdash; accounting for the
                fact that higher earners spend a smaller share of income on sales-taxable goods, etc.
              </p>
              <p className="mb-2">
                <strong>What this means:</strong> we are taking Ohio&rsquo;s statewide incidence profile and applying it
                to Cincinnati&rsquo;s income distribution. Cincinnati is <em>not</em> identical to Ohio &mdash; city
                taxpayers face different mix of property, sales, and local income taxes &mdash; so the numbers should
                be read as a reasonable estimate, not a measurement of what a specific Cincinnati household pays.
              </p>
              <p>
                We surface these numbers because the alternative is to show only the flat local rate, which would
                make the tax system look less regressive than it actually is. If you need defensible, citation-ready
                numbers, cite the ITEP source directly, not this site.
              </p>
            </>
          }
        />

        <Caveat
          title="The 99th and 99.9th percentiles of Cincinnati income are not publicly resolvable."
          severity="gap"
          body={
            <p>
              ACS summary tables top out at the 95th percentile. IRS Statistics of Income data by ZIP code has
              coarse income bins at the top (&ldquo;$200k+&rdquo;) and suppresses low-count cells for privacy. We show
              up to the top 5% threshold and note that the extreme top tail cannot be pinpointed from public data
              without microdata access.
            </p>
          }
        />
      </Section>

      {/* ─── Section 7: Language ────────────────────────────────────────────── */}
      <Section
        id="i18n"
        Icon={GlobeIcon}
        iconBg="bg-teal-100 text-teal-700"
        heading="Language"
      >
        <Caveat
          title="Spanish translations are machine-generated and awaiting native-speaker review."
          severity="warn"
          body={
            <p>
              Every user-facing string in <code>src/i18n/es.json</code> was produced by a machine translator. A
              volunteer native-speaker review is pending. If you notice translation errors, please open a GitHub
              issue or submit a pull request &mdash; line-level edits are welcome.
            </p>
          }
        />
      </Section>

      {/* ─── Section 8: Report / contribute ─────────────────────────────────── */}
      <Section
        id="contribute"
        Icon={DatabaseIcon}
        iconBg="bg-gray-100 text-gray-700"
        heading="Report an issue or contribute"
      >
        <div className="bg-gray-900 text-white rounded-xl p-5">
          <p className="text-sm leading-relaxed mb-1">
            Found a number that looks wrong? A caveat we missed? A dataset we should add?
          </p>
          <p className="text-gray-400 text-xs leading-relaxed mb-5">
            For data disputes, include the address or neighborhood, the exact number on the site, and the source
            you&rsquo;re comparing against &mdash; it makes diagnosis much faster. For data partnerships or feature
            suggestions, email works best.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <a
              href="mailto:chanfriendly@gmail.com?subject=Cincinnati%20Civic%20Data%20—%20Feedback"
              className="inline-flex items-center gap-2 bg-white text-gray-900 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Send an email
            </a>
            <a
              href="https://github.com/chanfriendly/cincinnati-civic-data/issues"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white/10 text-white border border-white/20 px-4 py-2 rounded-lg font-medium hover:bg-white/20 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.92.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              Open a GitHub issue
            </a>
            <a
              href="https://github.com/chanfriendly/cincinnati-civic-data"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white/10 text-white border border-white/20 px-4 py-2 rounded-lg font-medium hover:bg-white/20 transition-colors"
            >
              View source
            </a>
          </div>
        </div>
      </Section>

      {/* Last updated footer */}
      <p className="text-xs text-gray-500 mt-4 mb-8">
        This page is hand-maintained. Last reviewed: April 2026.
      </p>
    </div>
  )
}

export default Limitations
