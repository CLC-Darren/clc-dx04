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
  if (window.CLCSSO) return;

  const TOKEN_KEY = 'clc_sso_google';
  const AUTH_PREFIX = 'firebase:authUser:';
  const DB_NAME = 'firebaseLocalStorageDb';
  const STORE = 'firebaseLocalStorage';
  const FB = 'https://www.gstatic.com/firebasejs/10.8.0/';
  const DX04_API_KEY = 'AIzaSyDbLv-XgOD7Q3J_wl81eXOuK9rqNAdzxM8'; // 判斷 DX04 是否已登入（公開值）
  const script = document.currentScript;
  const siteKey = script && script.dataset ? (script.dataset.clcSite || '') : '';
  // 層級：登入只往下帶，不往上帶；登出則任一站登出、全部登出。
  //   LF（最高）→ DX → YA、SR。之後在 LF 底下新增的站，在 PARENT 加一行即可（例如 xx: 'lf'）。
  const PARENT = { dx: 'lf', ya: 'dx', sr: 'dx' };
  const API_KEYS = { lf: 'AIzaSyBPcURIjgwtEVi_nTaZT569e_nwJb4IsUs', dx: DX04_API_KEY }; // 有下層的站才需要（公開值）
  const me = siteKey || 'dx';
  // 已登入的小黃點不顯示（登入後圖示已經變成皇冠，黃點沒有其他意義）。四站都會載入這個檔，所以 DX、YA、SR 一起生效。
  try {
    const st = document.createElement('style');
    st.textContent = '#adminActiveDot { display:none !important; }';
    (document.head || document.documentElement).appendChild(st);
  } catch (_) {}
  // 安裝鈕依層級：同一個分頁「最先進入」的站才顯示安裝鈕。
  // 例：從 LF 進 DX、YA、SR → 只有 LF 有；直接開 DX 再進 YA、SR → 只有 DX 有；直接開 YA 或 SR → 它們自己有。
  try {
    let entry = sessionStorage.getItem('clc_entry_site');
    if (!entry) { entry = me; sessionStorage.setItem('clc_entry_site', me); }
    if (entry !== me) {
      const st = document.createElement('style');
      st.textContent = '#installAppBtn, #lfInstallBtn { display:none !important; }';
      (document.head || document.documentElement).appendChild(st);
    }
  } catch (_) {}
  const ancestors = []; for (let k = PARENT[me]; k; k = PARENT[k]) ancestors.push(k);
  async function ancestorLoggedIn() {
    for (const k of ancestors) if (API_KEYS[k] && await hasAuthUser(API_KEYS[k])) return true;
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

  // LF 的 User 權限：不分享登入，DX、YA、SR 不自動登入、也不跳提示。
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
  async function signInSite(config, tok) {
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
    // 使用根目錄，不能留在 /ya/ 或 /sr/ 的公開首頁。
    window.location.replace(siteKey === 'lf' ? '/lf/' : '/'); // LinFamily 回自己的首頁
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
        if (!err) had = true;
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
    const canSwipe = () => !navigating && innerWidth <= 1023 && !!window.isSuperuser &&
      !document.documentElement.classList.contains('dx-locked') &&
      !document.querySelector('dialog[open], .todo-edit, .reorder-source, .reorder-floating, .is-dragging, #siteGrid.is-editing, #homeApps.is-editing, .slot-grid.is-editing, .slot-floating, .clc-hmenu') &&
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
      const controls = 'button:not(.ha-tile):not(.slot-empty), input, textarea, select, dialog, [role="dialog"], [contenteditable="true"], .ha-menu, .slot-remove, .todo-trash, .todo-minus, .drag-handle, .reorder-handle, iframe, video, audio';
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
      setTimeout(() => { location.assign(routes[next]); }, reduced ? 0 : 210);
    }

    // 電腦版：滑鼠移到畫面左右邊緣，才淡淡出現 ‹ › 箭頭，點了換站（跟手機左右滑同一套順序與動畫）。
    // 平常完全看不到、也點不到（pointer-events:none），不影響畫面其他內容。
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const canArrow = () => !navigating && !!window.isSuperuser &&
        !document.documentElement.classList.contains('dx-locked') &&
        !document.querySelector('dialog[open], .is-dragging, #siteGrid.is-editing, #homeApps.is-editing, .slot-grid.is-editing, .slot-floating, .clc-hmenu');
      const mk = (side, dx) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'clc-edge-arrow'; b.textContent = side === 'left' ? '‹' : '›';
        b.style.cssText = `position:fixed;top:50%;${side}:12px;transform:translateY(-50%);z-index:2147482000;width:44px;height:64px;border:0;border-radius:14px;` +
          'background:rgba(15,23,42,.35);color:#fff;font:400 34px/1 Arial,sans-serif;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .2s,background .15s;';
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
      const show = (b, on) => { b.style.opacity = on ? '.75' : '0'; b.style.pointerEvents = on ? 'auto' : 'none'; };
      const hide = () => { show(left, false); show(right, false); };
      const EDGE = 72; // 離邊緣多少 px 內才出現
      document.addEventListener('mousemove', e => {
        if (!canArrow()) return hide();
        label();
        show(left, e.clientX <= EDGE);
        show(right, e.clientX >= innerWidth - EDGE);
      }, { passive:true });
      document.documentElement.addEventListener('mouseleave', hide);
      window.addEventListener('pageshow', hide);
    }
    document.addEventListener('touchcancel', cancel, { passive:true });
    window.addEventListener('pageshow', () => { navigating = false; gesture = null; restore(); });

  }
  installSiteSwipe();

  window.CLCSSO = { saveGoogleIdToken, blockShare, logoutAll, readToken, signInSite };
  runSite();
})();
