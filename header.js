/**
 * CLC DX04 總控台 - 共用 Header (header.js)
 * 外觀與 YA 相同（Logo、深淺模式、尺寸與斷點）。
 * 登入與權限（Superuser／Admin／Viewer）沿用 YA：Superuser 為 ADMIN_WHITELIST，其餘存於 Firestore admin_users/{email}。
 */

window.ADMIN_WHITELIST = [
  "darren710404@gmail.com",
  "darren.lin@twclc.org"
];

// 站台切換（僅 Superuser）：Logo 單擊回首頁，雙擊開啟其他站台選單。
// 三站（DX04、YA、SR）使用同一份 CLC_SITES，只有 CLC_SITE_KEY 不同；新增站台時三站都要加同一筆。
// 連結一律指向 DX04 底下的網址（同一個網域），在同一個視窗內切換。
window.CLC_SITE_KEY = 'dx04';
window.CLC_SITES = [
  { key: 'dx04', label: 'CLC DX04', url: 'https://clc-dx04.pages.dev/' },
  { key: 'ya', label: 'CLC YA', url: 'https://clc-dx04.pages.dev/ya/' },
  { key: 'sr', label: 'CLC SR', url: 'https://clc-dx04.pages.dev/sr/' }
];

// 將文字放進 innerHTML 前先跳脫。
window.clcEscapeHtml = function(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
};

window.firebaseConfig = {
  apiKey: "AIzaSyDbLv-XgOD7Q3J_wl81eXOuK9rqNAdzxM8",
  authDomain: "clc-dx04.firebaseapp.com",
  projectId: "clc-dx04",
  storageBucket: "clc-dx04.firebasestorage.app",
  messagingSenderId: "333844280279",
  appId: "1:333844280279:web:84e6f122ae00bf010dd192",
  measurementId: "G-W0HTMJCYXN"
};

// 初始化 Firebase（保證只初始化一次）
if (!firebase.apps.length) {
  firebase.initializeApp(window.firebaseConfig);
}
window.auth = firebase.auth();
window.db = firebase.firestore();
window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

window.isAdmin = false;
window.currentAdminEmail = "";
window.currentAdminRole = "";
window.isSuperuser = false;
window.isViewer = false;
window.canViewAdmin = false;

function renderHeaderComponent() {
  const headerContainer = document.getElementById('clc-header');
  if (!headerContainer) return;

  if (!document.getElementById('clc-header-fixed-style')) {
    const style = document.createElement('style');
    style.id = 'clc-header-fixed-style';
    style.textContent = `
      #clc-header { box-sizing: border-box !important; border-bottom-width: 1px !important; }
      #clc-header > div { width: 100% !important; height: 46px !important; min-height: 46px !important; padding: 0 14px !important; box-sizing: border-box !important; display: flex !important; align-items: center !important; justify-content: space-between !important; }
      #clc-header .logo-badge { font-size: 13.5px; height: 34px; line-height: 34px; box-sizing: border-box; padding: 0 12px; border-radius: 9px; font-weight: 800; background: #007E8A; color: white; display: inline-flex; align-items: center; text-decoration: none; letter-spacing: .05em; }
      #clc-header .header-btn { width: 34px; min-width: 34px; height: 34px; border-radius: 9px; font-size: 15px; padding: 0; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
      #clc-header #clcLogoLink { touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; }
      #clc-header #siteSwitcher { top: 100%; width: 180px; margin-top: 7.5px; padding: 6px 0; border-radius: 11.25px; z-index: 100; }
      #clc-header #siteSwitcher a { display: block; padding: 9px 15px; font-size: 13.5px; font-weight: 700; }
      #clc-header #adminActiveDot { width: 7px; height: 7px; top: 6px; right: 6px; }
      /* 下拉選單使用與 YA 相同的固定像素尺寸，避免各頁 html font-size 不同造成放大縮小。 */
      #clc-header #adminDropdown { width: 210px; margin-top: 7.5px; padding-top: 7.5px; padding-bottom: 7.5px; border-radius: 11.25px; }
      #clc-header #adminDropdown > a,
      #clc-header #adminDropdown > button { padding: 9.375px 15px; font-size: 13.125px; line-height: 18.75px; }
      #clc-header #adminDropdown #adminEmailDisplay { padding: 7.5px 15px; font-size: 11.25px; line-height: 15px; }
      #clc-header #adminDropdown > div:not(#adminEmailDisplay) { margin-top: 5.625px; margin-bottom: 5.625px; }
      @media (min-width: 640px) {
        #clc-header > div { height: 48px !important; min-height: 48px !important; padding: 0 20px !important; }
        #clc-header .logo-badge { font-size: 14px; height: 36px; line-height: 36px; padding: 0 14px; border-radius: 10px; }
        #clc-header .header-btn { width: 36px; min-width: 36px; height: 36px; border-radius: 10px; font-size: 16px; }
        #clc-header #adminDropdown > a,
        #clc-header #adminDropdown > button { font-size: 15px; }
      }
      @media (min-width: 1024px) {
        #clc-header > div { padding-left: 24px !important; padding-right: 24px !important; }
      }
      @media (min-width: 1440px) {
        #clc-header > div { padding-left: 32px !important; padding-right: 32px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  headerContainer.className = "border-b border-slate-200 dark:border-white/10 backdrop-blur-xl bg-white/70 dark:bg-[#090A0F]/70 sticky top-0 z-40";
  headerContainer.innerHTML = `
    <div>
      <div id="clcLogoWrap" class="relative">
        <a id="clcLogoLink" href="index.html" onclick="handleLogoClick(event)" class="flex items-center" aria-label="CLC DX04 首頁">
          <div class="logo-badge shadow-sm">CLC DX04</div>
        </a>
        <div id="siteSwitcher" class="hidden absolute left-0 bg-white dark:bg-[#161924] shadow-2xl border border-slate-200 dark:border-white/10 text-left">
          <div class="px-4 py-1.5 text-[11px] font-bold text-slate-400">切換站台</div>
          ${window.CLC_SITES.filter(s => s.key !== window.CLC_SITE_KEY).map(s => `
            <a href="${s.url}" class="text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition">${window.clcEscapeHtml(s.label)}</a>
          `).join('')}
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        <div class="relative">
          <button id="adminLoginBtn" onclick="toggleAdminDropdown()" title="管理員登入 / 狀態" class="header-btn relative bg-slate-200/70 hover:bg-slate-300/70 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-white/10 transition active:scale-95">
            <span id="adminBtnIcon">🔐</span>
            <span id="adminActiveDot" class="hidden absolute rounded-full bg-amber-400 animate-pulse"></span>
          </button>
          <div id="adminDropdown" class="hidden absolute right-0 bg-white dark:bg-[#161924] shadow-2xl border border-slate-200 dark:border-white/10 z-50 text-left">
            <div id="adminEmailDisplay" class="font-bold text-slate-400 border-b border-slate-100 dark:border-white/5 truncate">管理員已登入</div>
            <a href="admin-users.html" class="block font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition">👤 權限管理</a>
            <div class="border-t border-slate-100 dark:border-white/5"></div>
            <button onclick="handleAdminLogout()" class="w-full text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 font-bold transition">🚪 登出管理員</button>
          </div>
        </div>
        <button onclick="toggleTheme()" aria-label="切換深淺模式" class="header-btn bg-slate-200/70 hover:bg-slate-300/70 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-white/10 transition active:scale-95"><span class="dark:hidden">🌙</span><span class="hidden dark:inline">☀️</span></button>
      </div>
    </div>
  `;
}

function applyAdminState(active, email, notify = true, viewer = false) {
  // active = 已授權可進入後台；viewer = 唯讀檢視者（可看後台、不可編輯）
  const viewerOnly = !!(active && viewer);
  window.isAdmin = !!active && !viewerOnly;
  window.isViewer = viewerOnly;
  window.canViewAdmin = !!active;
  window.currentAdminEmail = email;
  const superuser = window.isAdmin && window.ADMIN_WHITELIST.includes(String(email || '').toLowerCase());
  window.currentAdminRole = active ? (viewerOnly ? 'viewer' : (superuser ? 'superuser' : 'admin')) : '';
  window.isSuperuser = superuser;
  if (!superuser) {
    const switcher = document.getElementById('siteSwitcher');
    if (switcher) switcher.classList.add('hidden');
  }
  const icon = document.getElementById('adminBtnIcon');
  const dot = document.getElementById('adminActiveDot');
  const emailDisp = document.getElementById('adminEmailDisplay');

  if (icon && dot) {
    if (active) {
      icon.innerText = viewerOnly ? "👁️" : "👑";
      dot.classList.remove('hidden');
      if (emailDisp) emailDisp.innerText = email + (viewerOnly ? ' · Viewer（唯讀）' : (superuser ? ' · Superuser' : ' · Admin'));
    } else {
      icon.innerText = "🔐";
      dot.classList.add('hidden');
      const dropdown = document.getElementById('adminDropdown');
      if (dropdown) dropdown.classList.add('hidden');
    }
  }

  if (notify) {
    window.dispatchEvent(new CustomEvent('clc-admin-changed', {
      detail: { isAdmin: window.isAdmin, isViewer: window.isViewer, canView: !!active, email: email }
    }));
  }
}

// 回傳 'admin'（可編輯）、'viewer'（唯讀）或 null（無權限）。
window.clcGetAdminRole = async function(user) {
  if (!user || !user.email || !user.emailVerified) return null;
  const email = user.email.toLowerCase().trim();
  if (window.ADMIN_WHITELIST.includes(email)) return 'admin';
  try {
    const snap = await window.db.collection('admin_users').doc(email).get();
    if (!snap.exists) return null;
    const d = snap.data();
    if (d.active === false || (d.email && d.email !== email)) return null;
    return (d.role === 'admin' || d.role === 'viewer') ? d.role : null;
  } catch (err) { console.warn('管理員權限讀取失敗', err); return null; }
};

let clcAdminPermissionUnsubscribe = null;
window.auth.onAuthStateChanged(user => {
  if (clcAdminPermissionUnsubscribe) {
    clcAdminPermissionUnsubscribe();
    clcAdminPermissionUnsubscribe = null;
  }
  // 驗證過程先關閉操作權限，但不要發出暫時「未授權」事件讓後台誤跳轉。
  applyAdminState(false, '', false);
  if (!user || !user.email || !user.emailVerified) {
    applyAdminState(false, '');
    return;
  }
  const email = user.email.toLowerCase().trim();
  if (window.ADMIN_WHITELIST.includes(email)) {
    applyAdminState(true, email);
    return;
  }
  // 動態 Admin 的停用與刪除立即同步到各分頁。
  clcAdminPermissionUnsubscribe = window.db.collection('admin_users').doc(email).onSnapshot(snap => {
    if (window.auth.currentUser?.uid !== user.uid) return;
    const data = snap.exists ? snap.data() : null;
    const allowed = !!(data && (data.role === 'admin' || data.role === 'viewer') && data.active !== false && (!data.email || data.email === email));
    applyAdminState(allowed, allowed ? email : '', true, allowed && data.role === 'viewer');
  }, err => {
    console.warn('無法驗證管理員權限：', err);
    if (window.auth.currentUser?.uid === user.uid) applyAdminState(false, '');
  });
});

// Logo：一般使用者單擊立即回首頁；Superuser 第一下先等 280ms，
// 若期間再點一下即視為雙擊並開啟站台選單（不依賴 dblclick 事件，手機雙點也可用）。
let clcLogoClickTimer = null;
function handleLogoClick(e) {
  const switcher = document.getElementById('siteSwitcher');
  if (!window.isSuperuser || !switcher) return; // 照舊回首頁
  e.preventDefault();
  const href = e.currentTarget.getAttribute('href');
  if (clcLogoClickTimer) {
    clearTimeout(clcLogoClickTimer);
    clcLogoClickTimer = null;
    switcher.classList.toggle('hidden');
    const admin = document.getElementById('adminDropdown');
    if (admin) admin.classList.add('hidden');
    return;
  }
  clcLogoClickTimer = setTimeout(() => {
    clcLogoClickTimer = null;
    window.location.href = href;
  }, 280);
}

function toggleAdminDropdown() {
  if (window.isAdmin || window.isViewer) {
    const dropdown = document.getElementById('adminDropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
  } else {
    triggerAdminLogin();
  }
}

async function triggerAdminLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await window.auth.signInWithPopup(provider);
    const email = result.user.email.toLowerCase();
    const loginRole = await window.clcGetAdminRole(result.user);
    if (loginRole) {
      applyAdminState(true, email, true, loginRole === 'viewer');
      alert(loginRole === 'viewer' ? `歡迎，${result.user.displayName || email}！目前為唯讀檢視權限。` : `歡迎回來，管理員 ${result.user.displayName || email}！`);
    } else {
      await window.auth.signOut();
      applyAdminState(false, "");
      alert(`帳號【${email}】非授權管理員！`);
    }
  } catch (error) {
    console.error("登入錯誤:", error);
    if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error?.code)) {
      alert('管理員登入未完成，請確認網路連線與瀏覽器是否允許 Google 登入彈出視窗。');
    }
  }
}

async function handleAdminLogout() {
  if (confirm("確定要登出管理員身分嗎？")) {
    await window.auth.signOut();
    applyAdminState(false, "");
  }
}

document.addEventListener('click', function(e) {
  const btn = document.getElementById('adminLoginBtn');
  const dropdown = document.getElementById('adminDropdown');
  if (btn && dropdown && !btn.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
  const logoWrap = document.getElementById('clcLogoWrap');
  const switcher = document.getElementById('siteSwitcher');
  if (logoWrap && switcher && !logoWrap.contains(e.target)) {
    switcher.classList.add('hidden');
  }
});

function toggleTheme() {
  const html = document.documentElement;
  if (html.classList.contains('dark')) {
    html.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  } else {
    html.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  }
}

document.addEventListener('DOMContentLoaded', renderHeaderComponent);
