/**
 * Cincinnati Civic Platform — Cloudflare Worker API Proxy
 *
 * Routes:
 *   /api/census/*      → https://api.census.gov/data/*      (appends CENSUS_API_KEY)
 *   /api/openrouter/*  → https://openrouter.ai/api/*        (appends OPENROUTER_API_KEY)
 *
 * Routes:
 *   /api/census/*      → https://api.census.gov/data/*      (appends CENSUS_API_KEY)
 *   /api/openrouter/*  → https://openrouter.ai/api/*        (appends OPENROUTER_API_KEY)
 *   /api/ohgo/*        → https://publicapi.ohgo.com/api/v1/* (appends OHGO_API_KEY)
 *
 * Environment secrets (set in Cloudflare dashboard → Worker → Settings → Variables):
 *   OPENROUTER_API_KEY  — from openrouter.ai/keys
 *   CENSUS_API_KEY      — from api.census.gov/data/key_signup.html
 *   OHGO_API_KEY        — register free at https://ohgo.com → developer portal
 *   SOCRATA_APP_TOKEN   — from data.cincinnati-oh.gov (low sensitivity, optional here)
 *
 * Deploy with Wrangler:
 *   wrangler deploy worker/api-proxy.js
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname, search } = url;

    // ── CORS preflight ─────────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // ── Census API proxy ───────────────────────────────────────────────────────
    if (pathname.startsWith('/api/census/')) {
      const censusPath = pathname.replace('/api/census/', '');
      const censusUrl = new URL(`https://api.census.gov/data/${censusPath}${search}`);
      censusUrl.searchParams.set('key', env.CENSUS_API_KEY ?? '');

      const upstream = await fetch(censusUrl.toString(), {
        method: 'GET',
        headers: { 'User-Agent': 'CincinnatiCivicPlatform/1.0' },
      });

      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
          ...CORS_HEADERS,
        },
      });
    }

    // ── OpenRouter proxy ───────────────────────────────────────────────────────
    // Forwards to openrouter.ai with the API key injected server-side.
    // Model: minimax/minimax-m2.5
    // OpenRouter uses the OpenAI-compatible messages API.
    if (pathname.startsWith('/api/openrouter/')) {
      const openrouterPath = pathname.replace('/api/openrouter', '');
      const openrouterUrl = `https://openrouter.ai/api${openrouterPath}${search}`;

      const upstream = await fetch(openrouterUrl, {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENROUTER_API_KEY ?? ''}`,
          'HTTP-Referer': 'https://cincydata.pages.dev',
          'X-Title': 'Cincinnati Civic Platform',
        },
        body: request.method !== 'GET' ? await request.text() : undefined,
      });

      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: {
          'Content-Type': 'application/json',
          // No caching for AI responses
          ...CORS_HEADERS,
        },
      });
    }

    // ── OHGO Traffic API proxy ─────────────────────────────────────────────────
    // Forwards to OHGO with the API key injected server-side so the key is not
    // exposed in the client bundle in production.
    // Dev fallback: set VITE_OHGO_API_KEY in .env.local to call OHGO directly.
    if (pathname.startsWith('/api/ohgo/')) {
      const ohgoPath = pathname.replace('/api/ohgo/', '');
      const ohgoUrl = new URL(`https://publicapi.ohgo.com/api/v1/${ohgoPath}${search}`);
      ohgoUrl.searchParams.set('api-key', env.OHGO_API_KEY ?? '');

      const upstream = await fetch(ohgoUrl.toString(), {
        method: 'GET',
        headers: { 'User-Agent': 'CincinnatiCivicPlatform/1.0' },
      });

      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60', // traffic data changes frequently
          ...CORS_HEADERS,
        },
      });
    }

    // ── Not found ──────────────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({ error: 'Not found', path: pathname }),
      { status: 404, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  },
};
