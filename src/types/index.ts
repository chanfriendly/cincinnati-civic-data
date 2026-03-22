// ─── App-level ───────────────────────────────────────────────────────────────

export type TabId = 'address' | 'neighborhood' | 'police' | 'explorer' | 'roadmap' | 'displacement' | 'owner';
export type Language = 'en' | 'es';

// ─── SODA API ────────────────────────────────────────────────────────────────

export interface SODAQueryParams {
  $where?: string;
  $select?: string;
  $limit?: number;
  $offset?: number;
  $order?: string;
  $group?: string;
  [key: string]: string | number | undefined;
}

// ─── CRIME ───────────────────────────────────────────────────────────────────

export interface CrimeIncident {
  date_reported?: string;
  datereported?: string; // STARS dataset field name
  offense: string;
  neighborhood: string;
  latitude?: string;
  longitude?: string;
}

// ─── PERMITS ─────────────────────────────────────────────────────────────────

export interface BuildingPermit {
  applieddate: string;
  permittype: string;
  address: string;
  neighborhood: string;
  worktype?: string;
  companyname?: string;
}

// ─── INSPECTIONS ─────────────────────────────────────────────────────────────

export interface Inspection {
  inspecdate: string;
  inspecresult: string;
  address: string;
  neighborhood?: string;
  inspectiontype?: string;
}

// ─── FOOD SAFETY ─────────────────────────────────────────────────────────────

export interface FoodViolation {
  inspection_date: string;
  facility_name: string;
  address: string;
  violation?: string;
  neighborhood?: string;
}

// ─── TAX ABATEMENT ───────────────────────────────────────────────────────────

export interface TaxAbatement {
  address: string;
  neighborhood: string;
  incentive_amount?: string;
  tax_abatement_type?: string;
}

// ─── PLAP ────────────────────────────────────────────────────────────────────

export interface PLAPRecord {
  date: string;
  address: string;
  neighborhood: string;
}

// ─── POLICE ──────────────────────────────────────────────────────────────────

export interface TrafficStop {
  interview_date: string; // actual API field name
  race: string;
  gender: string;
  action_taken: string;
  district: string;
}

export interface PedestrianStop {
  interview_date: string; // actual API field name
  race: string;
  gender: string;
  action_taken: string;
  district?: string;
}

export interface UseOfForce {
  date_of_incident: string;
  address: string;
  neighborhood: string;
  unique_report_id?: string;
}

export interface OISIncident {
  date: string;
  address: string;
  neighborhood: string;
}

// ─── FIRE / EMS ──────────────────────────────────────────────────────────────

export interface FireEMSIncident {
  create_time: string;
  incident_type: string;
  neighborhood: string;
}

// ─── ADDRESS LOOKUP ───────────────────────────────────────────────────────────

export interface GeocodedAddress {
  formatted: string;
  lat: number;
  lng: number;
  street: string;
  neighborhood?: string;
}

export interface SORTAStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  routes: string[];
}

// ─── OHGO TRAFFIC ────────────────────────────────────────────────────────────

export interface OHGOIncident {
  id: string;
  lat: number;
  lng: number;
  location: string;
  description: string;
  category: string;
  routeName: string;
  roadStatus: string;
}

export interface OHGOCamera {
  id: string;
  lat: number;
  lng: number;
  location: string;
  description: string;
  views: Array<{
    direction: string;
    smallUrl: string;
    largeUrl: string;
    mainRoute: string;
  }>;
}

export interface OHGOConstruction {
  id: string;
  lat: number;
  lng: number;
  location: string;
  description: string;
  routeName: string;
}

// ─── COMMUNITY PERCEPTIONS ───────────────────────────────────────────────────

export interface PerceptionRecord {
  question: string;
  neighborhood: string;
  response: string;
}

// ─── NEIGHBORHOOD EXPLORER ───────────────────────────────────────────────────

export type DimensionId =
  | 'affordability'
  | 'income'
  | 'safety'
  | 'transit'
  | 'investment'
  | 'blight'
  | 'parks'     // CAGIS: park acreage per 1,000 residents within 0.75 mi of centroid
  | 'flood'     // FEMA NFHL: whether centroid falls in a Special Flood Hazard Area
  | 'food'      // USDA FARA 2019: % of neighborhood population in a food desert tract
  | 'schools';

export interface Dimension {
  id: DimensionId;
  labelKey: string;
  descriptionKey: string;
  methodology?: string;  // Plain-English explanation of how the score is computed
  enabled: boolean;
  weight: number;        // 1–5
  available: boolean;    // false = disabled (schools)
  higherIsBetter: boolean;
  incomeSub?: 'higher' | 'lower';
}

export interface NeighborhoodRawMetrics {
  // Affordability
  rentBurdenRate?: number;
  medianGrossRent?: number;
  rentBurdenMOE?: number;
  // Income
  medianHouseholdIncome?: number;
  incomeMOE?: number;
  // Safety
  crimeRatePer1000?: number;
  crimeCount?: number;
  // Transit
  uniqueRouteCount?: number;
  stopCount?: number;
  // Investment
  permitYoYChange?: number;
  recentPermitCount?: number;
  // Blight
  plapPerSqMile?: number;
  firstPassRate?: number;
  // Parks (CAGIS) — acreage within 0.75 mi of neighborhood centroid / pop * 1000
  parkAcresPer1000?: number;
  parkTotalAcres?: number;
  // Flood (FEMA NFHL) — true if centroid is in a Special Flood Hazard Area
  inFloodZone?: boolean;
  // Food Access (USDA FARA 2019) — % of neighborhood population in a LILA food desert tract
  foodDesertPct?: number;     // 0–100; higher = more food desert exposure
  povertyRate?: number;       // weighted average poverty rate across tracts
  medianFamilyIncomeFARA?: number;
  // Population (denominator)
  population?: number;
}

export interface NeighborhoodScore {
  name: string;
  compositeScore: number;
  dimensionScores: Record<DimensionId, number | null>;
  rawMetrics: NeighborhoodRawMetrics;
  hasInsufficientData: boolean;
}
