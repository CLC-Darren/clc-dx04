window.clcDashboardWidgets = function (grid) {
  const key = 'clc_dx04_dashboard_widgets_v1';
  const breakpoint = matchMedia('(min-width: 1024px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const types = {
    clock: { min: [2, 5], size: [2, 5], mobile: [1, 3] },
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
  layout.desktop[main] = { x: 2, y: 0, w: 3, h: 9 };
  layout.desktop[top] = { x: 0, y: 0, w: 2, h: 5 };
  layout.desktop[bottom] = { x: 0, y: 5, w: 2, h: 5 };
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
        widgets: [...entries].map(([id, { type, title }]) => ({ id, type, title }))
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
    const resize = document.createElement('button');
    resize.type = 'button';
    resize.className = 'widget-resize';
    resize.setAttribute('aria-label', '調整區域大小（方向鍵）');
    el.append(content, resize);
    el.dataset.widgetId = id;
    const entry = { el, type, title: title || heading?.textContent };
    entries.set(id, entry);
    if (heading) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'widget-heading';
      button.textContent = entry.title;
      button.title = '修改區域名稱';
      heading.replaceChildren(button);
      button.addEventListener('click', () => {
        const input = document.createElement('input');
        input.className = 'widget-heading-input';
        input.maxLength = 40;
        input.value = entry.title;
        input.setAttribute('aria-label', '修改區域名稱');
        button.replaceWith(input);
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
      });
    }
    return entry;
  }

  const metadata = Array.isArray(saved?.widgets) ? saved.widgets : [];
  for (const el of grid.querySelectorAll(':scope > [data-widget]')) {
    const id = el.dataset.widget;
    templates.set(id, el.cloneNode(true));
    setup(el, id, metadata.find(item => item?.id === id && typeof item.title === 'string')?.title);
  }

  function make(type, id, title) {
    const el = copy(templates.get(type), id);
    grid.append(el);
    return setup(el, id, title || types[type].title);
  }

  for (const item of metadata) {
    if (item && ['todo', 'apps'].includes(item.type) && typeof item.id === 'string' &&
        /^area-[a-f0-9-]+$/.test(item.id) && !entries.has(item.id)) {
      make(item.type, item.id, typeof item.title === 'string' ? item.title : '');
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
    for (const [id, { type }] of entries) {
      const [minW, minH] = minimum(type, name);
      const stored = saved?.layout?.[name]?.[id] || defaultLayout[id];
      const [w, h] = name === 'desktop' ? types[type].size : types[type].mobile;
      const box = { x: 0, y: bottomRow(placed), w, h };
      if (stored && ['x', 'y', 'w', 'h'].every(k => Number.isSafeInteger(stored[k]))) {
        box.w = clamp(stored.w, minW, cols);
        box.h = Math.max(minH, stored.h);
        box.x = clamp(stored.x, 0, cols - box.w);
        box.y = Math.max(0, stored.y);
      }
      if (!available(box, placed)) box.y = bottomRow(placed);
      placed[id] = box;
    }
    layout[name] = placed;
  }

  function resolve(base, id, box, resize) {
    if (mobile()) {
      const ids = Object.keys(base).sort((a, b) => base[a].y - base[b].y);
      if (!resize && box.y !== base[id].y) {
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
    for (const [id, { el }] of entries) {
      if (animate && !reducedMotion.matches && (gesture?.resize || id !== gesture?.widgetId)) previous.set(id, el.getBoundingClientRect());
      animations.get(id)?.cancel();
      animations.delete(id);
      if (id !== gesture?.widgetId) el.style.transform = '';
      const { x, y, w, h } = boxes[id];
      el.style.gridArea = (y + 1) + ' / ' + (x + 1) + ' / span ' + h + ' / span ' + w;
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

  function metrics() {
    const rect = grid.getBoundingClientRect();
    return { rect, stepX: (rect.width + 12) / columns(), stepY: 60 };
  }

  function changeBox(start, type, dx, dy, resize) {
    const [minW, minH] = minimum(type, mode());
    if (resize) {
      return { ...start, w: clamp(start.w + dx, minW, columns() - start.x),
        h: Math.max(minH, start.h + dy) };
    }
    return { ...start, x: clamp(start.x + dx, 0, columns() - start.w),
      y: clamp(start.y + dy, 0, Math.max(0, bottomRow(current()) - 1)) };
  }

  function update() {
    const g = gesture;
    const { rect, stepX, stepY } = metrics();
    const dx = g.x - rect.left - g.startX, dy = g.y - rect.top - g.startY;
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
    if (!gesture.resize) {
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
      pointer, startX: x - rect.left, startY: y - rect.top, x, y };
    el.classList.add(resize ? 'is-resizing' : 'is-dragging');
    document.body.classList.add('dash-dragging');
    gesture.frame = requestAnimationFrame(autoScroll);
  }

  grid.addEventListener('pointerdown', e => {
    if (e.button !== 0 || gesture) return;
    const el = moveSurface(e.target);
    const resize = !!e.target.closest('.widget-resize');
    if (!el || (e.pointerType === 'touch' && !resize)) return;
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
        finish(event === 'touchend');
      }
    });
  }

  grid.addEventListener('click', e => {
    if (performance.now() < suppressClickUntil && e.detail !== 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('pointerdown', e => {
    if (selected && !selected.contains(e.target)) selectWidget(null);
  });

  function finish(commit) {
    const g = gesture;
    if (!g) return;
    cancelAnimationFrame(g.frame);
    g.el.classList.remove('is-dragging', 'is-resizing');
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
  breakpoint.addEventListener('change', () => { cancelHold(); finish(false); draw(current()); });

  grid.addEventListener('keydown', e => {
    const handle = e.target.closest('.drag-handle, .widget-resize');
    const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!handle || !Object.hasOwn(offsets, e.key) || gesture) return;
    e.preventDefault();
    const el = handle.closest('[data-widget-id]');
    const id = el.dataset.widgetId;
    const [dx, dy] = offsets[e.key];
    const resize = handle.classList.contains('widget-resize');
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
  menu.setAttribute('aria-label', '新增區域');
  document.body.append(menu);
  let point, previousFocus;
  function closeMenu(restoreFocus = false) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (restoreFocus) previousFocus?.focus();
  }

  function add(type) {
    const id = 'area-' + crypto.randomUUID();
    const { rect, stepX, stepY } = metrics();
    for (const name of ['desktop', 'mobile']) {
      const boxes = layout[name];
      const [w, h] = name === 'mobile' ? types[type].mobile : types[type].size;
      const box = { x: 0, y: bottomRow(boxes), w, h };
      if (name === mode()) {
        const x = clamp(Math.floor((point.x - rect.left) / stepX), 0, columns() - w);
        const y = clamp(Math.floor((point.y - rect.top) / stepY), 0, box.y);
        const nearby = [{ ...box, x, y }, { ...box, x, y: Math.max(0, y - 1) }, { ...box, x, y: y + 1 }];
        box.x = x;
        Object.assign(box, nearby.find(candidate => available(candidate, boxes)));
      }
      boxes[id] = box;
    }
    const entry = make(type, id);
    draw(current());
    save();
    mount.get(type)(entry.el, id);
    closeMenu();
    entry.el.querySelector('.drag-handle').focus();
  }

  for (const [type, label] of [['todo', '新增代辦事項區域'], ['apps', '新增APP管理區域']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => add(type));
    menu.append(button);
  }

  document.addEventListener('contextmenu', e => {
    if ((pending || gesture?.touch || e.pointerType === 'touch') && moveSurface(e.target, true)) {
      e.preventDefault();
      return;
    }
    if (!window.isSuperuser || gesture || !e.target.closest('main, footer') || document.querySelector('dialog[open]') ||
        e.target.closest('a, input, textarea, select, button, [contenteditable], .todo-row, .slot-cell')) return;
    e.preventDefault();
    point = { x: e.clientX, y: e.clientY };
    previousFocus = document.activeElement;
    menu.hidden = false;
    menu.style.left = Math.max(4, Math.min(point.x, innerWidth - menu.offsetWidth - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(point.y, innerHeight - menu.offsetHeight - 4)) + 'px';
    menu.firstElementChild.focus({ preventScroll: true });
  });

  document.addEventListener('pointerdown', e => { if (!menu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeMenu(true);
    cancelHold();
    finish(false);
    selectWidget(null);
  });
  window.addEventListener('scroll', () => closeMenu(), { passive: true });
  window.addEventListener('clc-admin-changed', () => { if (!window.isSuperuser) closeMenu(); });

  return {
    find, copy,
    register(type, init) {
      mount.set(type, init);
      for (const [id, entry] of entries) if (entry.type === type) init(entry.el, id);
    }
  };
};
