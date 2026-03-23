import React from 'react'

// ─── Status badge ─────────────────────────────────────────────────────────────

type Status = 'completed' | 'in-progress' | 'planned' | 'seeking-data' | 'needs-partner' | 'open-question'

interface StatusCfg { label: string; bg: string; text: string; dot: string }

const STATUS_CONFIG: Record<Status, StatusCfg> = {
  'completed':     { label: 'Completed',      bg: 'bg-green-50',  text: 'text-green-800',  dot: 'bg-green-500'  },
  'in-progress':   { label: 'In Progress',    bg: 'bg-amber-50',  text: 'text-amber-800',  dot: 'bg-amber-400'  },
  'planned':       { label: 'Planned',        bg: 'bg-blue-50',   text: 'text-blue-800',   dot: 'bg-blue-400'   },
  'seeking-data':  { label: 'Seeking Data',   bg: 'bg-red-50',    text: 'text-red-800',    dot: 'bg-red-400'    },
  'needs-partner': { label: 'Needs Partner',  bg: 'bg-purple-50', text: 'text-purple-800', dot: 'bg-purple-400' },
  'open-question': { label: 'Open Question',  bg: 'bg-gray-100',  text: 'text-gray-700',   dot: 'bg-gray-400'   },
}

const StatusBadge: React.FC<{ status: Status }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoadmapItem {
  title: string
  status: Status
  description: string
  why: string
  dataSource?: string
  dataSourceUrl?: string
  relatedOrgs?: string[]
  tab?: string
}

interface RoadmapSection {
  id: string
  heading: string
  subheading: string
  Icon: React.FC<{ className?: string }>
  iconBg: string
  items: RoadmapItem[]
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const HouseIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
)

const SchoolIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0112 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
  </svg>
)

const BusIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 7h8m-8 4h8m-4 4h.01M3 5a2 2 0 012-2h14a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
  </svg>
)

const ChartIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)

const GlobeIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
  </svg>
)

// ─── Section data ─────────────────────────────────────────────────────────────

const SECTIONS: RoadmapSection[] = [
  {
    id: 'housing',
    heading: 'Housing Justice & Displacement',
    subheading: 'Tools for tenants, organizers, and advocates fighting displacement in Cincinnati\'s changing neighborhoods.',
    Icon: HouseIcon,
    iconBg: 'bg-red-100 text-red-700',
    items: [
      {
        title: 'Displacement Pressure Index',
        status: 'completed',
        description: 'A neighborhood-level score combining rent burden, building permit activity, tax abatements, blight complaints, and housing unit removal permits to flag early gentrification pressure. Now live in the Housing Justice tab with a three-axis pressure scoring model (permits, abatements, unit loss) and full vulnerability/pressure quadrant analysis.',
        why: 'Cincinnati\'s eviction rate (9% in 2024) is above the national average. Avondale, Walnut Hills, and Price Hill are showing the same early-stage signals that preceded Over-the-Rhine\'s transformation. This index lets organizers identify where to focus before displacement is already underway.',
        dataSource: 'Cincinnati Open Data: Permits, Tax Abatements, PLAP, Housing Unit Activity + Census ACS rent burden',
        tab: 'Housing Justice',
        relatedOrgs: ['Over-the-Rhine Community Housing', 'Housing Opportunities Made Equal (HOME Cincy)', 'Affordable Housing Advocates'],
      },
      {
        title: 'Hamilton County Eviction Court Filings',
        status: 'seeking-data',
        description: 'Property-level mapping of eviction filings in Hamilton County, showing which landlords are filing, how often, and in which neighborhoods.',
        why: '13,601 eviction filings were made in Hamilton County in 2024 — 9% of all renter households. Only 7% of tenants have legal representation vs. 93% of landlords. Knowing which buildings and landlords are repeat filers could direct legal aid resources more effectively.',
        dataSource: 'Hamilton County Municipal Court (bulk data not publicly available). Princeton Eviction Lab tracks county-level totals.',
        dataSourceUrl: 'https://evictionlab.org/eviction-tracking/cincinnati-oh/',
        relatedOrgs: ['Legal Aid Society of Greater Cincinnati', 'Cincinnati Bar Association Pro Bono Program'],
      },
      {
        title: 'Property Ownership & LLC Network Map',
        status: 'needs-partner',
        description: 'A deeper "Who Owns Cincinnati" tool connecting shell companies and LLCs across the CAGIS parcel database — linking parcel ownership with Ohio Secretary of State corporate records to map full portfolio networks. The Owner Watch tab provides a permit-level starting point using open data.',
        why: 'The Owner Watch tab shows permit applicants and CRA recipients, but CAGIS parcel ownership data would allow tracking across the full property portfolio — including properties with no active permits. That deeper linkage requires a partnership.',
        dataSource: 'CAGIS Parcel Data (owner name field) + Ohio Secretary of State LLC Registry',
        dataSourceUrl: 'https://businesssearch.ohiosos.gov/',
        relatedOrgs: ['Housing Opportunities Made Equal (HOME Cincy)', 'COHHIO'],
      },
      {
        title: 'Tax Abatement Accountability Dashboard',
        status: 'in-progress',
        description: 'Cross-reference properties receiving city tax abatements with their blight violation and inspection history. Now live with address-level cross-referencing in Housing Justice, plus a city-wide CRA developer leaderboard showing top recipients of commercial subsidies by total dollar value.',
        why: 'Cincinnati grants millions in property tax abatements to developers. Residents in abatement zones should be able to see whether those subsidies improved conditions or accelerated displacement. All needed data is already in our system.',
        dataSource: 'Cincinnati Open Data: Tax Abatements (tkp7-yf64), Commercial CRA Abatements (m76i-p5p9) x PLAP Blight Violations',
        tab: 'Housing Justice',
      },
      {
        title: 'Owner / Developer Activity Tracker',
        status: 'in-progress',
        description: 'Search any owner name or LLC to see all their permit activity, housing unit removals, CRA subsidies, and neighborhood presence city-wide — Cincinnati\'s version of JustFix NYC\'s "Who Owns What." Now live in the Owner Watch tab.',
        why: 'Large landlords and developers frequently hold properties under multiple LLC names, making their full portfolio and violation history invisible. Searching permit applicant names surfaces those patterns using open data.',
        dataSource: 'Cincinnati Open Data: Housing Unit Activity (xedz-tk7q), Commercial CRA Abatements (m76i-p5p9)',
        tab: 'Owner Watch',
        relatedOrgs: ['Housing Opportunities Made Equal (HOME Cincy)', 'Legal Aid Society of Greater Cincinnati'],
      },
      {
        title: 'HUD Affordable Housing Unit Inventory',
        status: 'planned',
        description: 'Map of Section 8, LIHTC, and public housing units across Cincinnati neighborhoods with unit counts and subsidy expiration dates.',
        why: 'When affordable housing subsidies expire, units can convert to market rate. Knowing where and when subsidies expire lets advocates push for preservation before units are lost.',
        dataSource: 'HUD Picture of Subsidized Households (public API)',
        dataSourceUrl: 'https://www.huduser.gov/portal/datasets/assthsg.html',
      },
    ],
  },
  {
    id: 'schools',
    heading: 'School Quality & Educational Equity',
    subheading: 'Cincinnati families making housing decisions deserve school-level data alongside neighborhood profiles.',
    Icon: SchoolIcon,
    iconBg: 'bg-blue-100 text-blue-700',
    items: [
      {
        title: 'Cincinnati Public Schools Performance by Neighborhood',
        status: 'seeking-data',
        description: 'School-level performance data from the Ohio Department of Education\'s ESSA report cards, mapped to neighborhood catchment areas.',
        why: 'School quality is a primary factor in residential decisions and deeply tied to property values and displacement. Families in lower-income neighborhoods often have fewer options — making this data critical for equity analysis.',
        dataSource: 'Ohio Dept. of Education ESSA Report Cards (public but not machine-readable). CPS also publishes some data.',
        dataSourceUrl: 'https://reportcard.education.ohio.gov/',
        relatedOrgs: ['Cincinnati Public Schools', 'Strive Partnership', 'United Way of Greater Cincinnati'],
      },
      {
        title: 'School Proximity & Walk-Zone Analysis',
        status: 'planned',
        description: 'For any address, show the nearest CPS schools with walk distances and available bus service, integrated with the Address Lookup tab.',
        why: 'Walk zone eligibility affects whether families get busing, which restricts housing options for families without cars. This directly uses data already in our system.',
        dataSource: 'CPS school locations (public GeoJSON) + SORTA bus network already in our system',
        tab: 'Address Lookup',
      },
      {
        title: 'After-School Resource Desert Analysis',
        status: 'open-question',
        description: 'Mapping youth programming availability (recreation centers, library branches, after-school programs) relative to school-age population density.',
        why: 'After-school programming availability significantly affects outcomes in high-poverty neighborhoods. Cincinnati Recreation Commission locations are public data.',
        dataSource: 'Cincinnati Recreation Commission facility locations + Census school-age population',
        relatedOrgs: ['Cincinnati Recreation Commission', 'Boys & Girls Club of Greater Cincinnati'],
      },
    ],
  },
  {
    id: 'transit',
    heading: 'Transportation & Mobility Equity',
    subheading: 'Transit access shapes economic opportunity — especially for residents without cars.',
    Icon: BusIcon,
    iconBg: 'bg-green-100 text-green-700',
    items: [
      {
        title: 'OHGO Real-Time Traffic Integration',
        status: 'in-progress',
        description: 'Live construction zones, road closures, and traffic incidents from ODOT\'s OHGO API, shown near any address.',
        why: 'Construction activity is a leading indicator of neighborhood investment (or displacement). Real-time incident data is useful for residents and emergency planning. We need an API key to activate this feature.',
        dataSource: 'OHGO API (Ohio Dept. of Transportation) — requires API key',
        dataSourceUrl: 'https://www.ohgo.com/',
        tab: 'Address Lookup',
      },
      {
        title: 'Transit Equity Gap Analysis',
        status: 'planned',
        description: 'Compare SORTA bus stop density and route frequency by neighborhood against median household income — visualizing whether lower-income neighborhoods have proportionally less transit access.',
        why: 'If lower-income neighborhoods have fewer or lower-frequency routes, that concentrates car dependency costs on residents who can least afford them. This uses data already in our system.',
        dataSource: 'SORTA GTFS feed (stop locations + route frequencies) + Census ACS income data already in our system',
        tab: 'Neighborhood Explorer',
      },
      {
        title: 'Bike Infrastructure & Pedestrian Safety',
        status: 'open-question',
        description: 'Map of bike lanes, protected intersections, and pedestrian crossing infrastructure relative to injury crash data.',
        why: 'Pedestrian fatalities in Cincinnati are not evenly distributed — lower-income and majority-Black neighborhoods have higher rates. Infrastructure investment is a racial equity issue.',
        dataSource: 'Cincinnati CAGIS bike infrastructure layer + ODOT crash data',
      },
    ],
  },
  {
    id: 'civic',
    heading: 'Civic Transparency & Public Health',
    subheading: 'Connecting residents to the decisions and conditions shaping their communities.',
    Icon: ChartIcon,
    iconBg: 'bg-amber-100 text-amber-700',
    items: [
      {
        title: '311 Service Request Heat Map',
        status: 'planned',
        description: 'Where are residents reporting problems, and how long does the city take to respond? 311 request volume and resolution time by neighborhood.',
        why: 'Slow response to 311 complaints in lower-income neighborhoods is a well-documented pattern in cities nationwide. This data exists on Cincinnati\'s open data portal and would make service delivery disparities visible.',
        dataSource: 'Cincinnati Open Data: 311 Service Requests',
        dataSourceUrl: 'https://data.cincinnati-oh.gov/',
        tab: 'Neighborhood Profiles',
      },
      {
        title: 'Air Quality & Environmental Burden',
        status: 'planned',
        description: 'EPA EJScreen environmental justice scores by census tract — showing cumulative exposure to air pollution, Superfund proximity, and other environmental hazards.',
        why: 'Environmental burden in Cincinnati is concentrated in lower-income and Black communities along the river corridor. EPA makes this data publicly available via API and it directly overlaps with our flood zone analysis.',
        dataSource: 'EPA EJScreen API (public)',
        dataSourceUrl: 'https://www.epa.gov/ejscreen',
      },
      {
        title: 'Zoning Change & Variance Tracker',
        status: 'needs-partner',
        description: 'Track when properties receive zoning variances, rezoning requests, or conditional use permits — and who is requesting them.',
        why: 'Zoning changes often precede major development. Residents in affected neighborhoods rarely know a variance has been requested until construction begins. Early visibility enables community input during the public comment period.',
        dataSource: 'Cincinnati City Planning Commission meeting agendas (public, but requires parsing unstructured PDFs)',
        relatedOrgs: ['Neighborhood Business District Associations', 'Cincinnati Preservation Association'],
      },
      {
        title: 'Neighborhood Comparison Tool',
        status: 'planned',
        description: 'Side-by-side comparison of any two Cincinnati neighborhoods across all Explorer dimensions — useful for equity arguments, grant applications, and community presentations.',
        why: 'Advocates making the case for investment in a neighborhood benefit from comparing it directly to better-resourced areas using the same metrics. The data is already available.',
        tab: 'Neighborhood Explorer',
      },
    ],
  },
  {
    id: 'contribute',
    heading: 'Open Questions & Community Input',
    subheading: 'We\'re building this with community activists, not just for them. Your knowledge shapes what comes next.',
    Icon: GlobeIcon,
    iconBg: 'bg-purple-100 text-purple-700',
    items: [
      {
        title: 'What neighborhoods need priority attention?',
        status: 'open-question',
        description: 'We\'ve built tools for all 52 SNA neighborhoods, but activists know things the data doesn\'t capture. Which neighborhoods are showing early warning signs not visible in open data?',
        why: 'Community knowledge and lived experience are data sources. We want to hear from organizers on the ground.',
        relatedOrgs: ['Over-the-Rhine Community Housing', 'Avondale Community Council', 'Price Hill Will'],
      },
      {
        title: 'Are there data sources we\'re missing?',
        status: 'open-question',
        description: 'Do you work at an organization that collects relevant data — eviction filings, fair housing complaints, shelter utilization, food pantry demand? Some of the most important data never reaches open data portals.',
        why: 'Organizations like Legal Aid, HOME Cincy, and COHHIO hold data that would transform what\'s visible here. We\'re interested in privacy-preserving partnerships.',
        relatedOrgs: ['Legal Aid Society of Greater Cincinnati', 'Housing Opportunities Made Equal', 'COHHIO', 'Affordable Housing Advocates'],
      },
      {
        title: 'Translations beyond English and Spanish',
        status: 'open-question',
        description: 'Cincinnati has significant Burmese, Somali, Arabic, and Amharic-speaking communities. Are there neighborhoods where those translations would meaningfully expand access?',
        why: 'Language access is civic access. The platform already supports Spanish. Expanding to languages spoken by Cincinnati\'s refugee and immigrant communities is a priority if community partners can support the translation.',
      },
    ],
  },
]

// ─── Item card ────────────────────────────────────────────────────────────────

const ItemCard: React.FC<{ item: RoadmapItem }> = ({ item }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-sm transition-shadow">
    <div className="flex items-start justify-between gap-3 mb-3">
      <h3 className="font-semibold text-gray-900 text-sm leading-snug">{item.title}</h3>
      <StatusBadge status={item.status} />
    </div>

    <p className="text-sm text-gray-600 mb-3 leading-relaxed">{item.description}</p>

    <div className="bg-blue-50 border-l-4 border-blue-300 px-3 py-2 mb-3 rounded-r">
      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-0.5">Why it matters</p>
      <p className="text-xs text-blue-800 leading-relaxed">{item.why}</p>
    </div>

    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
      {item.dataSource && (
        <div className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          {item.dataSourceUrl
            ? <a href={item.dataSourceUrl} target="_blank" rel="noopener noreferrer"
                className="underline hover:text-blue-600">{item.dataSource}</a>
            : <span>{item.dataSource}</span>
          }
        </div>
      )}
      {item.tab && (
        <div className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span>Extends: {item.tab}</span>
        </div>
      )}
    </div>

    {item.relatedOrgs && item.relatedOrgs.length > 0 && (
      <div className="mt-3 flex flex-wrap gap-1">
        {item.relatedOrgs.map(org => (
          <span key={org} className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
            {org}
          </span>
        ))}
      </div>
    )}
  </div>
)

// ─── Legend ───────────────────────────────────────────────────────────────────

const Legend: React.FC = () => (
  <div className="flex flex-wrap gap-3">
    {(Object.entries(STATUS_CONFIG) as Array<[Status, StatusCfg]>).map(([key, cfg]) => (
      <span key={key}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
    ))}
  </div>
)

// ─── Main component ───────────────────────────────────────────────────────────

const Roadmap: React.FC = () => (
  <div className="max-w-5xl mx-auto">
    {/* Page header */}
    <div className="mb-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Future Work &amp; Data Roadmap</h1>
      <p className="text-gray-600 max-w-3xl leading-relaxed">
        This platform is built for community activists, tenants, journalists, and anyone who
        needs public data to make Cincinnati more equitable. Below is a transparent view of
        what we&apos;re building, what data gaps exist, and where we need partners to unlock
        the next layer of insight.
      </p>
      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm text-amber-800">
          <span className="font-semibold">Hamilton County context: </span>
          13,601 eviction filings in 2024 (9% of renters — above the national average). Only 7% of tenants
          have legal representation in housing court vs. 93% of landlords. Only 32 affordable units exist
          per 100 residents earning below $35,000/year. The data gaps below are not abstract —
          they have real consequences for real families.
        </p>
      </div>
    </div>

    {/* Legend */}
    <div className="mb-8">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status key</p>
      <Legend />
    </div>

    {/* Sections */}
    {SECTIONS.map(section => (
      <section key={section.id} className="mb-12">
        <div className="flex items-center gap-3 mb-2">
          <span className={`p-2 rounded-lg ${section.iconBg}`}>
            <section.Icon />
          </span>
          <h2 className="text-lg font-bold text-gray-900">{section.heading}</h2>
        </div>
        <p className="text-sm text-gray-500 mb-5 ml-11">{section.subheading}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {section.items.map(item => (
            <ItemCard key={item.title} item={item} />
          ))}
        </div>
      </section>
    ))}

    {/* Footer CTA */}
    <div className="border-t border-gray-200 pt-8 mb-8">
      <div className="bg-[#1A4A6B] text-white rounded-xl p-6">
        <h2 className="text-lg font-bold mb-2">Have data, skills, or community knowledge to contribute?</h2>
        <p className="text-blue-100 text-sm leading-relaxed mb-4">
          This is an open-source project. If your organization has data that would unlock any
          of the &ldquo;Seeking Data&rdquo; or &ldquo;Needs Partner&rdquo; items above, or if you want to advocate for
          a specific feature, we want to hear from you. Community input directly shapes the roadmap.
        </p>
        <p className="text-blue-200 text-xs font-semibold uppercase tracking-wide mb-2">
          You may be interested in these organizations
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="https://data.cincinnati-oh.gov" target="_blank" rel="noopener noreferrer"
            className="bg-white text-[#1A4A6B] px-4 py-2 rounded-lg font-medium hover:bg-blue-50 transition-colors">
            Cincinnati Open Data Portal
          </a>
          <a href="https://evictionlab.org/eviction-tracking/cincinnati-oh/" target="_blank" rel="noopener noreferrer"
            className="bg-white text-[#1A4A6B] px-4 py-2 rounded-lg font-medium hover:bg-blue-50 transition-colors">
            Eviction Lab &mdash; Cincinnati
          </a>
          <a href="https://www.homecincy.org" target="_blank" rel="noopener noreferrer"
            className="bg-white text-[#1A4A6B] px-4 py-2 rounded-lg font-medium hover:bg-blue-50 transition-colors">
            HOME Cincy
          </a>
        </div>
      </div>
    </div>
  </div>
)

export default Roadmap
