/*
 * 四站共用（LF、DX、YA、SR 各放一份，內容相同）：
 * 1. App 圖示上傳：按「上傳」選檔（手機可選相簿）、把圖片拖進視窗、或在視窗裡按 Ctrl／⌘＋V 貼上截圖。
 *    圖片會裁成正方形（取中間）、縮成 160px 的 WebP（不支援時用 PNG），以 data URL 存進 App 資料。
 * 2. 對話框點外面才關閉：只有「按下」和「放開」都在框外才算，避免拖曳選字滑到框外放開時，改到一半的資料不見。
 */
(function () {
  if (window.clcIconUploader) return;
  const SIZE = 160, MAX_CHARS = 45000; // 單一圖示約 30KB 以內，40 個 App 也不會超過 Firestore 單筆 1MB

  window.clcIsDataIcon = v => /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(String(v || ''));

  window.clcImageToIcon = function (file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('請選擇圖片檔。'));
      const src = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(src);
        const w = img.naturalWidth || SIZE, h = img.naturalHeight || SIZE, s = Math.min(w, h);
        // 先裁成正方形，再分段縮小（一次縮太多會有鋸齒）
        let c = document.createElement('canvas'); c.width = c.height = s;
        c.getContext('2d').drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, s, s);
        while (c.width / 2 >= SIZE) {
          const n = document.createElement('canvas'); n.width = n.height = Math.round(c.width / 2);
          const g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, n.width, n.height); c = n;
        }
        const out = document.createElement('canvas'); out.width = out.height = SIZE;
        const g = out.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, SIZE, SIZE);
        let data = '';
        for (const q of [0.88, 0.78, 0.65, 0.5]) {
          data = out.toDataURL('image/webp', q);
          if (!data.startsWith('data:image/webp')) data = out.toDataURL('image/jpeg', q); // 舊版 Safari 不支援 WebP
          if (data.length <= MAX_CHARS) break;
        }
        resolve(data);
      };
      img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('讀不到這張圖片，請換一張試試。')); };
      img.src = src;
    });
  };

  // 在圖示那一列加「上傳」「移除」，並讓整個對話框接受拖放與貼上。
  // onIcon(dataUrl)：拿到新圖示；onClear()：按「移除」；onError(msg)：顯示錯誤。回傳 { setUploaded(bool) }。
  window.clcIconUploader = function ({ dialog, row, onIcon, onClear, onError }) {
    if (!document.getElementById('clc-icon-upload-style')) {
      const st = document.createElement('style');
      st.id = 'clc-icon-upload-style';
      st.textContent = `
        .clc-up-btn{flex:none;height:40px;padding:0 12px;border-radius:10px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}
        .clc-up-btn:hover{background:rgba(127,127,127,.12)}
        .clc-up-clear{border-style:dashed}
        .clc-up-btn[hidden]{display:none}
        dialog.clc-drop{outline:3px dashed #007E8A;outline-offset:-6px}
        .clc-up-hint{font-size:12px;opacity:.65;margin:4px 0 0;font-weight:500}`;
      document.head.appendChild(st);
    }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'clc-up-btn'; btn.textContent = '上傳';
    btn.title = '上傳圖片；也可以把圖片拖進來，或按 Ctrl／⌘＋V 貼上截圖';
    const clear = document.createElement('button');
    clear.type = 'button'; clear.className = 'clc-up-btn clc-up-clear'; clear.textContent = '移除'; clear.hidden = true;
    row.append(btn, clear, input);
    const hint = document.createElement('p');
    hint.className = 'clc-up-hint';
    hint.textContent = window.matchMedia('(pointer: coarse)').matches ? '可上傳相簿裡的圖片，會自動裁成正方形。' : '可上傳、拖放圖片，或按 Ctrl／⌘＋V 貼上截圖；會自動裁成正方形。';
    row.insertAdjacentElement('afterend', hint);

    const take = async f => {
      try { onIcon(await window.clcImageToIcon(f)); }
      catch (e) { onError && onError(e.message || '圖片處理失敗。'); }
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
    return {
      setUploaded(on) { clear.hidden = !on; btn.textContent = on ? '換圖' : '上傳'; }
    };
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
