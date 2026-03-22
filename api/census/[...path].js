/**
 * Vercel Serverless Function — U.S. Census API Proxy
 *
 * Proxies /api/census/* → https://api.census.gov/data/*
 * Appends CENSUS_API_KEY server-side so it is never exposed in the browser bundle.
 *
 * Set CENSUS_API_KEY in Vercel → Project Settings → Environment Variables.
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

  // Rebuild query string, stripping the internal 'path' param Vercel injects
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== 'path') params.append(k, v);
  }
  params.set('key', process.env.CENSUS_API_KEY ?? '');

  const url = `https://api.census.gov/data/${path}?${params.toString()}`;

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'CincinnatiCivicPlatform/1.0' },
    });

    const data = await upstream.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(upstream.status).send(data);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream fetch failed', detail: String(err) });
  }
}
