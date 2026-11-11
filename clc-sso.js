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
  const script = document.currentScript;
  const siteKey = script && script.dataset ? (script.dataset.clcSite || '') : '';

  function decodeJwt(token) {
    const part = String(token || '').split('.')[1] || '';
    const b = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(b, c => c.charCodeAt(0))));
  }

  function saveGoogleIdToken(idToken) {
    try {
      const p = decodeJwt(idToken);
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ t: idToken, exp: p.exp * 1000, email: p.email || '' }));
    } catch (e) { console.warn('[CLC SSO] 無法保存登入憑證', e); }
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
      return true;
    } catch (e) {
      console.warn('[CLC SSO] 自動登入失敗：', e && (e.code || e.message));
      return false;
    } finally {
      if (!existing) { try { await appMod.deleteApp(app); } catch (_) {} }
    }
  }

  async function runSite() {
    if (window.top !== window) return; // 被嵌入 iframe 時由外層頁面處理
    let site;
    try {
      const res = await fetch('/' + siteKey + '/clc-site.json', { cache: 'no-store' });
      if (!res.ok) return;
      site = await res.json();
    } catch (_) { return; }
    const config = site && site.firebase;
    if (!config || !config.apiKey) return;

    let had = await hasAuthUser(config.apiKey);
    if (!had) {
      const tok = readToken();
      if (tok && await signInSite(config, tok)) had = true;
    }
    // 分站登出（登入狀態被移除）→ 所有站一起登出。
    setInterval(async () => {
      const now = await hasAuthUser(config.apiKey);
      if (had && !now) await logoutAll();
      had = now;
    }, 1500);
  }

  window.CLCSSO = { saveGoogleIdToken, logoutAll, readToken };
  if (siteKey) runSite();
})();
