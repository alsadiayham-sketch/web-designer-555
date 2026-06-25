// Server-side auth helpers (run only on Cloudflare, never shipped to the client).
// Credentials live in the AUTH_USERS / AUTH_SECRET environment secrets — not in
// client code and not in the public repo.

const enc = new TextEncoder();

function toHex(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function b64urlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

// Constant-time string compare.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2Hex(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations: iterations || 100000, hash: 'SHA-256' },
    key, 256
  );
  return toHex(bits);
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return toHex(sig);
}

function parseUsers(env) {
  try { return JSON.parse(env.AUTH_USERS || '{}'); } catch { return {}; }
}

// Verify username+password for a realm. Returns the matched username or null.
async function verifyCredential(env, realm, username, password) {
  const table = parseUsers(env);
  const users = table[realm];
  if (!Array.isArray(users)) return null;
  const uname = String(username || '').toLowerCase().trim();
  const match = users.find(u => String(u.u).toLowerCase() === uname);
  // Always run a PBKDF2 to keep timing roughly uniform whether or not the user exists.
  const target = match || { s: '00'.repeat(16), h: '' };
  const computed = await pbkdf2Hex(String(password || ''), target.s, 100000);
  if (match && safeEqual(computed, match.h)) return match.u;
  return null;
}

// Issue a signed session token: base64url(payload).hmac
async function issueToken(env, realm, username, ttlSeconds) {
  const payload = { u: username, r: realm, exp: Date.now() + (ttlSeconds || 43200) * 1000 };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacHex(env.AUTH_SECRET, body);
  return body + '.' + sig;
}

// Validate a token's signature + expiry. Returns payload or null.
async function verifyToken(env, token, realm) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  const expected = await hmacHex(env.AUTH_SECRET, body);
  if (!safeEqual(sig, expected)) return null;
  let payload;
  try { payload = JSON.parse(b64urlDecode(body)); } catch { return null; }
  if (!payload || payload.exp < Date.now()) return null;
  if (realm && payload.r !== realm) return null;
  return payload;
}

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export { verifyCredential, issueToken, verifyToken, jsonHeaders };
