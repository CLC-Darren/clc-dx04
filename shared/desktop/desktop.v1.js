/* CLC 共用桌面格子引擎 v1（gridstack.js）
 * 用法見 /shared/README.md。各站自己存資料：引擎只回報排列（saveLayout）與刪除（onDelete）。
 * 排列：{ desktop:{id:{x,y,w,h}}, phone:{...} }；手機第一次沒有排列時，依電腦版順序自動換算。
 */
(function () {
  'use strict';
  var GS_VER = '10.3.1', CDN = 'https://cdn.jsdelivr.net/npm/gridstack@' + GS_VER + '/dist/';
  var gsReady = null;
  function loadGridstack() {
    if (window.GridStack) return Promise.resolve();
    if (gsReady) return gsReady;
    ['gridstack.min.css', 'gridstack-extra.min.css'].forEach(function (f) {
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CDN + f; document.head.appendChild(l);
    });
    gsReady = new Promise(function (ok, fail) {
      var s = document.createElement('script'); s.src = CDN + 'gridstack-all.js';
      s.onload = function () { ok(); }; s.onerror = fail; document.head.appendChild(s);
    });
    return gsReady;
  }

  window.clcDesktop = function (root, opts) {
    opts = opts || {};
    var COLS = Object.assign({ desktop: 10, phone: 4 }, opts.cols);
    var phoneMq = matchMedia(opts.phoneQuery || '(max-width: 699px)');
    var items = new Map();   // id → { type, el, content, opt }
    var order = [];          // 加入順序（沒有排列時用）
    var layouts = { desktop: null, phone: null };
    var mode = phoneMq.matches ? 'phone' : 'desktop';
    var loaded = { desktop: !opts.waitLayout, phone: !opts.waitLayout };
    var grid = null, saveT = null, justDragged = 0, placeAt = null, menuEl = null, dlg = null;

    root.classList.add('grid-stack', 'dk-root');

    function norm(m) { return m ? JSON.stringify(Object.keys(m).sort().map(function (k) { var p = m[k] || {}; return [k, p.x, p.y, p.w, p.h]; })) : ''; }
    function cols() { return COLS[mode]; }
    function marg() { var m = opts.margin == null ? 6 : opts.margin; return typeof m === 'object' ? m[mode] : m; }
    function clampPos(p, o) {
      var c = cols(), w = o.type === 'app' ? 1 : Math.max(2, Math.min(p.w || 2, c)), h = o.type === 'app' ? 1 : Math.max(1, p.h || 1);
      return { x: Math.max(0, Math.min(p.x, c - w)), y: Math.max(0, p.y), w: w, h: h };
    }
    function defSize(o) {
      if (o.type === 'app') return { w: 1, h: 1 };
      var c = cols(); return { w: Math.min(c, Math.max(2, o.opt.w || 4)), h: Math.max(1, o.opt.h || 3) };
    }
    // 手機第一次：用電腦版的順序（上到下、左到右）
    function currentMap() {
      var m = layouts[mode];
      if (m) return m;
      if (mode === 'phone' && layouts.desktop) {
        var src = layouts.desktop, ids = Object.keys(src).sort(function (a, b) { return (src[a].y - src[b].y) || (src[a].x - src[b].x); });
        return { __order: ids };
      }
      return {};
    }

    function wrap(id, o) {
      var it = document.createElement('div'); it.className = 'grid-stack-item dk-item dk-' + o.type; it.setAttribute('gs-id', id);
      var c = document.createElement('div'); c.className = 'grid-stack-item-content';
      if (o.type === 'app') c.classList.add('dk-handle');
      c.appendChild(o.content); it.appendChild(c); o.el = it; return it;
    }
    function add(id, pos) {
      var o = items.get(id); if (!o.el) wrap(id, o);
      var s = defSize(o), it = o.el;
      ['gs-x', 'gs-y', 'gs-auto-position'].forEach(function (a) { it.removeAttribute(a); });
      if (pos) { pos = clampPos(pos, o); it.setAttribute('gs-x', pos.x); it.setAttribute('gs-y', pos.y); s = { w: pos.w, h: pos.h }; }
      else if (placeAt && grid.isAreaEmpty(placeAt.x, placeAt.y, s.w, s.h)) { it.setAttribute('gs-x', placeAt.x); it.setAttribute('gs-y', placeAt.y); placeAt = null; }
      else it.setAttribute('gs-auto-position', 'true');
      it.setAttribute('gs-w', s.w); it.setAttribute('gs-h', s.h);
      if (o.type === 'app') it.setAttribute('gs-no-resize', 'true'); else { it.setAttribute('gs-min-w', 2); it.removeAttribute('gs-no-resize'); }
      root.appendChild(it); grid.makeWidget(it);
    }
    // 依目前裝置的排列重排全部
    function relayout() {
      if (!grid) return;
      var m = currentMap(), ord = m.__order;
      grid.batchUpdate();
      grid.removeAll(false);
      grid.column(cols(), 'none');
      var ids = order.slice();
      if (ord) ids.sort(function (a, b) { var i = ord.indexOf(a), j = ord.indexOf(b); return (i < 0 ? 1e9 : i) - (j < 0 ? 1e9 : j); });
      ids.filter(function (id) { return !ord && m[id]; }).forEach(function (id) { add(id, m[id]); });
      ids.filter(function (id) { return ord || !m[id]; }).forEach(function (id) { add(id, null); });
      grid.batchUpdate(false);
      sizeCells();
      if (loaded[mode] && (ord || ids.some(function (id) { return !m[id]; }))) queueSave();
    }
    function snapshot() {
      var out = {};
      (grid ? grid.engine.nodes : []).forEach(function (n) { if (n.id) out[n.id] = { x: n.x, y: n.y, w: n.w, h: n.h }; });
      return out;
    }
    function queueSave() {
      if (!loaded[mode]) return; // 雲端排列還沒讀到，不要蓋掉
      clearTimeout(saveT);
      saveT = setTimeout(function () {
        var m = snapshot(); layouts[mode] = m;
        if (opts.saveLayout) Promise.resolve(opts.saveLayout(mode, m)).catch(function (e) { console.warn('排列儲存失敗', e); opts.error && opts.error(e); });
      }, 400);
    }
    function sizeCells() {
      if (!grid) return;
      // 格子寬＝root 寬／欄數（root 的最大寬度由各站 CSS 決定）；高＝寬 × ratio（App 圖示＋名稱）
      var w = root.clientWidth || window.innerWidth, cw = w / cols();
      grid.cellHeight(Math.round(cw * (opts.ratio || 1)));
      grid.margin(marg());
    }

    // ---------- 選單與刪除確認 ----------
    function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } root.classList.remove('dk-wiggle'); }
    function openMenu(x, y, id, cell) {
      closeMenu();
      var list = (opts.menu ? opts.menu({ id: id, type: id ? items.get(id).type : null, cell: cell }) : []) || [];
      if (id && opts.onDelete) list = list.concat([{ label: '刪除', danger: true, run: function () { confirmDelete(id); } }]);
      if (!list.length) return;
      if (id) root.classList.add('dk-wiggle'); // 只有可刪除的格子才抖
      menuEl = document.createElement('div'); menuEl.className = 'dk-menu'; menuEl.setAttribute('role', 'menu');
      list.forEach(function (m) {
        var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = m.label;
        if (m.danger) b.className = 'dk-danger';
        b.addEventListener('click', function () { if (cell) placeAt = cell; closeMenu(); m.run(); });
        menuEl.appendChild(b);
      });
      document.body.appendChild(menuEl);
      var r = menuEl.getBoundingClientRect();
      menuEl.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
      menuEl.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    }
    function confirmDelete(id) {
      if (!dlg) {
        dlg = document.createElement('dialog'); dlg.className = 'dk-confirm';
        dlg.innerHTML = '<form method="dialog"><p></p><div class="dk-actions"><button value="no">取消</button><button value="yes" class="dk-danger">刪除</button></div></form>';
        document.body.appendChild(dlg);
      }
      var name = opts.label ? opts.label(id) : '';
      dlg.querySelector('p').textContent = '確認刪除' + (name ? '「' + name + '」' : '') + '？';
      dlg.returnValue = '';
      dlg.onclose = function () { if (dlg.returnValue === 'yes') opts.onDelete(id, items.get(id) && items.get(id).type); };
      dlg.showModal();
    }
    function hitId(t) { var it = t && t.closest && t.closest('.dk-item'); return it && root.contains(it) ? it.getAttribute('gs-id') : null; }
    function cellAt(x, y) { try { var c = grid.getCellFromPixel({ left: x, top: y }, false); return { x: c.x, y: c.y }; } catch (_) { return null; } }
    function canEdit() { return !opts.canEdit || opts.canEdit(); }

    document.addEventListener('pointerdown', function (e) { if (menuEl && !menuEl.contains(e.target) && !lp.armed) closeMenu(); }, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    root.addEventListener('contextmenu', function (e) {
      if (e.target.closest('input,textarea,[contenteditable="true"]')) return;
      e.preventDefault();
      if (lp.touch || !canEdit()) return; // 觸控長按由下面處理
      var id = hitId(e.target); openMenu(e.clientX, e.clientY, id, id ? null : cellAt(e.clientX, e.clientY));
    });
    // 拖完放手不要觸發點擊（開 App）
    root.addEventListener('click', function (e) { if (Date.now() - justDragged < 350) { e.preventDefault(); e.stopPropagation(); } }, true);

    // ---------- 手機：長按 0.5 秒 → 抖動＋選單；手指一移動 → 收選單、變拖曳 ----------
    var lp = { timer: 0, armed: false, drag: false, touch: false, sx: 0, sy: 0, handle: null, id: null };
    function mouse(type, target, x, y) {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1, view: window }));
    }
    root.addEventListener('touchstart', function (e) {
      lp.touch = true;
      if (e.touches.length !== 1 || !canEdit()) return;
      var t = e.touches[0], handle = e.target.closest('.dk-handle');
      var inItem = e.target.closest('.dk-item');
      if (inItem && !handle) return; // 卡片內容（待辦等）照常操作
      if (handle) e.stopPropagation(); // gridstack 不直接接手觸控；長按後才交給它
      lp.sx = t.clientX; lp.sy = t.clientY; lp.handle = handle; lp.id = hitId(e.target); lp.armed = false; lp.drag = false;
      clearTimeout(lp.timer);
      lp.timer = setTimeout(function () {
        lp.armed = true; if (navigator.vibrate) navigator.vibrate(12);
        openMenu(lp.sx, lp.sy, lp.id, lp.id ? null : cellAt(lp.sx, lp.sy));
      }, opts.longPress || 500);
    }, { capture: true, passive: true });
    root.addEventListener('touchmove', function (e) {
      var t = e.touches[0]; if (!t) return;
      var moved = Math.abs(t.clientX - lp.sx) + Math.abs(t.clientY - lp.sy);
      if (!lp.armed) { if (moved > 10) clearTimeout(lp.timer); if (lp.handle) e.stopPropagation(); return; }
      e.preventDefault(); e.stopPropagation();
      if (!lp.handle) return;
      if (!lp.drag && moved > 8) {
        closeMenu();
        lp.drag = true; mouse('mousedown', lp.handle, lp.sx, lp.sy);
      }
      if (lp.drag) mouse('mousemove', document, t.clientX, t.clientY);
    }, { capture: true, passive: false });
    function touchEnd(e) {
      clearTimeout(lp.timer);
      if (lp.armed) {
        if (e.cancelable) e.preventDefault(); e.stopPropagation();
        if (lp.drag) { var t = e.changedTouches[0]; mouse('mouseup', document, t.clientX, t.clientY); }
      }
      lp.armed = false; lp.drag = false; lp.handle = null;
      setTimeout(function () { lp.touch = false; }, 600);
    }
    root.addEventListener('touchend', touchEnd, { capture: true, passive: false });
    root.addEventListener('touchcancel', touchEnd, { capture: true, passive: false });

    // ---------- 啟動 ----------
    var ready = loadGridstack().then(function () {
      grid = GridStack.init({
        column: cols(), cellHeight: 100, margin: marg(), float: true, animate: true,
        handle: '.dk-handle', resizable: { handles: 'se' }
      }, root);
      grid.on('dragstart resizestart', function () { closeMenu(); }); // 移動時不抖動
      grid.on('dragstop resizestop', function () { justDragged = Date.now(); });
      grid.on('change', queueSave);
      relayout();
    }).catch(function (e) { console.warn('gridstack 載入失敗', e); opts.error && opts.error(e); });

    phoneMq.addEventListener('change', function () {
      if (grid && Object.keys(snapshot()).length) layouts[mode] = layouts[mode] || snapshot();
      mode = phoneMq.matches ? 'phone' : 'desktop'; relayout();
    });
    var rT = 0; addEventListener('resize', function () { clearTimeout(rT); rT = setTimeout(sizeCells, 120); });

    return {
      ready: ready,
      mode: function () { return mode; },
      // 放入或更新一格：type 'app'（固定 1×1）或 'card'（可調大小，最小 2×1）
      put: function (id, content, o) {
        o = o || {};
        var cur = items.get(id);
        if (cur) {
          if (cur.content !== content) { cur.content.replaceWith(content); cur.content = content; }
          cur.opt = o; return;
        }
        items.set(id, { type: o.type || 'app', content: content, opt: o, el: null }); order.push(id);
        if (grid) { var m = currentMap(); add(id, m.__order ? null : m[id]); }
      },
      drop: function (id) {
        var o = items.get(id); if (!o) return;
        if (grid && o.el) grid.removeWidget(o.el, true);
        items.delete(id); order = order.filter(function (x) { return x !== id; });
      },
      has: function (id) { return items.has(id); },
      ids: function () { return order.slice(); },
      // 雲端排列進來（另一台裝置改的）
      setLayout: function (m, map) {
        map = map && typeof map === 'object' ? map : null;
        var first = !loaded[m]; loaded[m] = true;
        if (!first && norm(layouts[m]) === norm(map)) return;
        layouts[m] = map;
        if (m === mode || (mode === 'phone' && !layouts.phone)) relayout();
      },
      // 搜尋：每格自己提供可搜尋文字（put 的 o.searchText）
      search: function (q) {
        q = String(q || '').trim().toLowerCase(); var hits = [];
        root.classList.toggle('dk-searching', !!q);
        order.forEach(function (id) {
          var o = items.get(id), txt = o.opt.searchText ? o.opt.searchText() : (o.content.textContent || '');
          var ok = !q || String(txt).toLowerCase().indexOf(q) >= 0;
          if (o.el) o.el.classList.toggle('dk-dim', !ok);
          if (q && ok) hits.push(id);
        });
        return hits;
      },
      element: function (id) { var o = items.get(id); return o && o.el; },
      placeNext: function (cell) { placeAt = cell; },
      openMenu: openMenu, closeMenu: closeMenu, relayout: relayout
    };
  };
})();
