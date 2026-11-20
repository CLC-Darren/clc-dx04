window.clcDashboardWidgets = function (grid, { todoOnly = false } = {}) {
  const key = todoOnly ? 'clc_dx04_todo_view_v1' : 'clc_dx04_dashboard_widgets_v1';
  const breakpoint = matchMedia(todoOnly ? 'not all' : '(min-width: 1024px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const types = {
    clock: { min: [2, 3], size: [2, 4], mobile: [1, 3], label: '時鐘與天氣' },
    todo: { min: [2, 4], size: [3, 9], mobile: [1, 7], mobileMin: 4, title: '代辦事項' },
    apps: { min: [2, 3], size: [2, 4], mobile: [1, 4], mobileMin: 3, title: 'APP管理區域' }
  };
  const entries = new Map();
  const templates = new Map();
  const mount = new Map();
  const animations = new Map();
  let gesture = null, pending = null, selected = null, suppressClickUntil = 0;

  function read(storageKey) {
    try { return JSON.parse(localStorage.getItem(storageKey)); }
    catch (_) { return null; }
  }

  const saved = read(key);
  const mobile = () => !breakpoint.matches;
  const mode = () => mobile() ? 'mobile' : 'desktop';
  const columns = () => mobile() ? 1 : 5;
  const minimum = (type, name) => name === 'mobile'
    ? [1, types[type].mobileMin || types[type].mobile[1]]
    : types[type].min;
  const layout = { desktop: {}, mobile: {} };
  const current = () => layout[mode()];
  const baseIds = ['clock', 'todo', 'apps'];
  const legacyDesktop = read('clc_dx04_widget_desktop_slots_v1');
  const legacyMobile = read('clc_dx04_widget_order');

  function legacyOrder(value, fallback) {
    return Array.isArray(value) && value.length === 3 && new Set(value).size === 3 &&
      value.every(id => baseIds.includes(id)) ? value : fallback;
  }

  const [main, top, bottom] = legacyOrder(legacyDesktop, ['todo', 'apps', 'clock']);
  const defaultHeight = id => id === 'todo' && id !== main ? 5 : types[id].size[1];
  layout.desktop[main] = { x: 2, y: 0, w: 3, h: defaultHeight(main) };
  layout.desktop[top] = { x: 0, y: 0, w: 2, h: defaultHeight(top) };
  layout.desktop[bottom] = { x: 0, y: layout.desktop[top].h, w: 2, h: defaultHeight(bottom) };
  let row = 0;
  for (const id of legacyOrder(legacyMobile, baseIds)) {
    const [w, h] = types[id].mobile;
    layout.mobile[id] = { x: 0, y: row, w, h };
    row += h;
  }

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify({
        layout,
        clockHeightVersion: 2,
        widgets: [...entries].map(([id, { type, title, el }]) => ({ id, type, title, hidden: el.hidden }))
      }));
    } catch (_) {
      notice.textContent = '無法儲存區塊設定，請確認瀏覽器允許本機儲存。';
    }
  }

  function find(root, id) {
    return root.querySelector('[data-widget-field="' + id + '"], #' + id);
  }

  function copy(template, area) {
    const clone = template.cloneNode(true);
    const nodes = [clone, ...clone.querySelectorAll('[id], [for], [aria-controls], [aria-labelledby]')];
    for (const el of nodes) {
      if (el.id) {
        el.dataset.widgetField = el.id;
        el.id += '-' + area;
      }
      for (const attr of ['for', 'aria-controls', 'aria-labelledby']) {
        if (el.hasAttribute(attr)) el.setAttribute(attr, el.getAttribute(attr).split(' ').map(id => id + '-' + area).join(' '));
      }
    }
    return clone;
  }

  const drawer = document.createElement('dialog');
  drawer.className = 'widget-drawer';
  const collapse = document.createElement('button');
  collapse.type = 'button';
  collapse.className = 'widget-drawer-handle';
  collapse.setAttribute('aria-label', '收合區域');
  collapse.addEventListener('click', () => drawer.close());
  drawer.append(collapse);
  document.body.append(drawer);
  let expanded = null;
  const drawerObserver = new ResizeObserver(records => {
    for (const { target } of records) refreshExpand(entries.get(target.dataset.widgetId));
  });

  function refreshExpand(entry) {
    if (!mobile() || entry.el.hidden || expanded === entry) {
      entry.expand.hidden = true;
      return;
    }
    const body = entry.content;
    const list = body.querySelector('.todo-scroll');
    const clipped = node => node.scrollHeight > node.clientHeight + 1;
    entry.expand.hidden = !clipped(body) && !(list && clipped(list));
  }

  function openDrawer(entry) {
    if (expanded || entry.expand.hidden || document.querySelector('dialog[open]')) return;
    closeMenu();
    selectWidget(null);
    expanded = entry;
    drawer.dataset.widget = entry.type;
    drawer.setAttribute('aria-label', nameOf(entry));
    entry.el.style.setProperty('--drawer-collapsed-height', entry.el.offsetHeight + 'px');
    entry.el.classList.add('has-open-drawer');
    entry.expand.setAttribute('aria-expanded', 'true');
    drawer.insertBefore(entry.content, collapse);
    drawer.showModal();
    collapse.focus({ preventScroll: true });
  }

  drawer.addEventListener('close', () => {
    if (!expanded) return;
    const entry = expanded;
    expanded = null;
    entry.el.insertBefore(entry.content, entry.expand);
    entry.el.classList.remove('has-open-drawer');
    entry.el.style.removeProperty('--drawer-collapsed-height');
    entry.expand.setAttribute('aria-expanded', 'false');
    refreshExpand(entry);
    if (!entry.expand.hidden) entry.expand.focus({ preventScroll: true });
  });

  const notice = document.createElement('p');
  notice.setAttribute('role', 'status');
  grid.after(notice);

  function setup(el, id, title) {
    const type = el.dataset.widget;
    const heading = el.querySelector('h2');
    const content = document.createElement('div');
    content.className = 'widget-content';
    const handle = el.querySelector('.drag-handle');
    handle.setAttribute('aria-label', '移動區域（方向鍵）');
    for (const child of Array.from(el.children)) {
      if (child !== handle) content.append(child);
    }
    const resizeHandles = Object.entries({
      n: '上邊', ne: '右上角', e: '右邊', se: '右下角',
      s: '下邊', sw: '左下角', w: '左邊', nw: '左上角'
    }).map(([edge, label]) => {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'widget-resize';
      handle.dataset.edge = edge;
      handle.tabIndex = edge === 'se' ? 0 : -1;
      handle.setAttribute('aria-label', '從' + label + '調整區域大小（方向鍵）');
      return handle;
    });
    const expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'widget-drawer-handle';
    expand.hidden = true;
    expand.setAttribute('aria-label', '展開區域');
    expand.setAttribute('aria-expanded', 'false');
    el.append(content, expand, ...resizeHandles);
    el.dataset.widgetId = id;
    const entry = { el, type, content, expand, title: title || heading?.textContent };
    entries.set(id, entry);
    drawerObserver.observe(el);
    const changes = new MutationObserver(() => refreshExpand(entry));
    changes.observe(content, { childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['hidden', 'class'] });
    expand.addEventListener('click', () => openDrawer(entry));
    if (heading) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'widget-heading';
      button.textContent = entry.title;
      heading.replaceChildren(button);
      entry.rename = () => {
        if (!button.isConnected) return;
        const input = document.createElement('input');
        input.className = 'widget-heading-input';
        input.maxLength = 40;
        input.value = entry.title;
        input.setAttribute('aria-label', '修改區域名稱');
        button.replaceWith(input);
        input.focus({ preventScroll: true });
        input.select();
        let finished = false;
        function finish(commit) {
          if (finished) return;
          finished = true;
          if (commit && input.value.trim()) {
            entry.title = input.value.trim();
            button.textContent = entry.title;
            save();
          }
          input.replaceWith(button);
        }
        input.addEventListener('blur', () => finish(true));
        input.addEventListener('keydown', e => {
          if (e.isComposing || !['Enter', 'Escape'].includes(e.key)) return;
          e.preventDefault();
          finish(e.key === 'Enter');
          button.focus();
        });
      };
      button.addEventListener('dblclick', e => {
        if (!matchMedia('(pointer: coarse)').matches && e.sourceCapabilities?.firesTouchEvents !== true) entry.rename();
      });
      button.addEventListener('click', e => { if (e.detail === 0) entry.rename(); });
    }
    return entry;
  }

  const metadata = Array.isArray(saved?.widgets) ? saved.widgets : [];
  for (const el of grid.querySelectorAll(':scope > [data-widget]')) {
    const id = el.dataset.widget;
    if (todoOnly && id !== 'todo') {
      el.remove();
      continue;
    }
    templates.set(id, el.cloneNode(true));
    const item = metadata.find(item => item?.id === id);
    setup(el, id, typeof item?.title === 'string' ? item.title : '');
    el.hidden = item?.hidden === true;
  }

  function make(type, id, title) {
    const el = copy(templates.get(type), id);
    grid.append(el);
    return setup(el, id, title || types[type].title);
  }

  for (const item of metadata) {
    if (item && templates.has(item.type) && typeof item.id === 'string' &&
        /^area-[a-f0-9-]+$/.test(item.id) && !entries.has(item.id)) {
      make(item.type, item.id, typeof item.title === 'string' ? item.title : '').el.hidden = item.hidden === true;
    }
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  const bottomRow = boxes => Math.max(0, ...Object.values(boxes).map(box => box.y + box.h));
  const available = (box, boxes) => !Object.values(boxes).some(other => overlaps(box, other));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  for (const name of ['desktop', 'mobile']) {
    const placed = {};
    const defaultLayout = layout[name];
    const cols = name === 'desktop' ? 5 : 1;
    for (const [id, { type, el }] of entries) {
      if (el.hidden) continue;
      const [minW, minH] = minimum(type, name);
      const stored = saved?.layout?.[name]?.[id] || defaultLayout[id];
      const [w, h] = name === 'desktop' ? types[type].size : types[type].mobile;
      const box = { x: 0, y: bottomRow(placed), w, h };
      if (stored && ['x', 'y', 'w', 'h'].every(k => Number.isSafeInteger(stored[k]))) {
        box.w = clamp(stored.w, minW, cols);
        const upgradeClock = name === 'desktop' && type === 'clock' && saved?.clockHeightVersion !== 2 &&
          saved?.layout?.desktop?.[id] && stored.h === 5;
        box.h = Math.max(minH, upgradeClock ? types.clock.size[1] : stored.h);
        box.x = clamp(stored.x, 0, cols - box.w);
        box.y = Math.max(0, stored.y);
      }
      if (!available(box, placed)) box.y = bottomRow(placed);
      placed[id] = box;
    }
    layout[name] = placed;
  }

  function resolve(base, id, box, resize, slot) {
    if (mobile()) {
      const ids = Object.keys(base).sort((a, b) => base[a].y - base[b].y);
      if (slot !== undefined) {
        ids.splice(ids.indexOf(id), 1);
        ids.splice(slot, 0, id);
      } else if (!resize && box.y !== base[id].y) {
        ids.splice(ids.indexOf(id), 1);
        const position = box.y > base[id].y ? box.y + box.h : box.y;
        const ahead = ids.findIndex(other => position < base[other].y + base[other].h / 2);
        ids.splice(ahead === -1 ? ids.length : ahead, 0, id);
      }
      let y = 0;
      return Object.fromEntries(ids.map(other => {
        const placed = { ...(other === id ? box : base[other]), y };
        y += placed.h;
        return [other, placed];
      }));
    }
    if (resize) {
      const next = { [id]: box };
      const others = Object.keys(base).filter(other => other !== id);
      others.sort((a, b) => base[a].y - base[b].y || base[a].x - base[b].x);
      for (const other of others) {
        const candidate = { ...base[other] };
        while (!available(candidate, next)) candidate.y++;
        next[other] = candidate;
      }
      return next;
    }
    const next = { ...base, [id]: box };
    const collisions = Object.keys(base).filter(other => other !== id && overlaps(base[other], box));
    collisions.sort((a, b) => base[a].y - base[b].y || base[a].x - base[b].x);
    collisions.forEach(other => delete next[other]);
    for (const other of collisions) {
      const candidate = { ...base[other], y: 0 };
      while (!available(candidate, next)) candidate.y++;
      next[other] = candidate;
    }
    return next;
  }

  function draw(boxes, animate = false) {
    grid.style.setProperty('--widget-columns', columns());
    const previous = new Map();
    const mobileOrder = mobile() ? Object.keys(boxes).sort((a, b) => boxes[a].y - boxes[b].y) : null;
    for (const [id, { el }] of entries) {
      if (el.hidden) continue;
      if (animate && !reducedMotion.matches && (gesture?.resize || id !== gesture?.widgetId)) previous.set(id, el.getBoundingClientRect());
      animations.get(id)?.cancel();
      animations.delete(id);
      if (id !== gesture?.widgetId) el.style.transform = '';
      const { x, y, w, h } = boxes[id];
      el.classList.toggle('is-compact-clock', el.dataset.widget === 'clock' && !mobileOrder && h <= types.clock.size[1]);
      if (mobileOrder) {
        el.style.gridArea = (mobileOrder.indexOf(id) + 1) + ' / 1';
        el.style.setProperty('--mobile-height', h * 60 - 12 + 'px');
        el.style.setProperty('--clock-height-extra', (h - types.clock.mobile[1]) * 60 + 'px');
      } else {
        el.style.gridArea = (y + 1) + ' / ' + (x + 1) + ' / span ' + h + ' / span ' + w;
      }
    }
    for (const [id, before] of previous) {
      const { el } = entries.get(id);
      const after = el.getBoundingClientRect();
      const dx = before.left - after.left, dy = before.top - after.top;
      const from = { transform: `translate(${dx}px, ${dy}px)` }, to = { transform: 'none' };
      const resized = Math.abs(before.width - after.width) > .5 || Math.abs(before.height - after.height) > .5;
      if (resized) {
        Object.assign(from, { width: before.width + 'px', height: before.height + 'px' });
        Object.assign(to, { width: after.width + 'px', height: after.height + 'px' });
      }
      if (resized || Math.abs(dx) > .5 || Math.abs(dy) > .5) {
        const animation = el.animate([from, to], { duration: 250, easing: 'cubic-bezier(.18,.75,.25,1)' });
        animations.set(id, animation);
        animation.onfinish = () => { if (animations.get(id) === animation) animations.delete(id); };
      }
    }
  }
  grid.classList.add('widget-grid');
  draw(current());

  grid.addEventListener('wheel', e => {
    if (mobile() || gesture || e.defaultPrevented || !e.cancelable || e.ctrlKey || e.shiftKey ||
        Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    // Chrome can keep a wheel gesture latched to a list even at its edge.
    const scroller = e.target.closest('.todo-scroll, .widget-content');
    if (!scroller || e.target.closest('textarea, select')) return;
    const canScroll = getComputedStyle(scroller).overflowY === 'auto' &&
      (e.deltaY < 0 ? scroller.scrollTop > 1 : scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1);
    if (canScroll) return;

    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
    window.scrollBy({ top: e.deltaY * unit, behavior: 'instant' });
  }, { passive: false });

  function metrics() {
    const rect = grid.getBoundingClientRect();
    return { rect, stepX: (rect.width + 12) / columns(), stepY: 60 };
  }

  function changeBox(start, type, dx, dy, resize) {
    const [minW, minH] = minimum(type, mode());
    if (resize) {
      const right = start.x + start.w, bottom = start.y + start.h;
      let x = start.x, y = start.y, w = start.w, h = start.h;
      if (resize.includes('w')) {
        x = clamp(x + dx, 0, right - minW);
        w = right - x;
      }
      if (resize.includes('e')) w = clamp(w + dx, minW, columns() - x);
      if (resize.includes('n')) {
        if (mobile()) h = Math.max(minH, h - dy);
        else {
          y = clamp(y + dy, 0, bottom - minH);
          h = bottom - y;
        }
      }
      if (resize.includes('s')) h = Math.max(minH, h + dy);
      return { x, y, w, h };
    }
    return { ...start, x: clamp(start.x + dx, 0, columns() - start.w),
      y: clamp(start.y + dy, 0, Math.max(0, bottomRow(current()) - 1)) };
  }

  function update() {
    const g = gesture;
    const { rect, stepX, stepY } = metrics();
    const dx = g.x - rect.left - g.startX, dy = g.y - rect.top - g.startY;
    if (mobile() && !g.resize) {
      const edge = (dy < 0 ? g.top : g.bottom) + dy;
      const slot = g.centers.filter(value => edge > value).length;
      if (slot !== g.slot) {
        g.slot = slot;
        g.next = resolve(current(), g.widgetId, g.start, false, slot);
        draw(g.next, true);
      }
      g.el.style.transform = `translateY(${dy + g.top - g.el.offsetTop}px)`;
      return;
    }
    const box = changeBox(g.start, g.type, Math.round(dx / stepX), Math.round(dy / stepY), g.resize);
    if (['x', 'y', 'w', 'h'].some(k => box[k] !== g.box[k])) {
      g.box = box;
      g.next = resolve(current(), g.widgetId, box, g.resize);
      draw(g.next, true);
    }
    if (!g.resize) {
      const target = g.next[g.widgetId];
      g.el.style.transform = `translate(${dx + (g.start.x - target.x) * stepX}px, ${dy + (g.start.y - target.y) * stepY}px)`;
    }
  }

  function autoScroll() {
    if (!gesture) return;
    const y = gesture.y;
    if (!gesture.resize && (!gesture.touch || gesture.moved)) {
      if (y < 60) window.scrollBy(0, -12);
      else if (y > innerHeight - 60) window.scrollBy(0, 12);
    }
    update();
    gesture.frame = requestAnimationFrame(autoScroll);
  }

  function moveSurface(target, touch = false) {
    if (target.closest('a, input, textarea, select, [contenteditable], .todo-scroll, .slot-cell, .slot-empty') ||
        (target.closest('button') && !target.closest(touch
          ? '.drag-handle, .widget-resize, .widget-heading' : '.drag-handle, .widget-resize'))) return null;
    return target.closest('[data-widget-id]');
  }

  function selectWidget(el) {
    selected?.classList.remove('is-widget-selected');
    selected = el;
    selected?.classList.add('is-widget-selected');
  }

  function begin(el, pointer, x, y, resize, touch = false) {
    const widgetId = el.dataset.widgetId, start = current()[widgetId];
    const { rect } = metrics();
    gesture = { el, widgetId, start, type: el.dataset.widget, resize, touch, box: start, next: current(),
      pointer, touchX: x, touchY: y, startX: x - rect.left, startY: y - rect.top, x, y };
    if (mobile() && !resize) {
      gesture.top = el.offsetTop;
      gesture.bottom = gesture.top + el.offsetHeight;
      const center = (gesture.top + gesture.bottom) / 2;
      gesture.centers = [...entries.values()].filter(entry => !entry.el.hidden && entry.el !== el)
        .map(entry => entry.el.offsetTop + entry.el.offsetHeight / 2);
      gesture.slot = gesture.centers.filter(value => center > value).length;
    }
    if (resize) el.dataset.resizeEdge = resize;
    el.classList.add(resize ? 'is-resizing' : 'is-dragging');
    document.body.classList.add('dash-dragging');
    gesture.frame = requestAnimationFrame(autoScroll);
  }

  grid.addEventListener('pointerdown', e => {
    if (e.button !== 0 || gesture) return;
    const el = moveSurface(e.target);
    const resize = e.target.closest('.widget-resize')?.dataset.edge;
    if (!el || (e.pointerType === 'touch' && !resize)) return;
    if (resize) e.preventDefault();
    begin(el, e.pointerId, e.clientX, e.clientY, resize);
    grid.setPointerCapture(e.pointerId);
  });

  grid.addEventListener('pointermove', e => {
    if (!gesture || gesture.touch || gesture.pointer !== e.pointerId) return;
    gesture.x = e.clientX;
    gesture.y = e.clientY;
    update();
  });

  function cancelHold() {
    clearTimeout(pending?.timer);
    pending = null;
  }

  grid.addEventListener('touchstart', e => {
    cancelHold();
    if (e.touches.length !== 1 || gesture || e.target.closest('.widget-resize')) return;
    const el = moveSurface(e.target, true);
    if (!el) return;
    const { identifier, clientX, clientY } = e.touches[0];
    const timer = setTimeout(() => {
      cancelHold();
      selectWidget(el);
      if (canOpenMenu()) openMenu(clientX, clientY, el.dataset.widgetId, false);
      begin(el, identifier, clientX, clientY, false, true);
      navigator.vibrate?.(15);
    }, 500);
    pending = { identifier, clientX, clientY, timer };
  }, { passive: true });

  grid.addEventListener('touchmove', e => {
    const id = pending?.identifier ?? (gesture?.touch ? gesture.pointer : null);
    const touch = Array.from(e.changedTouches).find(t => t.identifier === id);
    if (!touch) return;
    if (pending) {
      if (Math.hypot(touch.clientX - pending.clientX, touch.clientY - pending.clientY) > 9) cancelHold();
      return;
    }
    if (e.cancelable) e.preventDefault();
    if (!gesture.moved) {
      if (Math.hypot(touch.clientX - gesture.touchX, touch.clientY - gesture.touchY) <= 9) return;
      gesture.moved = true;
      closeMenu();
    }
    gesture.x = touch.clientX;
    gesture.y = touch.clientY;
    update();
  }, { passive: false });

  for (const event of ['touchend', 'touchcancel']) {
    grid.addEventListener(event, e => {
      const ended = id => Array.from(e.changedTouches).some(t => t.identifier === id);
      if (pending && ended(pending.identifier)) cancelHold();
      if (gesture?.touch && ended(gesture.pointer)) {
        suppressClickUntil = performance.now() + 400;
        const stationary = !gesture.moved;
        if (e.cancelable) e.preventDefault();
        finish(event === 'touchend' && !stationary);
        if (event === 'touchcancel') closeMenu();
        else if (stationary && !menu.hidden) menu.querySelector('button').focus({ preventScroll: true });
      }
    });
  }

  grid.addEventListener('click', e => {
    if (performance.now() < suppressClickUntil && e.detail !== 0 && moveSurface(e.target, true)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('pointerdown', e => {
    if (selected && !selected.contains(e.target) && !menu.contains(e.target)) selectWidget(null);
  });

  function finish(commit) {
    const g = gesture;
    if (!g) return;
    cancelAnimationFrame(g.frame);
    g.el.classList.remove('is-dragging', 'is-resizing');
    delete g.el.dataset.resizeEdge;
    document.body.classList.remove('dash-dragging');
    gesture = null;
    if (commit && g.next !== current()) {
      layout[mode()] = g.next;
      save();
    }
    draw(current(), true);
  }

  grid.addEventListener('pointerup', e => {
    if (!gesture || gesture.touch || gesture.pointer !== e.pointerId) return;
    gesture.x = e.clientX;
    gesture.y = e.clientY;
    update();
    finish(true);
  });
  for (const event of ['pointercancel', 'lostpointercapture']) {
    grid.addEventListener(event, e => { if (gesture && !gesture.touch && gesture.pointer === e.pointerId) finish(false); });
  }
  breakpoint.addEventListener('change', () => {
    if (drawer.open) drawer.close();
    cancelHold();
    closeMenu();
    finish(false);
    draw(current());
    for (const entry of entries.values()) refreshExpand(entry);
  });

  grid.addEventListener('keydown', e => {
    const handle = e.target.closest('.drag-handle, .widget-resize');
    const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!handle || !Object.hasOwn(offsets, e.key) || gesture) return;
    e.preventDefault();
    const el = handle.closest('[data-widget-id]');
    const id = el.dataset.widgetId;
    const [dx, dy] = offsets[e.key];
    const resize = handle.dataset.edge;
    const base = current();
    let box = changeBox(base[id], el.dataset.widget, dx, dy, resize);
    if (mobile() && !resize && dy) {
      const ids = Object.keys(base).sort((a, b) => base[a].y - base[b].y);
      const adjacent = base[ids[ids.indexOf(id) + dy]];
      if (!adjacent) return;
      box = { ...box, y: dy > 0 ? adjacent.y + adjacent.h : adjacent.y };
    }
    layout[mode()] = resolve(base, id, box, resize);
    draw(current(), true);
    save();
  });

  const menu = document.createElement('div');
  menu.className = 'widget-context-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', '卡片操作');
  document.body.append(menu);
  const emptyButton = document.createElement('button');
  emptyButton.type = 'button';
  emptyButton.className = 'widget-empty-button';
  emptyButton.textContent = '新增區域';
  grid.before(emptyButton);
  let point, previousFocus, menuScrollX, menuScrollY;

  function updateEmptyButton() {
    emptyButton.hidden = !window.isSuperuser || Object.keys(current()).length > 0;
  }

  function canOpenMenu() {
    return window.isSuperuser && !gesture && !document.querySelector('dialog[open]');
  }

  function closeMenu(restoreFocus = false) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (restoreFocus) previousFocus?.focus({ preventScroll: true });
  }

  function mountEntry(id, entry) {
    if (entry.el.hidden || entry.mounted) return;
    mount.get(entry.type)(entry.el, id);
    entry.mounted = true;
  }

  function place(type, id, at) {
    const { rect, stepX, stepY } = metrics();
    for (const name of ['desktop', 'mobile']) {
      const boxes = layout[name];
      const [w, h] = name === 'mobile' ? types[type].mobile : types[type].size;
      const box = { x: 0, y: bottomRow(boxes), w, h };
      if (at && name === mode()) {
        const x = clamp(Math.floor((at.x - rect.left) / stepX), 0, columns() - w);
        const y = clamp(Math.floor((at.y - rect.top) / stepY), 0, box.y);
        const nearby = [{ ...box, x, y }, { ...box, x, y: Math.max(0, y - 1) }, { ...box, x, y: y + 1 }];
        box.x = x;
        Object.assign(box, nearby.find(candidate => available(candidate, boxes)));
      }
      boxes[id] = box;
    }
  }

  function add(type, restoreId) {
    const id = restoreId || 'area-' + crypto.randomUUID();
    place(type, id, point);
    const entry = restoreId ? entries.get(id) : make(type, id);
    entry.el.hidden = false;
    draw(current());
    mountEntry(id, entry);
    save();
    closeMenu();
    updateEmptyButton();
    entry.el.querySelector('.drag-handle').focus();
  }

  function remove(id) {
    const { el } = entries.get(id);
    animations.get(id)?.cancel();
    animations.delete(id);
    el.hidden = true;
    if (selected === el) selectWidget(null);
    for (const name of ['desktop', 'mobile']) {
      delete layout[name][id];
    }
    // 將手機版向上收齊，避免移除卡片後留下整張卡片的空位。
    let y = 0;
    for (const box of Object.values(layout.mobile).sort((a, b) => a.y - b.y)) {
      box.y = y;
      y += box.h;
    }
    draw(current(), true);
    save();
    closeMenu();
    updateEmptyButton();
    const next = [...entries.values()].find(entry => !entry.el.hidden);
    (next?.el.querySelector('.drag-handle') || emptyButton).focus({ preventScroll: true });
  }

  const nameOf = entry => entry.title || types[entry.type].label;
  function menuButton(label, action, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (className) button.className = className;
    button.addEventListener('click', () => { if (canOpenMenu()) action(); });
    menu.append(button);
  }

  function openMenu(x, y, id, focus = true) {
    document.dispatchEvent(new CustomEvent('clc-menu-open', { detail: 'widget' }));
    point = { x, y };
    menuScrollX = window.scrollX;
    menuScrollY = window.scrollY;
    previousFocus = document.activeElement;
    const entry = id && entries.get(id);
    const compact = mobile() && !!entry;
    if (entry) selectWidget(entry.el);
    menu.classList.toggle('is-card-popup', compact);

    function position() {
      menu.hidden = false;
      menu.scrollTop = 0;
      const width = menu.offsetWidth, height = menu.offsetHeight;
      const card = compact && entry.el.getBoundingClientRect();
      const left = card ? (card.left + card.right - width) / 2 : x;
      const top = card ? (card.top >= height + 14 ? card.top - height - 10 : card.bottom + 10) : y;
      menu.style.left = clamp(left, 4, Math.max(4, innerWidth - width - 4)) + 'px';
      menu.style.top = clamp(top, 4, Math.max(4, innerHeight - height - 4)) + 'px';
    }

    function additionOptions() {
      if (compact) {
        menu.replaceChildren();
        menu.classList.remove('is-card-popup');
      }
      for (const [type, label] of [
        ['todo', '新增代辦事項區域'], ['clock', '新增時鐘與天氣'], ['apps', '新增APP管理區域']
      ]) if (!todoOnly || type === 'todo') menuButton(label, () => add(type));
      for (const [hiddenId, hidden] of entries) {
        if (hidden.el.hidden) menuButton('復原「' + nameOf(hidden) + '」', () => add(hidden.type, hiddenId));
      }
      if (compact) {
        position();
        menu.querySelector('button').focus({ preventScroll: true });
      }
    }

    menu.replaceChildren();
    if (compact) {
      const title = document.createElement('p');
      title.className = 'widget-popup-title';
      title.textContent = nameOf(entry);
      menu.append(title);
      menuButton('新增', additionOptions, 'widget-menu-add');
      menuButton('刪除', () => remove(id), 'widget-menu-delete');
      if (entry.rename) menuButton('重新命名', () => { closeMenu(); selectWidget(null); entry.rename(); });
    } else {
      if (entry) menuButton('刪除「' + nameOf(entry) + '」', () => remove(id), 'widget-menu-delete');
      additionOptions();
    }
    position();
    if (focus) menu.querySelector('button').focus({ preventScroll: true });
  }

  emptyButton.addEventListener('click', () => {
    if (!canOpenMenu()) return;
    const rect = emptyButton.getBoundingClientRect();
    openMenu(rect.left, rect.bottom);
  });
  updateEmptyButton();

  document.addEventListener('contextmenu', e => {
    if ((pending || gesture?.touch || e.pointerType === 'touch') && moveSurface(e.target, true)) {
      e.preventDefault();
      return;
    }
    if (!canOpenMenu() || !e.target.closest('main, footer') ||
        e.target.closest('a, input, textarea, select, [contenteditable], .slot-cell, .slot-empty')) return;
    e.preventDefault();
    const el = e.target.closest('[data-widget-id]');
    openMenu(e.clientX, e.clientY, el?.dataset.widgetId);
  });

  document.addEventListener('pointerdown', e => { if (!menu.contains(e.target)) closeMenu(); });
  document.addEventListener('clc-menu-open', e => { if (e.detail !== 'widget') closeMenu(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeMenu(true);
    cancelHold();
    finish(false);
    selectWidget(null);
  });
  window.addEventListener('scroll', () => {
    if (window.scrollX !== menuScrollX || window.scrollY !== menuScrollY) closeMenu();
  }, { passive: true });
  window.addEventListener('clc-admin-changed', () => {
    if (!window.isSuperuser) closeMenu();
    updateEmptyButton();
  });

  return {
    find, copy,
    discoverTodoAreas(ids) {
      const added = [];
      for (const id of ids) {
        if (entries.has(id)) continue;
        place('todo', id);
        added.push([id, make('todo', id)]);
      }
      if (!added.length) return;
      draw(current());
      for (const [id, entry] of added) mountEntry(id, entry);
      save();
      updateEmptyButton();
    },
    reveal(widget) {
      const entry = entries.get(widget.dataset.widgetId);
      if (!entry || !mobile()) return;
      refreshExpand(entry);
      openDrawer(entry);
    },
    register(type, init) {
      mount.set(type, init);
      for (const [id, entry] of entries) if (entry.type === type) mountEntry(id, entry);
    }
  };
};
