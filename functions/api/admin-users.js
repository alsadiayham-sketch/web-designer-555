import { getUsers, verifyToken, jsonHeaders } from './_auth.js';

const enc = new TextEncoder();

function response(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: jsonHeaders });
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), function (value) {
    return value.toString(16).padStart(2, '0');
  }).join('');
}

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: Uint8Array.from(saltHex.match(/.{2}/g).map(function (value) { return parseInt(value, 16); })), iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  return toHex(bits);
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function safeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

export async function onRequestPost({ request, env }) {
  const data = await request.json().catch(function () { return {}; });
  const tokenUser = await verifyToken(env, data.token, 'notes');
  if (!tokenUser) return response({ ok: false, error: 'unauthorized' }, 401);
  if (!env.AUTH_USERS_KV || typeof env.AUTH_USERS_KV.put !== 'function') {
    return response({ ok: false, error: 'kv_not_configured' }, 503);
  }

  const users = await getUsers(env, 'notes');
  const action = String(data.action || '');
  const username = safeUsername(data.username);
  const existingIndex = users.findIndex(function (user) { return safeUsername(user.u) === username; });

  if (action === 'list') {
    return response({ ok: true, users: users.map(function (user) { return { username: user.u, active: user.active !== false }; }) });
  }

  if (!username || (action !== 'delete' && String(data.password || '').length < 8)) {
    return response({ ok: false, error: 'invalid_input' }, 400);
  }

  if (action === 'delete') {
    if (username === safeUsername(tokenUser.u)) return response({ ok: false, error: 'cannot_delete_self' }, 400);
    if (existingIndex < 0) return response({ ok: false, error: 'not_found' }, 404);
    users.splice(existingIndex, 1);
  } else {
    const salt = randomSalt();
    const entry = { u: username, s: salt, h: await hashPassword(String(data.password), salt), active: true };
    if (existingIndex >= 0) users[existingIndex] = Object.assign({}, users[existingIndex], entry);
    else users.push(entry);
  }

  await env.AUTH_USERS_KV.put('realm:notes', JSON.stringify(users));
  return response({ ok: true });
}

export async function onRequest({ request, env }) {
  if (request.method === 'POST') return onRequestPost({ request, env });
  return response({ ok: false, error: 'method' }, 405);
}
