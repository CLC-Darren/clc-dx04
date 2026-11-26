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
      dialog.setAttribute('aria-label', '刪除確認');
      dialog.innerHTML = '<form method="dialog"><h2>刪除確認</h2><p></p><div class="dk-actions"><button value="cancel" autofocus>取消</button><button value="remove" class="dk-danger">刪除</button></div></form>';
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

  function modeField(parent, entry, after) {
    const label = document.createElement('label');
    label.className = 'dk-open-mode';
    label.style.cssText = 'display:grid;gap:4px;font-size:inherit;color:inherit';
    label.append('開啟方式');
    const select = document.createElement('select');
    select.style.cssText = 'width:100%;min-height:40px;border:1px solid currentColor;border-radius:8px;padding:4px 8px;background:var(--bg,Canvas);color:inherit';
    for (const [value, text] of [['','依原設定／網址'],['inside','站內開啟'],['external','在瀏覽器另開']]) {
      select.add(new Option(text,value));
    }
    select.value = entry?.openMode || '';
    label.append(select);
    if (after?.parentElement === parent) after.after(label);
    else parent.prepend(label);
    return select;
  }

  function webURL(value) {
    if (!value || value === '#') return null;
    try {
      const url = new URL(value,location.href);
      return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url : null;
    } catch (_) { return null; }
  }

  function modeValue(field, href, previous) {
    if (field.value === 'inside' || field.value === 'external') return field.value;
    if (previous) return '';
    const url = webURL(href);
    return url?.origin === location.origin ? 'inside' : 'external';
  }

  function resolveLink(entry, href, fallback, inside) {
    const url = webURL(href);
    if (!url) return fallback;
    if (entry.openMode === 'external') return { href:url.href,newTab:true };
    if (entry.openMode !== 'inside') return fallback;
    if (inside) return inside(url.href);
    if (url.origin === location.origin) return { href:url.href,newTab:false };
    return { href:url.href,newTab:false,embed:true };
  }

  let openFrame;
  function showInHeader(destination, trigger) {
    const header = document.getElementById('clc-header');
    if (!header || !header.getBoundingClientRect().height) return false;
    openFrame?.();
    const section = document.createElement('section');
    section.setAttribute('aria-label','站內網站');
    section.style.cssText = 'position:fixed;inset-inline:0;bottom:0;z-index:30;display:flex;flex-direction:column;background:var(--bg,Canvas);color:var(--text,CanvasText)';
    const tools = document.createElement('div');
    tools.style.cssText = 'display:flex;justify-content:flex-end;gap:14px;padding:6px 14px;border-bottom:1px solid #8a8a8a44';
    const direct = document.createElement('a');
    direct.textContent = '在瀏覽器另開 ↗';
    direct.href = destination.href;
    direct.target = '_blank';
    direct.rel = 'noopener noreferrer';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '關閉';
    const frame = document.createElement('iframe');
    frame.title = trigger.textContent.trim() || '站內網站';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-downloads');
    frame.setAttribute('allow','fullscreen');
    frame.style.cssText = 'display:block;flex:1;min-height:0;width:100%;border:0;background:white';
    tools.append(direct,closeButton);
    section.append(tools,frame);
    const oldOverflow = document.body.style.overflow;
    function position() { section.style.top = Math.max(0,header.getBoundingClientRect().bottom)+'px'; }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position);
    function escape(event) { if (event.key === 'Escape') closeFrame(); }
    function closeFrame() {
      section.remove();
      document.body.style.overflow = oldOverflow;
      observer?.disconnect();
      window.removeEventListener('resize',position);
      document.removeEventListener('keydown',escape);
      openFrame = null;
      if (trigger.isConnected) trigger.focus();
    }
    openFrame = closeFrame;
    closeButton.onclick = closeFrame;
    position();
    observer?.observe(header);
    window.addEventListener('resize',position);
    document.addEventListener('keydown',escape);
    document.body.style.overflow = 'hidden';
    document.body.append(section);
    frame.src = destination.href;
    closeButton.focus();
    return true;
  }

  function applyLink(link, destination) {
    link.href = destination.href;
    link.removeAttribute('target');
    link.removeAttribute('rel');
    if (destination.newTab || destination.embed) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    if (link.clcEmbedListener) link.removeEventListener('click',link.clcEmbedListener);
    if (!destination.embed) return;
    link.clcEmbedListener = event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (showInHeader(destination,link)) event.preventDefault();
    };
    link.addEventListener('click',link.clcEmbedListener);
  }

  function mount(link, rows, appName) {
    if (rows.length < 2) return link;
    const button = link;
    if (button.clcEmbedListener) {
      button.removeEventListener('click',button.clcEmbedListener);
      delete button.clcEmbedListener;
    }
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
        applyLink(anchor, row);
        anchor.textContent = row.name;
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
    dialog.innerHTML = '<form><h2>新增選項</h2><div data-rows></div><div role="alert"></div><div class="dk-actions"><button type="button">取消</button><button type="submit" data-primary>儲存</button></div></form>';
    const form = dialog.querySelector('form');
    const rows = entries(app);
    const fields = [];
    for (let i = 0; i < Math.max(4, rows.length); i++) {
      const fieldset = document.createElement('fieldset');
      fieldset.innerHTML = '<legend></legend><div class="dk-entry-fields"><label>網址<input inputmode="url"></label><label>選單名稱<input></label></div>';
      fieldset.querySelector('legend').textContent = '選項 ' + (i + 1);
      const [address, name] = fieldset.querySelectorAll('input');
      address.value = rows[i]?.url || (i === 0 ? url : '');
      name.value = rows[i]?.name || (i === 0 ? app.name : '');
      const mode = modeField(fieldset, rows[i] || (i === 0 ? app : null));
      fields.push({ address, name, mode, previous: rows[i] || (i === 0 ? app : null) });
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
      for (const { address, name, mode, previous } of fields) {
        if (!address.value.trim() && !name.value.trim()) continue;
        const normalized = normalize(address.value);
        let parsed;
        try { parsed = new URL(normalized, location.href); } catch (_) {}
        if (!normalized || !parsed || !['https:', 'http:'].includes(parsed.protocol) || !name.value.trim()) {
          error.textContent = '請為每個使用中的選項填寫有效網址和選單名稱。';
          (!normalized || !parsed ? address : name).focus();
          return;
        }
        next.push({ name: name.value.trim(), url: normalized, openMode: modeValue(mode, normalized, previous) });
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

  window.clcAppEntries = { entries, mount, edit, pulse, badge, manage, closeManagement, modeField, modeValue, resolveLink, applyLink };
})();
