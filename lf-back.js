// 從 LinFamily 點進來（網址帶 ?lfhome=…）時，左下角顯示淡淡的圓形 🏠 浮動鈕回 LinFamily 主畫面。同一個分頁內切頁、切分站都會保留。
// 平常幾乎透明（只看得到一點點），滑鼠移上去／手指按住時才變清楚。Worker 自動插入各站 HTML。
(function () {
  var K = 'lfHome', home = '';
  try {
    var u = new URL(location.href), h = u.searchParams.get('lfhome');
    if (h && /^https?:\/\//i.test(h)) {
      sessionStorage.setItem(K, h);
      u.searchParams.delete('lfhome'); history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }
    home = sessionStorage.getItem(K) || '';
  } catch (_) {}
  if (!home || window.top !== window || /^\/lf(\/|$)/.test(location.pathname)) return; // LinFamily 自己的頁面不顯示
  function add() {
    if (document.getElementById('lfHomeBtn')) return;
    var s = document.createElement('style');
    s.textContent = '#lfHomeBtn{position:fixed;z-index:2147483647;left:calc(env(safe-area-inset-left) + 12px);bottom:calc(env(safe-area-inset-bottom) + 14px);' +
      'width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:rgba(28,28,28,.45);color:#fff;opacity:.28;' +
      '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 2px 8px rgba(0,0,0,.15);transition:opacity .2s;-webkit-tap-highlight-color:transparent}' +
      '#lfHomeBtn:hover,#lfHomeBtn:focus-visible,#lfHomeBtn:active{opacity:.9;outline:none}#lfHomeBtn svg{width:22px;height:22px;display:block}';
    document.head.appendChild(s);
    var a = document.createElement('a');
    a.id = 'lfHomeBtn'; a.href = home; a.title = 'LinFamily 主畫面'; a.setAttribute('aria-label', '回 LinFamily 主畫面');
    a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg>';
    document.body.appendChild(a);
  }
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
