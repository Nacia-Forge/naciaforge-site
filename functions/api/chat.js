/**
 * NACIA FORGE — Cloudflare Worker
 * Proxy for Anthropic API calls from the static Cloudflare Pages site.
 *
 * DEPLOY STEPS (takes ~5 minutes):
 *
 * 1. In your Cloudflare Pages project dashboard:
 *    Settings → Functions → Add binding (or use Workers & Pages)
 *    — OR — deploy this as a standalone Worker and bind it to the Pages project.
 *
 * RECOMMENDED: Pages Functions (simplest — no separate Worker needed)
 *   a. In your site repo, create the folder:  functions/api/
 *   b. Save this file as:                     functions/api/chat.js
 *   c. In Cloudflare Pages → Settings → Environment Variables → Add:
 *        ANTHROPIC_API_KEY = sk-ant-...   (mark as Secret)
 *   d. Redeploy. Cloudflare auto-routes POST /api/chat to this file.
 *
 * ALTERNATIVE: Standalone Worker
 *   a. Workers & Pages → Create Worker → paste this code
 *   b. Settings → Variables → Add secret: ANTHROPIC_API_KEY
 *   c. Add a Route or Custom Domain mapping /api/chat to this Worker
 *
 * The HTML file already points PROXY_URL to '/api/chat' — no HTML changes needed.
 */

const ANTHROPIC_API   = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ALLOWED_ORIGIN  = '*'; // tighten to 'https://yourdomain.com' once live

/* ── CORS headers returned on every response ── */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/* ── Main handler ── */
export default {
  async fetch(request, env) {

    /* Pre-flight OPTIONS request — browsers send this before POST */
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    /* Only accept POST */
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders(),
      });
    }

    /* Parse the incoming body from the browser */
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    /* Validate required fields */
    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(JSON.stringify({ error: 'messages array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    /* Build the Anthropic request — whitelist fields, never trust the client
       to set the model or inject an API key */
    const anthropicPayload = {
      model:      'claude-sonnet-4-6',   /* pinned — update here to change model */
      max_tokens: 1000,
      system:     body.system   || '',
      messages:   body.messages,
    };

    /* Forward to Anthropic with the secret key from env */
    let anthropicRes;
    try {
      anthropicRes = await fetch(ANTHROPIC_API, {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         env.ANTHROPIC_API_KEY,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(anthropicPayload),
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Upstream fetch failed', detail: String(err) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    /* Stream the Anthropic response body back to the browser */
    const anthropicBody = await anthropicRes.text();

    return new Response(anthropicBody, {
      status:  anthropicRes.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(),
      },
    });
  },
};
