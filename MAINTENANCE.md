# Maintenance Runbook — How to Keep This Site's Data Fresh

> **Audience:** whoever maintains the site — no prior context assumed. `HANDOFF.md` tells you
> *when* things need attention and who holds the accounts; this document tells you *how* to
> actually do each task, command by command. If something here fails, check `CHANGELOG.md`
> first — most failures have happened before and the fix is written down.
>
> **Last updated:** July 2026

---

## 1. The monthly automated refresh (the main loop)

Most data maintenance is one PR review a month. A GitHub Action
(`.github/workflows/refresh-data.yml`) runs on the **1st of every month at 6am UTC**:

1. It re-runs the 10 automated build scripts (see §3) against the upstream sources.
2. If any `public/data/*.json` file changed, it opens a PR titled **"data: automated monthly refresh"** (label: `data-refresh`).
3. If nothing changed upstream — true for most months, since most sources release annually — no PR appears. **A silent month is normal, not a failure.**

### Reviewing the refresh PR (~5 minutes)

1. Open the PR's **Files changed** diff.
2. Sanity-check plausibility, not correctness — you're guarding against upstream breakage, not re-auditing the data:
   - Values shifted modestly (a new ACS vintage moves incomes a few percent) → fine.
   - A file went to `[]`, `{}`, all-null, or lost most of its rows → **do not merge**; an upstream API broke or changed schema. See §6.
   - A file shrank from ~41 neighborhoods to a handful → same — do not merge.
3. Merge. Vercel auto-deploys `main`; the site updates within a few minutes.
4. **After a vintage rolls** (e.g. ACS 2022 → 2023 data appears in the diff): update the
   `VINTAGE_ROWS` table in `src/tabs/Limitations/index.tsx` to match — it is hand-maintained
   and the public data-vintages page will silently go stale otherwise.

### Triggering a refresh manually

GitHub → **Actions** → **Refresh Static Data** → **Run workflow** (top right). Same flow as above. Useful right after an upstream publishes (e.g. December ACS release) instead of waiting for the 1st.

### If the Action itself fails

The workflow runs each script with `set +e` (one failure doesn't stop the others) — open the run log and search for a non-zero `Exit:` line to find the culprit. The one credential it needs is the `CENSUS_API_KEY` repository secret (GitHub → Settings → Secrets and variables → Actions). If that secret is missing or revoked, the ACS scripts rate-limit or fail.

---

## 2. Running build scripts locally

Any script the Action runs can also be run from a laptop:

```bash
pip install requests
export CENSUS_API_KEY=your_key   # optional — Census works keyless at low volume, key avoids rate limits
python3 scripts/build_demographics.py
```

Every script writes directly to `public/data/`, prints a summary, and is safe to re-run (idempotent). Review with `git diff public/data/`, then commit. Nothing else to wire up — the app reads these files statically.

---

## 3. Per-dataset refresh reference

### Automated (rebuilt monthly by the Action)

| Data file (`public/data/`) | Script | Upstream & release rhythm | What "new data" looks like |
|---|---|---|---|
| `neighborhood_demographics.json` | `build_demographics.py` | Census ACS 5-year — new vintage each **December** (≈1-yr lag) | Once a year, in the Dec/Jan refresh |
| `neighborhood_disability.json` | `build_disability.py` | Census ACS 5-year — December | Once a year |
| `neighborhood_racial_equity.json` | `build_racial_equity.py` | Census ACS + HMDA — annual | Once a year |
| `cincinnati_income_percentiles.json` | `build_income_percentiles.py` | Census ACS B19080 — December | Once a year (adds a year to the series) |
| `neighborhood_health_outcomes.json` | `build_health_outcomes.py` | CDC PLACES — annual release (typically **late summer/fall**) | Once a year |
| `neighborhood_hmda.json` | `build_hmda.py` | CFPB HMDA — annual snapshot (typically **mid-year** for prior year) | Once a year |
| `hud_affordable_housing.json` | `build_hud.py` | HUD Picture of Subsidized Households — annual | Once a year |
| `lead_service_lines.json` | `build_lead.py` | Cincinnati Open Data (GCWW) — **rolling** updates | Small diffs many months (replacement progress) |
| `cagis_neighborhood_parks.json` | `build_parks.py` | CAGIS ArcGIS — live source | Rarely changes; diff only when parks are added/redrawn |
| `neighborhood_life_expectancy.json` | `build_life_expectancy.py` | CDC USALEEP — **no release since 2010–2015** | Almost certainly never; harmless to keep in the loop |

### Deliberately NOT automated

| Data file | How to refresh | Cadence | Why manual |
|---|---|---|---|
| `sorta_stops.json` | §4.1 below (`scripts/convert_gtfs.py`) | When SORTA publishes service changes (a few times a year); annual is fine | GTFS comes as a zip download, not an API |
| `neighborhood_ejscreen.json` | Don't. | Frozen (2019) | EPA EJScreen offline since Feb 2025 — `build_ejscreen.py` exists but has no live upstream |
| `healthcare_facilities.json` | `python3 scripts/build_healthcare_facilities.py` from a residential network | Annual, best-effort | OSM Overpass blocks CI runners; HRSA/SAMHSA APIs were unreachable — see CHANGELOG Session 29 |
| `schools.json` | Re-pull CAGIS layer 32 (see script-less note in README) | Annual spot-check | Rarely changes |
| `neighborhood_acs.json` | Pre-built tract file — regenerate only if tract definitions change (next: 2030 Census) | ~Decadal | Foundation file many scripts key off; don't churn it |
| `neighborhood_transit_equity.json` | Rebuild after a SORTA refresh (stop counts) + ACS vintage roll | Annual | Derived from two other files |

### Hand-curated (no script — a human edits the JSON)

| Data file | Update trigger | Source of truth |
|---|---|---|
| `cincinnati_council.json` | **City elections (odd Novembers — next: Nov 2027)**, resignations, leadership changes | cincinnati-oh.gov council pages |
| `community_councils.json` | Annual spot-check; user corrections via the contribution form | Community council sites / city directory |
| `cincinnati_orgs.json` | Annual spot-check (orgs fold, numbers change) | Each org's own site |
| `recreation_centers.json` | Rarely (CRC openings/closures) | cincinnati-oh.gov CRC pages |
| `cincinnati_tax_rate_history.json` | Only on a council vote + voter referendum (it will be news). **Never add a rate without a primary-source ordinance citation** | City Finance Dept |

Live Socrata data (crime, permits, 311, police, revenue, food safety…) needs **no maintenance** — the app queries it at page load. If a live chart breaks, that's a schema/UID drift problem (§6), not a refresh problem.

---

## 4. Manual procedures

### 4.1 SORTA bus stops

```bash
curl -o google_transit.zip https://www.go-metro.com/transitdata/google_transit.zip
unzip -o google_transit.zip -d gtfs/
python3 scripts/convert_gtfs.py gtfs/stops.txt
git add public/data/sorta_stops.json && git commit -m "chore: update SORTA transit data"
```

The script refuses to write if it parses suspiciously few stops (< 1,000), so a truncated download can't clobber good data. `routes` stays `[]` by design — the app scores by stop count (see CHANGELOG "SORTA route data").

### 4.2 After a city election (odd Novembers)

Edit `public/data/cincinnati_council.json` by hand: names, titles (Vice Mayor, President Pro Tem), emails (pattern: `first.last@cincinnati-oh.gov` — verify on the member's city page), direct phone lines where published, and the `_meta` term fields. All 9 members are at-large; there is no district mapping to update.

### 4.3 When a data vintage rolls (any source)

Three places must move together:
1. The data file itself (automated or manual, above).
2. `VINTAGE_ROWS` in `src/tabs/Limitations/index.tsx` — the public data-vintages table.
3. Any in-app copy that names the year — grep the old vintage string (e.g. `grep -rn "2022" src/tabs/` for ACS) and update methodology text that cites it.

---

## 5. Verifying after any refresh

Data-only PRs don't need a TypeScript check — the gate that matters is visual:

```bash
npm run dev
```

Open <http://localhost:5173>, then spot-check the tab(s) fed by what changed (§3 tables name them; `CLAUDE.md` has the full file→tab map). Pick one familiar neighborhood (e.g. Avondale) and confirm values render and look plausible. Open the browser console — it should be free of red errors. For code changes, also run `npm run build` (runs `tsc` + Vite; both must pass — Vercel runs the same on deploy).

---

## 6. When something breaks

Symptoms → most likely cause → where the fix is documented:

| Symptom | Likely cause | Go to |
|---|---|---|
| A card in Address Lookup errors (HTTP 400 from CAGIS) | CAGIS silently removed/renumbered a layer — **has happened before** (parks layer 34 → 46, fields renamed) | CHANGELOG "Failed Approaches"; fix layer index + field names in `src/utils/api.ts` |
| A live Socrata chart is empty / errors | Column renamed or dataset UID deprecated by the city | Canonical UID/field table in `CLAUDE.md`; test queries in the browser against `data.cincinnati-oh.gov/resource/<uid>.json` |
| ACS script returns HTTP 204 / all nulls | Wrong geography code, or a table suppressed at tract level | CHANGELOG: Cincinnati place FIPS is **`15000`** not `14000`; use `C16001` not `B16001` at tract level; use `safe_float()` for decimal ACS values |
| CDC PLACES script HTTP 400 | `$where` clause — PLACES rejects it | CHANGELOG Session 29: filter with `countyfips=39061` as a plain param instead |
| Refresh PR shows a file collapsed to `[]`/nulls | Upstream API broke mid-run | Don't merge; re-run the single script locally (§2) to see the real error |
| Socrata 403s | Someone added the token as an `X-App-Token` header | Always `$$app_token` query param (CHANGELOG, first entry) |

General rule, straight from the project's history: **when a script or query fails, someone has probably hit it before — read `CHANGELOG.md` before debugging from scratch, and add your own dead ends to it when you're done.**
