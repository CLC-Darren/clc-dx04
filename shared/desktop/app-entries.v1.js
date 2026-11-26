(function () {
  'use strict';
  const motion = [
    { opacity: 0, transform: 'translateY(-6px)', clipPath: 'inset(0 0 100% 0 round 14px)' },
    { opacity: 1, transform: 'translateY(0)', clipPath: 'inset(0 round 14px)' }
  ];
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active, management;
  function pulse(icon, repeat = false) {
    if (!icon || reducedMotion()) return;
    return icon.animate([
      { translate: '0 0', scale: '1', offset: 0, easing: 'cubic-bezier(.2,.8,.3,1)' },
      { translate: '0 -4px', scale: '1.025', offset: .29, easing: 'cubic-bezier(.55,.05,.7,.7)' },
      { translate: '0 1px', scale: '.99', offset: .55, easing: 'ease-out' },
      { translate: '0 -1px', scale: '1', offset: .69 },
      { translate: '0 0', scale: '1', offset: .83 },
      { translate: '0 0', scale: '1', offset: 1 }
    ], { duration: repeat ? 840 : 360, iterations: repeat ? Infinity : 1 });
  }
  function badge(icon) {
    if (!icon || icon.querySelector('.dk-entry-badge')) return;
    icon.classList.add('dk-entry-icon');
    const arrow = document.createElement('span');
    arrow.className = 'dk-entry-badge';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.style.animationDelay = (2 + Math.random() * 5) + 's';
    icon.append(arrow);
  }
  function closeManagement() {
    if (!management) return;
    management.animation?.cancel();
    management.menu.remove();
    management = null;
  }
  function manage({ name, icon, touch, actions, remove }) {
    close(false);
    closeManagement();
    const menu = document.createElement('div');
    menu.className = 'dk-menu dk-app-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', name);
    const header = document.createElement('div');
    header.className = 'dk-app-menu-header';
    const title = document.createElement('strong');
    title.textContent = name;
    header.append(title);
    menu.append(header);
    const rows = [...actions];
    if (remove) rows.push({ label: '刪除', danger: true, run: () => {
      const dialog = document.createElement('dialog');
      dialog.className = 'dk-confirm';
      dialog.innerHTML = '<form method="dialog"><p></p><div class="dk-actions"><button value="cancel">取消</button><button value="remove" class="dk-danger">刪除</button></div></form>';
      dialog.querySelector('p').textContent = '確認刪除「' + name + '」？';
      dialog.addEventListener('close', () => {
        if (dialog.returnValue === 'remove') remove();
        dialog.remove();
      }, { once: true });
      document.body.append(dialog);
      dialog.showModal();
    } });
    for (const row of rows) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.textContent = row.label;
      if (row.danger) button.className = 'dk-danger';
      button.onclick = () => { closeManagement(); row.run(); };
      menu.append(button);
    }
    document.body.append(menu);
    const rect = icon.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(rect.bottom + 4, innerHeight - menu.offsetHeight - 8)) + 'px';
    management = { menu, animation: pulse(icon, touch) };
  }
  document.addEventListener('pointerdown', event => {
    if (management && !management.menu.contains(event.target)) closeManagement();
  }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeManagement(); });
  window.addEventListener('resize', closeManagement);
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
    badge(button.querySelector('[data-dk-app-icon]'));
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
      pulse(icon);
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

  window.clcAppEntries = { entries, mount, edit, pulse, badge, manage, closeManagement };
})();
