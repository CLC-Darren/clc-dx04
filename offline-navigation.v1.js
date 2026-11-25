/* CLC 第一階段離線導覽。各站部署同一份版本。 */
function installOfflineNavigation(config) {
  const base = new URL('./', self.registration.scope);
  const urlFor = path => new URL(path, base).href;
  const prefix = 'clc-offline-' + base.pathname + '-';
  const cacheName = prefix + config.version;
  const assets = new Map((config.assets || []).map(path => [urlFor(path), path]));

  self.addEventListener('install', event => {
    event.waitUntil((async () => {
      const cache = await caches.open(cacheName);
      await Promise.all([...assets.keys()].map(async url => {
        const response = await fetch(url, { cache: 'reload', credentials: 'omit', redirect: 'error' });
        if (!response.ok || !/javascript/.test(response.headers.get('content-type') || '')) {
          throw new Error('無法下載離線程式：' + url);
        }
        await cache.put(url, response);
      }));
      await self.skipWaiting();
    })());
  });

  self.addEventListener('activate', event => {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)));
      await self.clients.claim();
    })());
  });

  self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    if (assets.has(url.href) && request.destination === 'script') {
      event.respondWith(fetch(request).catch(async () => {
        const cache = await caches.open(cacheName);
        return await cache.match(url.href) || Response.error();
      }));
      return;
    }
    if (request.mode !== 'navigate' || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
    const path = url.pathname.slice(base.pathname.length);
    const section = path.split('/')[0];
    if (/^(api|__|admin)/i.test(section) || (config.exclude || []).includes(section)) return;

    event.respondWith((async () => {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 5000);
      try {
        const online = await fetch(request, { signal: abort.signal });
        if (online.status < 500) return online;
      } catch (_) {
        // 網路失敗時提供離線入口。
      } finally {
        clearTimeout(timer);
      }

      const entrance = /^(index(?:\.html)?)?$/.test(path);
      const family = config.family && entrance;
      const retry = urlFor('./');
      const lfOrigin = 'https://linfamily.pages.dev';
      const dxOrigin = 'https://clc-dx04.pages.dev';
      const familyHome = base.origin === dxOrigin ? dxOrigin + '/lf/' : lfOrigin + '/';
      let home = config.family ? retry : familyHome;
      if (!config.family) {
        const requested = url.searchParams.get('lfhome');
        try {
          const target = new URL(requested);
          if (target.origin === lfOrigin && /^\/(?:index(?:\.html)?)?$/.test(target.pathname)) home = lfOrigin + '/';
          if (target.origin === dxOrigin && /^\/lf(?:\/(?:index(?:\.html)?)?)?$/.test(target.pathname)) home = dxOrigin + '/lf/';
        } catch (_) {}
      }
      const scripts = family ? [...assets.keys()].map(src => '<script defer src="' + src + '"></script>').join('') : '';
      const homeLink = family ? '' : '<p><a id="offline-home" href="' + home + '">🏠 回 LinFamily 首頁</a></p>';
      const retryLink = entrance ? '' : '<p><a href="' + retry + '">回本站入口</a></p>';
      const sessionHome = config.family || url.searchParams.has('lfhome') ? '' :
        `<script>try{const h=sessionStorage.getItem('lfHome');if(['https://linfamily.pages.dev/','https://clc-dx04.pages.dev/lf/'].includes(h))document.getElementById('offline-home').href=h}catch(_){}</script>`;
      return new Response(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">
<title>${config.title} · 離線</title><style>body{font:16px system-ui;margin:2rem auto;padding:0 1rem;max-width:42rem}li{margin:.7rem 0}</style>
<main><h1>${config.title}</h1><p>${entrance ? '目前無法連線。恢復連線後請重新整理。' : '這個頁面目前無法離線開啟。'}</p>
${family ? '<section id="offline-desktop" hidden><h2>上次的 App 清單</h2><ul id="offline-apps"></ul></section>' : ''}
${homeLink}${retryLink}</main>${sessionHome}${scripts}</html>`, {
        status: entrance ? 200 : 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    })());
  });
}
