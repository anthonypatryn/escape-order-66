// Private site (Vercel Routing Middleware): everything — the page, art, sounds, /api — sits behind one password, set
// in Vercel as SITE_PASSWORD. No password set = the site is open (so nothing breaks before it's configured).
// Friends type the password once (remembered for a year), or get a link with it: https://…/?key=PASSWORD
// Runs only on Vercel (not in `npm run dev`).
export const config = { matcher: '/:path*' };

const COOKIE = 'eo-pass';
// the home-screen icon + favicon stay public: iOS fetches them without the sign-in cookie
const OPEN = /^\/(favicon\.png|apple-touch-icon(-precomposed)?\.png|manifest\.webmanifest|icons\/[\w-]+\.png)$/;
const YEAR = 365 * 86400;

async function token(pass) {
  const data = new TextEncoder().encode(`escape-order-66:${pass}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const readCookie = (req, name) => (req.headers.get('cookie') ?? '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1];
const setCookie = (value) => `${COOKIE}=${value}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`;

export default async function middleware(request) {
  const pass = (process.env.SITE_PASSWORD ?? '').trim();
  if (!pass) return; // not configured: open
  const url = new URL(request.url);
  if (OPEN.test(url.pathname)) return;
  const good = await token(pass);

  // the login form posts here
  if (url.pathname === '/__login' && request.method === 'POST') {
    const form = await request.formData();
    const ok = String(form.get('password') ?? '').trim() === pass;
    const back = String(form.get('next') ?? '/');
    if (!ok) return page(back, true);
    return new Response(null, { status: 303, headers: { Location: back.startsWith('/') ? back : '/', 'Set-Cookie': setCookie(good) } });
  }
  // a link with the password in it: remember it, then drop it from the address
  if (url.searchParams.get('key')) {
    const ok = url.searchParams.get('key').trim() === pass;
    url.searchParams.delete('key');
    if (ok) return new Response(null, { status: 303, headers: { Location: url.pathname + url.search, 'Set-Cookie': setCookie(good) } });
  }
  if (readCookie(request, COOKIE) === good) return; // signed in: carry on
  if (url.pathname.startsWith('/api/') || /\.\w+$/.test(url.pathname)) return new Response('Private', { status: 401 });
  return page(url.pathname + url.search, false);
}

function page(next, wrong) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Escape Order 66</title><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="icon" href="/favicon.png">
<meta name="apple-mobile-web-app-title" content="Order 66"><meta name="theme-color" content="#05070d"><style>
html,body{margin:0;height:100%;background:#05070d;color:#e9eef7;font-family:system-ui,"Segoe UI",sans-serif}
body{display:grid;place-items:center;background:radial-gradient(120% 90% at 50% 40%,#0c1426,#05070d 70%)}
form{width:min(360px,88vw);padding:28px;border-radius:18px;background:rgba(12,18,30,.85);box-shadow:0 20px 60px rgba(0,0,0,.6),inset 0 0 0 1px rgba(160,200,255,.13);text-align:center}
h1{margin:0 0 4px;font-size:30px;color:#ffe14d;letter-spacing:.04em;text-transform:uppercase;font-weight:900}
p{margin:0 0 18px;color:rgba(220,230,245,.62)}
input{width:100%;box-sizing:border-box;font:inherit;font-size:18px;padding:11px 12px;border:0;border-radius:10px;background:rgba(255,255,255,.08);color:#fff;box-shadow:inset 0 0 0 1px rgba(160,200,255,.2)}
button{margin-top:12px;width:100%;font:inherit;font-weight:700;font-size:17px;padding:11px;border:0;border-radius:10px;color:#fff;background:linear-gradient(#3aa0ff,#1660d0);cursor:pointer}
.err{color:#ff8a80;margin:10px 0 0}
</style></head><body><form method="post" action="/__login">
<h1>Escape Order 66</h1><p>This game is private. Enter the password.</p>
<input type="password" name="password" autofocus autocomplete="current-password" aria-label="Password">
<input type="hidden" name="next" value="${esc(next)}">
<button type="submit">Enter</button>${wrong ? '<p class="err">That’s not it.</p>' : ''}
</form></body></html>`;
  return new Response(html, { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
