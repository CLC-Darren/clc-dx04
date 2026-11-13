// Direct mouse dragging, long-press touch dragging, native App drag/drop and keyboard sorting.
window.clcReorder = function (container, options) {
  let source = null, target = null, after = false, pointer = null, holdTimer = null;
  let suppressUntil = 0, saving = false, floating = null;
  const item = node => node?.closest?.(options.item);
  const excluded = node => node?.closest?.('input, textarea, select, .todo-del, .app-remove, .app-slot');
  function lift() {
    if (!options.directMouse || !source) return;
    const rect = source.getBoundingClientRect();
    floating = source.cloneNode(true);
    floating.classList.remove('reorder-source', 'reorder-target');
    floating.classList.add('reorder-floating');
    floating.removeAttribute('id');
    floating.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    floating.setAttribute('aria-hidden', 'true');
    floating.inert = true;
    floating.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;box-sizing:border-box;margin:0;pointer-events:none;z-index:2147483646;`;
    floating._liftOrigin = { left: rect.left, top: rect.top };
    document.body.appendChild(floating);
    follow(pointer.x, pointer.y);
  }
  function follow(x, y) {
    if (!floating || !pointer) return;
    const origin = floating._liftOrigin;
    const left = Math.max(12, Math.min(innerWidth - floating.offsetWidth * 1.035 - 12, origin.left + x - pointer.x));
    const top = Math.max(8, Math.min(innerHeight - floating.offsetHeight * 1.035 - 8, origin.top + y - pointer.y - 7));
    floating.style.transform = `translate3d(${left - origin.left}px,${top - origin.top}px,0) scale(1.035) rotate(-0.5deg)`;
  }
  async function land(ghost, id) {
    if (!ghost) return;
    const row = Array.from(container.querySelectorAll(options.item)).find(el => el.dataset.sortId === id);
    if (!row || !ghost.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { ghost.remove(); return; }
    const rect = row.getBoundingClientRect(), origin = ghost._liftOrigin;
    try {
      await ghost.animate([
        { transform: ghost.style.transform, opacity: 1 },
        { transform: `translate3d(${rect.left - origin.left}px,${rect.top - origin.top}px,0) scale(1) rotate(0deg)`, opacity: 0 }
      ], { duration: 160, easing: 'ease-out' }).finished;
    } catch (_) {} finally { ghost.remove(); }
  }
  function clear() {
    clearTimeout(holdTimer);
    floating?.remove(); floating = null;
    container.querySelectorAll('.reorder-source, .reorder-target').forEach(el => el.classList.remove('reorder-source', 'reorder-target'));
    source = target = pointer = null;
  }
  function aim(next, x, y) {
    target?.classList.remove('reorder-target');
    target = source && next && next !== source && container.contains(next) ? next : null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    after = options.grid ? x > rect.left + rect.width / 2 : y > rect.top + rect.height / 2;
    target.classList.add('reorder-target');
  }
  function begin() {
    if (!pointer || !source || !options.allowed()) return;
    pointer.armed = true;
    options.start?.();
    source.classList.add('reorder-source');
    lift();
    if (pointer.touch && navigator.vibrate) navigator.vibrate(15);
  }
  function move(x, y) {
    pointer.moved = true;
    follow(x, y);
    aim(item(document.elementFromPoint(x, y)), x, y);
    if (y < 60) window.scrollBy(0, -15);
    else if (y > innerHeight - 60) window.scrollBy(0, 15);
  }
  async function finish(commit) {
    const from = source?.dataset.sortId, to = target?.dataset.sortId, insertAfter = after;
    if (pointer?.armed) suppressUntil = Date.now() + 500;
    const ghost = floating; floating = null;
    clear();
    if (!commit || !from || !to || !options.allowed()) { await land(ghost, from); return; }
    suppressUntil = Date.now() + 500;
    saving = true;
    try { await options.move(from, to, insertAfter); }
    catch (error) { options.error?.(error); }
    finally { await land(ghost, from); saving = false; }
  }
  container.addEventListener('click', e => {
    if (Date.now() < suppressUntil || e.target.closest('.reorder-handle')) {
      e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);
  container.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || saving || !options.allowed() || e.button !== 0 || excluded(e.target)) return;
    const handle = e.target.closest('.reorder-handle');
    if (!handle && !options.directMouse) return; // Apps keep native desktop drag/drop.
    const next = item(e.target); if (!next) return;
    source = next; pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, armed: false, moved: false };
    if (handle) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  container.addEventListener('pointermove', e => {
    if (pointer?.touch && pointer.armed) e.stopPropagation();
  }, true);
  container.addEventListener('pointermove', e => {
    if (!pointer || pointer.touch || e.pointerId !== pointer.id) return;
    if (!pointer.armed) {
      if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) < 7) return;
      begin();
      container.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
    move(e.clientX, e.clientY);
  });
  container.addEventListener('pointerup', e => {
    if (!pointer || pointer.touch || e.pointerId !== pointer.id) return;
    const moved = pointer.moved;
    if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
    finish(moved);
  });
  container.addEventListener('pointercancel', () => { if (pointer && !pointer.touch) finish(false); });
  // A short swipe remains normal scrolling; only a stationary long press takes over touchmove.
  container.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || saving || !options.allowed() || excluded(e.target)) { if (pointer?.touch) finish(false); return; }
    const next = item(e.target); if (!next) return;
    const touch = e.touches[0];
    source = next; pointer = { touch: true, id: touch.identifier, x: touch.clientX, y: touch.clientY, armed: false, moved: false };
    holdTimer = setTimeout(begin, 400);
  }, { passive: true });
  container.addEventListener('touchmove', e => {
    if (!pointer?.touch) return;
    const touch = Array.from(e.touches).find(t => t.identifier === pointer.id);
    if (!touch) return;
    if (!pointer.armed) {
      if (Math.hypot(touch.clientX - pointer.x, touch.clientY - pointer.y) > 10) clear();
      return;
    }
    if (e.cancelable) e.preventDefault();
    move(touch.clientX, touch.clientY);
  }, { passive: false });
  container.addEventListener('touchend', e => {
    if (!pointer?.touch) return;
    if (Array.from(e.touches).some(t => t.identifier === pointer.id)) return;
    const held = pointer.armed && !pointer.moved;
    finish(pointer.moved);
    if (held) options.hold?.();
  });
  container.addEventListener('touchcancel', () => { if (pointer?.touch) finish(false); });
  container.addEventListener('contextmenu', e => { if (pointer?.touch && pointer.armed) e.preventDefault(); });
  container.addEventListener('dragstart', e => {
    if (saving || !options.allowed() || options.directMouse) { e.preventDefault(); return; }
    source = item(e.target);
    if (!source) { e.preventDefault(); return; }
    options.start?.();
    source.classList.add('reorder-source');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', source.dataset.sortId);
  });
  container.addEventListener('dragover', e => {
    if (!source) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    aim(item(e.target), e.clientX, e.clientY);
  });
  container.addEventListener('drop', e => { if (source) { e.preventDefault(); finish(true); } });
  container.addEventListener('dragend', () => { if (source) { suppressUntil = Date.now() + 500; clear(); } });
  container.addEventListener('keydown', e => {
    if (!e.target.closest('.reorder-handle') || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) || saving || !options.allowed()) return;
    const row = item(e.target), forward = ['ArrowDown','ArrowRight'].includes(e.key);
    const rows = Array.from(container.querySelectorAll(options.item));
    const next = rows[rows.indexOf(row) + (forward ? 1 : -1)];
    if (!next) return;
    e.preventDefault(); source = row; target = next; after = forward;
    const id = row.dataset.sortId;
    finish(true).then(() => Array.from(container.querySelectorAll(options.item)).find(el => el.dataset.sortId === id)?.querySelector('.reorder-handle')?.focus());
  });
};
