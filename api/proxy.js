/**
 * Vercel Serverless Function — Unified API Proxy
 *
 * Handles all /api/* routes by dispatching based on the path prefix:
 *   /api/census/*      → https://api.census.gov/data/* (injects CENSUS_API_KEY)
 *   /api/ohgo/*        → https://publicapi.ohgo.com/api/v1/* (injects OHGO_API_KEY)
 *
 * Required env vars (set in Vercel Project Settings → Environment Variables):
 *   CENSUS_API_KEY, OHGO_API_KEY
 *
 * The /api/openrouter/* AI route was removed in Jul 2026 (maintenance/funding).
 * If AI features return, restore the branch from git history (CHANGELOG Session 36).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req, res) {
  // CORS preflight
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `https://${req.headers.host}`);
  const pathname = url.pathname; // e.g. /api/census/2022/acs/acs5

  // ── Census API ─────────────────────────────────────────────────────────────
  if (pathname.startsWith('/api/census/')) {
    const subpath = pathname.replace('/api/census/', '');
    const params = new URLSearchParams(url.search);
    params.set('key', process.env.CENSUS_API_KEY ?? '');
    const target = `https://api.census.gov/data/${subpath}?${params}`;

    const upstream = await fetch(target, {
      headers: { 'User-Agent': 'CincinnatiCivicPlatform/1.0' },
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(upstream.status).send(await upstream.text());
  }

  // ── OHGO Traffic API ───────────────────────────────────────────────────────
  if (pathname.startsWith('/api/ohgo/')) {
    const subpath = pathname.replace('/api/ohgo/', '');
    const params = new URLSearchParams(url.search);
    params.set('api-key', process.env.OHGO_API_KEY ?? '');
    const target = `https://publicapi.ohgo.com/api/v1/${subpath}?${params}`;

    const upstream = await fetch(target, {
      headers: { 'User-Agent': 'CincinnatiCivicPlatform/1.0' },
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(upstream.status).send(await upstream.text());
  }

  return res.status(404).json({ error: 'Unknown API route', path: pathname });
}
