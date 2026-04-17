import React from 'react'
import { useLanguage } from '../../context/LanguageContext'

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

const LeafIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M5 3s5.5 0 9 3.5S17 14 17 14M5 3c0 0 0 10 7 14M5 3L3 21" />
  </svg>
)

const ScaleIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 6l9-3 9 3M3 6v12l9 3 9-3V6M12 3v18" />
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
        description: 'A deeper "Who Owns Cincinnati" tool connecting shell companies and LLCs across the CAGIS parcel database — linking parcel ownership with Ohio Secretary of State corporate records to map full portfolio networks. The Owner / Developer Search in Housing Justice provides a permit-level starting point using open data.',
        why: 'The Owner / Developer Search shows permit applicants and CRA recipients, but CAGIS parcel ownership data would allow tracking across the full property portfolio — including properties with no active permits. That deeper linkage requires a partnership.',
        dataSource: 'CAGIS Parcel Data (owner name field) + Ohio Secretary of State LLC Registry',
        dataSourceUrl: 'https://businesssearch.ohiosos.gov/',
        relatedOrgs: ['Housing Opportunities Made Equal (HOME Cincy)', 'COHHIO'],
      },
      {
        title: 'Tax Abatement Accountability Dashboard',
        status: 'completed',
        description: 'Cross-reference properties receiving city tax abatements with their blight violation and inspection history. Now live with address-level cross-referencing in Housing Justice, plus a city-wide CRA developer leaderboard showing top recipients of commercial subsidies by total dollar value.',
        why: 'Cincinnati grants millions in property tax abatements to developers. Residents in abatement zones should be able to see whether those subsidies improved conditions or accelerated displacement. All needed data is already in our system.',
        dataSource: 'Cincinnati Open Data: Tax Abatements (tkp7-yf64), Commercial CRA Abatements (m76i-p5p9) x PLAP Blight Violations',
        tab: 'Housing Justice',
      },
      {
        title: 'Owner / Developer Activity Tracker',
        status: 'completed',
        description: 'Start with an address to see its enforcement record and who filed permits there — then follow that name to their full portfolio city-wide. Surfaces displacement signals (unit removals, subsidies-while-removing), violation history, and contextual housing orgs.',
        why: 'Large landlords and developers frequently hold properties under multiple LLC names, making their full portfolio and violation history invisible. Searching permit applicant names surfaces those patterns using open data.',
        dataSource: 'Cincinnati Open Data: Housing Unit Activity (xedz-tk7q), Commercial CRA Abatements (m76i-p5p9)',
        tab: 'Housing Justice',
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
        status: 'completed',
        description: 'Live construction zones, road closures, and traffic incidents from ODOT\'s OHGO API, shown near any address. Now live in Address Lookup. Note: covers Ohio-managed roads (interstates, state routes) only — not Cincinnati city streets.',
        why: 'Construction activity is a leading indicator of neighborhood investment (or displacement). Real-time incident data is useful for residents and emergency planning.',
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
        title: 'BRT Construction Impact Tracker',
        status: 'planned',
        description: 'Track the rollout of Cincinnati\'s first Bus Rapid Transit lines on Hamilton Avenue and Reading Road — showing construction zones, new stop locations, projected service frequency, and which neighborhoods gain or lose access during the build period.',
        why: 'SORTA\'s Reinventing Metro BRT build (approved 2024, construction starting 2025) is the biggest transit investment in Cincinnati in decades. Neighborhoods along the corridors will experience both construction disruption and long-term access gains. Residents deserve a clear view of both.',
        dataSource: 'SORTA GTFS feed + SORTA Reinventing Metro project updates (go-metro.com/reinventing-metro)',
        dataSourceUrl: 'https://www.go-metro.com/reinventing-metro',
        tab: 'Address Lookup',
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
        status: 'completed',
        description: 'Cumulative air toxics cancer risk by neighborhood, scored as a dimension in the Neighborhood Explorer. Based on EPA AirToxScreen 2019 — the most recent publicly available modeled estimate. EPA\'s EJScreen tool, which provided updated multi-indicator environmental justice screening, was taken offline in February 2025.',
        why: 'Environmental burden in Cincinnati is concentrated in lower-income and Black communities along the river corridor. The Mill Creek industrial corridor (Lower Price Hill, West End, Camp Washington) shows the highest cumulative air toxics risk. Making this visible at the neighborhood level enables advocacy and planning.',
        dataSource: 'EPA AirToxScreen 2019 via ArcGIS feature service',
        dataSourceUrl: 'https://www.epa.gov/AirToxScreen',
        tab: 'Neighborhood Explorer',
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
    id: 'environment',
    heading: 'Environmental Health & Lead Safety',
    subheading: 'Cincinnati\'s industrial legacy and aging infrastructure create public health risks that are not evenly distributed — and are barely visible in public data.',
    Icon: LeafIcon,
    iconBg: 'bg-emerald-100 text-emerald-700',
    items: [
      {
        title: 'Lead Service Line Replacement Tracker',
        status: 'completed',
        description: 'Neighborhood-by-neighborhood breakdown of GCWW\'s lead service line replacement program — active lead lines, replaced lines, and risk concentration by area. Includes city-wide urgency framing (33,449 lines remaining, 220 child cases/year) and resident action guidance.',
        why: 'As of 2025, 33,449 lead or unknown service lines remain in Cincinnati — 64% of the original inventory. The city\'s 2024 Lead Annual Report recorded an average of 220 child blood lead cases per year (2015–2024), yet only 36.8% of Cincinnati children are tested annually. Hamilton County ranks 54th of Ohio\'s 88 counties for lead-poisoned children. This data exists and is published by the Cincinnati Health Department — no civic-facing map yet exists.',
        dataSource: 'GCWW Lead Service Line Replacement Program (b4xq-u3su)',
        dataSourceUrl: 'https://data.cincinnati-oh.gov/dataset/GCWW-Private-Side-One-off-Lead-Service-Line-Replac/b4xq-u3su',
        relatedOrgs: ['Cincinnati Health Department', 'Cincinnati Children\'s Hospital', 'Groundwork Ohio River Valley'],
        tab: 'Lead Safety',
      },
      {
        title: 'Environmental Justice Cumulative Impact Map',
        status: 'in-progress',
        description: 'A neighborhood-level overlay combining air toxics exposure, Superfund/brownfield proximity, flood risk, lead burden, and proximity to industrial facilities — the same approach used by CalEnviroScreen in California. Air toxics scoring is live in the Neighborhood Explorer; additional layers (Superfund proximity, TRI facility data, brownfields) are planned.',
        why: 'Environmental burden in Cincinnati is concentrated in lower-income and Black communities along the river corridor and in neighborhoods like Lower Price Hill, Carthage, and Norwood. EPA\'s EJScreen tool, which previously provided updated cumulative burden scores, was taken offline in February 2025 — making a local, maintained alternative more important.',
        dataSource: 'EPA AirToxScreen 2019 (live) · EPA TRI · EPA Brownfields · FEMA NFHL (planned)',
        dataSourceUrl: 'https://www.epa.gov/AirToxScreen',
        relatedOrgs: ['Groundwork Ohio River Valley', 'EPA Region 5', 'Cincinnati Port Authority'],
      },
      {
        title: 'Industrial Site Remediation Progress',
        status: 'seeking-data',
        description: 'Track the cleanup status of contaminated industrial sites across Cincinnati — Phase I assessments completed, remediation in progress, and sites cleared for reuse.',
        why: 'The City completed nearly 40 Phase I environmental site assessments under the 2023 Green Cincinnati Plan. Cincinnati Port holds $16M in state cleanup grants. But no single public dashboard shows where these sites are, what stage they\'re in, or what\'s planned for them. Neighbors in affected communities have no way to track remediation.',
        dataSource: 'EPA Brownfields database (partial) + City of Cincinnati Green Cincinnati Plan implementation data (not yet public)',
        relatedOrgs: ['Cincinnati Port Authority', 'Groundwork Ohio River Valley', 'Ohio EPA'],
      },
      {
        title: 'Flood Risk Infrastructure Status',
        status: 'planned',
        description: 'An interactive view of Cincinnati\'s aging flood protection infrastructure — the Mill Creek Barrier Dam, 14 floodgates, and 1.5-mile floodwall — overlaid with updated FEMA flood zone boundaries and First Street Foundation flood risk scores.',
        why: 'The Ohio River reached 60 feet at Cincinnati on April 7, 2025 — the highest in seven years. The flood protection infrastructure was built in 1948 and is nearly 90 years old. Flooding that historically occurred every 20 years now occurs every 5–10. Yet our current flood data only shows FEMA flood zones — not the condition of the infrastructure protecting neighborhoods from them.',
        dataSource: 'FEMA NFHL (already in system) + First Street Foundation flood risk API + City stormwater management data',
        dataSourceUrl: 'https://www.cincinnati-oh.gov/stormwater/flood-management/',
        tab: 'Address Lookup',
      },
    ],
  },
  {
    id: 'equity',
    heading: 'Racial Equity & Economic Mobility',
    subheading: 'Cincinnati\'s racial wealth gap is not historical background — it is the current operating reality. The data to make it visible is public.',
    Icon: ScaleIcon,
    iconBg: 'bg-rose-100 text-rose-700',
    items: [
      {
        title: 'Racial Equity Dashboard',
        status: 'planned',
        description: 'A neighborhood-level dashboard showing income, homeownership rates, mortgage approval rates, poverty, and incarceration by race — drawing on Census ACS data and local reporting. Updated annually as new ACS data is released.',
        why: 'The Urban League\'s "State of Black Cincinnati" report (June 2024) documents stark disparities: 35.6% of Black residents in poverty vs. 16.5% of white; median household income $31,520 vs. $70,909; mortgage approval 17.5% vs. 67%. These gaps are not abstract statistics — they shape which neighborhoods are reinvested in and which aren\'t. Making them visible at the neighborhood level enables accountability.',
        dataSource: 'U.S. Census ACS (already in our system) + Urban League State of Black Cincinnati report',
        dataSourceUrl: 'https://www.ulgso.org/blackcincinnati',
        relatedOrgs: ['Urban League of Greater Southwestern Ohio', 'All-In Cincinnati', 'Cincinnati NAACP'],
      },
      {
        title: 'Connected Communities Zoning Reform Impact Tracker',
        status: 'planned',
        description: 'Track the impact of Cincinnati\'s Connected Communities zoning reform (adopted June 5, 2024; effective July 1, 2024) — which removed minimum lot sizes and parking mandates for most of the city — by monitoring new permit applications, housing unit additions, and rent changes in formerly restricted zones.',
        why: 'Connected Communities is the biggest zoning change in Cincinnati in decades, explicitly designed to increase housing supply. Whether it produces affordable units or just market-rate infill is an open empirical question that will determine its equity impact. The permit and zoning data to answer it is already in our system.',
        dataSource: 'Cincinnati Open Data: Building Permits (uhjb-xac9) + Tax Abatements (tkp7-yf64) + CAGIS Zoning Layer',
        tab: 'Neighborhood Explorer',
      },
      {
        title: 'Mortgage Lending & Homeownership Gap Map',
        status: 'needs-partner',
        description: 'A map of mortgage application approval rates by race and neighborhood — showing where lending disparities concentrate and how they have changed over time.',
        why: 'Mortgage approval rates for Black borrowers in Cincinnati were 17.5% in 2020 vs. 67% for white borrowers. This lending gap directly shapes homeownership rates, wealth accumulation, and neighborhood stability. HMDA (Home Mortgage Disclosure Act) data is public at the federal level, but requires cleaning and geographic matching.',
        dataSource: 'HMDA data (Consumer Financial Protection Bureau, public)',
        dataSourceUrl: 'https://www.consumerfinance.gov/data-research/hmda/',
        relatedOrgs: ['Housing Opportunities Made Equal (HOME Cincy)', 'Federal Home Loan Bank of Cincinnati', 'Urban League'],
      },
      {
        title: 'School Funding Equity Tracker',
        status: 'seeking-data',
        description: 'Per-pupil spending by CPS school, overlaid with neighborhood poverty rates, school performance indicators, and the impact of state funding formula changes on individual schools.',
        why: 'Cincinnati Public Schools is facing a >$50M budget gap (2025–2026) after Ohio changed its funding formula. CPS receives only $0.36 per dollar per student under the new formula. Since CPS is majority Black and lower-income, these cuts are a racial equity issue. The data to make this visible exists in state education records but is not machine-readable.',
        dataSource: 'Ohio Department of Education ESSA Report Cards + CPS budget documents',
        dataSourceUrl: 'https://reportcard.education.ohio.gov/',
        relatedOrgs: ['Cincinnati Public Schools', 'Strive Partnership', 'United Way of Greater Cincinnati'],
      },
    ],
  },
  {
    id: 'accountability',
    heading: 'Accountability & Civic Action',
    subheading: 'Connecting the data this platform surfaces to the decisions that created it — and the civic actions that can change it.',
    Icon: ScaleIcon,
    iconBg: 'bg-amber-100 text-amber-700',
    items: [
      {
        title: 'City Council Voting Records',
        status: 'seeking-data',
        description: 'Show how each of Cincinnati\'s 9 council members voted on legislation relevant to housing, policing, infrastructure, and environmental health — linked directly to the data this platform already surfaces.',
        why: 'Residents can see that affordable housing is declining in their neighborhood, but have no easy way to trace that back to the budget votes and zoning decisions that drove it. Connecting outcomes to votes is what turns a data dashboard into an accountability tool.',
        dataSource: 'Cincinnati City Council uses Legistar (cincinnatioh.legistar.com) for all legislation and votes. The data is public through the web interface but the API requires credentials the city has not made publicly available. This is a simple configuration change — any council member can ask City IT to enable it.',
        dataSourceUrl: 'https://cincinnatioh.legistar.com/Calendar.aspx',
        relatedOrgs: ['Cincinnati City Council', 'Clerk of Council (513-352-3246)'],
      },
      {
        title: 'Public Comment & Civic Engagement Windows',
        status: 'planned',
        description: 'Surface upcoming opportunities to engage: city council meeting agendas, public comment periods on zoning changes, CDBG allocation hearings, Cincinnati Planning Commission hearings, and MSD public notices — matched to the neighborhoods and issues you\'re looking at.',
        why: 'Civic systems have openings, but residents rarely know when they\'re open. A resident who sees lead service line data on their block should be one click from knowing the next Cincinnati Water Works board meeting where that can be raised. That connection doesn\'t exist anywhere today.',
        dataSource: 'Cincinnati City Council meeting calendar, Cincinnati Planning Commission notices, MSD public notices, Hamilton County Board of Elections filing deadlines',
        dataSourceUrl: 'https://cincinnatioh.legistar.com/Calendar.aspx',
      },
      {
        title: 'Tax & Revenue Transparency',
        status: 'completed',
        description: 'A dedicated Tax & Revenue tab covering Cincinnati\'s municipal income tax rate history, household income percentiles over 2012–2023 (ACS 5-Year Table B19080), a modeled view of effective state+local tax burden by income group (ITEP Who Pays? 7th ed.), and the composition of the City\'s general fund revenue by source. Every chart is labeled Measured (primary-source) or Modeled (applied from statewide Ohio data) so advocates can cite with confidence.',
        why: 'Residents can see the rate on their paycheck, but cannot see how it compares across income levels, how it has changed, or where city revenue actually comes from. Cincinnati\'s state+local tax system is regressive by ITEP\'s modeling — the lowest-income 20% pay roughly twice the share the top 1% pay — but that framing had nowhere to live on the site. This tab makes the fiscal system legible without overstating what a statewide incidence model can say about a specific Cincinnati household.',
        dataSource: 'City of Cincinnati Finance Dept (rate history), U.S. Census ACS 5-Year Table B19080 (income percentiles), ITEP Who Pays? 7th edition (Ohio incidence), Cincinnati Open Data a9hy-bv25 (general fund revenue)',
        dataSourceUrl: 'https://www.cincinnati-oh.gov/finance/income-taxes/',
        tab: 'Tax & Revenue',
      },
      {
        title: 'City Spending Tracker (companion to Revenue)',
        status: 'planned',
        description: 'The expenditure-side companion to the Tax & Revenue tab: show how much the city is spending per neighborhood on core services — code enforcement, parks maintenance, street repair, community centers — and whether spending patterns correlate with neighborhood conditions as measured by this platform.',
        why: 'The City of Cincinnati publishes an annual budget and a Capital Improvements Program, but neither is easily searchable by neighborhood. Understanding whether a neighborhood\'s deteriorating conditions reflect reduced city investment — or whether investment is happening and not working — is a fundamentally different policy question. The revenue view exists; the spending view doesn\'t yet.',
        dataSource: 'City of Cincinnati Annual Budget documents (published on cin.cincinnati-oh.gov). Machine-readable format varies by year.',
        dataSourceUrl: 'https://www.cincinnati-oh.gov/finance/budget-financial-reporting/',
      },
      {
        title: 'Limitations & Methodology Page',
        status: 'completed',
        description: 'A dedicated public methodology page documenting what this site\'s data can and can\'t do — neighborhood boundary ambiguity (Statistical Neighborhood Approximations vs. Community Council Boundaries), census-tract-to-neighborhood mapping via nearest centroid, data vintages, the Legistar API blockage, AI-generated content disclosures, tax modeling caveats, and language translation limits. One citable URL for advocates, journalists, and residents who want to know the fine print before acting on a chart.',
        why: 'Caveats buried in per-tab tooltips don\'t get cited. A single page that advocates can link to — and that encourages corrections via GitHub issues — is more load-bearing than a footer disclaimer. It also makes the boundary-definition problem (SNA vs. Community Council, with Oakley as the worked example) visible to residents who encounter it in lived experience but have never seen it named.',
        tab: 'Limitations',
      },
      {
        title: 'Civic Organizations Directory',
        status: 'completed',
        description: 'A curated directory of 19 Cincinnati organizations working on housing, policing, environmental justice, food access, and civic engagement — surfaced contextually alongside relevant data. Appears in Neighborhood Profiles and alongside the City Council panel. When you\'re looking at eviction data, you see Legal Aid. When you\'re looking at council contacts, you see civic engagement organizations.',
        why: 'Awareness without a path to action is frustrating. Most residents don\'t know which organizations to contact about a given issue, and most organizations don\'t have easy ways for residents to find them. This closes that gap.',
        relatedOrgs: ['Legal Aid Society of Greater Cincinnati', 'Housing Opportunities Made Equal (HOME Cincy)', 'NAACP Cincinnati', 'Cincinnati Fair Housing', 'Price Hill Will', 'Over-the-Rhine Community Housing', 'Freestore Foodbank', 'LISC Cincinnati'],
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
      <div className="mt-3">
        <p className="text-xs text-gray-400 mb-1">Organizations you may be interested in supporting:</p>
        <div className="flex flex-wrap gap-1">
          {item.relatedOrgs.map(org => (
            <span key={org} className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
              {org}
            </span>
          ))}
        </div>
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

const Roadmap: React.FC = () => {
  const { language } = useLanguage()

  return (
  <div className="max-w-5xl mx-auto">

    {/* Spanish AI-translation disclaimer — shown only when language is ES */}
    {language === 'es' && (
      <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <span className="text-amber-500 text-lg shrink-0 mt-0.5">⚠️</span>
        <div>
          <p className="text-sm font-semibold text-amber-800 mb-1">Nota sobre la traducción al español</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Las traducciones al español en este sitio fueron generadas por inteligencia artificial y aún
            no han sido revisadas por un hablante nativo. Es posible que haya errores de redacción o
            terminología. Si deseas colaborar como revisor voluntario o tienes comentarios sobre la
            traducción, por favor escríbenos — tu aportación es muy bienvenida.
          </p>
        </div>
      </div>
    )}

    {/* Page header */}
    <div className="mb-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Future Work &amp; Data Roadmap</h1>
      <p className="text-gray-600 max-w-3xl leading-relaxed">
        This platform is built for community activists, tenants, journalists, and anyone who
        needs public data to make Cincinnati more equitable. Below is a transparent view of
        what we&apos;re building, what data gaps exist, and where we need partners to unlock
        the next layer of insight.
      </p>
    </div>

    {/* Why this exists */}
    <div className="mb-8 bg-[#1A4A6B] text-white rounded-xl p-6">
      <h2 className="text-base font-bold mb-3 text-white">Why we built this</h2>
      <p className="text-blue-100 text-sm leading-relaxed mb-4">
        Cincinnati&apos;s public data is largely open — but it&apos;s scattered across dozens of portals,
        in formats that require technical expertise to use. That means the people with the most at
        stake in civic decisions — tenants, parents, community organizers — are the least likely to
        access it. We exist to close that gap.
      </p>
      <p className="text-blue-100 text-sm leading-relaxed mb-5">
        Every number on this platform represents a real tradeoff: zoning reform vs. displacement risk.
        Transit investment vs. who actually benefits. Police accountability vs. community trust. Flood
        protection vs. riverfront development. We try to make those tradeoffs legible, not obscure them.
      </p>
      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { stat: '13,601', label: 'eviction filings in Hamilton County, 2024 — 9% of all renter households' },
          { stat: '33,449', label: 'lead or unknown water service lines still active in Cincinnati as of 2025' },
          { stat: '$31,520', label: 'median household income for Black families vs. $70,909 for white families' },
          { stat: '7%', label: 'of tenants have legal representation in housing court — vs. 93% of landlords' },
        ].map(({ stat, label }) => (
          <div key={stat} className="bg-white/10 rounded-lg p-3">
            <div className="text-xl font-bold text-white">{stat}</div>
            <div className="text-xs text-blue-200 leading-tight mt-1">{label}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Guiding principles */}
    <div className="mb-8 bg-gray-50 border border-gray-200 rounded-xl p-5">
      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">How we decide what to build</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          {
            title: 'Fill civic gaps, not dashboard gaps',
            body: 'We build what residents actually need — even when it\'s harder. If no civic-facing lead service line map exists in Cincinnati, we build one.',
          },
          {
            title: 'Show the tradeoffs',
            body: 'Gentrification, transit, policing, flood risk — each involves real winners and losers. Our job is to make that visible, not to paper it over.',
          },
          {
            title: 'Race and place together',
            body: 'Every metric should be examinable by race and by neighborhood. Data that\'s only citywide can hide inequity.',
          },
          {
            title: 'Accuracy over completeness',
            body: 'A broken tab is worse than a missing one. We label gaps as gaps, and we don\'t ship data we haven\'t verified.',
          },
        ].map(({ title, body }) => (
          <div key={title} className="flex gap-3">
            <div className="w-1.5 rounded-full bg-[#1A4A6B] flex-shrink-0 mt-1" style={{ height: 'auto', minHeight: '1.5rem' }} />
            <div>
              <p className="text-sm font-semibold text-gray-800">{title}</p>
              <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{body}</p>
            </div>
          </div>
        ))}
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

    {/* What we won't build */}
    <div className="mb-10 border border-gray-200 rounded-xl p-5 bg-white">
      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-1">What we won&apos;t build</h2>
      <p className="text-xs text-gray-500 mb-4">
        Clarity about our limits is part of being trustworthy. These are explicit commitments, not omissions.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          {
            title: 'No real-time crime heat maps',
            body: 'Individual incident maps without context amplify fear without accountability. We show aggregate trends and patterns — not a live crime ticker.',
          },
          {
            title: 'No predictive policing inputs',
            body: 'We don\'t publish algorithmic risk scores for individuals, addresses, or neighborhoods. Those systems have a documented history of encoding racial bias.',
          },
          {
            title: 'No surveillance infrastructure',
            body: 'No integration with traffic cameras, license plate readers, or facial recognition systems — regardless of who operates them.',
          },
          {
            title: 'No scraped personal data',
            body: 'We use public government datasets. We don\'t scrape social media, purchase data broker records, or aggregate information about private individuals.',
          },
        ].map(({ title, body }) => (
          <div key={title} className="flex gap-3 bg-gray-50 rounded-lg p-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-700">{title}</p>
              <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Footer CTA */}
    <div className="border-t border-gray-200 pt-8 mb-8">
      <div className="bg-gray-900 text-white rounded-xl p-6">
        <h2 className="text-lg font-bold mb-2">Have data, skills, or community knowledge to contribute?</h2>
        <p className="text-gray-300 text-sm leading-relaxed mb-4">
          This is an open-source project. If your organization has data that would unlock any
          of the &ldquo;Seeking Data&rdquo; or &ldquo;Needs Partner&rdquo; items above, or if you want to advocate for
          a specific feature, we want to hear from you. Community input directly shapes the roadmap.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="https://data.cincinnati-oh.gov" target="_blank" rel="noopener noreferrer"
            className="bg-white text-gray-900 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors">
            Cincinnati Open Data Portal
          </a>
          <a href="https://evictionlab.org/eviction-tracking/cincinnati-oh/" target="_blank" rel="noopener noreferrer"
            className="bg-white text-gray-900 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors">
            Eviction Lab &mdash; Cincinnati
          </a>
          <a href="https://www.homecincy.org" target="_blank" rel="noopener noreferrer"
            className="bg-white text-gray-900 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors">
            HOME Cincy
          </a>
          <a href="https://www.ulgso.org/blackcincinnati" target="_blank" rel="noopener noreferrer"
            className="bg-white text-gray-900 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors">
            State of Black Cincinnati
          </a>
        </div>
      </div>
    </div>
  </div>
  )
}

export default Roadmap
