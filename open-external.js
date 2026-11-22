/* open-external.js — 共用：有「安裝」功能的網頁一律載入（LF、DX、YA、SR 與子站）。
 * 在 LINE／Facebook／Instagram 內建瀏覽器開啟時，改用手機預設瀏覽器（才能安裝 App、Google 登入）。
 * - LINE：自動補 openExternalBrowser=1 重新開啟（LINE 會交給 Safari／Chrome）
 * - Android 的 FB／IG：自動用 intent:// 交給 Chrome（每個分頁只試一次）
 * - 跳不出去（iPhone 的 FB／IG、或 LINE 沒反應）：頂部顯示提示條
 * 用法：<script src="https://clc-dx04.pages.dev/open-external.js?v=1"></script>
 */
(function () {
  var ua = navigator.userAgent || '';
  var isLine = /\bLine\//i.test(ua);
  if (!isLine && !/FBAN|FBAV|FB_IAB|Instagram/i.test(ua)) return;
  var isAndroid = /Android/i.test(ua);
  var u = new URL(location.href);

  function chrome() {
    location.href = 'intent://' + u.host + u.pathname + u.search + u.hash + '#Intent;scheme=https;package=com.android.chrome;end';
  }

  if (isLine && u.searchParams.get('openExternalBrowser') !== '1') {
    u.searchParams.set('openExternalBrowser', '1');
    location.replace(u.href);
    return;
  }
  var KEY = 'clc_open_external_tried';
  if (isAndroid && !isLine) {
    var tried = false;
    try { tried = sessionStorage.getItem(KEY) === '1'; sessionStorage.setItem(KEY, '1'); } catch (_) {}
    if (!tried) { chrome(); }
  }

  function banner() {
    if (document.getElementById('clc-open-external')) return;
    var zh = /^zh\b/i.test((navigator.languages && navigator.languages[0]) || navigator.language || '');
    var msg = isAndroid
      ? (zh ? '請改用 Chrome 開啟，才能安裝 App 與登入。' : 'Open in Chrome to install the app and sign in.')
      : (zh ? '請點右上角「⋯」→「用瀏覽器開啟」（Safari），才能安裝 App 與登入。'
            : 'Tap “⋯” at the top right → “Open in browser” (Safari) to install the app and sign in.');
    var bar = document.createElement('div');
    bar.id = 'clc-open-external';
    bar.setAttribute('role', 'alert');
    bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;display:flex;align-items:center;gap:10px;' +
      'padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 10px;background:#fff7d6;color:#5b4500;' +
      'font:600 14px/1.4 system-ui,-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.15)';
    var text = document.createElement('span');
    text.style.flex = '1';
    text.textContent = msg;
    bar.appendChild(text);
    if (isAndroid) {
      var go = document.createElement('button');
      go.type = 'button';
      go.textContent = zh ? '用 Chrome 開啟' : 'Open in Chrome';
      go.style.cssText = 'border:0;border-radius:999px;padding:6px 12px;background:#5b4500;color:#fff;font:inherit;cursor:pointer';
      go.onclick = chrome;
      bar.appendChild(go);
    }
    var x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', zh ? '關閉' : 'Close');
    x.style.cssText = 'border:0;background:none;color:inherit;font:700 20px/1 system-ui;cursor:pointer;padding:0 4px';
    x.onclick = function () { bar.remove(); };
    bar.appendChild(x);
    document.body.appendChild(bar);
  }
  if (document.body) banner(); else document.addEventListener('DOMContentLoaded', banner);
})();
