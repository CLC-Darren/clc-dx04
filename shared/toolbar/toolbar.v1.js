/* CLC 共用頂部工具列 v1：分頁＋放大鏡＋加號（＋搜尋列）。用法見 /shared/README.md */
(function () {
  'use strict';
  var SVG_S = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.2-4.2"/></svg>';
  var SVG_P = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }

  window.clcToolbar = function (host, o) {
    o = o || {};
    var cur = o.active || (o.tabs && o.tabs[0] && o.tabs[0].id);
    host.classList.add('clc-tb');
    var tabs = h('div', 'clc-tb-tabs'); tabs.setAttribute('role', 'tablist');
    (o.tabs || []).forEach(function (t) {
      var b = h('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.tab = t.id; b.textContent = t.label;
      var dot = h('i', 'clc-tb-dot'); dot.hidden = true; b.appendChild(dot);
      b.addEventListener('click', function () { setTab(t.id, true); });
      tabs.appendChild(b);
    });
    var sBtn = h('button', 'clc-tb-icon', SVG_S); sBtn.type = 'button'; sBtn.setAttribute('aria-label', '搜尋'); sBtn.setAttribute('aria-expanded', 'false');
    tabs.appendChild(sBtn);
    var addWrap = h('div', 'clc-tb-add'), add = h('button', 'clc-tb-btn', SVG_P), menu = h('div', 'clc-tb-menu');
    add.type = 'button'; add.setAttribute('aria-label', '新增'); add.setAttribute('aria-expanded', 'false'); menu.hidden = true;
    addWrap.append(add, menu); host.append(tabs, addWrap);

    var box = h('label', 'clc-tb-search', SVG_S), input = h('input'), clr = h('button', '', '✕');
    input.type = 'search'; input.placeholder = o.placeholder || '搜尋…'; input.autocomplete = 'off'; input.setAttribute('enterkeyhint', 'go'); input.setAttribute('aria-label', '搜尋');
    clr.type = 'button'; clr.setAttribute('aria-label', '清除搜尋'); clr.hidden = true; box.hidden = true;
    box.append(input, clr);
    (o.searchHost || host.parentNode).insertBefore(box, o.searchHost ? null : host.nextSibling);

    function setTab(id, user) {
      cur = id;
      tabs.querySelectorAll('[data-tab]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === id ? 'true' : 'false'); });
      refresh();
      if (user && o.onTab) o.onTab(id);
    }
    function items() { return (o.addItems ? o.addItems(cur) : []) || []; }
    function refresh() { add.hidden = !items().length; setMenu(false); }
    function setMenu(open) {
      if (open) {
        menu.textContent = '';
        items().forEach(function (m) {
          var b = h('button'); b.type = 'button'; b.textContent = m.label;
          b.addEventListener('click', function () { setMenu(false); m.run(); });
          menu.appendChild(b);
        });
      }
      menu.hidden = !open; add.setAttribute('aria-expanded', String(open));
    }
    add.addEventListener('click', function () { setMenu(menu.hidden); });
    document.addEventListener('pointerdown', function (e) { if (!addWrap.contains(e.target)) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); add.focus(); } });

    function fire() { clr.hidden = !input.value; if (o.onSearch) o.onSearch(input.value.trim()); }
    function show(on) { box.hidden = !on; sBtn.setAttribute('aria-expanded', on ? 'true' : 'false'); if (on) input.focus(); }
    function clear() { input.value = ''; fire(); show(false); }
    input.addEventListener('input', fire);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') clear();
      if (e.key === 'Enter' && input.value.trim() && o.onEnter) o.onEnter(input.value.trim());
    });
    sBtn.addEventListener('click', function () { if (box.hidden) show(true); else clear(); });
    input.addEventListener('blur', function () { setTimeout(function () { if (!input.value.trim() && document.activeElement !== input) show(false); }, 150); });
    clr.addEventListener('mousedown', function (e) { e.preventDefault(); });
    clr.addEventListener('click', clear);

    setTab(cur, false);
    return {
      setTab: setTab, tab: function () { return cur; }, refresh: refresh,
      setDot: function (id, on) { var b = tabs.querySelector('[data-tab="' + id + '"] .clc-tb-dot'); if (b) b.hidden = !on; },
      value: function () { return input.value.trim(); }, clearSearch: clear, input: input
    };
  };
})();
