// DX04 入口只使用 header.js 的既有 Firebase 登入及管理權限。
(function () {
  let allowed = false, started = false, busy = false;
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
    if (!allowed && started && !window.clcLogoutPending) { location.replace('/'); return; }
    startPrivateScripts();
  };
  async function login(button) {
    if (allowed) return true;
    if (busy) return false;
    const status = document.getElementById('dx-login-status');
    if (typeof window.triggerAdminLogin !== 'function') {
      status.textContent = '登入服務尚未載入，請重新整理後再試。';
      return false;
    }
    busy = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    status.textContent = '';
    try {
      await window.triggerAdminLogin({ quiet:true, onError:message => { status.textContent = message; } });
      return allowed;
    } catch (error) {
      console.error('登入未完成：', error);
      status.textContent = '登入尚未完成，請稍後再試。';
      return false;
    } finally {
      busy = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    const welcome = document.getElementById('dx04-welcome-overlay');
    if (welcome) {
      // 動畫與最後靜止畫面就是登入入口，不再建立底層的第二個 DX04。
      const status = document.createElement('p');
      status.id = 'dx-login-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      welcome.appendChild(status);
      welcome.setAttribute('aria-label', '使用 Google 帳號登入 DX04');
      window.clcEnterWelcome = () => login(welcome);
    } else {
      // 權限管理及 app 頁，以及 Canvas 不可用時，保留共用登入入口。
      const gate = document.createElement('section');
      gate.id = 'dx-login-gate'; gate.hidden = allowed; gate.setAttribute('aria-label', 'DX04 登入');
      gate.innerHTML = '<button type="button" id="dx-login-button" aria-label="使用 Google 帳號登入 DX04">DX04</button><p id="dx-login-status" role="status" aria-live="polite"></p>';
      document.body.appendChild(gate);
      const button = document.getElementById('dx-login-button');
      button.addEventListener('click', () => login(button));
    }
    startPrivateScripts();
  });
})();
