/*
  CLC DX04 單一登入（SSO）
  - 在 DX04 用 Google 登入時，保存 Google 發的身分憑證（1 小時有效）。
  - 經 DX04 轉送的分站頁面（/ya/、/sr/…）會由 DX04 Worker 自動插入本檔：
      分站尚未登入且憑證有效 → 用分站自己的 Firebase 設定（分站根目錄的 clc-site.json）自動登入。
      分站登出 → 所有站一起登出。
  - 只在 clc-dx04.pages.dev 同網域下運作；單獨開分站原網址時不會載入本檔。
  - 分站需在自己的 Firebase：已授權網域加上 clc-dx04.pages.dev，Google 登入白名單加上 DX04 的用戶端 ID。
*/
(function () {
  'use strict';
  // 共用細捲軸：不預留空白邊條，App／全螢幕隱藏外觀但仍可捲動。
  if (!window.CLC_SCROLLBARS_INSTALLED && !document.getElementById('clc-scrollbar-loader')) {
    const scrollbarScript = document.createElement('script');
    scrollbarScript.id = 'clc-scrollbar-loader';
    scrollbarScript.src = 'https://linfamily.pages.dev/js/scrollbars.js?v=20261118-1';
    (document.head || document.documentElement).appendChild(scrollbarScript);
  }
  if (window.CLCSSO) return;

  const TOKEN_KEY = 'clc_sso_google';
  const AUTH_PREFIX = 'firebase:authUser:';
  const DB_NAME = 'firebaseLocalStorageDb';
  const STORE = 'firebaseLocalStorage';
  const FB = 'https://www.gstatic.com/firebasejs/10.8.0/';
  const DX04_API_KEY = 'AIzaSyDbLv-XgOD7Q3J_wl81eXOuK9rqNAdzxM8'; // 判斷 DX04 是否已登入（公開值）
  const script = document.currentScript;
  const siteKey = script && script.dataset ? (script.dataset.clcSite || '') : '';
  // 登入沿子樹向下同步。休眠與登出後的目的地由分頁入口決定。
  const SITES = {
    lf: { label: 'LinFamily', home: '/lf/', project: 'linfamily-31cb6',
      security: 'linfamily_settings/security', apiKey: 'AIzaSyBPcURIjgwtEVi_nTaZT569e_nwJb4IsUs' },
    dx: { label: 'DX', parent: 'lf', home: '/', project: 'clc-dx04',
      security: 'dx04_settings/security', apiKey: DX04_API_KEY },
    ya: { label: 'YA', parent: 'dx', home: '/ya/' },
    sr: { label: 'SR', parent: 'dx', home: '/sr/' }
  };
  const me = siteKey || 'dx';
  function readEntry() {
    if (me === 'lf') return { key: 'lf', home: SITES.lf.home };
    const url = new URL(location.href);
    const stored = key => { try { return sessionStorage.getItem(key); } catch (_) { return null; } };
    function lfHome(value) {
      if (!value) return '';
      try {
        const home = new URL(value);
        const proxyLF = home.origin === url.origin && /^\/lf(?:\/(?:index(?:\.html)?)?)?$/.test(home.pathname);
        const standaloneLF = home.origin === 'https://linfamily.pages.dev' && /^\/(?:index(?:\.html)?)?$/.test(home.pathname);
        if (proxyLF || standaloneLF) return home.origin + (proxyLF ? SITES.lf.home : '/');
      } catch (_) {}
      return '';
    }
    const home = lfHome(url.searchParams.get('lfhome')) || lfHome(stored('lfHome'));
    const prior = stored('clc_entry_site');
    const key = home ? 'lf' : Object.hasOwn(SITES, prior) ? prior : me;
    return { key, home: home || SITES[key].home };
  }
  const entry = readEntry();
  if (window.top === window) {
    try { sessionStorage.setItem('clc_entry_site', entry.key); } catch (_) {}
  }
  const entryURL = new URL(entry.home, location.href);
  const homeURL = entryURL.origin === location.origin ? entryURL.pathname : entryURL.href;
  function withEntry(href) {
    const url = new URL(href, location.href);
    if (entry.key === 'lf' && url.origin === location.origin && !/^\/lf(\/|$)/.test(url.pathname)) {
      url.searchParams.set('lfhome', entryURL.href);
    }
    return url.href;
  }
  // 留在網址裡，使手機重建頁面時仍能還原入口。舊分頁可從 sessionStorage 補回。
  if (window.top === window && me !== 'lf' && entry.key === 'lf') {
    try { history.replaceState(history.state, '', withEntry(location.href)); } catch (_) {}
  }
  // 已登入的小黃點不顯示（登入後圖示已經變成皇冠，黃點沒有其他意義）。四站都會載入這個檔，所以 DX、YA、SR 一起生效。
  try {
    const st = document.createElement('style');
    st.textContent = '#adminActiveDot { display:none !important; }';
    (document.head || document.documentElement).appendChild(st);
  } catch (_) {}
  // 安裝鈕依層級：同一個分頁「最先進入」的站才顯示安裝鈕。
  // 例：從 LF 進 DX、YA、SR → 只有 LF 有；直接開 DX 再進 YA、SR → 只有 DX 有；直接開 YA 或 SR → 它們自己有。
  try {
    if (entry.key !== me) {
      const st = document.createElement('style');
      st.textContent = '#installAppBtn, #lfInstallBtn { display:none !important; }';
      (document.head || document.documentElement).appendChild(st);
    }
  } catch (_) {}
  const ancestors = [];
  for (let key = SITES[me].parent; key; key = SITES[key].parent) ancestors.push(key);
  async function ancestorLoggedIn() {
    for (const key of ancestors) {
      const apiKey = SITES[key].apiKey || (await siteConfig(key))?.firebase?.apiKey;
      if (apiKey && await hasAuthUser(apiKey)) return true;
    }
    return false;
  }

  function decodeJwt(token) {
    const part = String(token || '').split('.')[1] || '';
    const b = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(b, c => c.charCodeAt(0))));
  }

  function saveGoogleIdToken(idToken) {
    try {
      const p = decodeJwt(idToken);
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ t: idToken, exp: p.exp * 1000, email: p.email || '', src: me })); // src：在哪一站登入的
    } catch (e) { console.warn('[CLC SSO] 無法保存登入憑證', e); }
  }

  // 跨站登入只給 Superuser：其他權限（Admin、Viewer、User）登入時呼叫，下層站不自動登入、也不跳提示。
  function blockShare() {
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ noshare: true, src: me })); } catch (_) {}
  }
  function shareBlocked() {
    try { const o = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); return !!(o && o.noshare); } catch (_) { return false; }
  }

  function readToken() {
    try {
      const o = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      return o && o.t && o.exp > Date.now() + 60000 ? o : null; // 剩不到 1 分鐘視為過期
    } catch (_) { return null; }
  }

  // 讀寫 Firebase 存放登入狀態的 IndexedDB（同網域各站共用同一個資料庫，以 apiKey 區分）。
  function withStore(mode, work) {
    return new Promise(resolve => {
      let req;
      try { req = indexedDB.open(DB_NAME); } catch (_) { resolve(null); return; }
      req.onupgradeneeded = () => { try { req.transaction.abort(); } catch (_) {} }; // 資料庫不存在時不要建立
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) { db.close(); resolve(null); return; }
        try {
          const tx = db.transaction(STORE, mode);
          const out = work(tx.objectStore(STORE));
          tx.oncomplete = () => { db.close(); resolve({ result: out ? out.result : undefined }); };
          tx.onerror = tx.onabort = () => { db.close(); resolve(null); };
        } catch (_) { db.close(); resolve(null); }
      };
    });
  }

  async function hasAuthUser(apiKey) {
    const key = AUTH_PREFIX + apiKey + ':[DEFAULT]';
    const r = await withStore('readonly', s => s.getKey(key));
    if (r && r.result !== undefined) return true;
    try { return !!localStorage.getItem(key); } catch (_) { return false; }
  }

  async function logoutAll() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
    for (const st of [localStorage, sessionStorage]) {
      try {
        Object.keys(st).filter(k => k.indexOf(AUTH_PREFIX) === 0).forEach(k => st.removeItem(k));
      } catch (_) {}
    }
    await withStore('readwrite', s => {
      const req = s.openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        if (String(c.key).indexOf(AUTH_PREFIX) === 0) c.delete();
        c.continue();
      };
    });
  }

  // 用 DX04 的 Google 憑證登入分站的 Firebase（另一份獨立的 SDK，不會干擾分站自己的 Firebase）。
  // 登入結果寫進瀏覽器後，分站自己的 Firebase 會自動讀到。
  async function signInSiteNow(config, tok) {
    const appMod = await import(FB + 'firebase-app.js');
    const authMod = await import(FB + 'firebase-auth.js');
    const existing = appMod.getApps().find(a => a.name === '[DEFAULT]');
    const app = existing || appMod.initializeApp(config);
    let auth;
    try { auth = existing ? authMod.getAuth(app) : authMod.initializeAuth(app, { persistence: authMod.indexedDBLocalPersistence }); }
    catch (_) { auth = authMod.getAuth(app); }
    try {
      await authMod.signInWithCredential(auth, authMod.GoogleAuthProvider.credential(tok.t));
      return '';
    } catch (e) {
      console.warn('[CLC SSO] 自動登入失敗：', e && (e.code || e.message));
      return (e && (e.code || e.message)) || 'unknown';
    } finally {
      if (!existing) { try { await appMod.deleteApp(app); } catch (_) {} }
    }
  }

  // 同一頁面同時只跑一個登入（Firebase 的 [DEFAULT] App 一次只能有一個），其餘排隊。
  let signChain = Promise.resolve();
  function signInSite(config, tok) {
    const p = signChain.then(() => signInSiteNow(config, tok));
    signChain = p.catch(() => {});
    return p;
  }

  // ---------- 登入當下一次把下層各站登好 ----------
  //   在 LF 登入 → DX、YA、SR 一起登入；在 DX 登入 → YA、SR 一起登入。
  //   下層站已經是同一個帳號就跳過；是別的帳號就換成這次登入的帳號。
  //   同步期間整個畫面暫停操作（顯示「登入中」），完成才放行，避免同步到一半就切站造成錯亂。
  const DX_CONFIG = { // DX04 的 Firebase 設定（公開值，與 header.js 相同），LF 頁面替 DX 登入時使用
    apiKey: DX04_API_KEY, authDomain: 'clc-dx04.firebaseapp.com', projectId: 'clc-dx04',
    storageBucket: 'clc-dx04.firebasestorage.app', messagingSenderId: '333844280279',
    appId: '1:333844280279:web:84e6f122ae00bf010dd192'
  };
  const BUSY_KEY = 'clc_sso_busy'; // 同步中的記號（其他分頁打開下層站時先等同步完成）
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function descendantsOf(k) {
    const out = [];
    (function walk(p) { Object.keys(SITES).forEach(c => { if (SITES[c].parent === p) { out.push(c); walk(c); } }); })(k);
    return out;
  }
  async function siteConfig(k) {
    if (k === 'dx') return { name: 'DX04', firebase: (!siteKey && window.firebaseConfig) || DX_CONFIG };
    try {
      const res = await fetch('/' + k + '/clc-site.json', { cache: 'no-store' });
      return res.ok ? await res.json() : null;
    } catch (_) { return null; }
  }
  // 某站目前登入的 Email（沒登入回傳空字串）
  async function authEmail(apiKey) {
    const key = AUTH_PREFIX + apiKey + ':[DEFAULT]';
    const r = await withStore('readonly', s => s.get(key));
    let v = r && r.result ? r.result.value : null;
    if (!v) { try { v = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) {} }
    return v ? String(v.email || '?').toLowerCase() : '';
  }
  function setBusy(on) {
    try { on ? localStorage.setItem(BUSY_KEY, String(Date.now() + 20000)) : localStorage.removeItem(BUSY_KEY); } catch (_) {}
  }
  async function waitIdle() { // 最多等 20 秒（記號本身 20 秒後也會自動失效）
    for (;;) {
      let until = 0;
      try { until = Number(localStorage.getItem(BUSY_KEY)) || 0; } catch (_) {}
      if (until <= Date.now()) return;
      await sleep(200);
    }
  }
  function withTimeout(p, ms) { return Promise.race([p, sleep(ms).then(() => 'timeout')]); }

  function blockScreen() {
    const evs = ['click', 'dblclick', 'auxclick', 'contextmenu', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'keydown', 'keyup', 'submit'];
    const stop = e => { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); };
    evs.forEach(t => window.addEventListener(t, stop, { capture: true, passive: false }));
    let done, released = false;
    (window.clcVerseWait ? Promise.resolve() : import('/verse-wait.js?v=2')).then(() => {
      if (!released) done = window.clcVerseWait?.({ timeout: 0 });
    }).catch(() => {});
    return () => {
      released = true;
      done?.();
      evs.forEach(t => window.removeEventListener(t, stop, { capture: true }));
    };
  }

  let syncing = null;
  function syncDown() {
    if (syncing) return syncing;
    syncing = (async () => {
      if (window.top !== window) return;
      const tok = readToken();
      if (!tok || shareBlocked()) return;
      if (tok.src !== me && !ancestors.includes(tok.src || 'dx')) return; // 只用自己或上層站發的憑證（登入只往下帶）
      const targets = descendantsOf(me);
      if (!targets.length) return;
      const release = blockScreen();
      setBusy(true);
      const failed = [];
      try {
        const want = String(tok.email || '').toLowerCase();
        const sdk = Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js')]).catch(() => null); // 先下載，和下面同時進行
        const list = await Promise.all(targets.map(async k => {
          const site = await siteConfig(k);
          const config = site && site.firebase;
          if (!config || !config.apiKey) return { k, bad: true };
          return { k, config, same: !!want && (await authEmail(config.apiKey)) === want };
        }));
        await withTimeout(sdk, 8000);
        for (const it of list) {
          if (it.bad) { failed.push(SITES[it.k].label); continue; }
          if (it.same) continue; // 已經是同一個帳號
          const err = await withTimeout(signInSite(it.config, tok), 8000);
          if (err) failed.push(SITES[it.k].label);
        }
      } catch (e) {
        console.warn('[CLC SSO] 同步登入失敗', e);
      } finally {
        setBusy(false);
        await release();
      }
      if (failed.length) notice(`${failed.join('、')} 沒有自動登入成功，打開時請按右上角 🔐 登入。`);
    })().finally(() => { syncing = null; });
    return syncing;
  }
  // 登入成功後呼叫：保存憑證並立刻同步下層各站。
  function shareLogin(idToken) {
    saveGoogleIdToken(idToken);
    return syncDown();
  }

  // 畫面下方的簡短提示，點一下或 10 秒後消失。
  function notice(text) {
    const show = () => {
      const el = document.createElement('div');
      el.setAttribute('role', 'status');
      el.textContent = text;
      el.style.cssText = 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;max-width:min(92vw,420px);box-sizing:border-box;padding:12px 16px;border-radius:12px;background:#161924;color:#f1f5f9;border:1px solid rgba(255,255,255,.15);box-shadow:0 12px 40px rgba(0,0,0,.45);font:13.5px/1.6 Arial,"Microsoft JhengHei",sans-serif;cursor:pointer;';
      el.addEventListener('click', () => el.remove());
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 10000);
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  }

  let returningToLogin = false;
  async function returnToLogin() {
    if (returningToLogin) return;
    returningToLogin = true;
    await logoutAll();
    if (entry.key === 'lf') {
      try { sessionStorage.removeItem('linfamily_entered'); } catch (_) {}
    }
    window.location.replace(homeURL);
  }

  // Worker 插入的是 defer script，分站原本的 header.js 已完成載入。
  // 沿用分站既有確認與 signOut；只有真正登出成功才清除共用登入並返回。
  if (siteKey && typeof window.handleAdminLogout === 'function') {
    const originalLogout = window.handleAdminLogout;
    window.handleAdminLogout = async function (...args) {
      const wasSignedIn = !!window.auth?.currentUser;
      await originalLogout.apply(this, args);
      if (wasSignedIn && !window.auth?.currentUser) await returnToLogin();
    };
  }

  async function runSite() {
    if (window.top !== window) return; // 被嵌入 iframe 時由外層頁面處理
    if (!siteKey && document.readyState !== 'complete') await new Promise(r => addEventListener('load', r, { once: true })); // 等 header.js 設好 firebaseConfig
    let site;
    if (!siteKey) site = { name: 'DX04', firebase: window.firebaseConfig }; // DX04 本身也可以由 LinFamily 帶入登入
    else try {
      const res = await fetch('/' + siteKey + '/clc-site.json', { cache: 'no-store' });
      if (!res.ok) return;
      site = await res.json();
    } catch (_) { return; }
    const config = site && site.firebase;
    if (!config || !config.apiKey) return;

    await waitIdle(); // 其他分頁正在同步登入：等它完成再判斷
    let had = await hasAuthUser(config.apiKey);
    if (!had && !shareBlocked() && await ancestorLoggedIn()) {
      // 只在上層站已登入時才嘗試自動登入或提示，不打擾一般訪客。
      const name = site.name || '本站';
      let tok = readToken();
      if (tok && !ancestors.includes(tok.src || 'dx')) tok = null; // 只接受上層站發的憑證
      if (!tok) {
        notice(`共用登入憑證已過期（超過 1 小時），無法自動登入 ${name}。請按右上角 🔐 登入一次，或回 LinFamily 登出後重新登入。`);
      } else {
        const err = await signInSite(config, tok);
        if (!err) { had = true; await syncDown(); } // 例：DX 由 LF 帶入登入後，順便把 YA、SR 也登好
        else notice(`自動登入 ${name} 失敗，請按右上角 🔐 登入。（${err}）`);
      }
    }
    // 分站登出（登入狀態被移除）→ 所有站一起登出。
    setInterval(async () => {
      const now = await hasAuthUser(config.apiKey);
      if (had && !now) await returnToLogin();
      had = now;
    }, 1500);
  }

  // Same-origin DX04 / YA / SR cycling. No preloading or extra data listeners.
  function installSiteSwipe() {
    if (window.top !== window || siteKey === 'lf') return; // LinFamily 不加入 DX04／YA／SR 左右滑切站
    let gesture = null, visual = null, navigating = false;
    const dirtyForms = new Set();
    // 只在 DX、YA、SR 各自的首頁可以換站；子頁（例如 /sr/events/…、/ya/hymn-lyrics.html、admin-xxx.html）不能左右滑、沒有箭頭、鍵盤 ← → 也不換站
    const isHome = () => /^\/(?:(?:ya|sr)\/)?(?:index\.html)?$/.test(location.pathname);
    const canSwipe = () => isHome() && !navigating && innerWidth <= 1023 && !!window.isSuperuser &&
      !document.documentElement.classList.contains('dx-locked') &&
      !document.querySelector('dialog[open], .todo-edit, .reorder-source, .reorder-floating, .is-dragging, #siteGrid.is-editing, #homeApps.is-editing, .slot-grid.is-editing, .slot-floating, .clc-hmenu, .dk-menu, .dk-sel, .ui-resizable-resizing, .ui-draggable-dragging') &&
      !Array.from(dirtyForms).some(form => form.isConnected && Array.from(form.elements).some(field => {
        if (field.disabled || ['submit', 'button', 'reset'].includes(field.type)) return false;
        if (['checkbox', 'radio'].includes(field.type)) return field.checked !== field.defaultChecked;
        if (field.type === 'file') return !!field.files.length;
        if (field.tagName === 'SELECT') {
          const defaults = Array.from(field.options).filter(o => o.defaultSelected).map(o => o.value);
          const current = Array.from(field.selectedOptions).map(o => o.value);
          if (!defaults.length && !field.multiple && field.options.length) defaults.push(field.options[0].value);
          return JSON.stringify(current) !== JSON.stringify(defaults);
        }
        return 'defaultValue' in field && field.value !== field.defaultValue;
      }));
    // 三站都是整個畫面都能滑（Header 除外；左右各留 10% 給瀏覽器的返回手勢）。
    // 從連結、App 圖示、待辦上開始滑也可以：輕點照常、長按照常（拖曳排序開始後就不會切站）。
    function blocked(node) {
      const controls = 'button:not(.ha-tile):not(.slot-empty), input, textarea, select, dialog, [role="dialog"], [contenteditable="true"], .ha-menu, .slot-remove, .todo-trash, .todo-minus, .drag-handle, .reorder-handle, iframe, video, audio, .dk-card, .ui-resizable-handle'; // 桌面卡片上（含調整大小）不換站
      if (node.closest(controls)) return true;
      for (let el = node; el && el !== document.body; el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
      }
      return false;
    }
    const routes = ['/', '/ya/', '/sr/'], labels = ['DX04', 'YA', 'SR'];
    const currentSite = () => /^\/ya(?:\/|$)/.test(location.pathname) ? 1 : /^\/sr(?:\/|$)/.test(location.pathname) ? 2 : 0;
    function makeVisual(dx) {
      const next = (currentSite() + (dx < 0 ? 1 : 2)) % routes.length;
      if (visual) {
        visual.next = next;
        visual.layer.querySelector('strong').textContent = labels[next];
        return;
      }
      const body = document.body, layer = document.createElement('div');
      layer.id = 'clc-site-transition';
      layer.setAttribute('role', 'status'); layer.setAttribute('aria-live', 'polite');
      layer.style.cssText = 'position:fixed;inset:0;z-index:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#090a0f;color:#fff;font-family:Arial,sans-serif;pointer-events:none;will-change:transform;';
      const title = document.createElement('strong'); title.textContent = labels[next];
      title.style.cssText = 'font-size:52px;letter-spacing:.08em;';
      const caption = document.createElement('span'); caption.textContent = '載入中…'; caption.style.cssText = 'font-size:14px;color:#94a3b8;';
      layer.append(title, caption);
      visual = { layer, next, css: { transform:body.style.transform, transition:body.style.transition, position:body.style.position, zIndex:body.style.zIndex, willChange:body.style.willChange }, overflow:document.documentElement.style.overflowX };
      document.documentElement.appendChild(layer);
      document.documentElement.style.overflowX = 'hidden';
      body.style.position = 'relative'; body.style.zIndex = '1'; body.style.willChange = 'transform'; body.style.transition = 'none';
    }
    function draw(dx) {
      makeVisual(dx);
      const amount = Math.max(-innerWidth, Math.min(innerWidth, dx));
      document.body.style.transform = `translate3d(${amount}px,0,0)`;
      visual.layer.style.transform = `translate3d(${(dx < 0 ? innerWidth : -innerWidth) + amount}px,0,0)`;
    }
    function restore() {
      if (!visual) return;
      Object.assign(document.body.style, visual.css);
      document.documentElement.style.overflowX = visual.overflow;
      visual.layer.remove(); visual = null;
    }
    function cancel() {
      gesture = null;
      if (!visual || navigating) return;
      const state = visual;
      document.body.style.transition = 'transform 160ms ease-out';
      document.body.style.transform = 'translate3d(0,0,0)';
      setTimeout(() => { if (visual === state && !gesture && !navigating) restore(); }, 170);
    }
    document.addEventListener('input', e => { const form = e.target.closest('form'); if (form) dirtyForms.add(form); }, true);
    document.addEventListener('change', e => { const form = e.target.closest('form'); if (form) dirtyForms.add(form); }, true);
    document.addEventListener('reset', e => dirtyForms.delete(e.target), true);
    document.addEventListener('touchstart', e => {
      if (navigating) return;
      restore(); gesture = null;
      if (e.touches.length !== 1 || !canSwipe() || blocked(e.target)) return;
      const t = e.touches[0];
      const edge = Math.max(16, innerWidth * .05); // 只留很窄的邊給系統返回手勢
      if (t.clientX < edge || t.clientX > innerWidth - edge) return;
      if (t.clientY <= (document.getElementById('clc-header')?.getBoundingClientRect().bottom || 0)) return;
      gesture = { id:t.identifier, x:t.clientX, y:t.clientY, at:performance.now(), horizontal:false, dx:0 };
    }, { passive:true });
    document.addEventListener('touchmove', e => {
      if (!gesture) return;
      if (e.touches.length !== 1 || !canSwipe()) { cancel(); return; }
      const t = e.touches[0], dx = t.clientX - gesture.x, dy = t.clientY - gesture.y;
      if (t.identifier !== gesture.id) { cancel(); return; }
      if (!gesture.horizontal) {
        if (Math.abs(dy) > 22 && Math.abs(dy) > Math.abs(dx) * 1.2) { cancel(); return; } // 明顯在上下捲動才放棄
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
        gesture.horizontal = true;
      }
      gesture.dx = dx;
      if (e.cancelable) e.preventDefault();
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) draw(dx);
    }, { passive:false });
    document.addEventListener('touchend', () => {
      const g = gesture;
      const fast = !!g && Math.abs(g.dx) >= 28 && performance.now() - g.at < 320; // 快速一撥也算
      if (!g || !g.horizontal || !canSwipe() || (!fast && Math.abs(g.dx) < Math.max(40, innerWidth * .11))) { cancel(); return; }
      gesture = null;
      commit(g.dx);
    }, { passive:true });
    function commit(dx) { // dx < 0：往右邊的站（下一站）；dx > 0：往左邊的站（上一站）
      const g = { dx };
      makeVisual(g.dx); navigating = true;
      const next = visual.next;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const transition = reduced ? 'none' : 'transform 200ms cubic-bezier(.2,.7,.3,1)';
      document.body.style.transition = transition;
      visual.layer.style.transition = transition;
      document.body.style.transform = `translate3d(${g.dx < 0 ? -innerWidth : innerWidth}px,0,0)`;
      visual.layer.style.transform = 'translate3d(0,0,0)';
      setTimeout(() => { location.assign(withEntry(routes[next])); }, reduced ? 0 : 210);
    }

    // 電腦版：滑鼠移到畫面左右邊緣，才淡淡出現 ‹ › 箭頭，點了換站（跟手機左右滑同一套順序與動畫）。
    // 平常完全看不到、也點不到（pointer-events:none），不影響畫面其他內容。
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const canArrow = () => isHome() && !navigating && !!window.isSuperuser &&
        !document.documentElement.classList.contains('dx-locked') &&
        !document.querySelector('dialog[open], .is-dragging, #siteGrid.is-editing, #homeApps.is-editing, .slot-grid.is-editing, .slot-floating, .clc-hmenu');
      const mk = (side, dx) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'clc-edge-arrow'; b.textContent = side === 'left' ? '‹' : '›';
        // 貼齊畫面邊緣、只有內側圓角，像從邊緣拉出來的小分頁；出現時從邊緣滑出
        b.style.cssText = `position:fixed;top:60px;${side}:0;transform:translate(${side === 'left' ? '-100%' : '100%'},0);z-index:2147482000;width:40px;height:72px;border:0;` +
          `border-radius:${side === 'left' ? '0 14px 14px 0' : '14px 0 0 14px'};padding:0;` +
          'background:rgba(15,23,42,.35);color:#fff;font:400 34px/1 Arial,sans-serif;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s ease-out,background .15s;';
        b.dataset.side = side;
        b.addEventListener('mouseenter', () => { b.style.background = 'rgba(15,23,42,.6)'; });
        b.addEventListener('mouseleave', () => { b.style.background = 'rgba(15,23,42,.35)'; });
        b.addEventListener('click', () => { if (canArrow()) { hide(); commit(dx); } });
        document.documentElement.appendChild(b);
        return b;
      };
      const left = mk('left', 1), right = mk('right', -1);
      const label = () => {
        const i = currentSite();
        left.setAttribute('aria-label', '切換到 ' + labels[(i + 2) % 3]); left.title = labels[(i + 2) % 3];
        right.setAttribute('aria-label', '切換到 ' + labels[(i + 1) % 3]); right.title = labels[(i + 1) % 3];
      };
      const show = (b, on) => {
        b.style.opacity = on ? '.75' : '0'; b.style.pointerEvents = on ? 'auto' : 'none';
        b.style.transform = `translate(${on ? '0' : (b.dataset.side === 'left' ? '-100%' : '100%')},0)`;
        if (on) b.style.top = ((document.getElementById('clc-header')?.getBoundingClientRect().bottom || 48) + 10) + 'px'; // Header 下方
      };
      const hide = () => { show(left, false); show(right, false); };
      const EDGE = 72; // 離邊緣多少 px 內才出現
      document.addEventListener('mousemove', e => {
        if (!canArrow()) return hide();
        label();
        show(left, e.clientX <= EDGE);
        show(right, e.clientX >= innerWidth - EDGE);
      }, { passive:true });
      document.documentElement.addEventListener('mouseleave', hide);
      // 鍵盤 ← →：換到左邊／右邊的站（正在輸入文字、按著 Ctrl／Alt／⌘／Shift 時不作用）
      document.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.isComposing) return;
        const t = e.target;
        if (t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="slider"], [role="tablist"], [role="listbox"], [role="menu"]')) return;
        if (!canArrow()) return;
        e.preventDefault(); hide(); commit(e.key === 'ArrowLeft' ? 1 : -1);
      });
      window.addEventListener('pageshow', hide);
    }
    document.addEventListener('touchcancel', cancel, { passive:true });
    window.addEventListener('pageshow', () => { navigating = false; gesture = null; restore(); });

  }
  installSiteSwipe();

  // ---------- 休眠與自動登出：照「這個分頁是從哪一站進來的」決定誰管 ----------
  //  從 /lf/ 進來 → 照 LF 的設定（linfamily_settings/security），休眠回 LF 的 Welcome、登出回 LF。
  //  從 /（DX）進來 → 照 DX 的設定（dx04_settings/security），休眠回 DX 的歡迎動畫、登出回 DX。
  //  YA、SR 用自己的連結直接開 → 不受管制。
  // 同入口的分頁共用活動時間，LF 和 DX 分別計時。
  function installSecurity() {
    if (window.top !== window) return;
    const site = SITES[entry.key];
    if (!site.security) return;
    const securityURL = `https://firestore.googleapis.com/v1/projects/${site.project}/databases/(default)/documents/${site.security}?key=${site.apiKey}`;
    const isMobile = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
    const SEC_KEY = 'clc_security_' + entry.key + (isMobile ? '_m' : '');
    const ACT_KEY = 'clc_last_active_' + entry.key;
    let sec = { sleepMin: 0, logoutMin: 0 }, lastWrite = 0, slept = false;
    try { Object.assign(sec, JSON.parse(localStorage.getItem(SEC_KEY) || '{}')); } catch (_) {}
    const lastActive = () => { try { return Number(localStorage.getItem(ACT_KEY) || 0); } catch (_) { return 0; } };
    function touch() {
      slept = false;
      const t = Date.now();
      if (t - lastWrite < 10000) return; // 最多 10 秒寫一次
      lastWrite = t; try { localStorage.setItem(ACT_KEY, String(t)); } catch (_) {}
    }
    async function anySignedIn() {
      try { if (Object.keys(localStorage).some(k => k.indexOf(AUTH_PREFIX) === 0)) return true; } catch (_) {}
      const r = await withStore('readonly', st => st.getAllKeys());
      return !!(r && Array.isArray(r.result) && r.result.some(k => String(k).indexOf(AUTH_PREFIX) === 0));
    }
    const onLF = () => /^\/lf(\/|$)/.test(location.pathname);
    function goSleep() {
      if (entry.key === 'lf') {
        if (onLF() && typeof window.lfSleep === 'function') return window.lfSleep();
        try { sessionStorage.removeItem('linfamily_entered'); } catch (_) {} // 回到 LF 時停在 Welcome
        return location.assign(homeURL);
      }
      try { sessionStorage.removeItem('clc_dx04_welcome_seen_v1'); } catch (_) {}
      location.assign(homeURL); // DX 的歡迎動畫
    }
    async function check(onLoad) {
      const la = lastActive(); if (!la) return;
      const idle = Date.now() - la;
      if (sec.logoutMin > 0 && idle >= sec.logoutMin * 60000 && await anySignedIn()) {
        try { localStorage.removeItem(ACT_KEY); } catch (_) {}
        return returnToLogin();
      }
      if (sec.sleepMin > 0 && idle >= sec.sleepMin * 60000) {
        if (onLoad) { slept = true; return; } // 剛打開的頁面本來就在首頁，不用再跳
        if (!slept && !document.hidden) { slept = true; goSleep(); }
      }
    }
    fetch(securityURL).then(r => r.ok ? r.json() : null).then(j => { // 公開讀取，不用登入
      const f = (j && j.fields) || {};
      const n = k => Number((f[k] || {}).integerValue || (f[k] || {}).doubleValue || 0);
      const has = k => k in f;
      // 手機版有自己的設定（mSleepMin／mLogoutMin，0＝不休眠／不登出）；沒設過就沿用電腦版
      sec = isMobile
        ? { sleepMin: has('mSleepMin') ? n('mSleepMin') : n('sleepMin'), logoutMin: has('mLogoutMin') ? n('mLogoutMin') : n('logoutMin') }
        : { sleepMin: n('sleepMin'), logoutMin: n('logoutMin') };
      try { localStorage.setItem(SEC_KEY, JSON.stringify(sec)); } catch (_) {}
    }).catch(() => {});
    check(true).then(() => { lastWrite = 0; touch(); }); // 打開也算一次操作
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, touch, { passive: true, capture: true }));
    setInterval(() => { if (!document.hidden) check(false); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(false); }); // 從背景回來：超過時間就休眠或登出
  }
  installSecurity();

  window.CLCSSO = { saveGoogleIdToken, shareLogin, syncDown, blockShare, logoutAll, returnToLogin, readToken, signInSite,
    entryHome: entry.key === 'lf' && me !== 'lf' ? homeURL : '' };
  runSite();
})();
