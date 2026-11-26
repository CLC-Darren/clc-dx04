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
    // 手指還是滑鼠：一開始看裝置（任何一種是觸控就算），之後每次按下依實際輸入切換 .dk-touch（CSS 依此決定調整大小的方式）
    root.classList.toggle('dk-touch', matchMedia('(pointer:coarse), (any-pointer:coarse)').matches);
    function guardTouch(e) {
      var touch = e.type === 'touchstart' || e.pointerType === 'touch' || e.pointerType === 'pen';
      if (e.type === 'pointerdown' || touch) root.classList.toggle('dk-touch', touch);
      // 手指：卡片沒被長按選取時，邊緣不能直接拉大小（這次按下的事件不交給 gridstack）
      var h = touch && e.target.closest && e.target.closest('.ui-resizable-handle');
      if (h && !(h.parentElement && h.parentElement.classList.contains('dk-sel'))) e.stopPropagation();
    }
    root.addEventListener('pointerdown', guardTouch, { capture: true, passive: true });
    root.addEventListener('touchstart', guardTouch, { capture: true, passive: true });
    root.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse' && root.classList.contains('dk-touch')) root.classList.remove('dk-touch'); }, { passive: true }); // 觸控筆電：滑鼠一移動就換回電腦的拉邊方式

    function norm(m) { return m ? JSON.stringify(m.__byCols || null) + JSON.stringify(Object.keys(m).filter(function (k) { return k.slice(0, 2) !== '__'; }).sort().map(function (k) { var p = m[k] || {}; return [k, p.x, p.y, p.w, p.h]; })) : ''; }
    // opts.cell[mode]：格子固定寬（px）→ 欄數＝畫面放得下幾格（電腦版 App 大小不隨視窗變）；沒設就用固定欄數 COLS
    var CELL = opts.cell || {}, curCols = 0, temp = {};
    function calcCols() {
      if (!CELL[mode]) return COLS[mode];
      var w = root.clientWidth || window.innerWidth;
      return Math.max(opts.minCols || 4, Math.floor(w / CELL[mode]));
    }
    function cols() { return curCols || COLS[mode]; }
    // gridstack 10 的 CSS 只到 12 欄：其他欄數自己補寬度與位置，不然格子寬度會是 0
    function colCss(n) {
      if (n <= 12 || document.getElementById('dk-gs-' + n)) return;
      var s = '.gs-' + n + '>.grid-stack-item{width:' + (100 / n) + '%}';
      for (var i = 1; i <= n; i++) s += '.gs-' + n + '>.grid-stack-item[gs-x="' + i + '"]{left:' + (100 * i / n) + '%}.gs-' + n + '>.grid-stack-item[gs-w="' + i + '"]{width:' + (100 * i / n) + '%}';
      var st = document.createElement('style'); st.id = 'dk-gs-' + n; st.textContent = s; document.head.appendChild(st);
    }

    function marg() { var m = opts.margin == null ? 6 : opts.margin; return typeof m === 'object' ? m[mode] : m; }
    function clampPos(p, o) {
      var c = cols(), w = o.type === 'app' ? 1 : Math.max(minW(o), Math.min(p.w || 2, c, o.opt.maxW || c)), h = o.type === 'app' ? 1 : Math.max(minH(o), Math.min(p.h || 1, o.opt.maxH || 99));
      return { x: Math.max(0, Math.min(p.x, c - w)), y: Math.max(0, p.y), w: w, h: h };
    }
    // 卡片最小尺寸由每種卡片自己決定（像 Android widget）：put 的 o.minW / o.minH，可到 1×1；沒指定時 2×1
    function minW(o) { return Math.min(cols(), Math.max(1, o.opt.minW || 2)); }
    function minH(o) { return Math.max(1, o.opt.minH || 1); }
    function defSize(o) {
      if (o.type === 'app') return { w: 1, h: 1 };
      var c = cols(); return { w: Math.min(c, Math.max(minW(o), o.opt.w || 4)), h: Math.max(minH(o), o.opt.h || 3) };
    }
    // 手機第一次：用電腦版的順序（上到下、左到右）
    // 電腦版：每個欄數（視窗放得下幾格）各記一份 __byCols[欄數]；這個欄數沒調整過 → 用欄數最接近的那份照順序排（不自動存）
    function byOrder(src) { return { __order: Object.keys(src).filter(function (k) { return k.slice(0, 2) !== '__'; }).sort(function (a, b) { return (src[a].y - src[b].y) || (src[a].x - src[b].x); }) }; }
    var fromBy = false;
    function currentMap() {
      var m = layouts[mode]; fromBy = false;
      // 手機也固定格寬後：舊的手機排列都是 4 欄排的，當成 4 欄那份
      var by = m && CELL[mode] ? (m.__byCols || (mode === 'phone' ? { 4: m } : null)) : null;
      if (by) {
        var c = calcCols(), keys = Object.keys(by);
        if (by[c]) return by[c];
        if (keys.length) { fromBy = true; return byOrder(by[keys.sort(function (a, b) { return Math.abs(a - c) - Math.abs(b - c); })[0]]); }
      }
      if (m) return m;
      if (mode === 'phone' && layouts.desktop) {
        var src = layouts.desktop, ids = Object.keys(src).filter(function (k) { return k.slice(0, 2) !== '__'; }).sort(function (a, b) { return (src[a].y - src[b].y) || (src[a].x - src[b].x); });
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
      delete temp[id];
      if (pos && pos.x + (o.type === 'app' ? 1 : Math.max(minW(o), pos.w || 2)) > cols()) { temp[id] = pos; pos = null; } // 窄視窗放不下：暫時往下補，不存
      if (pos) { pos = clampPos(pos, o); it.setAttribute('gs-x', pos.x); it.setAttribute('gs-y', pos.y); s = { w: pos.w, h: pos.h }; }
      else if (placeAt && grid.isAreaEmpty(placeAt.x, placeAt.y, s.w, s.h)) { it.setAttribute('gs-x', placeAt.x); it.setAttribute('gs-y', placeAt.y); placeAt = null; }
      else it.setAttribute('gs-auto-position', 'true');
      it.setAttribute('gs-w', s.w); it.setAttribute('gs-h', s.h);
      if (o.type === 'app') it.setAttribute('gs-no-resize', 'true'); else { it.setAttribute('gs-min-w', minW(o)); it.setAttribute('gs-min-h', minH(o)); if (o.opt.maxW) it.setAttribute('gs-max-w', o.opt.maxW); if (o.opt.maxH) it.setAttribute('gs-max-h', o.opt.maxH); it.removeAttribute('gs-no-resize'); } // 最大尺寸（可選）：put 的 o.maxW / o.maxH
      root.appendChild(it); grid.makeWidget(it);
      if (o.type === 'app') grid.update(it, { noResize: true, w: 1, h: 1, minW: 1, maxW: 1, minH: 1, maxH: 1 }); // App 圖示固定 1×1，不能拖拉放大
    }
    // 依目前裝置的排列重排全部
    function relayout() {
      if (!grid) return;
      var m = currentMap(), ord = m.__order;
      derived = fromBy; // 照最接近欄數自動排的先不存；先設好：重排時的 change 不要存
      grid.batchUpdate();
      grid.removeAll(false);
      flushSave(); curCols = calcCols(); colCss(curCols); temp = {};
      grid.column(cols(), 'none');
      var ids = order.slice();
      if (ord) ids.sort(function (a, b) { var i = ord.indexOf(a), j = ord.indexOf(b); return (i < 0 ? 1e9 : i) - (j < 0 ? 1e9 : j); });
      ids.filter(function (id) { return !ord && m[id]; }).forEach(function (id) { add(id, m[id]); });
      ids.filter(function (id) { return ord || !m[id]; }).forEach(function (id) { add(id, null); });
      grid.batchUpdate(false);
      sizeCells();
      if (!derived && loaded[mode] && (ord || ids.some(function (id) { return !m[id]; }))) queueSave();
    }
    function merged() { // 暫時補位的格子存回原本位置
      var m = snapshot(); Object.keys(temp).forEach(function (id) { if (m[id]) m[id] = temp[id]; }); return m;
    }
    function flushSave() { if (saveT) { clearTimeout(saveT); saveT = null; doSave(); } }
    function snapshot() {
      var out = {};
      (grid ? grid.engine.nodes : []).forEach(function (n) { if (n.id) out[n.id] = { x: n.x, y: n.y, w: n.w, h: n.h }; });
      return out;
    }
    var derived = false;
    function queueSave() {
      if (!loaded[mode] || derived) return; // 照順序自動排的（這個欄數沒調整過）不存，使用者動過才存 // 雲端排列還沒讀到，不要蓋掉
      clearTimeout(saveT);
      saveT = setTimeout(doSave, 400);
    }
    function doSave() {
      saveT = null;
      {
        var m = merged();
        if (CELL[mode]) { var old = layouts[mode] || {}, by = Object.assign({}, old.__byCols || (mode === 'phone' && Object.keys(old).length ? { 4: old } : null)); by[curCols] = m; m = Object.assign({}, m, { __byCols: by }); }
        layouts[mode] = m;
        if (opts.saveLayout) Promise.resolve(opts.saveLayout(mode, m)).catch(function (e) { console.warn('排列儲存失敗', e); opts.error && opts.error(e); });
      }
    }
    function sizeCells() {
      if (!grid) return;
      // 格子寬＝root 寬／欄數（root 的最大寬度由各站 CSS 決定）；高＝寬 × ratio（App 圖示＋名稱）
      var w = root.clientWidth || window.innerWidth, cw = CELL[mode] || w / cols();
      grid.cellHeight(Math.round(cw * (opts.ratio || 1)));
      grid.margin(marg()); root.style.setProperty('--dk-m', marg() + 'px'); // 給手機選取框、圓點對齊卡片邊緣用
    }

    // ---------- 選單與刪除確認 ----------
    function closeMenu() { if (appIconMotion) { appIconMotion.cancel(); appIconMotion = null; } if (menuEl) { var m = menuEl; menuEl = null; m.classList.add('dk-menu-out'); setTimeout(function () { m.remove(); }, 160); } } // 收合動畫
    var appIconMotion = null;
    function openMenu(x, y, id, cell) {
      closeMenu();
      var item = id && items.get(id);
      var list = (opts.menu ? opts.menu({ id: id, type: item ? item.type : null, cell: cell }) : []) || [];
      var appName = item && item.type === 'app' && opts.appMenu && opts.appMenu(id);
      if (id && opts.onDelete) list = list.concat([{ label: '刪除', danger: true, run: function () { confirmDelete(id); } }]);
      if (!list.length) return;
      if (id && lp.touch) select(items.get(id) && items.get(id).el); // 手機：長按選取的卡片出現調整大小的圓點
      menuEl = document.createElement('div'); menuEl.className = 'dk-menu'; menuEl.setAttribute('role', 'menu');
      if (appName) {
        menuEl.classList.add('dk-app-menu');
        menuEl.setAttribute('aria-label', appName);
        var header = document.createElement('div'); header.className = 'dk-app-menu-header';
        var title = document.createElement('strong'); title.textContent = appName;
        header.appendChild(title);
        menuEl.appendChild(header);
      }
      list.forEach(function (m) {
        var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = m.label;
        if (m.danger) b.className = 'dk-danger';
        b.addEventListener('click', function () { if (cell) placeAt = cell; closeMenu(); m.run(); });
        menuEl.appendChild(b);
      });
      document.body.appendChild(menuEl);
      // 用實際大小（offset），不用 getBoundingClientRect：選單出現時有縮放動畫（.92），量到的會偏小，放在卡片上方就會壓到卡片
      var r = { width: menuEl.offsetWidth, height: menuEl.offsetHeight }, top = y;
      // 卡片：像 Android，選單放卡片下方，放不下放上方；都放不下就捲一點讓卡片和選單都看得到；卡片比螢幕高才浮在手指旁
      var card = item && item.el;
      if (appName && card) {
        var bounds = card.getBoundingClientRect();
        var icon = card.querySelector('[data-dk-app-icon]');
        var label = card.querySelector('[data-dk-app-name]');
        var iconBounds = icon && icon.getBoundingClientRect();
        x = iconBounds ? iconBounds.left : bounds.left;
        top = iconBounds ? iconBounds.bottom + 4 : label ? label.getBoundingClientRect().top : bounds.bottom - 20;
        if (icon && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          if (appIconMotion) appIconMotion.cancel();
          appIconMotion = icon.animate([
            { translate: '0 0' }, { translate: '0 -4px', offset: .4 },
            { translate: '0 1px', offset: .72 }, { translate: '0 0' }
          ], { duration: lp.touch ? 620 : 230, iterations: lp.touch ? Infinity : 1, easing: 'ease-in-out' });
        }
      } else if (card) {
        var c = card.getBoundingClientRect(), g = 8;
        if (c.bottom + g + r.height <= innerHeight - g) top = c.bottom + g;
        else if (c.top - g - r.height >= g) top = c.top - g - r.height;
        else if (c.height + g + r.height <= innerHeight - 2 * g) {
          // 捲動的是桌面外面那層（LF 是 section，不是整個視窗），找到真正會捲的那層來捲
          var sp = root.parentElement, dy = c.bottom + g + r.height - (innerHeight - g);
          while (sp && sp !== document.body && !(sp.scrollHeight > sp.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(sp).overflowY))) sp = sp.parentElement;
          if (sp && sp !== document.body) sp.scrollTop += dy; else scrollBy(0, dy);
          c = card.getBoundingClientRect(); top = c.bottom + g;
        }
        x = c.left; // 像 Android：選單跟卡片左邊切齊
        menuEl.style.transformOrigin = (top < c.top ? 'bottom ' : 'top ') + 'left';
      }
      menuEl.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
      menuEl.style.top = Math.max(8, Math.min(top, innerHeight - r.height - 8)) + 'px';
    }
    var selEl = null;
    function select(el) { if (selEl) selEl.classList.remove('dk-sel'); selEl = el && el.classList.contains('dk-card') ? el : null; if (selEl) selEl.classList.add('dk-sel'); }
    document.addEventListener('touchstart', function (e) { if (selEl && !selEl.contains(e.target) && !(menuEl && menuEl.contains(e.target))) select(null); }, { capture: true, passive: true });
    function confirmDelete(id) {
      if (!dlg) {
        dlg = document.createElement('dialog'); dlg.className = 'dk-confirm';
        dlg.innerHTML = '<form method="dialog"><p></p><div class="dk-actions"><button value="no">取消</button><button value="yes" class="dk-danger">刪除</button></div></form>';
        document.body.appendChild(dlg);
      }
      var name = opts.label ? opts.label(id) : '';
      dlg.querySelector('p').textContent = (opts.deleteMessage && opts.deleteMessage(id)) || ('確認刪除' + (name ? '「' + name + '」' : '') + '？');
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

    // ---------- 手機：長按 0.5 秒 → 選單（卡片出現調整大小的圓點）；手指一移動 → 收選單、變拖曳 ----------
    var lp = { timer: 0, armed: false, drag: false, touch: false, sx: 0, sy: 0, handle: null, id: null };
    function mouse(type, target, x, y) {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1, view: window }));
    }
    root.addEventListener('touchstart', function (e) {
      lp.touch = true;
      if (e.touches.length !== 1 || !canEdit()) return;
      var t = e.touches[0], handle = e.target.closest('.dk-handle');
      var inItem = e.target.closest('.dk-item');
      // 整張卡片都能長按；有自己操作的地方不攔截（輸入框、待辦項目拖曳排序等）
      if (inItem && !handle && e.target.closest(opts.noPress || 'input,textarea,select,[contenteditable="true"],[data-dk-nopress],.todo-row')) return;
      if (handle) e.stopPropagation(); // gridstack 不直接接手觸控；長按後才交給它
      lp.sx = t.clientX; lp.sy = t.clientY; lp.own = !!handle; lp.handle = handle || (inItem && inItem.querySelector('.dk-handle')); lp.id = hitId(e.target); lp.armed = false; lp.drag = false;
      clearTimeout(lp.timer);
      lp.timer = setTimeout(function () {
        lp.armed = true; if (navigator.vibrate) navigator.vibrate(12);
        openMenu(lp.sx, lp.sy, lp.id, lp.id ? null : cellAt(lp.sx, lp.sy));
      }, opts.longPress || 500);
    }, { capture: true, passive: true });
    root.addEventListener('touchmove', function (e) {
      var t = e.touches[0]; if (!t) return;
      var moved = Math.abs(t.clientX - lp.sx) + Math.abs(t.clientY - lp.sy);
      if (!lp.armed) { if (moved > 10) clearTimeout(lp.timer); if (lp.own) e.stopPropagation(); return; }
      e.preventDefault(); e.stopPropagation();
      if (!lp.handle) return;
      if (!lp.drag && moved > 12) { // 像 Android：選單出來後手指移動超過一點點 → 選單收起、變成拖曳
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
        handle: '.dk-handle', resizable: { handles: 'n,ne,e,se,s,sw,w,nw' }
      }, root);
      root.style.setProperty('--dk-m', marg() + 'px');
      // 拖曳時最多只能放到「目前最下面一排」再往下 2 排；要更下面就再拖一次（手機、電腦都一樣）。新增的卡片不受限制。
      function setMaxRow(n) { grid.opts.maxRow = n; if (grid.engine) grid.engine.maxRow = n; }
      // 拖曳／調整大小開始：記下每一格原本的位置；拖曳另外算出「最多到哪一排」（不算正在拖的這張）
      var pre = null, limitY = null;
      // 注意：gridstack 的 dragstart／dragstop 等事件每種只能掛一個處理函式（後掛的會蓋掉前面的），所以全部寫在同一個裡
      grid.on('dragstart resizestart', function (e, el) {
        closeMenu(); // 開始移動或調整大小就收起選單
        var me = el && el.gridstackNode, b = 0; pre = new Map();
        grid.engine.nodes.forEach(function (n) { pre.set(n, { x: n.x, y: n.y }); if (n !== me) b = Math.max(b, n.y + n.h); });
        limitY = e.type === 'dragstart' && me ? Math.max(b + 2, me.y) : null; // 這張的上緣最多到其他東西最下面再往下 2 排
        dragNode = limitY != null ? me : null;
        if (limitY != null) setMaxRow(limitY + me.h);
      });
      // gridstack 的 maxRow 會跟著「目前最下面一排」一起變大（拖下去一排，限制就多一排），慢慢往下拖等於沒有限制；
      // 所以拖曳中每一步直接把位置夾在限制內，畫面上就拖不下去
      var dragNode = null, moveCheck = grid.engine.moveNodeCheck;
      grid.engine.moveNodeCheck = function (n, o) {
        if (n === dragNode && limitY != null && o && o.y > limitY) o = Object.assign({}, o, { y: limitY });
        return moveCheck.call(this, n, o);
      };
      function overlaps(n, x, y) {
        return grid.engine.nodes.some(function (o) { return o !== n && x < o.x + o.w && x + n.w > o.x && y < o.y + o.h && y + n.h > o.y; });
      }
      grid.on('dragstop resizestop', function (e, el) {
        var me = el && el.gridstackNode;
        setMaxRow(0);
        // 保險：拖曳中沒擋住的話，放手時拉回到限制內
        if (me && limitY != null && me.y > limitY && !overlaps(me, me.x, limitY)) grid.update(me.el, { y: limitY });
        dragNode = null;
        // 被擠開往下掉的格子：先往上找最近的空位補進去，沒有才留在下面（自己留的空格不動）
        if (pre) {
          var cols = grid.getColumn();
          grid.engine.nodes.filter(function (n) { var p = pre.get(n); return n !== me && p && n.y > p.y; })
            .sort(function (a, b) { return pre.get(a).y - pre.get(b).y; })
            .forEach(function (n) {
              var p = pre.get(n), best = null, bd = 1e9;
              for (var y = p.y; y >= 0; y--) for (var x = 0; x + n.w <= cols; x++) {
                var d = (p.y - y) * cols + Math.abs(x - p.x);
                if (d < bd && !overlaps(n, x, y)) { best = { x: x, y: y }; bd = d; }
              }
              if (best) grid.update(n.el, best);
            });
        }
        pre = null; limitY = null;
        justDragged = Date.now(); derived = false; queueSave(); if (el) delete temp[el.getAttribute('gs-id')]; // 使用者動過的就照新位置存
      });
      grid.on('change', queueSave);
      relayout();
    }).catch(function (e) { console.warn('gridstack 載入失敗', e); opts.error && opts.error(e); });

    phoneMq.addEventListener('change', function () {
      if (grid && Object.keys(snapshot()).length) layouts[mode] = layouts[mode] || snapshot();
      mode = phoneMq.matches ? 'phone' : 'desktop'; relayout();
    });
    // 拉視窗：每一格當下就重算欄數（不等停手），拉的時候關動畫，App 不會先變形再彈回
    var rF = 0, rT = 0;
    addEventListener('resize', function () {
      if (!grid || rF) return;
      rF = requestAnimationFrame(function () {
        rF = 0; grid.setAnimation(false); clearTimeout(rT);
        rT = setTimeout(function () { grid.setAnimation(true); }, 300);
        if (calcCols() !== curCols) relayout(); else sizeCells();
      });
    });

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
      // 往上整理：把空出來的列往上補齊（排得太長時用），存成這台裝置模式（手機／電腦）的新排列
      compact: function () { if (!grid) return; derived = false; grid.compact(); queueSave(); },
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
