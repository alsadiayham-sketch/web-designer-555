import { verifyCredential, issueToken, jsonHeaders } from './_auth.js';

export async function onRequestPost({ request, env }) {
  let data;
  try { data = await request.json(); } catch { data = {}; }
  const realm = String(data.realm || '');
  const username = data.username;
  const password = data.password;

  const allowed = ['projects', 'notes', 'store', 'posadmin'];
  if (!allowed.includes(realm)) {
    return new Response(JSON.stringify({ ok: false, error: 'bad_realm' }), { status: 400, headers: jsonHeaders });
  }

  const user = await verifyCredential(env, realm, username, password);
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid' }), { status: 401, headers: jsonHeaders });
  }

  const token = await issueToken(env, realm, user, 43200); // 12h
  return new Response(JSON.stringify({ ok: true, token, user, realm }), { status: 200, headers: jsonHeaders });
}

export async function onRequest({ request, env }) {
  if (request.method === 'POST') return onRequestPost({ request, env });
  return new Response(JSON.stringify({ ok: false, error: 'method' }), { status: 405, headers: jsonHeaders });
}
