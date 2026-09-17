// functions/api/chat.js
//
// Cloudflare Pages Function.
// This file MUST live at:  <your-repo-root>/functions/api/chat.js
// Cloudflare Pages auto-detects anything in /functions and deploys it
// as a serverless route on your existing domain — no separate Worker,
// no extra DNS, no CORS problem, because it's same-origin.
//
// It receives the chat widget's POST to /api/chat, attaches your
// Anthropic API key server-side (never exposed to the browser), and
// forwards the request to Anthropic. This is the missing piece that
// was breaking the bot.
//
// ── SETUP (one-time) ──
// 1. Commit this file at functions/api/chat.js in your Pages project repo.
// 2. In the Cloudflare dashboard: Workers & Pages → your project →
//    Settings → Environment variables → add a variable named
//    ANTHROPIC_API_KEY, value = your real Anthropic API key, and mark
//    it as "Encrypt" / secret. Do this for both Production and Preview.
// 3. Redeploy. That's it — /api/chat will now exist on your domain.

export async function onRequestPost(context) {
  const { request, env } = context;

  // Restrict which origins can call this endpoint (defense in depth —
  // Pages Functions are same-origin by default anyway, but this stops
  // someone else from embedding your key-holding endpoint on their site).
  const allowedOrigins = [
    'https://naciaforge.com',
    'https://www.naciaforge.com',
    // add your *.pages.dev preview domain here while testing, e.g.:
    // 'https://your-project.pages.dev',
  ];
  const origin = request.headers.get('Origin') || '';
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (!env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Server is not configured (missing ANTHROPIC_API_KEY).' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body.' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // Only pass through the fields we expect — don't let the client
  // control things like the API key or arbitrary headers.
  const payload = {
    model: body.model || 'claude-sonnet-5',
    max_tokens: Math.min(body.max_tokens || 1000, 1500),
    system: body.system,
    messages: body.messages,
  };

  let anthropicRes;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Could not reach Anthropic API.' }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  const data = await anthropicRes.text(); // pass through raw, whether success or error

  return new Response(data, {
    status: anthropicRes.status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Handle CORS preflight
export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
