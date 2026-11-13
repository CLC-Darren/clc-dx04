// Pointer handles (mouse/touch), native desktop drag/drop, and keyboard sorting.
window.clcReorder = function (container, options) {
  let source = null, target = null, after = false, pointer = null, suppressUntil = 0, saving = false;
  const item = node => node?.closest?.(options.item);
  function valid(next) {
    return source && next && next !== source && container.contains(next) &&
      (!options.sameGroup || next.parentElement === source.parentElement);
  }
  function clear() {
    container.querySelectorAll('.reorder-source, .reorder-target').forEach(el => el.classList.remove('reorder-source', 'reorder-target'));
    source = target = pointer = null;
  }
  function aim(next, x, y) {
    if (target) target.classList.remove('reorder-target');
    target = valid(next) ? next : null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    after = options.grid ? x > rect.left + rect.width / 2 : y > rect.top + rect.height / 2;
    target.classList.add('reorder-target');
  }
  async function finish(commit) {
    const from = source?.dataset.sortId, to = target?.dataset.sortId, insertAfter = after;
    clear();
    if (!commit || !from || !to || !options.allowed()) return;
    suppressUntil = Date.now() + 400;
    saving = true;
    try { await options.move(from, to, insertAfter); }
    catch (error) { options.error?.(error); }
    finally { saving = false; }
  }
  container.addEventListener('click', e => {
    if (Date.now() < suppressUntil || e.target.closest('.reorder-handle')) {
      e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);
  container.addEventListener('pointerdown', e => {
    if (saving || !options.allowed() || e.button !== 0 || !e.target.closest('.reorder-handle')) return;
    const next = item(e.target); if (!next) return;
    e.preventDefault(); e.stopPropagation();
    source = next; pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    container.setPointerCapture(e.pointerId);
  }, true);
  container.addEventListener('pointermove', e => {
    if (!pointer || e.pointerId !== pointer.id) return;
    if (!pointer.moved && Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) < 6) return;
    pointer.moved = true;
    source.classList.add('reorder-source');
    aim(item(document.elementFromPoint(e.clientX, e.clientY)), e.clientX, e.clientY);
    if (e.clientY < 60) window.scrollBy(0, -15);
    else if (e.clientY > innerHeight - 60) window.scrollBy(0, 15);
  });
  container.addEventListener('pointerup', e => {
    if (!pointer || e.pointerId !== pointer.id) return;
    const moved = pointer.moved;
    container.releasePointerCapture(e.pointerId);
    if (moved) suppressUntil = Date.now() + 400;
    finish(moved);
  });
  container.addEventListener('pointercancel', () => { if (pointer) finish(false); });
  container.addEventListener('dragstart', e => {
    if (saving || !options.allowed()) { e.preventDefault(); return; }
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
  container.addEventListener('dragend', () => { if (source) { suppressUntil = Date.now() + 400; clear(); } });
  container.addEventListener('keydown', e => {
    if (!e.target.closest('.reorder-handle') || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) || saving || !options.allowed()) return;
    const row = item(e.target), forward = ['ArrowDown','ArrowRight'].includes(e.key);
    const next = forward ? row.nextElementSibling : row.previousElementSibling;
    if (!next?.matches(options.item)) return;
    e.preventDefault(); source = row; target = next; after = forward;
    const id = row.dataset.sortId;
    finish(true).then(() => {
      Array.from(container.querySelectorAll(options.item)).find(el => el.dataset.sortId === id)?.querySelector('.reorder-handle')?.focus();
    });
  });
};
