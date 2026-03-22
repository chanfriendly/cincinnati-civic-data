/**
 * Vercel Serverless Function — OHGO Traffic API Proxy
 *
 * Proxies /api/ohgo/* → https://publicapi.ohgo.com/api/v1/*
 * Appends OHGO_API_KEY server-side.
 *
 * Set OHGO_API_KEY in Vercel → Project Settings → Environment Variables.
 * (The VITE_OHGO_API_KEY in .env.local is used in dev only as a direct fallback.)
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const segments = req.query.path ?? [];
  const path = Array.isArray(segments) ? segments.join('/') : segments;

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== 'path') params.append(k, v);
  }
  params.set('api-key', process.env.OHGO_API_KEY ?? '');

  const url = `https://publicapi.ohgo.com/api/v1/${path}?${params.toString()}`;

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'CincinnatiCivicPlatform/1.0' },
    });

    const data = await upstream.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(upstream.status).send(data);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream fetch failed', detail: String(err) });
  }
}
