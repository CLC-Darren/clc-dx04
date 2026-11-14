/**
 * CLC 共用「主畫面格子」(DX04、YA、SR 三站同一份程式；三站各放一份相同的檔案)
 * 像手機主畫面：每個 App 記住自己在第幾格（pos），中間可以留空格。
 * - 長按 App → 進入編輯（晃動）。晃動時：拖曳到空格＝移過去；拖到另一個 App 上＝互換位置；
 *   按「−」刪除、點 App 修改、按「完成」或點旁邊結束。
 *   新增：長按空格「＋」（晃動中點一下也可以），不容易誤觸。
 * - 長按後手指不放直接拖，也可以（跟手機一樣）。
 * - 只有 canEdit() 為 true 的人（Superuser）能編輯。
 *
 * 用法：
 *   const g = clcSlotGrid(gridEl, {
 *     minSlots: 6, cellClass: 'ha-cell', emptyClass: 'ha-slot', removeClass: 'ha-remove',
 *     doneButton: el,                    // 可省略，會自動在格子下方建立「完成」
 *     canEdit: () => bool,
 *     getItems: () => items,             // 每個 item 至少要有 id；pos 可省略（會依序補上）
 *     renderTile: (item, editing) => Element,
 *     save: async items => {},           // 移動後的新清單（含 pos）
 *     onAdd: pos => {}, onEdit: id => {}, onRemove: id => {},
 *     onEditingChange: editing => {}
 *   });
 *   g.render(); g.setEditing(false); g.isEditing();
 */
(function () {
  if (window.clcSlotGrid) return;
  if (!document.getElementById('clcSlotGridStyle')) {
    const st = document.createElement('style');
    st.id = 'clcSlotGridStyle';
    st.textContent = `
      .slot-cell { position:relative; aspect-ratio:1; -webkit-touch-callout:none; -webkit-user-select:none; user-select:none; }
      .slot-cell img { pointer-events:none; }
      /* iPhone：長按連結時不要讓系統接手（連結拖曳、預覽、選字），App 才能浮起來 */
      .slot-cell, .slot-cell * { -webkit-user-drag:none; -webkit-touch-callout:none; -webkit-user-select:none; user-select:none; -webkit-tap-highlight-color:transparent; }
      .slot-grid.is-editing .slot-cell { touch-action:none; cursor:grab; }
      .slot-grid.is-editing .slot-cell > :first-child { animation:clcSlotJiggle .32s ease-in-out infinite; animation-delay:var(--jiggle-delay,0s); }
      @keyframes clcSlotJiggle { 0%,100% { transform:rotate(-2deg); } 50% { transform:rotate(2deg); } }
      @media (prefers-reduced-motion: reduce) { .slot-grid.is-editing .slot-cell > :first-child { animation:none; } }
      .slot-cell.slot-pressing > :first-child { transform:scale(.92); transition:transform .45s; }
      .slot-cell.slot-source { opacity:.2; }
      .slot-grid .slot-target { outline:2px solid #00A3B4; outline-offset:3px; border-radius:22%; }
      .slot-floating { position:fixed !important; margin:0 !important; pointer-events:none; z-index:2147483646; will-change:transform; aspect-ratio:auto !important; }
      .slot-floating > :first-child { animation:none !important; transform:translateY(-10px) scale(1.22) rotate(-3deg); transition:transform .18s cubic-bezier(.2,.8,.3,1.2); }
      .slot-floating.slot-landing > :first-child { transform:scale(1) rotate(0); box-shadow:none; transition:transform .16s ease-out, box-shadow .16s; }
      .slot-empty.slot-pressing { transform:scale(.92); transition:transform .45s; }
      .slot-floating .slot-remove { display:none !important; }
      .slot-done { margin:14px auto 0; display:block; padding:8px 22px; border-radius:9999px; background:#007E8A; color:#fff; font-weight:700; font-size:14px; border:0; cursor:pointer; }
      .slot-done[hidden] { display:none; }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  // 依序補上沒有 pos 或重複的格子位置。
  function normalize(items) {
    const used = new Set(), out = [];
    items.forEach(it => {
      const p = Number.isInteger(it.pos) && it.pos >= 0 && it.pos < 400 && !used.has(it.pos) ? it.pos : null;
      if (p !== null) used.add(p);
      out.push(Object.assign({}, it, { pos: p }));
    });
    let next = 0;
    out.forEach(it => {
      if (it.pos !== null) return;
      while (used.has(next)) next++;
      it.pos = next; used.add(next);
    });
    return out;
  }
  window.clcSlotGridNormalize = normalize;

  window.clcSlotGrid = function (grid, o) {
    const LONG_PRESS = 700, MOVE_TOL = 9; // 長按 0.7 秒，避免誤觸
    let editing = false, items = [], saving = false;
    let g = null;              // 目前的手勢
    let suppressClickUntil = 0;
    grid.classList.add('slot-grid');
    let done = o.doneButton;
    if (!done) {
      done = document.createElement('button');
      done.type = 'button'; done.className = 'slot-done'; done.textContent = '完成'; done.hidden = true;
      grid.after(done);
    }
    done.addEventListener('click', () => setEditing(false));

    const canEdit = () => !!o.canEdit();
    function columns() {
      return getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
    }
    function render() {
      if (g && g.dragging) return; // 拖曳中不要重建
      if (!canEdit()) editing = false;
      items = normalize(o.getItems() || []);
      const admin = canEdit(), cols = columns();
      const byPos = new Map(items.map(it => [it.pos, it]));
      const maxPos = items.reduce((m, it) => Math.max(m, it.pos), -1);
      let total = Math.max(o.minSlots || 0, Math.ceil((maxPos + 1) / cols) * cols);
      if (admin && items.length >= total) total += cols; // 管理時至少留一格空格可新增
      total = Math.ceil(total / cols) * cols;
      grid.classList.toggle('is-editing', editing);
      const floating = Array.from(grid.querySelectorAll(':scope > .slot-floating')); // 落位動畫中的卡片保留
      grid.replaceChildren();
      for (let pos = 0; pos < total; pos++) {
        const it = byPos.get(pos);
        if (it) {
          const cell = document.createElement('div');
          cell.className = 'slot-cell ' + (o.cellClass || '');
          cell.dataset.slot = pos; cell.dataset.id = it.id; cell.dataset.sortId = it.id;
          cell.style.setProperty('--jiggle-delay', (-(pos % 3) * 0.11) + 's');
          const tile = o.renderTile(it, editing);
          tile.draggable = false;
          cell.append(tile);
          if (editing) cell.append(removeButton(it));
          grid.append(cell);
        } else if (admin) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'slot-empty is-admin ' + (o.emptyClass || '');
          b.dataset.slot = pos; b.textContent = '+'; b.title = '長按新增'; b.setAttribute('aria-label', '新增到第 ' + (pos + 1) + ' 格');
          grid.append(b);
        } else {
          const d = document.createElement('div');
          d.className = 'slot-empty ' + (o.emptyClass || '');
          d.dataset.slot = pos; d.setAttribute('aria-hidden', 'true'); d.textContent = '+';
          grid.append(d);
        }
      }
      floating.forEach(f => grid.appendChild(f));
      done.hidden = !editing;
    }
    function removeButton(it) {
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'slot-remove ' + (o.removeClass || '');
      rm.dataset.removeId = it.id;
      rm.setAttribute('aria-label', '移除 ' + (it.name || ''));
      rm.innerHTML = '<span aria-hidden="true"></span>';
      return rm;
    }
    // 切換編輯時不重建格子（避免長按中的手指失去目標），只加減「−」。
    function setEditing(on) {
      on = !!on && canEdit();
      if (editing === on) return;
      editing = on;
      grid.classList.toggle('is-editing', editing);
      grid.querySelectorAll('.slot-cell').forEach(cell => {
        const rm = cell.querySelector('.slot-remove');
        if (editing && !rm) { const it = items.find(x => x.id === cell.dataset.id); if (it) cell.append(removeButton(it)); }
        if (!editing && rm) rm.remove();
      });
      done.hidden = !editing;
      if (on && navigator.vibrate) navigator.vibrate(15);
      o.onEditingChange?.(editing);
    }

    // ---------- 拖曳 ----------
    function cellAt(x, y) {
      const el = document.elementFromPoint(x, y);
      const slot = el && el.closest && el.closest('[data-slot]');
      return slot && grid.contains(slot) ? slot : null;
    }
    function startDrag() {
      const cell = g.cell, r = cell.getBoundingClientRect();
      const f = cell.cloneNode(true);
      f.classList.remove('slot-pressing', 'slot-source');
      f.classList.add('slot-floating', 'reorder-floating');
      f.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      ['data-slot', 'data-id', 'data-sort-id'].forEach(a => f.removeAttribute(a));
      f.setAttribute('aria-hidden', 'true');
      f.style.left = r.left + 'px'; f.style.top = r.top + 'px'; f.style.width = r.width + 'px'; f.style.height = r.height + 'px';
      f.classList.add('slot-landing'); // 先跟原本一樣大，下一格畫面再「彈起來」
      grid.appendChild(f); // 放在格子裡面，才會套到各站 App 的樣式（position:fixed 不影響排版）
      requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('slot-landing')));
      cell.classList.add('slot-source');
      g.dragging = true; g.float = f; g.origin = { x: r.left, y: r.top };
      if (!editing) setEditing(true);
    }
    function moveDrag(x, y) {
      if (!g.moved && Math.hypot(x - g.x, y - g.y) < MOVE_TOL) return; // 手指小幅晃動不算移動
      g.moved = true;
      g.float.style.transform = `translate3d(${x - g.x}px,${y - g.y}px,0)`;
      const t = cellAt(x, y);
      if (g.target !== t) {
        g.target?.classList.remove('slot-target');
        g.target = t && t !== g.cell ? t : null;
        g.target?.classList.add('slot-target');
      }
      if (y < 60) window.scrollBy(0, -12); else if (y > innerHeight - 60) window.scrollBy(0, 12);
    }
    async function endDrag(commit) {
      const st = g; g = null;
      suppressClickUntil = Date.now() + 400;
      const ok = commit && st.target && !saving && canEdit();
      land(st.float, (ok ? st.target : st.cell).getBoundingClientRect(), st.origin);
      st.cell.classList.remove('slot-source');
      st.target?.classList.remove('slot-target');
      if (!ok) return;
      const from = Number(st.cell.dataset.slot), to = Number(st.target.dataset.slot);
      if (from === to) return;
      const moving = items.find(it => it.pos === from), other = items.find(it => it.pos === to);
      if (!moving) return;
      const next = items.map(it => it === moving ? Object.assign({}, it, { pos: to }) : it === other ? Object.assign({}, it, { pos: from }) : it);
      saving = true;
      items = next;
      try { await o.save(next); }
      catch (err) { console.warn('排列儲存失敗', err); o.error?.(err); }
      finally { saving = false; render(); }
    }
    // 放開時卡片滑進格子再消失（跟今日待辦一樣）
    function land(f, rect, origin) {
      if (!f) return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { f.remove(); return; }
      f.classList.add('slot-landing');
      f.style.transition = 'transform .16s ease-out';
      f.style.transform = `translate3d(${rect.left - origin.x}px,${rect.top - origin.y}px,0)`;
      setTimeout(() => f.remove(), 170);
    }
    function cancelGesture() {
      if (!g) return;
      clearTimeout(g.timer);
      g.cell.classList.remove('slot-pressing');
      if (g.dragging) endDrag(false); else g = null;
    }
    function begin(e, x, y, touch) {
      if (g && (!g.cell.isConnected || Date.now() - g.at > 8000)) { cancelGesture(); g = null; } // 上一次手勢沒收尾就重設
      if (saving || !canEdit() || g) return;
      if (e.target.closest('.slot-remove')) return;
      const empty = e.target.closest('.slot-empty.is-admin');
      if (empty && grid.contains(empty)) {
        if (editing) return; // 晃動中點一下「＋」就新增
        g = { cell: empty, empty: true, x, y, touch, at: Date.now(), held: false, dragging: false, target: null };
        empty.classList.add('slot-pressing');
        g.timer = setTimeout(() => {
          if (!g || !g.empty) return;
          empty.classList.remove('slot-pressing');
          suppressClickUntil = Date.now() + 600;
          if (navigator.vibrate) navigator.vibrate(15);
          const pos = Number(empty.dataset.slot); g = null;
          o.onAdd?.(pos);
        }, LONG_PRESS);
        return;
      }
      const cell = e.target.closest('.slot-cell');
      if (!cell || !grid.contains(cell)) return;
      g = { cell, x, y, touch, at: Date.now(), held: false, dragging: false, editingAtStart: editing, target: null };
      cell.classList.add('slot-pressing');
      g.timer = setTimeout(() => {
        if (!g) return;
        g.held = true;
        cell.classList.remove('slot-pressing');
        suppressClickUntil = Date.now() + 600;
        setEditing(true);
        startDrag(); // 長按一到就浮起來（跟今日待辦一樣），放開沒移動就落回原位
      }, LONG_PRESS);
    }
    function move(e, x, y) {
      if (!g) return false;
      const dist = Math.hypot(x - g.x, y - g.y);
      if (g.empty) { if (dist >= MOVE_TOL) cancelGesture(); return false; }
      if (!g.dragging) {
        if (dist < MOVE_TOL) return g.held || g.editingAtStart;
        if (!g.held && !g.editingAtStart) { cancelGesture(); return false; } // 一般捲動或左右滑
        clearTimeout(g.timer);
        g.cell.classList.remove('slot-pressing');
        startDrag();
      }
      moveDrag(x, y);
      return true;
    }
    function end() {
      if (!g) return;
      clearTimeout(g.timer);
      g.cell.classList.remove('slot-pressing');
      if (g.dragging) endDrag(true);
      else { if (g.held) suppressClickUntil = Date.now() + 400; g = null; }
    }

    // 滑鼠
    grid.addEventListener('mousedown', e => { if (e.button === 0) begin(e, e.clientX, e.clientY, false); });
    document.addEventListener('mousemove', e => { if (g && !g.touch && move(e, e.clientX, e.clientY)) e.preventDefault(); });
    document.addEventListener('mouseup', () => { if (g && !g.touch) end(); });
    grid.addEventListener('dragstart', e => { if (e.target.closest('.slot-cell')) e.preventDefault(); });
    // 觸控（用 touch 事件，才能在長按後擋住捲動）
    grid.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) { cancelGesture(); return; }
      const t = e.touches[0]; begin(e, t.clientX, t.clientY, true);
    }, { passive: true });
    // 放在 document：就算手指下的元素被換掉，也一定收得到結束事件。
    document.addEventListener('touchmove', e => {
      if (!g || !g.touch) return;
      const t = e.touches[0];
      if (move(e, t.clientX, t.clientY) && e.cancelable) e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchend', e => { if (g && g.touch) end(); });
    document.addEventListener('touchcancel', () => { if (g && g.touch) cancelGesture(); });
    // 手機長按不要跳出系統選單；電腦右鍵照常（可以「在新分頁開啟」）。
    let lastTouch = 0;
    grid.addEventListener('touchstart', () => { lastTouch = Date.now(); }, { passive: true, capture: true });
    grid.addEventListener('contextmenu', e => {
      if ((Date.now() - lastTouch < 1500 || editing) && e.target.closest('.slot-cell, .slot-empty')) e.preventDefault();
    });

    // ---------- 點擊 ----------
    grid.addEventListener('click', e => {
      if (Date.now() < suppressClickUntil) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      const rm = e.target.closest('.slot-remove');
      if (rm) { e.preventDefault(); e.stopImmediatePropagation(); o.onRemove?.(rm.dataset.removeId); return; }
      const empty = e.target.closest('.slot-empty.is-admin');
      if (empty) { e.preventDefault(); e.stopImmediatePropagation(); if (editing) o.onAdd?.(Number(empty.dataset.slot)); return; }
      const cell = e.target.closest('.slot-cell');
      if (cell && editing) { e.preventDefault(); e.stopImmediatePropagation(); o.onEdit?.(cell.dataset.id); }
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && editing && !document.querySelector('dialog[open]')) setEditing(false); });
    document.addEventListener('pointerdown', e => {
      if (editing && !g && !grid.contains(e.target) && e.target !== done && !e.target.closest('dialog')) setEditing(false);
    });
    let rt = null, lastCols = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { const c = columns(); if (c !== lastCols) { lastCols = c; render(); } }, 120);
    });
    lastCols = columns();
    return { render, setEditing, isEditing: () => editing, items: () => items };
  };
})();
