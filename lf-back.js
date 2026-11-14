// 從 LinFamily 點進來（網址帶 ?lfhome=…）時，左上角顯示「‹ LinFamily」回主畫面。同一個分頁內切頁、切分站都會保留。
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
  if (!home || window.top !== window) return;
  function add() {
    if (document.getElementById('lfBackBtn')) return;
    var a = document.createElement('a');
    a.id = 'lfBackBtn'; a.href = home; a.textContent = '‹ LinFamily'; a.setAttribute('aria-label', '回 LinFamily');
    a.style.cssText = 'position:fixed;z-index:2147483647;left:calc(env(safe-area-inset-left) + 10px);bottom:calc(env(safe-area-inset-bottom) + 14px);' +
      'padding:7px 13px;border-radius:999px;background:rgba(30,30,30,.55);color:#fff;font:600 13px Arial,"Microsoft JhengHei",-apple-system,"PingFang TC",sans-serif;' +
      'text-decoration:none;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 2px 10px rgba(0,0,0,.18)';
    document.body.appendChild(a);
  }
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
