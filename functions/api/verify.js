import { verifyToken, jsonHeaders } from './_auth.js';

export async function onRequestPost({ request, env }) {
  let data;
  try { data = await request.json(); } catch { data = {}; }
  const payload = await verifyToken(env, data.token, data.realm || null);
  if (!payload) {
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: jsonHeaders });
  }
  return new Response(JSON.stringify({ ok: true, user: payload.u, realm: payload.r }), { status: 200, headers: jsonHeaders });
}

export async function onRequest({ request, env }) {
  if (request.method === 'POST') return onRequestPost({ request, env });
  return new Response(JSON.stringify({ ok: false, error: 'method' }), { status: 405, headers: jsonHeaders });
}
