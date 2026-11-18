// 從 LinFamily 點進來（網址帶 ?lfhome=…）時，左下角顯示淡淡的圓形 🏠 浮動鈕回 LinFamily 主畫面。同一個分頁內切頁、切分站都會保留。
// 平常淡淡半透明、吸在左或右邊且一半藏在畫面外；按住可拖動，點一下回 LinFamily。Worker 自動插入各站 HTML。
(function () {
  var script = document.currentScript;
  var configuredHome = script && script.getAttribute('data-home');
  var configuredKey = script && script.getAttribute('data-key');
  if (window.top !== window || (!configuredHome && /^\/lf(\/|$)/.test(location.pathname))) return;
  var K = 'lfHome', home = configuredHome || '';
  if (!configuredHome) try {
    var u = new URL(location.href), h = u.searchParams.get('lfhome');
    if (h && /^https?:\/\//i.test(h)) {
      sessionStorage.setItem(K, h);
      u.searchParams.delete('lfhome'); history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }
    home = sessionStorage.getItem(K) || '';
  } catch (_) {}
  if (!home) return;
    // 🏠：可以停在畫面任何地方（圓形）；放在左右邊緣附近會吸附、收成半圓貼邊，碰到時變成圓頭長方形；
    // 長按（不移動）回到預設位置（左下貼邊）。位置記在這個瀏覽器（每站各自記）。點一下回 LinFamily。
    var CSS = '#lfHomeBtn{position:fixed;z-index:Z;width:44px;height:44px;border-radius:22px;display:grid;place-items:center;' +
      'background:rgba(28,28,28,.45);color:#fff;opacity:.28;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 2px 8px rgba(0,0,0,.15);' +
      'cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;overflow:hidden;' +
      'transition:opacity .2s,width .2s ease,border-radius .2s ease,left .25s ease,top .25s ease}' +
      '#lfHomeBtn svg{width:22px;height:22px;display:block;pointer-events:none;flex:none;transition:transform .2s}' +
      '#lfHomeBtn.edge-left{width:22px;border-radius:0 22px 22px 0}' +
      '#lfHomeBtn.edge-right{width:22px;border-radius:22px 0 0 22px}' +
      '#lfHomeBtn.edge-left svg{transform:translateX(-11px)}#lfHomeBtn.edge-right svg{transform:translateX(11px)}' + // 收起來時房子正好切在螢幕邊緣，只露出一半
      // 拉出來＝圓頭長方形（貼邊那側是平的）；手機只在手指按住時拉出，放開就收回半圓（不用 :hover，避免手機點完一直卡在拉出狀態）
      '#lfHomeBtn.is-active,#lfHomeBtn:focus-visible{opacity:.9;outline:none}' +
      '#lfHomeBtn.edge-left.is-active,#lfHomeBtn.edge-right.is-active,#lfHomeBtn.edge-left:focus-visible,#lfHomeBtn.edge-right:focus-visible{width:50px;place-items:center}' +
      '#lfHomeBtn.is-active svg,#lfHomeBtn:focus-visible svg{transform:none}' +
      '@media (hover:hover){#lfHomeBtn:hover{opacity:.9}#lfHomeBtn.edge-left:hover,#lfHomeBtn.edge-right:hover{width:50px;place-items:center}#lfHomeBtn:hover svg{transform:none}}' +
      '#lfHomeBtn.is-dragging{transition:opacity .2s;opacity:.9;width:44px;border-radius:22px;place-items:center}#lfHomeBtn.is-dragging svg{transform:none}' +
      '#lfHomeBtn.is-reset{animation:lfHomePing .5s ease}@keyframes lfHomePing{50%{opacity:1;transform:scale(1.15)}}';
    function homeDraggable(a, key) {
      var SIZE = 44, SNAP = 40, DEF = { edge: 'left', y: 0.86 };
      var pos = DEF, start = null, dragged = false, pressT = null, didReset = false;
      try { var sv = JSON.parse(localStorage.getItem(key) || 'null'); if (sv && sv.y >= 0 && sv.y <= 1 && (sv.edge === 'left' || sv.edge === 'right' || (sv.edge === '' && sv.x >= 0 && sv.x <= 1))) pos = sv; } catch (_) {}
      function clampTop(cy) { return Math.min(innerHeight - SIZE - 8, Math.max(8, cy - SIZE / 2)); }
      function place() {
        a.classList.toggle('edge-left', pos.edge === 'left');
        a.classList.toggle('edge-right', pos.edge === 'right');
        a.style.top = clampTop(pos.y * innerHeight) + 'px';
        if (pos.edge === 'left') { a.style.left = '0px'; a.style.right = ''; }
        else if (pos.edge === 'right') { a.style.left = ''; a.style.right = '0px'; }
        else { a.style.right = ''; a.style.left = Math.min(innerWidth - SIZE - 8, Math.max(8, pos.x * innerWidth - SIZE / 2)) + 'px'; }
      }
      function save() { try { localStorage.setItem(key, JSON.stringify(pos)); } catch (_) {} }
      place(); addEventListener('resize', place);
      a.draggable = false; a.style.webkitUserDrag = 'none';
      a.addEventListener('dragstart', function (e) { e.preventDefault(); }); // 不讓瀏覽器把連結當成拖曳檔案（會中斷拖動）
      a.addEventListener('pointerdown', function (e) {
        var r = a.getBoundingClientRect();
        start = { x: e.clientX, y: e.clientY, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; dragged = false; didReset = false;
        a.classList.add('is-active'); try { a.setPointerCapture(e.pointerId); } catch (_) {}
        clearTimeout(pressT);
        pressT = setTimeout(function () { // 長按不動：回到預設位置
          if (!start || dragged) return;
          didReset = true; pos = DEF; save(); place();
          a.classList.remove('is-reset'); void a.offsetWidth; a.classList.add('is-reset');
        }, 650);
      });
      a.addEventListener('pointermove', function (e) {
        if (!start) return;
        var dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (!dragged && Math.sqrt(dx * dx + dy * dy) < 10) return; // 移動超過 10px 才算拖動
        dragged = true; clearTimeout(pressT);
        a.classList.add('is-dragging'); a.classList.remove('edge-left', 'edge-right'); a.style.right = '';
        var cx = Math.min(innerWidth - SIZE / 2, Math.max(SIZE / 2, start.cx + dx)), cy = Math.min(innerHeight - SIZE / 2, Math.max(SIZE / 2, start.cy + dy));
        a.style.left = (cx - SIZE / 2) + 'px'; a.style.top = (cy - SIZE / 2) + 'px';
      });
      function end() {
        if (!start) return;
        clearTimeout(pressT); start = null; a.classList.remove('is-active', 'is-dragging');
        if (!dragged) return;
        var r = a.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        pos = cx < SNAP ? { edge: 'left', y: cy / innerHeight }           // 靠近左右邊緣：吸附貼邊
          : cx > innerWidth - SNAP ? { edge: 'right', y: cy / innerHeight }
          : { edge: '', x: cx / innerWidth, y: cy / innerHeight };          // 其他地方：停在原地
        save(); place();
      }
      a.addEventListener('pointerup', end); a.addEventListener('pointercancel', end);
      a.addEventListener('click', function (e) { if (dragged || didReset) { e.preventDefault(); dragged = false; didReset = false; } }); // 拖完、長按重設都不算點擊
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
    homeDraggable(a, configuredKey || (configuredHome
      ? 'linfamily_homebtn_' + location.pathname.replace(/[^\w]+/g, '_')
      : 'clc_homebtn_' + site));
  }
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
