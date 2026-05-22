/**
 * Supabase Edge Function: REST API for Enterprise users
 * Ticket: XST-778 — API Access for Enterprise Users
 *
 * Route: /functions/v1/api (all routes handled via URL path)
 *
 * Supported endpoints:
 *   GET    /api/v1/portfolio   → list portfolio items
 *   POST   /api/v1/portfolio   → add portfolio item
 *   DELETE /api/v1/portfolio/:id → remove portfolio item
 *   GET    /api/v1/watchlist   → list watchlist
 *   GET    /api/v1/assets      → list assets
 *   GET    /api/v1/history     → chat history (last 50)
 *
 * Authentication: Authorization: Bearer <raw-api-key>
 * Rate limiting: 100 requests/hour per key (tracked in api_keys.request_count)
 */

// Deno/Supabase Edge Function environment
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') || '';
  const rawKey = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!rawKey) return json({ error: 'Missing Authorization header' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const db = createClient(supabaseUrl, serviceKey);

  // Hash the incoming key
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawKey));
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  // Look up key in DB
  const { data: keyRow, error: keyErr } = await db
    .from('api_keys')
    .select('id, user_id, revoked, request_count')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (keyErr || !keyRow) return json({ error: 'Invalid API key' }, 401);
  if (keyRow.revoked)    return json({ error: 'API key has been revoked' }, 401);

  // Rate limit: 100 req/hour (simple counter; resets when day changes)
  if (keyRow.request_count >= 100) {
    return json({ error: 'Rate limit exceeded. Max 100 requests/hour.' }, 429);
  }

  const userId = keyRow.user_id;

  // Increment counter (fire-and-forget)
  db.from('api_keys').update({
    request_count: keyRow.request_count + 1,
    last_used_at: new Date().toISOString(),
  }).eq('id', keyRow.id).then(() => {});

  // Verify enterprise plan
  const { data: sub } = await db
    .from('subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (sub?.plan_id !== 'enterprise') {
    return json({ error: 'API access requires Enterprise plan' }, 403);
  }

  // ── Routing ─────────────────────────────────────────────────────────────
  const url    = new URL(req.url);
  const parts  = url.pathname.replace(/^\/functions\/v1\/api/, '').replace(/^\/api\/v1/, '').split('/').filter(Boolean);
  const entity = parts[0]; // 'portfolio' | 'watchlist' | 'assets' | 'history'
  const itemId = parts[1]; // for DELETE /portfolio/:id

  const method = req.method;

  // ── Portfolio ────────────────────────────────────────────────────────────
  if (entity === 'portfolio') {
    if (method === 'GET') {
      const { data, error } = await db.from('portfolio').select('*').eq('user_id', userId).order('symbol');
      if (error) return json({ error: error.message }, 500);
      return json({ data, count: data.length });
    }

    if (method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const { symbol, quantity, avg_price } = body;
      if (!symbol || !quantity || !avg_price) return json({ error: 'Required: symbol, quantity, avg_price' }, 400);

      const { data, error } = await db
        .from('portfolio')
        .insert({ user_id: userId, symbol: symbol.toUpperCase(), quantity: Number(quantity), avg_price: Number(avg_price) })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ data }, 201);
    }

    if (method === 'DELETE' && itemId) {
      const { error } = await db.from('portfolio').delete().eq('id', itemId).eq('user_id', userId);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }
  }

  // ── Watchlist ────────────────────────────────────────────────────────────
  if (entity === 'watchlist' && method === 'GET') {
    const { data, error } = await db.from('watchlist').select('*').eq('user_id', userId).order('symbol');
    if (error) return json({ error: error.message }, 500);
    return json({ data, count: data.length });
  }

  // ── Assets ───────────────────────────────────────────────────────────────
  if (entity === 'assets' && method === 'GET') {
    const { data, error } = await db.from('assets').select('*').eq('user_id', userId).order('name');
    if (error) return json({ error: error.message }, 500);
    return json({ data, count: data.length });
  }

  // ── Chat History ─────────────────────────────────────────────────────────
  if (entity === 'history' && method === 'GET') {
    const limit = Number(url.searchParams.get('limit') || 50);
    const { data, error } = await db
      .from('chat_history')
      .select('id,prompt,response,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 200));
    if (error) return json({ error: error.message }, 500);
    return json({ data, count: data.length });
  }

  return json({ error: `Unknown endpoint: ${method} /api/v1/${entity || ''}` }, 404);
});
