// api/proxy.js — Vercel Serverless Proxy
// Handles two services:
//   POST /api/proxy  { service: 'anthropic', ... }  → forwards to api.anthropic.com
//   GET  /api/proxy?service=govdata&...             → forwards to api.data.gov.in

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GOVDATA_URL   = 'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070';

// Keys live in Vercel Environment Variables — never exposed to the browser
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GOVDATA_KEY   = process.env.GOVDATA_API_KEY;

export default async function handler(req, res) {
  // Allow requests from your own domain only (update this after deploying)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const service = req.query.service || (req.body && req.body.service);

  // ── ANTHROPIC ──────────────────────────────────────────────
  if (service === 'anthropic') {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!ANTHROPIC_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server.' });
    }

    try {
      const { model, max_tokens, system, messages } = req.body;

      const upstream = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type':         'application/json',
          'x-api-key':            ANTHROPIC_KEY,
          'anthropic-version':    '2023-06-01',
        },
        body: JSON.stringify({ model, max_tokens, system, messages }),
      });

      const data = await upstream.json();

      if (!upstream.ok) {
        return res.status(upstream.status).json(data);
      }

      return res.status(200).json(data);

    } catch (err) {
      return res.status(500).json({ error: 'Anthropic proxy error', detail: err.message });
    }
  }

  // ── DATA.GOV.IN / AGMARKNET ────────────────────────────────
  if (service === 'govdata') {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!GOVDATA_KEY) {
      return res.status(500).json({ error: 'GOVDATA_API_KEY not configured on server.' });
    }

    try {
      // Forward all query params except 'service', inject the server-side key
      const params = new URLSearchParams();
      params.set('api-key', GOVDATA_KEY);
      params.set('api-version', '2.0');
      params.set('format', 'json');
      params.set('limit',  req.query.limit  || '200');
      params.set('offset', req.query.offset || '0');

      if (req.query.state)     params.set('filters[state]',     req.query.state);
      if (req.query.commodity) params.set('filters[commodity]', req.query.commodity);

      const upstream = await fetch(`${GOVDATA_URL}?${params.toString()}`);
      const data     = await upstream.json();

      if (!upstream.ok) {
        return res.status(upstream.status).json(data);
      }

      return res.status(200).json(data);

    } catch (err) {
      return res.status(500).json({ error: 'GovData proxy error', detail: err.message });
    }
  }

  // Unknown service
  return res.status(400).json({
    error: 'Unknown service. Use ?service=govdata (GET) or { service: "anthropic" } (POST).'
  });
}
