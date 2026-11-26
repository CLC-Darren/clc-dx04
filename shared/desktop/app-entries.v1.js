(function () {
  'use strict';
  const motion = [
    { opacity: 0, transform: 'translateY(-6px)', clipPath: 'inset(0 0 100% 0 round 14px)' },
    { opacity: 1, transform: 'translateY(0)', clipPath: 'inset(0 round 14px)' }
  ];
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active;
  function close(animate = true) {
    if (!active) return;
    const { button, menu } = active;
    active = null;
    button.setAttribute('aria-expanded', 'false');
    if (!animate || reducedMotion()) { menu.remove(); return; }
    menu.inert = true;
    menu.getAnimations().forEach(animation => animation.cancel());
    menu.animate(motion, { duration: 140, direction: 'reverse', fill: 'forwards' }).onfinish = () => menu.remove();
  }
  document.addEventListener('pointerdown', event => {
    if (active && !active.button.contains(event.target) && !active.menu.contains(event.target)) close();
  }, true);
  document.addEventListener('contextmenu', () => close(false), true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) { const { button } = active; close(); button.focus(); }
  });
  window.addEventListener('resize', () => close(false));
  window.addEventListener('scroll', event => { if (event.target !== active?.menu) close(false); }, { capture: true, passive: true });

  const entries = app => Array.isArray(app.menu) ? app.menu.filter(row => row && row.name && row.url) : [];

  function mount(link, rows, appName) {
    if (rows.length < 2) return link;
    const button = link;
    button.classList.add('dk-entry-trigger');
    button.removeAttribute('target');
    button.removeAttribute('rel');
    button.setAttribute('href', '#');
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', appName);
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('keydown', event => {
      if (event.key === ' ') { event.preventDefault(); button.click(); }
    });
    button.addEventListener('click', event => {
      event.preventDefault();
      if (active?.button === button) { close(); return; }
      close(false);
      const menu = document.createElement('div');
      menu.className = 'dk-menu dk-entry-menu';
      for (const row of rows) {
        const anchor = document.createElement('a');
        anchor.href = row.href;
        anchor.textContent = row.name;
        if (row.newTab) { anchor.target = '_blank'; anchor.rel = 'noopener'; }
        anchor.addEventListener('click', () => close());
        menu.append(anchor);
      }
      button.after(menu);
      const icon = button.querySelector('[data-dk-app-icon]') || button;
      const { left, bottom } = icon.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(left, innerWidth - menu.offsetWidth - 8)) + 'px';
      menu.style.top = Math.max(8, Math.min(bottom + 4, innerHeight - menu.offsetHeight - 8)) + 'px';
      button.setAttribute('aria-expanded', 'true');
      active = { button, menu };
      if (!reducedMotion()) menu.animate(motion, { duration: 170, easing: 'ease-out' });
    });
    return button;
  }

  function edit(app, url, normalize, save) {
    close(false);
    const dialog = document.createElement('dialog');
    dialog.className = 'dk-confirm dk-entry-dialog';
    dialog.setAttribute('aria-label', '新增選項');
    dialog.innerHTML = '<form><p>新增選項</p><div data-rows></div><div role="alert"></div><div class="dk-actions"><button type="button">取消</button><button type="submit">儲存</button></div></form>';
    const form = dialog.querySelector('form');
    const rows = entries(app);
    const fields = [];
    for (let i = 0; i < Math.max(4, rows.length); i++) {
      const fieldset = document.createElement('fieldset');
      fieldset.innerHTML = '<legend></legend><div class="dk-entry-fields"><input placeholder="網址" aria-label="網址" inputmode="url"><input placeholder="選單名稱" aria-label="選單名稱"></div>';
      fieldset.querySelector('legend').textContent = '選項 ' + (i + 1);
      const [address, name] = fieldset.querySelectorAll('input');
      address.value = rows[i]?.url || (i === 0 ? url : '');
      name.value = rows[i]?.name || (i === 0 ? app.name : '');
      fields.push({ address, name });
      form.querySelector('[data-rows]').append(fieldset);
    }
    let saving = false;
    form.querySelector('[type=button]').onclick = () => dialog.close();
    dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (saving) return;
      const error = form.querySelector('[role=alert]');
      const next = [];
      for (const { address, name } of fields) {
        if (!address.value.trim() && !name.value.trim()) continue;
        const normalized = normalize(address.value);
        let parsed;
        try { parsed = new URL(normalized, location.href); } catch (_) {}
        if (!normalized || !parsed || !['https:', 'http:'].includes(parsed.protocol) || !name.value.trim()) {
          error.textContent = '請為每個使用中的選項填寫有效網址和選單名稱。';
          (!normalized || !parsed ? address : name).focus();
          return;
        }
        next.push({ name: name.value.trim(), url: normalized });
      }
      if (!next.length) { error.textContent = '請至少保留一個入口。'; return; }
      saving = true;
      form.querySelectorAll('button').forEach(button => button.disabled = true);
      error.textContent = '';
      try { await save(next); dialog.close(); }
      catch (err) {
        console.warn('入口儲存失敗', err);
        error.textContent = '儲存失敗，請確認權限與連線後再試一次。';
        form.querySelectorAll('button').forEach(button => button.disabled = false);
        saving = false;
      }
    });
    document.body.append(dialog);
    dialog.showModal();
  }

  window.clcAppEntries = { entries, mount, edit };
})();
