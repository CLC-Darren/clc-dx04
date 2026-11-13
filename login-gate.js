// DX04 入口只使用 header.js 的既有 Firebase 登入及管理權限。
(function () {
  let allowed = false;
  let started = false;
  let busy = false;
  function startPrivateScripts() {
    if (!allowed || started || document.readyState === 'loading') return;
    started = true;
    document.querySelectorAll('script[data-dx-private]').forEach(source => {
      const script = document.createElement('script');
      script.textContent = source.textContent;
      source.replaceWith(script);
    });
  }
  window.clcSetGateAccess = function (active) {
    allowed = !!active;
    document.documentElement.classList.toggle('dx-locked', !allowed);
    const gate = document.getElementById('dx-login-gate');
    if (gate) gate.hidden = allowed;
    // 清掉已載入的私有畫面、計時器與監聽，避免登出後仍背景讀取。
    if (!allowed && started && !window.clcLogoutPending) { location.replace('/'); return; }
    startPrivateScripts();
  };
  document.addEventListener('DOMContentLoaded', () => {
    const gate = document.createElement('section');
    gate.id = 'dx-login-gate';
    gate.hidden = allowed;
    gate.setAttribute('aria-label', 'DX04 登入');
    gate.innerHTML = '<button type="button" id="dx-login-button" aria-label="使用 Google 帳號登入 DX04">DX04</button><p id="dx-login-status" role="status" aria-live="polite"></p>';
    document.body.appendChild(gate);
    const button = document.getElementById('dx-login-button');
    button.addEventListener('click', async () => {
      if (busy) return;
      const status = document.getElementById('dx-login-status');
      if (typeof window.triggerAdminLogin !== 'function') {
        status.textContent = '登入服務尚未載入，請重新整理後再試。';
        return;
      }
      busy = true;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      status.textContent = '';
      try {
        await window.triggerAdminLogin({ quiet: true, onError: message => { status.textContent = message; } });
      } finally {
        busy = false;
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    });
    startPrivateScripts();
  });
})();
