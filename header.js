/**
 * CLC DX04 總控台 - 共用 Header (header.js)
 * 外觀與 YA 相同（Logo、深淺模式、尺寸與斷點）。
 * 登入與權限（Superuser／Admin／Viewer）待 DX04 Firebase 專案建立後再接上。
 */

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
      @media (min-width: 640px) {
        #clc-header > div { height: 48px !important; min-height: 48px !important; padding: 0 20px !important; }
        #clc-header .logo-badge { font-size: 14px; height: 36px; line-height: 36px; padding: 0 14px; border-radius: 10px; }
        #clc-header .header-btn { width: 36px; min-width: 36px; height: 36px; border-radius: 10px; font-size: 16px; }
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
      <a href="index.html" class="flex items-center" aria-label="CLC DX04 首頁">
        <div class="logo-badge shadow-sm">CLC DX04</div>
      </a>
      <div class="flex items-center gap-1.5">
        <button onclick="toggleTheme()" aria-label="切換深淺模式" class="header-btn bg-slate-200/70 hover:bg-slate-300/70 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-white/10 transition active:scale-95"><span class="dark:hidden">🌙</span><span class="hidden dark:inline">☀️</span></button>
      </div>
    </div>
  `;
}

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
