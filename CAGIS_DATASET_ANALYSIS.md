# CAGIS Open Data — Dataset Analysis & Integration Recommendations

**Source:** [CAGIS Open Data Hub](https://data-cagisportal.opendata.arcgis.com)
**Update cadence:** Quarterly (static geographic layers, not live transactional data)
**Access:** ArcGIS Feature Service REST API — no auth required, free tier
**Base pattern:** `https://opendata.arcgis.com/datasets/{DATASET_ID}.geojson`
**Spatial query pattern:** `https://services1.arcgis.com/vdNDkVykv9vEWFX4/arcgis/rest/services/{ServiceName}/FeatureServer/0/query?geometry={lng},{lat}&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&inSR=4326&outSR=4326&f=geojson`

---

## Confirmed Available Datasets

| Dataset | ID / URL Slug | Update | Best Use |
|---|---|---|---|
| Statistical Neighborhood Approximations (SNA) | `572561553c9e4d618d2d7939c5261d46` | Quarterly | Already in use (Tab 4 map) |
| **Zoning Designation (Cincinnati only)** | `zoning-designation-cincinnati-only` | Quarterly | Tab 1, Tab 2 |
| Countywide Zoning | `f682afb7aaa049b1a4af1a7c46d04749_21` | Quarterly | Tab 4 dimension |
| **FEMA Flood Hazard Zones** | `31417e0e347f49c9b25822e12f688595` | Quarterly | Tab 1, Tab 4 |
| **Cincinnati Parks and Greenspace** | `f3a7a97236f54d9395db2b639787a5db` | Quarterly | Tab 1, Tab 4 |
| **Cincinnati Historic Districts** | `41203d41015d43c08d7354e57b7eee75_3` | Quarterly | Tab 1 |
| Cincinnati Hillside Overlay Districts | `8712c2838cee40fbabd3dec3e544335f_3` | Quarterly | Tab 1 (construction context) |
| Cincinnati Urban Design Districts | `46115784fbd74aaea8bcc44ee06dba2c_1` | Quarterly | Tab 2 |
| **Cincinnati Tax Increment Financing (TIF) Districts** | `e0ef961f520646019f54ee8b28b967eb_10` | Quarterly | Tab 2 (investment context) |
| Cincinnati Police Districts | `3dfc9ca5946b4165b4bcd81dde07174b_13` | Quarterly | Tab 3 district filter |
| Hamilton County Owned Parcels | `156c9e13c2ec47929f1cecd27ccdc601` | Quarterly | Tab 1 (owner lookup) |
| Cincinnati Streetcar Route | `1ffa624fcab442a1a5ad57d745798438_0` | Static | Tab 4 transit dimension |
| Right of Ways and Easements | `b90105a071974a61b3638db1d99d14b3` | Quarterly | Low priority |
| Urban Tree Canopy (2020 LiDAR) | Hamilton County / Sanborn analysis | 2020 | Tab 4 dimension |

---

## Priority Recommendations by Tab

### 🏠 Tab 1 — Address Lookup (HIGH PRIORITY adds)

These are the datasets a renter or prospective tenant would most want to know about a specific address. Each is a simple point-in-polygon spatial query — one API call returns whether the address falls inside the layer.

#### 1. Zoning Designation
**Why:** Tells residents what the land is legally zoned for. Relevant for renters assessing stability (is my apartment building in a residential zone or a commercial overlay?), advocates tracking spot-rezoning, and journalists covering development.
**API call:** Point-in-polygon against `zoning-designation-cincinnati-only`
**Fields to show:** Zone code, zone description (R1, R2, MX, B, etc.)
**Complexity:** Low — single spatial query, no joins needed.

#### 2. FEMA Flood Hazard Zone
**Why:** A property being in a 100-year or 500-year flood zone directly affects insurance requirements, mortgage terms, and livability. This is information most tenants don't know to look for and can't easily find.
**API call:** Point-in-polygon against `31417e0e347f49c9b25822e12f688595`
**Fields to show:** Zone type (AE, X, etc.), risk description
**Complexity:** Low — single spatial query.
**Note:** Display as a yellow or orange warning card if positive.

#### 3. Historic District
**Why:** Properties in Cincinnati's historic districts have renovation restrictions (affects landlords) and may be eligible for historic tax credits (relevant to advocates tracking equity investment). Context for journalists covering gentrification.
**API call:** Point-in-polygon against `41203d41015d43c08d7354e57b7eee75_3`
**Fields to show:** District name, designation year
**Complexity:** Low.

#### 4. Nearest Park(s)
**Why:** Park access is a measurable quality-of-life metric that people genuinely want when evaluating a neighborhood or apartment.
**API call:** Spatial proximity query (nearest features within 0.5 miles) against `f3a7a97236f54d9395db2b639787a5db`
**Fields to show:** Park name, distance, acreage
**Complexity:** Medium — needs distance calculation from point to polygon centroid.

---

### 📋 Tab 2 — Neighborhood Profiles (MEDIUM PRIORITY)

#### 5. TIF Districts
**Why:** Tax Increment Financing districts are where the city has committed future tax revenue to fund current development. Their presence signals active public investment in an area — directly relevant to displacement advocacy, grant applications, and community organizing context.
**API call:** Point-in-polygon or clip against neighborhood boundary
**Fields to show:** District name, activation year, purpose
**Complexity:** Low.

#### 6. Zoning Mix
**Why:** The proportion of residential vs. commercial vs. industrial zoning in a neighborhood tells advocates and organizers about land-use pressure. A neighborhood with rapidly increasing commercial zoning near residential areas is a displacement signal.
**API call:** Clip zoning layer to neighborhood boundary, aggregate by zone type
**Complexity:** Medium — needs polygon clipping, not just point lookup.

---

### 🗺️ Tab 4 — Neighborhood Explorer (HIGH PRIORITY — new scoring dimensions)

These would become new toggleable dimensions in the explorer, adding genuine analytical depth.

#### 7. Park Access (NEW DIMENSION)
**Metric:** Total park acreage within or adjacent to neighborhood per 1,000 residents
**Data:** Parks and Greenspace layer clipped to neighborhood boundaries
**Why it matters:** Green space access is a well-documented equity indicator. Lower-income neighborhoods in Cincinnati have measurably less park access.
**Complexity:** Medium — needs spatial clip + Census population denominator.

#### 8. Flood Risk (NEW DIMENSION)
**Metric:** % of neighborhood land area in FEMA Special Flood Hazard Area (100-year zone)
**Data:** FEMA Flood Hazard Zones clipped to neighborhood boundaries
**Why it matters:** Flood risk concentrates in lower-income neighborhoods and directly affects insurance costs, habitability during storms, and long-term climate risk.
**Complexity:** Medium — needs spatial area calculation.

#### 9. Zoning Health / Land Use Diversity (refine Investment dimension)
**Metric:** % of neighborhood zoned residential (stable) vs. mixed-use or commercial (transition risk or opportunity, depending on perspective)
**Data:** Zoning Designation layer
**Complexity:** Medium.

---

## What's NOT Available via CAGIS (Notable Gaps)

| Desired Data | Status | Alternative |
|---|---|---|
| School quality / CPS ratings | Not published publicly via API | Ohio Dept. of Education (PDF reports only) — already noted as out of scope |
| Sidewalk condition / ADA compliance | Not found in CAGIS portal | Cincinnati 311 requests (via Socrata?) might proxy |
| Vacant lots / land bank inventory | Partially — Hamilton County Parcels has ownership; DCED City-Owned Properties on Socrata (`gubx-p4qi`) covers city-owned land | Socrata already in scope |
| Real-time traffic / congestion | Not published | Would require ODOT or Google data |
| Grocery / food access | Not a CAGIS layer | USDA Food Access Research Atlas (separate federal data) |
| Tree canopy per neighborhood | Available but only as 2020 raster analysis | Could add as a static layer if the canopy % per SNA is tabulated |

---

## Integration Approach

All CAGIS layers are static geographic data (quarterly updates). The right approach is different from Socrata's transactional API:

**For point-in-polygon (Tab 1):** Query the ArcGIS Feature Service with the geocoded lat/lng:
```
https://services1.arcgis.com/vdNDkVykv9vEWFX4/arcgis/rest/services/{ServiceName}/FeatureServer/0/query
  ?geometry={lng},{lat}
  &geometryType=esriGeometryPoint
  &spatialRel=esriSpatialRelIntersects
  &inSR=4326
  &outFields=*
  &f=json
```

**For neighborhood-level stats (Tabs 2 & 4):** Pre-compute the statistics at build time or cache them. Since these are quarterly datasets, fetching them live on every page load is wasteful. Better approach: add a build-time data pipeline that generates a `public/data/cagis_neighborhood_stats.json` file containing pre-computed metrics per neighborhood (park acreage, % flood zone, zoning mix, TIF presence). This file ships with the app and is regenerated quarterly.

**CORS:** CAGIS ArcGIS services support CORS for browser requests, but test early — some Hamilton County services require the Vite proxy as a fallback.

---

## Recommended Build Order

1. **Zoning + Flood + Historic** on Tab 1 — highest resident utility, low complexity, all point-in-polygon
2. **TIF Districts** on Tab 2 — one paragraph of context per neighborhood, meaningful for advocacy audiences
3. **Parks access dimension** on Tab 4 — strongest data equity story, pairs well with existing safety/transit/affordability dimensions
4. **Flood risk dimension** on Tab 4 — climate relevance, underserved by current tools
5. **Pre-computed stats pipeline** — replace live spatial queries in Tab 4 with a build-time JSON, improving performance and reliability

---

*Prepared March 2026 — Data source: [CAGIS Open Data Hub](https://data-cagisportal.opendata.arcgis.com)*
