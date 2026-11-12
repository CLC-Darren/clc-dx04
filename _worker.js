/*
  CLC DX04 總控台 - 轉送 Worker（Cloudflare Pages Advanced mode）
  讓各分站掛在 DX04 同一個網域底下，PWA 才會把它們視為同一個 App：
    /ya/*  → https://clc-ya-portal.pages.dev/*
    /sr/*  → https://clc-sr-portal.pages.dev/*
    /api/site-info → 讀取任一網站的名稱與 App 圖示（見下方）
    其他   → DX04 自己的靜態檔
  轉送時會拿掉 /ya、/sr 前綴，分站自己的 _worker.js（/api/...）不用修改。
  新增分站時只要在 SITES 加一筆。
*/

const SITES = {
  ya: 'https://clc-ya-portal.pages.dev',
  sr: 'https://clc-sr-portal.pages.dev'
};

function matchSite(pathname) {
  const m = pathname.match(/^\/([a-z0-9-]+)(\/.*)?$/i);
  if (!m) return null;
  const key = m[1].toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(SITES, key)) return null;
  return { key, prefix: '/' + key, rest: m[2] || '' };
}

// 分站回應的轉址（例如 Cloudflare Pages 把 /venue.html 轉成 /venue）改寫回 DX04 底下，避免跳出 DX04。
function rewriteLocation(location, upstreamUrl, prefix, ownOrigin) {
  let target;
  try { target = new URL(location, upstreamUrl); } catch (_) { return location; }
  if (target.origin !== new URL(upstreamUrl).origin) return location; // 外部網址（例如 Google 登入）照舊
  return ownOrigin + prefix + target.pathname + target.search + target.hash;
}

async function proxy(request, site, url) {
  const upstreamBase = SITES[site.key];
  const upstreamUrl = upstreamBase + site.rest + url.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  // 分站的上傳 API 會檢查 Origin 必須是自己的網域；從 DX04 發出的請求視同分站本身。
  if (headers.get('origin') === url.origin) headers.set('origin', upstreamBase);

  const init = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;

  const upstream = await fetch(upstreamUrl, init);

  const location = upstream.headers.get('location');
  if (!location) return injectSso(upstream, site.key);

  const outHeaders = new Headers(upstream.headers);
  outHeaders.set('location', rewriteLocation(location, upstreamUrl, site.prefix, url.origin));
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders
  });
}

// 分站的 HTML 頁面自動插入 DX04 單一登入程式（/clc-sso.js），分站程式不用修改。
function injectSso(res, key) {
  const type = res.headers.get('content-type') || '';
  if (res.status !== 200 || type.indexOf('text/html') === -1 || typeof HTMLRewriter === 'undefined') return res;
  return new HTMLRewriter().on('head', {
    element(el) { el.append(`<script src="/clc-sso.js" data-clc-site="${key}" defer></script>`, { html: true }); }
  }).transform(res);
}

/* ---------- /api/site-info：讀取任一網站的名稱與 App 圖示（總控台「分站入口」新增時使用） ----------
  瀏覽器因 CORS 不能直接讀別的網站，所以由這裡代讀。順序和手機「加入主畫面」相同：
  manifest 圖示 → apple-touch-icon → 其他 icon → 網站根目錄常見檔名 → Google 圖示服務。
  另回傳 embeddable：對方網站是否允許被 DX04 內嵌（不允許的網站在總控台會直接開新分頁）。
  只接受 http(s) 公開網址；讀取有大小與時間上限；結果快取 1 天。 */
const SITE_INFO_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 CLC-DX04';

function siteInfoAllowed(u) {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h.startsWith('[') || h === 'localhost') return false;
  if (/\.(localhost|local|internal|lan|home|corp)$/.test(h)) return false;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
  }
  return true;
}

async function siteInfoFetch(url, ms, accept) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': SITE_INFO_UA, 'accept': accept, 'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8' }
    });
  } finally { clearTimeout(timer); }
}

async function siteInfoText(res, max) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '', size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    out += decoder.decode(value, { stream: true });
  }
  try { reader.cancel(); } catch (_) {}
  return out;
}

function siteInfoDecode(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k[0] === '#') { const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); try { return String.fromCodePoint(n); } catch (_) { return m; } }
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[k] || m;
  });
}

function siteInfoAttrs(tag) {
  const out = {};
  const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = siteInfoDecode(m[3] ?? m[4] ?? m[5] ?? '');
  return out;
}

function siteInfoSize(sizes, href) {
  const s = String(sizes || '').toLowerCase();
  if (s.includes('any') || /\.svg(\?|#|$)/i.test(href || '')) return 1024;
  let best = 0;
  s.split(/\s+/).forEach(p => { const m = p.match(/^(\d+)x(\d+)$/); if (m) best = Math.max(best, Number(m[1])); });
  return best;
}

function siteInfoParseHtml(html, base) {
  const head = html.slice(0, 400000);
  const info = { links: [], meta: {}, title: '', manifest: '' };
  const abs = (h) => { try { return new URL(h, base).href; } catch (_) { return ''; } };
  let baseHref = base;
  const baseTag = head.match(/<base\b[^>]*>/i);
  if (baseTag) { const b = siteInfoAttrs(baseTag[0]).href; if (b) baseHref = abs(b) || base; }
  const absB = (h) => { try { return new URL(h, baseHref).href; } catch (_) { return ''; } };
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = siteInfoAttrs(m[0]);
    const rel = String(a.rel || '').toLowerCase().split(/\s+/);
    if (!a.href) continue;
    if (rel.includes('manifest')) { if (!info.manifest) info.manifest = absB(a.href); continue; }
    if (rel.includes('mask-icon')) continue;
    const kind = rel.some(r => r.startsWith('apple-touch-icon')) ? 'apple' : (rel.includes('icon') ? 'icon' : '');
    if (!kind) continue;
    const href = absB(a.href);
    if (href) info.links.push({ kind, href, size: siteInfoSize(a.sizes, href) || (kind === 'apple' ? 180 : 32) });
  }
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = siteInfoAttrs(m[0]);
    const key = String(a.property || a.name || '').toLowerCase();
    if (key && a.content && !info.meta[key]) info.meta[key] = a.content.trim();
  }
  const t = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) info.title = siteInfoDecode(t[1]).replace(/\s+/g, ' ').trim();
  return info;
}

function siteInfoCleanName(s) {
  let n = String(s || '').replace(/\s+/g, ' ').trim();
  const parts = n.split(/\s*[|｜–—·]\s*|\s+-\s+/).filter(Boolean);
  if (parts.length > 1 && parts[0].length >= 2) n = parts[0];
  return n.slice(0, 30);
}

// 判斷網站是否允許被 DX04 內嵌（iframe）：看 CSP frame-ancestors，沒有的話看 X-Frame-Options。
function siteInfoSourceMatches(src, origin) {
  const s = src.trim().replace(/^'|'$/g, '').toLowerCase();
  if (!s) return false;
  if (s === '*') return true;
  const o = new URL(origin);
  if (/^[a-z][a-z0-9+.-]*:$/.test(s)) return s === o.protocol;
  const m = s.match(/^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^/:]+)(?::(\d+|\*))?/);
  if (!m) return false;
  if (m[1] && m[1] + ':' !== o.protocol) return false;
  if (!m[1] && o.protocol !== 'https:' && o.protocol !== 'http:') return false;
  const host = o.hostname.toLowerCase();
  if (m[2]) return host.endsWith('.' + m[3]);
  return host === m[3];
}
function siteInfoEmbeddable(headers, pageOrigin, ancestorOrigin) {
  const csp = headers.get('content-security-policy') || '';
  let governed = false, allowed = true;
  csp.split(',').forEach(policy => {
    const dir = policy.split(';').map(d => d.trim()).find(d => /^frame-ancestors(\s|$)/i.test(d));
    if (!dir) return;
    governed = true;
    const sources = dir.split(/\s+/).slice(1);
    const ok = sources.some(src => {
      const v = src.toLowerCase();
      if (v === "'none'") return false;
      if (v === "'self'") return pageOrigin === ancestorOrigin;
      return siteInfoSourceMatches(src, ancestorOrigin);
    });
    if (!ok) allowed = false;
  });
  if (governed) return allowed;
  const xfo = (headers.get('x-frame-options') || '').trim().toLowerCase();
  if (!xfo) return true;
  if (xfo === 'sameorigin') return pageOrigin === ancestorOrigin;
  return false;
}

async function siteInfoIsImage(url) {
  try {
    const res = await siteInfoFetch(url, 5000, 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8');
    const type = (res.headers.get('content-type') || '').toLowerCase();
    try { if (res.body) res.body.cancel(); } catch (_) {}
    return res.ok && (type.startsWith('image/') ||
      (type.includes('octet-stream') && /\.(png|ico|jpe?g|webp|svg|gif)(\?|$)/i.test(url)));
  } catch (_) { return false; }
}

async function siteInfo(target, ancestorOrigin) {
  const page = await siteInfoFetch(target.href, 8000, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5');
  const finalUrl = page.url || target.href;
  const final = new URL(finalUrl);
  const type = (page.headers.get('content-type') || '').toLowerCase();
  const html = page.ok && (type.includes('html') || !type) ? await siteInfoText(page, 600000) : '';
  const info = siteInfoParseHtml(html, finalUrl);
  const embeddable = page.ok ? siteInfoEmbeddable(page.headers, final.origin, ancestorOrigin) : false;

  let manifest = null;
  const manifestUrl = info.manifest || '';
  if (manifestUrl) {
    try {
      const r = await siteInfoFetch(manifestUrl, 5000, 'application/manifest+json,application/json;q=0.9,*/*;q=0.5');
      if (r.ok) manifest = JSON.parse(await siteInfoText(r, 200000));
    } catch (_) { manifest = null; }
  }

  const candidates = [];
  const add = (href) => { if (href && !candidates.includes(href)) candidates.push(href); };
  const mIcons = (manifest && Array.isArray(manifest.icons) ? manifest.icons : [])
    .filter(i => i && typeof i.src === 'string')
    .map(i => {
      let href = ''; try { href = new URL(i.src, manifestUrl).href; } catch (_) {}
      const purpose = String(i.purpose || 'any').toLowerCase();
      return { href, size: siteInfoSize(i.sizes, i.src), any: purpose.split(/\s+/).includes('any') };
    })
    .filter(i => i.href);
  mIcons.filter(i => i.any).sort((a, b) => b.size - a.size).forEach(i => add(i.href));
  info.links.filter(l => l.kind === 'apple').sort((a, b) => b.size - a.size).forEach(l => add(l.href));
  mIcons.filter(i => !i.any).sort((a, b) => b.size - a.size).forEach(i => add(i.href));
  info.links.filter(l => l.kind === 'icon' && l.size >= 64).sort((a, b) => b.size - a.size).forEach(l => add(l.href));
  add(final.origin + '/apple-touch-icon.png');
  info.links.filter(l => l.kind === 'icon' && l.size < 64).sort((a, b) => b.size - a.size).forEach(l => add(l.href));
  add(final.origin + '/favicon.ico');

  let icon = '';
  for (const c of candidates.slice(0, 8)) {
    let ok = false;
    try { ok = siteInfoAllowed(new URL(c)) && await siteInfoIsImage(c); } catch (_) { ok = false; }
    if (ok) { icon = c; break; }
  }
  if (!icon) icon = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(final.hostname) + '&sz=128';

  const m = info.meta;
  const name = siteInfoCleanName(
    (manifest && (manifest.short_name || manifest.name)) ||
    m['application-name'] || m['apple-mobile-web-app-title'] || m['og:site_name'] ||
    info.title || final.hostname.replace(/^www\./, '')
  );
  return { ok: true, url: finalUrl, name, icon, embeddable };
}

async function handleSiteInfo(request, ctx) {
  const json = (body, status = 200, cache = 'no-store') => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache }
  });
  if (request.method !== 'GET') return json({ ok: false, error: 'method' }, 405);
  const reqUrl = new URL(request.url);
  let raw = (reqUrl.searchParams.get('url') || '').trim();
  if (raw && !/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let target;
  try { target = new URL(raw); } catch (_) { return json({ ok: false, error: '網址格式不正確' }, 400); }
  if (!siteInfoAllowed(target)) return json({ ok: false, error: '只接受公開的 http(s) 網址' }, 400);
  target.hash = '';

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(reqUrl.origin + '/api/site-info?v=2&url=' + encodeURIComponent(target.href));
  if (cache) { const hit = await cache.match(cacheKey); if (hit) return hit; }
  try {
    const out = json(await siteInfo(target, reqUrl.origin), 200, 'public, max-age=86400');
    if (cache && ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  } catch (err) {
    return json({ ok: false, error: '讀取不到這個網站', url: target.href, name: target.hostname.replace(/^www\./, ''), embeddable: false }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/site-info') return handleSiteInfo(request, ctx);
    const site = matchSite(url.pathname);

    if (site) {
      // /ya → /ya/，相對路徑才會正確。
      if (site.rest === '') {
        return Response.redirect(url.origin + site.prefix + '/' + url.search, 301);
      }
      return proxy(request, site, url);
    }

    if (env.ASSETS && env.ASSETS.fetch) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not found', { status: 404 });
  }
};
