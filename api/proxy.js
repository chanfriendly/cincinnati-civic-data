/**
 * Vercel Serverless Function — Unified API Proxy
 *
 * Handles all /api/* routes by dispatching based on the path prefix:
 *   /api/openrouter/*  → https://openrouter.ai/api/*   (injects OPENROUTER_API_KEY)
 *   /api/census/*      → https://api.census.gov/data/* (injects CENSUS_API_KEY)
 *   /api/ohgo/*        → https://publicapi.ohgo.com/api/v1/* (injects OHGO_API_KEY)
 *
 * Required env vars (set in Vercel Project Settings → Environment Variables):
 *   OPENROUTER_API_KEY, CENSUS_API_KEY, OHGO_API_KEY
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
  const pathname = url.pathname; // e.g. /api/openrouter/v1/chat/completions

  // ── OpenRouter ─────────────────────────────────────────────────────────────
  if (pathname.startsWith('/api/openrouter/')) {
    const subpath = pathname.replace('/api/openrouter/', '');
    const target = `https://openrouter.ai/api/${subpath}`;

    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}`,
        'HTTP-Referer': 'https://cincinnati-civic-data.vercel.app',
        'X-Title': 'Cincinnati Civic Platform',
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    res.setHeader('Content-Type', 'application/json');
    return res.status(upstream.status).send(await upstream.text());
  }

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
