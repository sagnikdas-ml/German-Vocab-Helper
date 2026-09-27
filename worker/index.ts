interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  PORTAL_PASSWORD: string;
  SESSION_SECRET: string;
  APPS_SCRIPT_URL: string;
  APPS_SCRIPT_TOKEN: string;
}
const cookieName = 'wortwerk_session';
const sessionMs = 12 * 60 * 60 * 1000;
const encoder = new TextEncoder();
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
function configured(env: Env) {
  return Boolean(env.PORTAL_PASSWORD && env.SESSION_SECRET && env.APPS_SCRIPT_URL && env.APPS_SCRIPT_TOKEN);
}
async function signature(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
function equal(a: string, b: string) {
  const x = encoder.encode(a), y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
function cookie(request: Request) {
  return (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
}
async function authorized(request: Request, env: Env) {
  const [expires, mac] = cookie(request).split('.');
  if (!expires || !mac || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return equal(mac, await signature(env.SESSION_SECRET, expires));
}
function sessionCookie(request: Request, value: string, age: number) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure}`;
}
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
async function upstream(env: Env, payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ ...payload, token: env.APPS_SCRIPT_TOKEN }), redirect: 'follow', signal: controller.signal,
    });
    const text = await response.text();
    const data = JSON.parse(text);
    if (!response.ok || !data || typeof data !== 'object') throw new Error('Storage service returned an invalid response.');
    return data;
  } finally { clearTimeout(timeout); }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!configured(env)) return json({ error: 'Server setup is incomplete. Add the four required Cloudflare secrets.' }, 503);
    if (request.method !== 'GET' && !sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
    if (url.pathname === '/api/auth') {
      if (request.method === 'GET') return (await authorized(request, env)) ? json({ authenticated: true }) : json({ authenticated: false }, 401);
      if (request.method === 'DELETE') return json({ authenticated: false }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) });
      if (request.method === 'POST') {
        let password = '';
        try { password = String((await request.json() as { password?: string }).password || ''); } catch { return json({ error: 'Invalid request.' }, 400); }
        if (!equal(password, env.PORTAL_PASSWORD)) return json({ error: 'Incorrect password.' }, 401);
        const expires = String(Date.now() + sessionMs);
        const token = `${expires}.${await signature(env.SESSION_SECRET, expires)}`;
        return json({ authenticated: true }, 200, { 'Set-Cookie': sessionCookie(request, token, sessionMs / 1000) });
      }
      return json({ error: 'Method not allowed.' }, 405);
    }
    if (!(await authorized(request, env))) return json({ error: 'Please unlock your vocabulary first.' }, 401);
    if (url.pathname !== '/api/entries') return json({ error: 'Not found.' }, 404);
    let payload: Record<string, unknown>;
    if (request.method === 'GET') payload = { action: 'list' };
    else if (request.method === 'POST') {
      try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: 'Invalid request.' }, 400); }
      if (!['create', 'update', 'practice', 'history', 'delete'].includes(String(payload.action))) return json({ error: 'Unsupported action.' }, 400);
    } else return json({ error: 'Method not allowed.' }, 405);
    try {
      const result = await upstream(env, payload);
      return json(result, result.ok ? 200 : 400);
    } catch {
      return json({ error: 'Could not reach Google Sheets. Please try again.' }, 502);
    }
  },
};
