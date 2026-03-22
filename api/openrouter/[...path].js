/**
 * Vercel Serverless Function — OpenRouter AI Proxy
 *
 * Proxies /api/openrouter/* → https://openrouter.ai/api/*
 * Injects OPENROUTER_API_KEY server-side so it is never exposed in the browser bundle.
 *
 * Set OPENROUTER_API_KEY in Vercel → Project Settings → Environment Variables.
 */
export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const segments = req.query.path ?? [];
  const path = Array.isArray(segments) ? segments.join('/') : segments;
  const url = `https://openrouter.ai/api/${path}`;

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}`,
        'HTTP-Referer': 'https://cincinnati-civic-data.vercel.app',
        'X-Title': 'Cincinnati Civic Platform',
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const data = await upstream.text();
    res.setHeader('Content-Type', 'application/json');
    return res.status(upstream.status).send(data);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream fetch failed', detail: String(err) });
  }
}
