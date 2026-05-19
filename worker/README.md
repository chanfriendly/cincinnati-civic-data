# Cloudflare Worker — Optional API Proxy

This directory contains an alternative backend to `api/proxy.js` (the Vercel serverless function). It is **not currently deployed** — the live site uses the Vercel proxy.

## What it does

Routes `/api/census/*`, `/api/openrouter/*`, and `/api/ohgo/*` to their upstream APIs, injecting secrets server-side. Functionally identical to `api/proxy.js`.

## When you'd use this

If you migrate off Vercel (e.g. to Cloudflare Pages) or want lower cold-start latency, you can deploy the Worker instead of the Vercel function.

## Setup

```bash
# Install Wrangler
npm install -g wrangler

# Create the KV namespace (needed for civic counters feature)
cd worker
wrangler kv:namespace create CIVIC_COUNTERS
# Copy the output ID into wrangler.toml [[kv_namespaces]] id field

# Set secrets
wrangler secret put OPENROUTER_API_KEY
wrangler secret put CENSUS_API_KEY
wrangler secret put OHGO_API_KEY

# Deploy
wrangler deploy api-proxy.js

# Update VITE_WORKER_URL in your Vercel env vars to point at the deployed Worker URL
```
