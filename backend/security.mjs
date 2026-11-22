export const now = () => Math.floor(Date.now() / 1000);
export function token(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), n => n.toString(16).padStart(2, '0')).join('');
}
export async function hash(value) {
  const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(data), n => n.toString(16).padStart(2, '0')).join('');
}
export class HttpError extends Error { constructor(status, code) { super(code); this.status = status; } }
export function assert(condition, status, code) { if (!condition) throw new HttpError(status, code); }
export function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff', ...extra
  }});
}
export function origin(env) {
  const value = new URL(env.SITE_ORIGIN);
  assert(value.protocol === 'https:' && value.origin === env.SITE_ORIGIN, 503, 'invalid_site_origin');
  return value.origin;
}
export function sameOrigin(request, env) {
  assert(request.headers.get('Origin') === origin(env), 403, 'origin_rejected');
}
export async function body(request, max = 4096) {
  assert(request.headers.get('Content-Type')?.startsWith('application/json'), 415, 'json_required');
  const text = await boundedText(request, max);
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'invalid_json'); }
}
export async function boundedText(request, max) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  let size=0; const chunks=[];
  for (;;) {
    const {done,value}=await reader.read(); if(done) break;
    size+=value.byteLength;
    if(size>max) { await reader.cancel(); throw new HttpError(413,'body_too_large'); }
    chunks.push(value);
  }
  const all=new Uint8Array(size); let offset=0;
  for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder('utf-8',{fatal:true}).decode(all);
}
export async function rate(env, key, max, seconds=60) {
  const bucket=Math.floor(now()/seconds);
  const result=await env.DB.prepare(`INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits`).bind(await hash(`${key}:${bucket}`),(bucket+2)*seconds).first();
  assert(result.hits<=max,429,'rate_limited');
}
