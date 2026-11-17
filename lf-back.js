// 從 LinFamily 點進來（網址帶 ?lfhome=…）時，左下角顯示淡淡的圓形 🏠 浮動鈕回 LinFamily 主畫面。同一個分頁內切頁、切分站都會保留。
// 平常淡淡半透明、吸在左或右邊且一半藏在畫面外；按住可拖動，點一下回 LinFamily。Worker 自動插入各站 HTML。
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
    // 可拖動、自動吸邊、一半藏在畫面外；點一下回 LinFamily。位置記在這個瀏覽器（每站各自記）。
    var CSS = '#lfHomeBtn{position:fixed;z-index:Z;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;' +
      'background:rgba(28,28,28,.45);color:#fff;opacity:.28;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 2px 8px rgba(0,0,0,.15);' +
      'cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;' +
      'transition:opacity .2s,transform .25s ease,left .25s ease,top .25s ease}' +
      '#lfHomeBtn svg{width:22px;height:22px;display:block;pointer-events:none}' +
      '#lfHomeBtn.tuck-left{transform:translateX(-50%)}#lfHomeBtn.tuck-right{transform:translateX(50%)}' +
      '#lfHomeBtn:hover,#lfHomeBtn:focus-visible,#lfHomeBtn.is-active{opacity:.9;transform:none;outline:none}' +
      '#lfHomeBtn.is-dragging{transition:opacity .2s;opacity:.9;transform:none}';
    function homeDraggable(a, key) {
      var SIZE = 44, pos = { side: 'left', y: 0.86 }, start = null, dragged = false;
      try { var saved = JSON.parse(localStorage.getItem(key) || 'null'); if (saved && (saved.side === 'left' || saved.side === 'right') && saved.y >= 0 && saved.y <= 1) pos = saved; } catch (_) {}
      function place() {
        var top = Math.min(innerHeight - SIZE - 12, Math.max(12, pos.y * innerHeight - SIZE / 2));
        a.style.top = top + 'px';
        a.style.left = (pos.side === 'left' ? 0 : innerWidth - SIZE) + 'px';
        a.classList.toggle('tuck-left', pos.side === 'left');
        a.classList.toggle('tuck-right', pos.side === 'right');
      }
      place(); addEventListener('resize', place);
      a.addEventListener('pointerdown', function (e) {
        start = { x: e.clientX, y: e.clientY, l: a.offsetLeft, t: a.offsetTop }; dragged = false;
        a.classList.add('is-active'); try { a.setPointerCapture(e.pointerId); } catch (_) {}
      });
      a.addEventListener('pointermove', function (e) {
        if (!start) return;
        var dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (!dragged && Math.sqrt(dx * dx + dy * dy) < 10) return; // 移動超過 10px 才算拖動
        dragged = true; a.classList.add('is-dragging'); a.classList.remove('tuck-left', 'tuck-right');
        a.style.left = Math.min(innerWidth - SIZE, Math.max(0, start.l + dx)) + 'px';
        a.style.top = Math.min(innerHeight - SIZE, Math.max(0, start.t + dy)) + 'px';
      });
      function end() {
        if (!start) return;
        start = null; a.classList.remove('is-active', 'is-dragging');
        if (!dragged) return;
        pos = { side: a.offsetLeft + SIZE / 2 < innerWidth / 2 ? 'left' : 'right', y: (a.offsetTop + SIZE / 2) / innerHeight };
        try { localStorage.setItem(key, JSON.stringify(pos)); } catch (_) {}
        place();
      }
      a.addEventListener('pointerup', end); a.addEventListener('pointercancel', end);
      a.addEventListener('click', function (e) { if (dragged) { e.preventDefault(); dragged = false; } }); // 剛拖完不算點擊
      a.addEventListener('contextmenu', function (e) { e.preventDefault(); }); // 手機長按不跳出連結選單
    }
  function add() {
    if (document.getElementById('lfHomeBtn')) return;
    var s = document.createElement('style');
    s.textContent = CSS.replace('Z', '2147483647');
    document.head.appendChild(s);
    var a = document.createElement('a');
    a.id = 'lfHomeBtn'; a.href = home; a.title = 'LinFamily 主畫面'; a.setAttribute('aria-label', '回 LinFamily 主畫面');
    a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg>';
    document.body.appendChild(a);
    var site = /^\/ya(\/|$)/.test(location.pathname) ? 'ya' : /^\/sr(\/|$)/.test(location.pathname) ? 'sr' : 'dx';
    homeDraggable(a, 'clc_homebtn_' + site);
  }
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
