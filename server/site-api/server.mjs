// wgdively.com site API. One small service, no dependencies, runs on the official
// node:24-alpine image behind the site's Caddy web server. It does two jobs:
//
// 1. Downloads:  GET /get/<repo>/<tag>/<file>
//    Streams a GitHub release file to the visitor under a wgdively.com address, so the
//    browser saves it straight away and never visits GitHub. Nothing is stored on the
//    server: each download is passed through as it arrives. Only release files from
//    the repos in DOWNLOAD_REPOS can be fetched.
//
// 2. Contact form:  POST /api/contact
//    Checks the message isn't from a bot (Cloudflare Turnstile) and emails it to the
//    site owner through Resend.
//
// Settings come from environment variables, kept in site-api.env on the server and
// never in this public repo:
//   RESEND_API_KEY    re_...   Resend API key with "Sending access" only
//   MAIL_FROM         "wgdively, inc. <contact@mail.wgdively.com>"   (on a verified Resend domain)
//   MAIL_TO           admin@wgdively.com
//   TURNSTILE_SECRET  0x...    Turnstile secret key; when set, every message must pass the check
//   ALLOWED_ORIGINS   https://wgdively.com,https://www.wgdively.com,https://preview.wgdively.com
//   DOWNLOAD_OWNER    dslayer6989
//   DOWNLOAD_REPOS    NuvioDesktop,NuvioMobile,NuvioTV,NuvioTVSmart,NuvioTVSmart-Installer
//   MAX_DOWNLOADS     24       downloads allowed at the same time
//   PORT              8787
// Downloads work even before the email settings are filled in.
import http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const env = process.env;
const PORT = Number(env.PORT || 8787);
const list = (v, d) => (v || d).split(',').map(s => s.trim()).filter(Boolean);
const ORIGINS = list(env.ALLOWED_ORIGINS, 'https://wgdively.com,https://www.wgdively.com,https://preview.wgdively.com');
const OWNER = env.DOWNLOAD_OWNER || 'dslayer6989';
const REPOS = list(env.DOWNLOAD_REPOS, 'NuvioDesktop,NuvioMobile,NuvioTV,NuvioTVSmart,NuvioTVSmart-Installer');
const MAX_DOWNLOADS = Number(env.MAX_DOWNLOADS || 24);
const REASONS = ['Nuvio help', 'Bug report', 'IT or homelab help', 'Work enquiry', 'Website feedback', 'Something else'];
const MAIL_READY = ['RESEND_API_KEY', 'MAIL_FROM', 'MAIL_TO'].every(k => env[k]);
if (!MAIL_READY) console.warn('Email settings are missing in site-api.env: the contact form is OFF (downloads still work).');
else if (!env.TURNSTILE_SECRET) console.warn('TURNSTILE_SECRET is not set: the contact form bot check is OFF.');

const stamp = () => new Date().toISOString();
const clean = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const oneLine = (v, max) => clean(v, max).replace(/\s+/g, ' ');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clientIp = req => oneLine(req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress, 64);

function send(res, status, body, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (origin && ORIGINS.includes(origin)) { headers['Access-Control-Allow-Origin'] = origin; headers['Vary'] = 'Origin'; }
  res.writeHead(status, headers); res.end(JSON.stringify(body));
}

/* ---------- Downloads ---------- */

const TAG = /^[\w.\-]{1,100}$/;
const FILE = /^[\w.\-+ ()]{1,200}$/;
const TYPES = {
  apk: 'application/vnd.android.package-archive', msi: 'application/x-msi', exe: 'application/vnd.microsoft.portable-executable',
  zip: 'application/zip', dmg: 'application/x-apple-diskimage', wgt: 'application/widget', gz: 'application/gzip',
};
let active = 0;

function sorry(res, status, title, text, extra = {}) {
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · wgdively, inc.</title><meta name="robots" content="noindex">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#141413;color:#ecebe6;font:16px/1.5 system-ui,sans-serif;padding:24px}main{max-width:32rem}h1{font-size:1.4rem}a{color:#ffb000}@media(prefers-color-scheme:light){body{background:#f7f5ef;color:#1d1c19}a{color:#8a5200}}</style></head>
<body><main><h1>${esc(title)}</h1><p>${esc(text)}</p><p><a href="/downloads/">Go to all downloads</a></p></main></body></html>`;
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(page);
}

async function download(req, res, rest) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sorry(res, 405, 'Not allowed', 'Downloads only work with a normal link.', { Allow: 'GET, HEAD' });
  let parts;
  try { parts = rest.split('/').map(decodeURIComponent); } catch { parts = []; }
  const [repo, tag, file] = parts;
  if (parts.length !== 3 || !REPOS.includes(repo) || !TAG.test(tag) || !FILE.test(file) || file.startsWith('.')) {
    return sorry(res, 404, 'That download link isn\u2019t valid', 'The link or QR code may be incomplete. Pick your file from the downloads page instead.');
  }
  if (active >= MAX_DOWNLOADS) return sorry(res, 503, 'Busy right now', 'Lots of people are downloading at the moment. Please try again in a minute.', { 'Retry-After': '30' });

  active++;
  let released = false;
  const release = () => { if (!released) { released = true; active--; } };
  const ac = new AbortController();
  res.on('close', () => { release(); ac.abort(); });

  const url = `https://github.com/${OWNER}/${encodeURIComponent(repo)}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(file)}`;
  const headers = { 'User-Agent': 'wgdively.com-downloads', Accept: 'application/octet-stream' };
  const range = req.headers.range;
  if (range && /^bytes=\d*-\d*$/.test(range)) headers.Range = range; // lets interrupted downloads resume

  try {
    const up = await fetch(url, { method: req.method, headers, redirect: 'follow', signal: ac.signal });
    if (up.status === 404) { release(); return sorry(res, 404, 'That file isn\u2019t available any more', 'It may have been replaced by a newer version. Pick your file from the downloads page.'); }
    if (up.status === 416) { release(); res.writeHead(416, { 'Content-Range': up.headers.get('content-range') || '' }); return res.end(); }
    if (up.status !== 200 && up.status !== 206) throw new Error(`GitHub answered ${up.status}`);

    const ext = (file.split('.').pop() || '').toLowerCase();
    const out = {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodeURIComponent(file)}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    };
    for (const h of ['content-length', 'content-range', 'last-modified', 'etag']) { const v = up.headers.get(h); if (v) out[h.replace(/(^|-)\w/g, m => m.toUpperCase())] = v; }
    res.writeHead(up.status, out);
    if (req.method === 'HEAD' || !up.body) { release(); return res.end(); }
    if (!range) console.log(`${stamp()} download: ${repo}/${tag}/${file} (${clientIp(req)})`);
    await pipeline(Readable.fromWeb(up.body), res);
  } catch (err) {
    if (ac.signal.aborted) return; // the visitor cancelled; nothing to do
    console.error(`${stamp()} download error ${repo}/${tag}/${file}:`, err.message);
    if (!res.headersSent) sorry(res, 502, 'The download couldn\u2019t start', 'GitHub didn\u2019t answer just now. Please try again in a minute.');
    else res.destroy();
  } finally { release(); }
}

/* ---------- Contact form ---------- */

// Simple per-IP limit: 5 messages per 15 minutes, 20 per day.
const hits = new Map();
function limited(ip) {
  const now = Date.now(), times = (hits.get(ip) || []).filter(t => now - t < 86400000);
  const recent = times.filter(t => now - t < 900000).length;
  if (recent >= 5 || times.length >= 20) { hits.set(ip, times); return true; }
  times.push(now); hits.set(ip, times); return false;
}
setInterval(() => { const now = Date.now(); for (const [ip, l] of hits) if (!l.some(t => now - t < 86400000)) hits.delete(ip); }, 3600000).unref();

const EMAIL = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const PHONE = /^[0-9+().\-\s]{7,25}$/;

async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 32768) throw Object.assign(new Error('too big'), { status: 413 }); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString('utf8');
  const type = (req.headers['content-type'] || '').split(';')[0].trim();
  if (type === 'application/json') return JSON.parse(raw || '{}');
  if (type === 'application/x-www-form-urlencoded') return Object.fromEntries(new URLSearchParams(raw));
  throw Object.assign(new Error('bad type'), { status: 415 });
}

async function turnstileOk(token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (ip) form.set('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, signal: AbortSignal.timeout(8000) });
  const data = await r.json().catch(() => ({}));
  return data.success === true;
}

async function mail({ name, email, phone, reason, message, ip, page }) {
  const when = new Date().toUTCString();
  const text = `New message from the wgdively.com contact form\n\nName:   ${name}\nEmail:  ${email}\nPhone:  ${phone || '(not given)'}\nReason: ${reason}\n\n${message}\n\n--\nSent ${when} from ${page || 'wgdively.com'} (IP ${ip || 'unknown'}). Reply to this email to answer ${name}.`;
  const row = (k, v) => `<tr><td style="padding:4px 12px 4px 0;color:#666;font:12px monospace;text-transform:uppercase">${k}</td><td style="padding:4px 0;font:15px sans-serif">${v}</td></tr>`;
  const html = `<div style="font-family:sans-serif;max-width:620px"><p style="font:12px monospace;color:#9a5b00;letter-spacing:.1em;text-transform:uppercase">wgdively.com contact form</p>
<table>${row('Name', esc(name))}${row('Email', `<a href="mailto:${esc(email)}">${esc(email)}</a>`)}${row('Phone', phone ? esc(phone) : '<span style="color:#999">not given</span>')}${row('Reason', esc(reason))}</table>
<div style="margin-top:16px;padding:16px;border-left:3px solid #ffb000;background:#f6f4ee;white-space:pre-wrap;font:15px/1.5 sans-serif">${esc(message)}</div>
<p style="color:#888;font-size:12px;margin-top:16px">Sent ${esc(when)} from ${esc(page || 'wgdively.com')} · IP ${esc(ip || 'unknown')}. Reply to this email to answer ${esc(name)}.</p></div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [env.MAIL_TO], reply_to: `${name.replace(/["<>]/g, '')} <${email}>`, subject: `[wgdively.com] ${reason}: ${name}`, text, html }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

async function contact(req, res) {
  const origin = req.headers.origin || '';
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' }); return res.end(); }
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Use POST.' });
  if (origin && !ORIGINS.includes(origin)) return send(res, 403, { ok: false, error: 'This form only works on wgdively.com.' });
  if (!MAIL_READY) return send(res, 503, { ok: false, error: 'The contact form isn\u2019t switched on yet. Please try again later.' }, origin);
  const ip = clientIp(req);
  try {
    const b = await readBody(req);
    if (clean(b.website, 200)) return send(res, 200, { ok: true }, origin); // honeypot: bots fill the hidden field
    const f = { name: oneLine(b.name, 100), email: oneLine(b.email, 200), phone: oneLine(b.phone, 25), reason: oneLine(b.reason, 60), message: clean(b.message, 5000), page: oneLine(b.page, 200) };
    const errors = {};
    if (f.name.length < 2) errors.name = 'Please enter your name.';
    if (!EMAIL.test(f.email)) errors.email = 'Please enter a valid email address.';
    if (f.phone && !PHONE.test(f.phone)) errors.phone = 'That phone number doesn\u2019t look right. You can leave it blank.';
    if (!REASONS.includes(f.reason)) errors.reason = 'Please pick a reason.';
    if (f.message.length < 10) errors.message = 'Please write a little more (at least 10 characters).';
    if (Object.keys(errors).length) return send(res, 422, { ok: false, error: 'Please fix the highlighted fields.', fields: errors }, origin);
    if (limited(ip)) return send(res, 429, { ok: false, error: 'Too many messages from your connection. Please try again later.' }, origin);
    if (!(await turnstileOk(oneLine(b['cf-turnstile-response'], 2048), ip))) return send(res, 403, { ok: false, error: 'The bot check didn\u2019t pass. Please reload the page and try again.' }, origin);
    await mail({ ...f, ip });
    console.log(`${stamp()} sent: ${f.reason} from ${f.email} (${ip})`);
    return send(res, 200, { ok: true }, origin);
  } catch (err) {
    console.error(`${stamp()} contact error:`, err.message);
    const status = err.status || (err instanceof SyntaxError ? 400 : 502);
    return send(res, status, { ok: false, error: status === 502 ? 'The message couldn\u2019t be sent just now. Please try again in a few minutes.' : 'That request wasn\u2019t understood.' }, origin);
  }
}

/* ---------- Router ---------- */

http.createServer((req, res) => {
  const path = new URL(req.url, 'http://local').pathname;
  if (path === '/api/health') return send(res, 200, { ok: true, downloads: true, contactForm: MAIL_READY, botCheck: !!env.TURNSTILE_SECRET, activeDownloads: active });
  if (path === '/api/contact') return contact(req, res);
  if (path.startsWith('/get/')) return download(req, res, path.slice(5));
  return send(res, 404, { ok: false, error: 'Not found.' });
}).listen(PORT, '0.0.0.0', () => console.log(`site API listening on :${PORT} (downloads on, contact form ${MAIL_READY ? 'on' : 'OFF'}, bot check ${env.TURNSTILE_SECRET ? 'on' : 'OFF'})`));
