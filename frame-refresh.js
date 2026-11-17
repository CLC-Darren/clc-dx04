/* 嵌入網頁（open.html 的 iframe）也能「往下拉重新整理」。
 * 外部網站在 iframe 裡，手指在網頁內容上拉時瀏覽器不會更新，也收不到觸控事件；
 * 所以改成：從頂端的 Header（標題列）往下拉，出現 ↻，拉夠放開就重新載入裡面的網頁。
 * 用法：在有 <header> 與 <iframe> 的頁面最後加 <script src="frame-refresh.js"></script>。 */
(function () {
  var frame = document.querySelector('iframe'), bar = document.querySelector('header');
  if (!frame || !bar) return;
  var TRIGGER = 70, MAX = 110, startY = null, dy = 0;
  var ind = document.createElement('div');
  ind.setAttribute('aria-hidden', 'true'); ind.textContent = '↻';
  ind.style.cssText = 'position:fixed;left:50%;top:calc(8px + env(safe-area-inset-top));z-index:2147483600;width:36px;height:36px;margin-left:-18px;border-radius:50%;' +
    'display:grid;place-items:center;font:700 20px/1 Arial,sans-serif;background:#fff;color:#0f766e;box-shadow:0 2px 10px rgba(0,0,0,.2);' +
    'opacity:0;transform:translateY(-50px);transition:opacity .15s;pointer-events:none;';
  document.body.appendChild(ind);
  function hide() { ind.style.transition = 'opacity .15s, transform .2s'; ind.style.opacity = 0; ind.style.transform = 'translateY(-50px)'; }
  bar.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1 || e.target.closest('button, a, input, select, textarea, [role="menu"], [role="dialog"]')) { startY = null; return; }
    startY = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  bar.addEventListener('touchmove', function (e) {
    if (startY === null) return;
    dy = Math.min(MAX, Math.max(0, (e.touches[0].clientY - startY) * 0.6));
    ind.style.transition = 'opacity .15s';
    ind.style.opacity = dy > 10 ? Math.min(1, dy / TRIGGER) : 0;
    ind.style.transform = 'translateY(' + (dy - 40) + 'px) rotate(' + (dy * 4) + 'deg)';
  }, { passive: true });
  bar.addEventListener('touchend', function () {
    if (startY === null) return;
    startY = null;
    if (dy < TRIGGER) return hide();
    var src = frame.getAttribute('src') || frame.dataset.src;
    if (!src) return hide();
    var spin = ind.animate ? ind.animate([{ transform: 'translateY(' + (dy - 40) + 'px) rotate(0)' }, { transform: 'translateY(' + (dy - 40) + 'px) rotate(360deg)' }], { duration: 600, iterations: Infinity }) : null;
    var done = function () { frame.removeEventListener('load', done); if (spin) spin.cancel(); hide(); };
    frame.addEventListener('load', done); setTimeout(done, 8000);
    frame.src = 'about:blank'; setTimeout(function () { frame.src = src; }, 30); // 重新載入裡面的網頁
  });
})();
