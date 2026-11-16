/*
 * 四站共用（LF、DX、YA、SR 各放一份，內容相同）：
 * 1. App 圖示：按 📷 選圖（手機可選相簿或拍照）、把圖片拖進視窗、或在視窗裡按 Ctrl／⌘＋V 貼上截圖。
 *    取得圖片後開啟裁切畫面（像 LINE）：中間是 App 的圓角方形，可拖曳移動、縮放（滑桿、滾輪、雙指），
 *    下方即時預覽 App 圖示和名稱。完成後縮成 160px 的 WebP（不支援時用 JPEG），以 data URL 存進 App 資料。
 * 2. 對話框點外面才關閉：只有「按下」和「放開」都在框外才算，避免拖曳選字滑到框外放開時，改到一半的資料不見。
 */
(function () {
  if (window.clcIconUploader) return;
  const SIZE = 160, MAX_CHARS = 45000; // 單一圖示約 30KB 以內，40 個 App 也不會超過 Firestore 單筆 1MB
  const RADIUS = '22%';                // 與四站 App 圖示的圓角相同

  window.clcIsDataIcon = v => /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(String(v || ''));

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('請選擇圖片檔。'));
      const src = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve(img); // 用完再呼叫 URL.revokeObjectURL(img.src)
      img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('讀不到這張圖片，請換一張試試。')); };
      img.src = src;
    });
  }
  // 從原圖裁出 (sx, sy, sw, sw) 這塊正方形，縮成 size×size（分段縮小，避免鋸齒）
  function cropToCanvas(img, sx, sy, sw, size) {
    let c = document.createElement('canvas');
    const first = Math.max(size, Math.min(Math.round(sw), 2048));
    c.width = c.height = first;
    const g0 = c.getContext('2d'); g0.imageSmoothingQuality = 'high';
    g0.drawImage(img, sx, sy, sw, sw, 0, 0, first, first);
    while (c.width / 2 >= size) {
      const n = document.createElement('canvas'); n.width = n.height = Math.round(c.width / 2);
      const g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, n.width, n.height); c = n;
    }
    const out = document.createElement('canvas'); out.width = out.height = size;
    const g = out.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, size, size);
    return out;
  }
  function encode(canvas) {
    let data = '';
    for (const q of [0.88, 0.78, 0.65, 0.5]) {
      data = canvas.toDataURL('image/webp', q);
      if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', q); // 舊版 Safari 不支援 WebP
      if (data.length <= MAX_CHARS) break;
    }
    return data;
  }
  // 不裁切、直接取中間正方形（保留給舊程式用）
  window.clcImageToIcon = async function (file) {
    const img = await loadImage(file);
    const w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h);
    try { return encode(cropToCanvas(img, (w - s) / 2, (h - s) / 2, s, SIZE)); } finally { URL.revokeObjectURL(img.src); }
  };

  const CAMERA = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';
  const CROSS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function injectStyle() {
    if (document.getElementById('clc-icon-upload-style')) return;
    const st = document.createElement('style');
    st.id = 'clc-icon-upload-style';
    st.textContent = `
      .clc-up-btn{flex:none;width:40px;height:40px;display:grid;place-items:center;border-radius:12px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;cursor:pointer;padding:0}
      .clc-up-btn:hover{background:rgba(127,127,127,.12)}
      .clc-up-btn[hidden]{display:none}
      .clc-up-clear{width:32px;height:32px;border-radius:50%;border:0;opacity:.6}
      dialog.clc-drop{outline:3px dashed #007E8A;outline-offset:-6px}
      .clc-crop{border:0;padding:0;margin:auto;width:min(100vw,420px);max-width:100vw;max-height:100dvh;background:#111;color:#fff;border-radius:18px;overflow:hidden;font-family:"CLC Arial",Arial,"Microsoft JhengHei",sans-serif}
      .clc-crop::backdrop{background:rgba(0,0,0,.7)}
      @media (max-width:480px){.clc-crop{width:100vw;height:100dvh;border-radius:0}.clc-crop-in{justify-content:center}}
      .clc-crop-in{display:flex;flex-direction:column;height:100%}
      .clc-crop-top{display:flex;align-items:center;justify-content:space-between;padding:12px 14px}
      .clc-crop-top b{font-size:15px}
      .clc-crop-x{width:40px;height:40px;border:0;background:transparent;color:#fff;cursor:pointer;display:grid;place-items:center;border-radius:50%}
      .clc-crop-x:hover{background:rgba(255,255,255,.1)}
      .clc-crop-stage{position:relative;width:100%;aspect-ratio:1;overflow:hidden;background:#000;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}
      .clc-crop-stage.drag{cursor:grabbing}
      .clc-crop-stage img{position:absolute;left:0;top:0;transform-origin:0 0;max-width:none;pointer-events:none;-webkit-user-drag:none}
      .clc-crop-hole{position:absolute;left:10%;top:10%;width:80%;height:80%;border-radius:${RADIUS};box-shadow:0 0 0 9999px rgba(0,0,0,.55);outline:1.5px solid rgba(255,255,255,.85);pointer-events:none}
      .clc-crop-zoom{display:flex;align-items:center;gap:12px;padding:14px 18px 4px}
      .clc-crop-zoom button{width:32px;height:32px;border:0;background:transparent;color:#fff;font-size:22px;line-height:1;cursor:pointer;border-radius:50%}
      .clc-crop-zoom input{flex:1;accent-color:#06C755}
      .clc-crop-foot{display:flex;align-items:center;gap:16px;padding:12px 18px 18px;padding-bottom:max(18px,env(safe-area-inset-bottom))}
      .clc-crop-prev{display:flex;flex-direction:column;align-items:center;gap:6px;width:76px;flex:none}
      .clc-crop-prev canvas{width:60px;height:60px;border-radius:${RADIUS};background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.4)}
      .clc-crop-prev span{font-size:12px;font-weight:700;max-width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}
      .clc-crop-tip{flex:1;font-size:12px;line-height:1.5;color:rgba(255,255,255,.65)}
      .clc-crop-ok{flex:none;height:42px;padding:0 22px;border:0;border-radius:10px;background:#06C755;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer}
      .clc-crop-ok:hover{filter:brightness(1.05)}`;
    document.head.appendChild(st);
  }

  // 裁切畫面：回傳 Promise<dataURL | null>（按 ✕ 或 Esc 取消為 null）
  function openCropper(img, name) {
    injectStyle();
    return new Promise(resolve => {
      const d = document.createElement('dialog');
      d.className = 'clc-crop';
      d.innerHTML = `
        <div class="clc-crop-in">
          <div class="clc-crop-top"><b>調整圖示</b><button type="button" class="clc-crop-x" data-c="x" aria-label="取消">${CROSS}</button></div>
          <div class="clc-crop-stage" data-c="stage"><img alt="" data-c="img"><div class="clc-crop-hole"></div></div>
          <div class="clc-crop-zoom"><button type="button" data-c="out" aria-label="縮小">−</button><input type="range" min="0" max="1000" value="0" data-c="zoom" aria-label="縮放"><button type="button" data-c="in" aria-label="放大">＋</button></div>
          <div class="clc-crop-foot">
            <div class="clc-crop-prev"><canvas width="120" height="120" data-c="prev"></canvas><span data-c="name"></span></div>
            <div class="clc-crop-tip">拖曳移動、縮放調整<br>框內就是 App 圖示</div>
            <button type="button" class="clc-crop-ok" data-c="ok">完成</button>
          </div>
        </div>`;
      document.body.appendChild(d);
      const q = k => d.querySelector('[data-c="' + k + '"]');
      const stage = q('stage'), im = q('img'), zoom = q('zoom'), prev = q('prev');
      q('name').textContent = name || 'App';
      im.src = img.src;
      const W = img.naturalWidth, H = img.naturalHeight;
      let S = 0, hole = 0, hx = 0, minS = 1, maxS = 1, s = 1, ox = 0, oy = 0;

      function clamp() {
        s = Math.min(maxS, Math.max(minS, s));
        ox = Math.min(hx, Math.max(hx + hole - W * s, ox)); // 圖片永遠蓋滿中間的框
        oy = Math.min(hx, Math.max(hx + hole - H * s, oy));
      }
      let raf = 0;
      function draw() {
        clamp();
        im.style.transform = `translate(${ox}px,${oy}px) scale(${s})`;
        zoom.value = Math.round(Math.log(s / minS) / Math.log(maxS / minS || 2) * 1000) || 0;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const g = prev.getContext('2d'); g.imageSmoothingQuality = 'high';
          g.clearRect(0, 0, 120, 120);
          g.drawImage(img, (hx - ox) / s, (hx - oy) / s, hole / s, hole / s, 0, 0, 120, 120);
        });
      }
      function layout() {
        const oldS = S;
        S = stage.clientWidth; hole = S * 0.8; hx = S * 0.1;
        const prevMin = minS;
        minS = Math.max(hole / W, hole / H); maxS = Math.max(minS * 8, minS * 1.01);
        if (!oldS) { s = minS; ox = hx + (hole - W * s) / 2; oy = hx + (hole - H * s) / 2; } // 一開始：短邊剛好填滿框、置中
        else { const k = S / oldS; ox *= k; oy *= k; s = s / prevMin * minS; }
        draw();
      }
      function zoomAt(ns, cx, cy) { // 以 (cx, cy) 為中心縮放
        ns = Math.min(maxS, Math.max(minS, ns));
        ox = cx - (cx - ox) * ns / s; oy = cy - (cy - oy) * ns / s; s = ns; draw();
      }
      const center = () => hx + hole / 2;
      zoom.addEventListener('input', () => zoomAt(minS * Math.pow(maxS / minS, zoom.value / 1000), center(), center()));
      q('in').addEventListener('click', () => zoomAt(s * 1.2, center(), center()));
      q('out').addEventListener('click', () => zoomAt(s / 1.2, center(), center()));
      stage.addEventListener('wheel', e => {
        e.preventDefault();
        const r = stage.getBoundingClientRect();
        zoomAt(s * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
      // 拖曳（一指）與縮放（兩指）
      const pts = new Map(); let last = null;
      const rel = e => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      function snapshot() {
        const a = [...pts.values()];
        if (a.length === 1) return { x: a[0].x, y: a[0].y, dist: 0 };
        return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, dist: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) };
      }
      stage.addEventListener('pointerdown', e => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, rel(e)); last = snapshot(); stage.classList.add('drag'); });
      stage.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, rel(e));
        const now = snapshot();
        if (last && now.dist && last.dist) { const ns = Math.min(maxS, Math.max(minS, s * now.dist / last.dist)); ox = now.x - (last.x - ox) * ns / s; oy = now.y - (last.y - oy) * ns / s; s = ns; }
        else if (last) { ox += now.x - last.x; oy += now.y - last.y; }
        last = now; draw();
      });
      const up = e => { pts.delete(e.pointerId); last = pts.size ? snapshot() : null; if (!pts.size) stage.classList.remove('drag'); };
      stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);

      const ro = window.ResizeObserver ? new ResizeObserver(() => { if (stage.clientWidth && stage.clientWidth !== S) layout(); }) : null;
      let done = false;
      function finish(v) {
        if (done) return; done = true;
        if (ro) ro.disconnect();
        d.close(); d.remove(); resolve(v);
      }
      q('x').addEventListener('click', () => finish(null));
      d.addEventListener('cancel', e => { e.preventDefault(); finish(null); }); // Esc
      q('ok').addEventListener('click', () => finish(encode(cropToCanvas(img, (hx - ox) / s, (hx - oy) / s, hole / s, SIZE))));
      d.showModal();
      requestAnimationFrame(() => { layout(); if (ro) ro.observe(stage); });
    });
  }

  // 在圖示那一列加 📷（選圖）與 ✕（移除），並讓整個對話框接受拖放與貼上截圖。
  // onIcon(dataUrl)：拿到新圖示；onClear()：按 ✕；onError(msg)：顯示錯誤。回傳 { setUploaded(bool) }。
  window.clcIconUploader = function ({ dialog, row, onIcon, onClear, onError, getName }) {
    injectStyle();
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'clc-up-btn'; btn.innerHTML = CAMERA;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    btn.title = btn.ariaLabel = coarse ? '選擇圖片' : '選擇圖片（也可以把圖片拖進來，或按 Ctrl／⌘＋V 貼上截圖）';
    btn.setAttribute('aria-label', '選擇圖片做為圖示');
    const clear = document.createElement('button');
    clear.type = 'button'; clear.className = 'clc-up-btn clc-up-clear'; clear.innerHTML = CROSS; clear.hidden = true;
    clear.title = '移除上傳的圖片'; clear.setAttribute('aria-label', '移除上傳的圖片');
    row.append(btn, clear, input);

    const nameOf = () => {
      if (getName) return getName();
      const el = dialog.querySelector('input[data-ha="name"], #appName, #lfAppName');
      return el ? el.value.trim() : '';
    };
    const take = async f => {
      let img = null;
      try {
        img = await loadImage(f);
        const data = await openCropper(img, nameOf());
        if (data) onIcon(data);
      } catch (e) { onError && onError(e.message || '圖片處理失敗。'); }
      finally { if (img) URL.revokeObjectURL(img.src); }
    };
    btn.addEventListener('click', () => input.click());
    clear.addEventListener('click', () => onClear && onClear());
    input.addEventListener('change', () => { if (input.files && input.files[0]) take(input.files[0]); input.value = ''; });
    const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    dialog.addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); dialog.classList.add('clc-drop'); } });
    dialog.addEventListener('dragleave', e => { if (!e.relatedTarget || !dialog.contains(e.relatedTarget)) dialog.classList.remove('clc-drop'); });
    dialog.addEventListener('drop', e => {
      dialog.classList.remove('clc-drop');
      if (!hasFiles(e)) return;
      e.preventDefault();
      const f = Array.from(e.dataTransfer.files || []).find(x => /^image\//.test(x.type));
      if (f) take(f); else onError && onError('請拖放圖片檔。');
    });
    dialog.addEventListener('paste', e => {
      const item = Array.from((e.clipboardData && e.clipboardData.items) || []).find(i => i.kind === 'file' && /^image\//.test(i.type));
      if (!item) return; // 一般文字照常貼上
      e.preventDefault();
      take(item.getAsFile());
    });
    return { setUploaded(on) { clear.hidden = !on; } };
  };

  // 點對話框外面關閉：按下和放開都要在框外（拖曳選字滑出去不會關掉）。
  window.clcDialogBackdropClose = function (dialog, close) {
    let downOutside = false;
    const outside = e => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    dialog.addEventListener('pointerdown', e => { downOutside = e.target === dialog && outside(e); });
    dialog.addEventListener('click', e => {
      const ok = downOutside && e.target === dialog && outside(e);
      downOutside = false;
      if (ok) (close || (() => dialog.close()))();
    });
  };
})();
