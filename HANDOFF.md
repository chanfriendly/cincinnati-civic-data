# Handoff Guide — Operating & Transferring the Cincinnati Civic Data Platform

> **Audience:** the next maintainer — UC College of Nursing staff, a student developer, or any
> steward taking over from the original author. This is the *operational* companion to the
> developer docs. Read `README.md` for setup, `CLAUDE.md` for architecture, and the live
> **Methodology & Limits** tab for data caveats.
>
> **Last updated:** July 2026

---

## 1. What you are inheriting

A static React/TypeScript site (Vite build) deployed on Vercel, plus one serverless function
(`api/proxy.js`) that injects API keys. There is **no database and no backend to operate** —
data is either fetched live from public APIs in the browser, or served from pre-built JSON
files in `public/data/` that a GitHub Action refreshes monthly.

The practical consequence: **the platform can run untouched for months.** The failure modes
are upstream (a city dataset changes schema, a GIS layer is removed) — not operational
(nothing crashes at 3am, there are no servers to patch).

**There are no recurring costs.** The former AI features (address summary, police Q&A,
Explorer blurbs) — the only pay-per-use dependency — were removed in July 2026. Every
remaining service runs on a free tier. See §8 for the conditions under which a future
maintainer could restore AI responsibly.

**Hosting is interim.** Vercel (free tier) works today, but it is not a committed long-term
home — the adopting institution should decide where this lives. Migration is easy by design:
the site is a static Vite build plus one small serverless function (`api/proxy.js`) that
injects two free API keys. Any static host + serverless runtime works, and `worker/`
contains a ready Cloudflare Worker equivalent of the proxy (see `worker/README.md`).

---

## 2. ⚠️ Blocking item for formal adoption: no license

The repository currently has **no LICENSE file**. Legally that means "all rights reserved" —
a university cannot formally fork, redistribute, or build on it until a license is chosen.
This is a deliberate open decision by the original author, not an oversight. Resolve it
before (or as part of) any formal transfer. MIT or Apache-2.0 fit the project's stated
non-commercial public-benefit spirit; the choice belongs to the author.

---

## 3. Accounts & credentials to transfer

Every external dependency, who holds it today, and what happens if it lapses:

| Item | Held by | Cost | If it lapses |
|------|---------|------|--------------|
| GitHub repo `chanfriendly/cincinnati-civic-data` | Christian Glass (personal) | Free | Transfer to an org account for institutional continuity |
| Vercel project (hosting + `*.vercel.app` domain + env vars) | Personal Vercel account | Free tier | Site goes down. Transfer the project or redeploy from repo (15 min) — or migrate to the institution's preferred host (§1) |
| `VITE_GEOCODING_API_KEY` (Mapbox) | Personal Mapbox account | Free tier (generous) | Address Lookup search stops working |
| `VITE_OHGO_API_KEY` (Ohio ODOT) | Personal registration | Free | Live traffic cards go empty |
| `CENSUS_API_KEY` (GitHub Actions secret + Vercel env var) | Personal registration | Free | Monthly ACS rebuilds fail (site keeps serving last-built JSON) |
| Google Form `forms.gle/sMHyvc4Hu8FMwARE8` + response Sheet | Personal Google account | Free | Community corrections stop arriving. Re-create the form and update `GOOGLE_FORM_URL` in `src/tabs/Limitations/index.tsx` |

**Transfer checklist:** move the repo to an org → connect Vercel to the new repo location and
re-enter the env vars → re-register the four free API keys under an institutional email →
re-create the Google Form under an institutional account and update the one constant →
add `CENSUS_API_KEY` as an Actions secret in the new repo.

---

## 4. Routine maintenance calendar

> This section is the *when*. For the *how* — exact commands, per-dataset release cadences,
> and a symptom→fix troubleshooting table — see **`MAINTENANCE.md`**.

### Monthly (~5 minutes)
- The **Refresh Static Data** GitHub Action runs on the 1st. If upstream published new data,
  it opens a PR. Skim the diff (sanity-check that values look plausible, not zeroed-out) and
  merge — merging auto-deploys. Most months it's a no-op and there is nothing to do.

### Quarterly (~30 minutes)
- Click through each tab on the live site with the browser console open. The realistic
  failures are silent upstream changes — see §5.
- Check that the Socrata-backed charts (crime, permits, police, revenue) show recent dates.

### Annually (~2 hours)
- **After city elections (odd years, next: Nov 2027):** update
  `public/data/cincinnati_council.json` by hand from cincinnati-oh.gov.
- Spot-check `public/data/community_councils.json` and `cincinnati_orgs.json` — meeting
  times, contacts, and org existence drift.
- Review the data-vintages table in `src/tabs/Limitations/index.tsx` (`VINTAGE_ROWS`) —
  when the monthly action pulls a new ACS/PLACES/HMDA year, the table's vintage strings
  need a matching manual bump.
- Check whether Cincinnati's income tax rate changed (would require a council vote +
  referendum — it will be news) → `public/data/cincinnati_tax_rate_history.json`.

---

## 5. What breaks first (fragility ranking)

1. **CAGIS/ArcGIS layer removals** — has already happened once (parks layer 34 silently
   deleted, HTTP 400s in production). Symptom: a card in Address Lookup errors. Fix: find
   the replacement layer on CAGIS Open Data, update the layer index and field names in
   `src/utils/api.ts`. See CHANGELOG for the worked example.
2. **Socrata schema/UID drift** — the city occasionally renames columns or deprecates
   dataset UIDs. The canonical UID/field table lives in `CLAUDE.md` and `CHANGELOG.md`.
3. **GTFS drift** — SORTA stop locations age slowly. Rebuild per README §"Updating SORTA
   transit data".
4. **Already broken upstream, by design:** EPA EJScreen (offline since Feb 2025 — 2019
   snapshot served, disclosed in UI); Legistar API (city never enabled it); pedestrian
   stops dataset (near-empty on the portal).

---

## 6. Files that only a human can update

These are hand-curated — no script rebuilds them:

| File | What it is | Update trigger |
|------|-----------|----------------|
| `public/data/cincinnati_council.json` | 9 council members + contacts | Elections, resignations |
| `public/data/community_councils.json` | 52 community council entries | Annual spot-check |
| `public/data/cincinnati_orgs.json` | 19 civic orgs directory | Annual spot-check |
| `public/data/cincinnati_tax_rate_history.json` | Verified tax rates only — **never add a rate without a primary-source ordinance citation** | Council vote + referendum |
| `public/data/recreation_centers.json` | 24 CRC centers | Rarely |
| `src/tabs/Limitations/index.tsx` → `VINTAGE_ROWS` | Public data-vintages table | When data vintages roll |
| `src/tabs/Roadmap/index.tsx` → `SECTIONS` | Public roadmap statuses | When features ship/stall |

---

## 7. Notes for the UC College of Nursing specifically

- There is **no formal partnership** — faculty confirmed they will use the tool as-is.
- Student-facing guidance (what the site can and can't do for a community health
  assessment, model-based-estimate caveats, and how to cite) lives on the live site:
  **Methodology & Limits → "For students & researchers."** Point students there first.
- The assessment dimensions the platform deliberately does *not* cover — neighborhood
  history, values and beliefs, resident perceptions — require student fieldwork. The
  Community & Civic section of each Neighborhood Profile lists community council contacts
  as fieldwork entry points.
- Composite indices (Explorer scores, Senior Vulnerability Score, displacement phases) are
  relative rankings within Cincinnati using equal-weight min–max normalization. They are
  transparent and reproducible, but **not validated instruments** — students should not
  cite them as if they were.
- The community-corrections Google Form currently routes to the original author's Google
  account (§3) — re-point it if the college wants to receive those reports.

---

## 8. Known open items at handoff

| Item | Status |
|------|--------|
| LICENSE | **Missing — blocks formal adoption (§2)** |
| Spanish translations | Machine-generated; native-speaker review pending; disclaimer banner ships in UI |
| Mobile QA (Tabs 1 & 3) | In progress, unconfirmed |
| AI features | **Removed Jul 2026** (no funding/maintainer). Code + prompts preserved in git history (CHANGELOG Session 36). Restore only with: sustained API funding, a named output-quality reviewer, and visible AI-generated disclosures — see the public Roadmap entry |
| Hosting | Vercel is interim (§1) — long-term home is the adopting institution's decision |
| Eviction data | Blocked — needs a data partner (Legal Aid Society); do not build without tract-level data |
| Healthcare facility enrichment | HRSA/SAMHSA APIs unreachable from build env; OSM is sole source; FQHC flags are name-keyword matches |
| SORTA route-per-stop data | Empty in GTFS export; UI uses stop counts |
| Manual QA of CAGIS cards (Tab 1) | Pending — test one Downtown (flood zone) and one Hyde Park address |

---

## 9. Documentation map

| File | Read it when |
|------|--------------|
| `README.md` | Setting up, deploying, API keys |
| `MAINTENANCE.md` | **Actually doing the maintenance** — refresh PR review, per-dataset rebuild commands and cadences, troubleshooting |
| `CLAUDE.md` | Architecture, dataset UIDs, critical patterns, sprint board |
| `CHANGELOG.md` | Before touching anything — failures, dead ends, design decisions |
| `PROGRESS.md` | Narrative history of every work session |
| `BRAND_BIBLE.md` / `DESIGN_SYSTEM.md` | Before adding or restyling any visualization |
| `HANDOFF.md` (this file) | Operating, maintaining, or transferring the platform |
| `CLAUDE_CODE_HANDOFF.md` | Historical only — self-flagged stale (Mar 2026) |
