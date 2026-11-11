/*
  CLC DX04 總控台 - 轉送 Worker（Cloudflare Pages Advanced mode）
  讓各分站掛在 DX04 同一個網域底下，PWA 才會把它們視為同一個 App：
    /ya/*  → https://clc-ya-portal.pages.dev/*
    /sr/*  → https://clc-sr-portal.pages.dev/*
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
