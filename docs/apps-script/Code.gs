/**
 * CLC 寄信中心（Google Apps Script）— 所有站台共用這一份
 *
 * 一份程式處理所有站的寄信；各站的規則（開關、收件人…）都在各站自己的網站後台設定，存在各站的 Firestore。
 *
 *   YA（clc-ya-portal）
 *     - ya_processMailJobs：權限管理「寄測試信」（每 5 分鐘）
 *     - ya_dailyDigest：每天 09:00 待審核摘要（場地登記、使用者送審的新歌）→ 勾選「接收每日審核摘要」的管理員
 *     - ya_weeklyEditDigest：每週二 09:00 使用者排版修改建議（歌詞管理 → 📥 待審核 可開關）
 *       信裡「✅ 直接存為預設」「✕ 不採用」由本程式的網頁應用程式（doGet／doPost）處理
 *   SR（clc-sr-portal）
 *     - sr_processIntakes：新朋友留名單後寄通知與歡迎卡（每 5 分鐘）→ 名單後台「小組」設定的通知信箱
 *   DX04：目前沒有寄信功能；之後新增時在 SITES 加設定、寫一個 dx_ 開頭的函式，再排進下面的排程。
 *
 * 必要條件：
 *   - 放在 darren710404@gmail.com 的 Apps Script（所有站的 Firebase 專案都在這個帳號底下）。
 *     程式用這個帳號的身分讀寫各站 Firestore，不受網站規則限制。寄件人就是這個帳號。
 *   - 個人 Gmail 每天約可寄給 100 位收件人（所有程式合計）。
 *
 * 安裝（只要做一次）：
 *   1. script.google.com 新增專案（建議命名「CLC 寄信中心」），貼上本檔（Code.gs）與 appsscript.json
 *      （專案設定 → 勾選「在編輯器中顯示 appsscript.json」）。
 *   2. 上方選 setup → 執行，依提示授權。會建立三個排程（每 5 分鐘、每天 09:00、每週二 09:00）並跑一次檢查。
 *   3. 部署 → 新增部署作業 → 類型「網頁應用程式」：執行身分「我」、存取權「任何人」→ 部署（信裡的「直接存為預設」要用）。
 *      之後改程式：部署 → 管理部署作業 → 編輯（鉛筆）→ 版本選「新版本」→ 部署。
 *   4. 舊的 YA、SR 寄信專案：打開 → 左邊「觸發條件」→ 全部刪除（或直接刪掉專案），避免重複寄信。
 */

// ---------------------------------------------------------------- 站台設定
const SITES = {
  ya: { key: 'ya', projectId: 'clc-ya-portal', siteUrl: 'https://clc-ya-portal.pages.dev', mailName: 'CLC YA' },
  sr: { key: 'sr', projectId: 'clc-sr-portal', siteUrl: 'https://clc-sr-portal.pages.dev', mailName: 'CLC SR 加樂團契' }
};
const YA = SITES.ya, SR = SITES.sr;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ---------------------------------------------------------------- 安裝／檢查
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('every5min').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('daily0900').timeBased().atHour(9).everyDays(1).inTimezone('Asia/Taipei').create();
  ScriptApp.newTrigger('weeklyTue0900').timeBased().onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(9).inTimezone('Asia/Taipei').create();
  secret_(); // 建立信內連結的簽章金鑰（存在這個程式的「指令碼屬性」，不會外流）
  checkSetup();
}

/** 只檢查，不寄信：確認這個帳號讀得到各站 Firestore。結果看「執行紀錄」。 */
function checkSetup() {
  console.log(`寄件帳號：${Session.getEffectiveUser().getEmail()}`);
  Object.values(SITES).forEach(site => {
    try {
      const n = site === YA ? runQuery_(YA, 'mail_jobs', 'status', 'pending', 50).length : runQuery_(SR, 'intakes', 'notify', 'pending', 50).length;
      console.log(`✅ ${site.projectId}：讀取成功（待處理 ${n} 筆）`);
    } catch (err) { console.log(`❌ ${site.projectId}：讀取失敗 — ${err.message}`); }
  });
  console.log(`排程：${ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()).join('、') || '（無）'}`);
  console.log(`網頁應用程式網址：${webAppUrl_() || '（尚未部署）'}`);
}

// ---------------------------------------------------------------- 排程（各站互不影響：一站出錯，其他站照常）
function every5min() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try { run_('YA 測試信', ya_processMailJobs); run_('SR 新朋友通知', sr_processIntakes); }
  finally { lock.releaseLock(); }
}
function daily0900() { run_('YA 每日摘要', ya_dailyDigest); }
function weeklyTue0900() { run_('YA 每週修改建議', ya_weeklyEditDigest); }
function run_(label, fn) { try { fn(); } catch (err) { console.error(`${label} 失敗：${err.message || err}`); } }

// ================================================================ YA
// ---------------------------------------------------------------- 1. 測試信佇列
function ya_processMailJobs() {
  {
    const jobs = runQuery_(YA, 'mail_jobs', 'status', 'pending', 20);
    jobs.forEach(job => {
      const d = job.data;
      try {
        if (d.type !== 'test') throw new Error('不支援的信件類型：' + d.type);
        const to = String(d.recipientEmail || '').trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error('收件人 Email 格式不正確');
        MailApp.sendEmail({
          to,
          subject: 'CLC YA｜測試信',
          htmlBody: `<p>這是 CLC YA 後台寄出的測試信。</p><p>申請人：${esc_(d.requestedBy)}</p>` +
            `<p>收到這封信，代表每日 09:00 審核摘要也能正常寄到這個信箱。</p>`,
          name: YA.mailName
        });
        patch_(job.name, { status: 'sent', sentAt: new Date() });
      } catch (err) {
        patch_(job.name, { status: 'failed', error: String(err.message || err).slice(0, 300), failedAt: new Date() });
      }
    });
  }
}

// ---------------------------------------------------------------- 2. 每日摘要
function ya_dailyDigest() {
  const date = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  // 每天只寄一次（重複執行時建立鎖會失敗）
  if (!createIfAbsent_(YA, 'system_mail_jobs', 'digest-' + date, { status: 'sending', createdAt: new Date() })) return;

  const recipients = listAll_(YA, 'admin_users')
    .filter(u => u.data.active === true && u.data.notifyReview === true && u.data.role === 'admin')
    .map(u => u.id);

  const bookings = listAll_(YA, 'venue_bookings').filter(b => b.data.hasChanges === true && b.data.approved !== true);
  const songs = runQuery_(YA, 'hymn_submissions', 'status', 'pending', 200);
  const newSongs = songs.filter(s => !s.data.notifiedAt);

  if (!recipients.length || (!bookings.length && !newSongs.length)) {
    patch_(docName_(YA, 'system_mail_jobs', 'digest-' + date), { status: 'skipped', bookings: bookings.length, songs: newSongs.length });
    return;
  }

  let html = `<h2>CLC YA｜${date} 每日審核摘要</h2>`;
  if (bookings.length) {
    html += `<h3>🏠 小組場地登記：${bookings.length} 筆待審核</h3><ol>` + bookings.map(b => {
      const d = b.data;
      const weeks = Object.entries(d.weeks || {})
        .filter(([, v]) => v && !['正常聚會', '未申請', '不申請'].includes(String(v).trim()))
        .map(([k, v]) => `${esc_(k)}：${esc_(v)}`).join('<br>');
      const link = `${YA.siteUrl}/admin-users.html?reviewMonth=${encodeURIComponent(d.month || '')}`;
      return `<li style="margin-bottom:12px"><b>${esc_(d.groupId || b.id)}</b>（${esc_(d.month || '')}）<br>${weeks || '請至後台查看說明'}<br><a href="${link}">開啟審核</a></li>`;
    }).join('') + '</ol>';
  }
  if (newSongs.length) {
    html += `<h3>🎵 使用者送審的新歌：${newSongs.length} 首</h3><ol>` +
      newSongs.map(s => `<li>${esc_(s.data.title)}</li>`).join('') + '</ol>' +
      `<p><a href="${YA.siteUrl}/admin-hymns.html">開啟歌詞管理 → 📥 待審核</a>（目前共 ${songs.length} 首待審核）</p>`;
  }

  const subject = `CLC YA｜${date} 待審核` +
    (bookings.length ? ` 場地 ${bookings.length} 筆` : '') + (newSongs.length ? ` 新歌 ${newSongs.length} 首` : '');
  const failed = [];
  recipients.forEach(to => {
    try { MailApp.sendEmail({ to, subject, htmlBody: html, name: YA.mailName }); }
    catch (err) { failed.push(to + '：' + err.message); }
  });
  newSongs.forEach(s => patch_(s.name, { notifiedAt: new Date() }));
  patch_(docName_(YA, 'system_mail_jobs', 'digest-' + date), {
    status: failed.length ? 'partial' : 'sent', sentAt: new Date(), recipients: recipients.length,
    bookings: bookings.length, songs: newSongs.length, error: failed.join('\n').slice(0, 500)
  });
}

// ---------------------------------------------------------------- 3. 每週二：使用者排版修改建議
function ya_weeklyEditDigest() {
  const date = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  if (!createIfAbsent_(YA, 'system_mail_jobs', 'edit-digest-' + date, { status: 'sending', createdAt: new Date() })) return;
  const cfg = getDoc_(YA, 'system_config', 'hymn_edit_suggest');
  if (!cfg || cfg.data.enabled !== true) { patch_(docName_(YA, 'system_mail_jobs', 'edit-digest-' + date), { status: 'disabled' }); return; }

  const recipients = listAll_(YA, 'admin_users')
    .filter(u => u.data.active === true && u.data.notifyReview === true && u.data.role === 'admin').map(u => u.id);
  const all = runQuery_(YA, 'hymn_edit_suggestions', 'status', 'pending', 200);
  const items = all.filter(x => !x.data.notifiedAt);
  if (!recipients.length || !items.length) {
    patch_(docName_(YA, 'system_mail_jobs', 'edit-digest-' + date), { status: 'skipped', items: items.length });
    return;
  }
  const webapp = webAppUrl_();
  let html = `<div style="font-family:Arial,'Microsoft JhengHei',sans-serif;color:#1e293b">` +
    `<h2>CLC YA｜使用者排版修改建議（${items.length} 筆）</h2>` +
    `<p style="color:#64748b">使用者改過這些歌的段落、字級或行距並列印／下載 PDF。左邊是原本的預設，右邊是使用者的版本（黃底＝新的或改過的行）。</p>`;
  items.forEach(x => {
    const d = x.data, title = String(d.title || '').replace(/^【|】$/g, '');
    const fonts = d.fonts || {}, lh = d.lineHeights || {};
    const links = [];
    if (webapp) links.push(`<a href="${webapp}?action=approve&id=${x.id}&sig=${sign_(x.id, 'approve')}" style="background:#007E8A;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;font-weight:bold">✅ 直接存為預設</a>`);
    links.push(`<a href="${YA.siteUrl}/hymn-lyrics.html?review=${x.id}" style="background:#f1f5f9;color:#0f172a;padding:8px 14px;border-radius:8px;text-decoration:none;font-weight:bold">✏️ 到網站調整</a>`);
    if (webapp) links.push(`<a href="${webapp}?action=reject&id=${x.id}&sig=${sign_(x.id, 'reject')}" style="color:#e11d48;padding:8px 6px;text-decoration:none">✕ 不採用</a>`);
    html += `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin:16px 0">` +
      `<h3 style="margin:0 0 6px">${esc_(title)}</h3>` +
      `<div style="color:#64748b;font-size:13px;margin-bottom:10px">${esc_(Utilities.formatDate(d.createdAt || new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm'))}｜字級 A4 ${fonts.A4 || '-'}／A3 ${fonts.A3 || '-'}／A3多拼 ${fonts.A2 || '-'} pt｜行距 A3 ${lh.A3 || '-'} 倍｜段落${d.keepTogether ? '' : '不'}維持在同一頁</div>` +
      `<table style="width:100%;border-collapse:collapse"><tr>` +
      `<td style="vertical-align:top;width:50%;padding-right:8px"><div style="font-size:12px;color:#94a3b8">原本</div>${sectionsHtml_(d.before, d.sections, false)}</td>` +
      `<td style="vertical-align:top;width:50%;padding-left:8px;border-left:1px solid #e2e8f0"><div style="font-size:12px;color:#94a3b8">使用者的版本</div>${sectionsHtml_(d.sections, d.before, true)}</td>` +
      `</tr></table><div style="margin-top:12px">${links.join(' ')}</div></div>`;
  });
  if (!webapp) html += `<p style="color:#b45309">（尚未部署「網頁應用程式」，所以信裡沒有「直接存為預設」按鈕；請到網站調整後按「存為預設排版」。）</p>`;
  html += `<p style="color:#94a3b8;font-size:12px">不想再收到：歌詞管理 → 📥 待審核 → 取消「收集使用者的排版修改建議」。</p></div>`;

  const subject = `CLC YA｜${date} 使用者排版修改建議 ${items.length} 筆`;
  const failed = [];
  recipients.forEach(to => {
    try { MailApp.sendEmail({ to, subject, htmlBody: html, name: YA.mailName }); }
    catch (err) { failed.push(to + '：' + err.message); }
  });
  items.forEach(x => patch_(x.name, { notifiedAt: new Date() }));
  patch_(docName_(YA, 'system_mail_jobs', 'edit-digest-' + date), {
    status: failed.length ? 'partial' : 'sent', sentAt: new Date(), recipients: recipients.length, items: items.length, error: failed.join('\n').slice(0, 500)
  });
}
// 段落 → 信件 HTML；mark=true 時，對方沒有的行用黃底標出
function sectionsHtml_(secs, other, mark) {
  const seen = new Set();
  (other || []).forEach(s => (s.lines || []).forEach(l => seen.add(String(l).trim())));
  return (secs || []).map(s => {
    const label = String(s.label || '').trim();
    const lines = (s.lines || []).map(l => {
      const t = String(l).trim();
      const hi = mark && t && !seen.has(t);
      return `<div style="${hi ? 'background:#fef08a;' : ''}line-height:1.5">${esc_(t) || '&nbsp;'}</div>`;
    }).join('');
    return `<div style="margin:6px 0">${label ? `<div style="font-size:11px;color:#94a3b8">${esc_(label)}</div>` : ''}${lines}</div>`;
  }).join('');
}

// ---------------------------------------------------------------- 網頁應用程式：信裡的「直接存為預設」「不採用」
// 點連結 → 顯示確認頁（避免信箱的連結預覽誤觸）→ 按按鈕（POST）才寫入。
function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action === 'reject' ? 'reject' : 'approve';
  if (!p.id || p.sig !== sign_(p.id, action)) return page_('連結無效', '<p>這個連結無效或已過期，請到網站處理。</p>');
  const x = getDoc_(YA, 'hymn_edit_suggestions', p.id);
  if (!x) return page_('找不到', '<p>找不到這筆修改建議，可能已經處理過。</p>');
  if (x.data.status !== 'pending') return page_('已處理', `<p>這筆修改建議先前已${x.data.status === 'approved' ? '採用' : '不採用'}。</p>`);
  const title = esc_(String(x.data.title || '').replace(/^【|】$/g, ''));
  const url = webAppUrl_();
  const btn = action === 'approve' ? '✅ 確認存為預設' : '✕ 確認不採用';
  return page_(title, `<h2>${title}</h2><p>${action === 'approve' ? '將使用者的版本存為這首歌的預設排版（A4、A3、A3 多拼）。' : '不採用這筆修改建議。'}</p>` +
    `<form method="post" action="${url}" target="_top"><input type="hidden" name="id" value="${esc_(p.id)}"><input type="hidden" name="action" value="${action}"><input type="hidden" name="sig" value="${esc_(p.sig)}">` +
    `<button style="background:${action === 'approve' ? '#007E8A' : '#e11d48'};color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:16px;font-weight:bold">${btn}</button></form>` +
    `<p style="margin-top:16px"><a href="${YA.siteUrl}/hymn-lyrics.html?review=${esc_(p.id)}" target="_top">✏️ 改到網站查看／調整</a></p>`);
}
function doPost(e) {
  const p = (e && e.parameter) || {};
  const action = p.action === 'reject' ? 'reject' : 'approve';
  if (!p.id || p.sig !== sign_(p.id, action)) return page_('連結無效', '<p>這個連結無效，請到網站處理。</p>');
  const x = getDoc_(YA, 'hymn_edit_suggestions', p.id);
  if (!x || x.data.status !== 'pending') return page_('已處理', '<p>這筆修改建議已經處理過。</p>');
  const me = Session.getEffectiveUser().getEmail();
  const d = x.data, title = String(d.title || '');
  if (action === 'approve') {
    const fonts = d.fonts || {}, lh = d.lineHeights || {};
    const fmt = k => ({ fontSize: Number(fonts[k]) || 0, lineHeight: Number(lh[k]) || 1.25,
      sections: (d.sections || []).map(s => ({ label: String(s.label || ''), lines: (s.lines || []).map(String) })) });
    set_(YA, 'hymn_layouts', d.songId, { title: title.slice(0, 120), formats: { A4: fmt('A4'), A3: fmt('A3'), A2: fmt('A2') },
      keepTogether: d.keepTogether === true, basis: String(d.basis || ''), updatedAt: new Date(), updatedBy: me });
  }
  patch_(x.name, { status: action === 'approve' ? 'approved' : 'rejected', reviewedAt: new Date(), reviewedBy: me });
  const name = esc_(title.replace(/^【|】$/g, ''));
  return page_(name, action === 'approve'
    ? `<h2>✅ 已存為預設</h2><p>《${name}》之後所有人搜尋到都會套用這個排版。</p><p><a href="${YA.siteUrl}/hymn-lyrics.html?review=${esc_(p.id)}" target="_top">到網站查看</a></p>`
    : `<h2>已不採用</h2><p>《${name}》的這筆修改建議已略過。</p>`);
}
function page_(title, body) {
  return HtmlService.createHtmlOutput(`<div style="font-family:Arial,'Microsoft JhengHei',sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#1e293b">${body}</div>`)
    .setTitle('CLC YA｜' + title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function webAppUrl_() { try { return ScriptApp.getService().getUrl() || ''; } catch (_) { return ''; } }
function secret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('LINK_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('LINK_SECRET', s); }
  return s;
}
function sign_(id, action) {
  const raw = Utilities.computeHmacSha256Signature(id + ':' + action, secret_());
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}


// ================================================================ SR
function sr_processIntakes() {
  {
    const jobs = runQuery_(SR, 'intakes', 'notify', 'pending', 20);
    if (!jobs.length) return;
    const contacts = Object.fromEntries(listAll_(SR, 'groupContacts').map(c => [c.id, (c.data.emails || []).filter(e => EMAIL_RE.test(e))]));
    jobs.forEach(job => {
      const d = job.data;
      try {
        const to = Array.from(new Set([...(contacts._all || []), ...(d.groupId ? contacts[d.groupId] || [] : [])]));
        if (!to.length) { patch_(job.name, { notify: 'no-recipient', notifiedAt: new Date() }); return; }
        let card = null;
        try {
          const c = getDoc_(SR, 'intakeCards', job.id);
          const m = c && String(c.data.data || '').match(/^data:image\/jpeg;base64,(.+)$/);
          if (m) card = Utilities.newBlob(Utilities.base64Decode(m[1]), 'image/jpeg', `加樂歡迎卡_${d.name || '新朋友'}.jpg`);
        } catch (e) { console.warn('讀不到紀念卡：' + e.message); }
        const subject = `CLC SR｜新朋友 ${d.name || ''}${d.groupName ? '（' + d.groupName + '）' : ''}`;
        MailApp.sendEmail({
          to: to.join(','),
          subject,
          htmlBody: sr_mailHtml_(d, !!card),
          inlineImages: card ? { card } : undefined,
          attachments: card ? [card] : undefined,
          name: SR.mailName
        });
        patch_(job.name, { notify: 'sent', notifiedAt: new Date() });
      } catch (err) {
        patch_(job.name, { notify: 'failed', notifyError: String(err.message || err).slice(0, 300), notifiedAt: new Date() });
      }
    });
  }
}

function sr_mailHtml_(d, hasCard) {
  const roc = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `民國 ${+m[1] - 1911} 年 ${+m[2]} 月 ${+m[3]} 日` : ''; };
  const rows = [
    ['姓名', d.name], ['身分', d.gender === '女' ? '姊妹' : d.gender === '男' ? '弟兄' : ''], ['生日', roc(d.birthday)],
    ['手機', d.mobile], ['市話', d.phone], ['地址', d.address], ['婚姻', d.marital], ['居住狀況', d.living],
    ['關懷小組', d.groupName || '暫不安排'],
    ['介紹人', [d.refName, d.refRelation ? `（${d.refRelation}）` : '', d.refPhone].filter(Boolean).join(' ')],
    ['信仰', (d.faith || []).join('、')], ['希望', (d.intent || []).join('、')], ['代禱事項', d.note]
  ].filter(r => r[1]);
  const tel = String(d.mobile || '').replace(/[^\d]/g, '');
  return `<div style="font-family:'PingFang TC','Microsoft JhengHei',sans-serif;font-size:16px;color:#3B342C;max-width:560px">
    <h2 style="color:#007E8A;margin:0 0 8px">🌱 有一位新朋友留了名單</h2>
    <p style="margin:0 0 16px">請在一週內聯絡、關心這位新朋友。</p>
    ${hasCard ? '<img src="cid:card" alt="歡迎紀念卡" style="width:100%;max-width:420px;border-radius:12px;display:block;margin:0 0 16px">' : ''}
    <table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) =>
      `<tr><td style="padding:8px 10px;border-bottom:1px solid #EFE3D3;color:#8A7D6E;white-space:nowrap;vertical-align:top">${esc_(k)}</td><td style="padding:8px 10px;border-bottom:1px solid #EFE3D3;font-weight:bold;white-space:pre-line">${esc_(v)}</td></tr>`).join('')}
    </table>
    <p style="margin:18px 0">${tel ? `<a href="tel:${tel}" style="display:inline-block;background:#007E8A;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:bold">📞 撥給 ${esc_(d.name)}</a>　` : ''}
      <a href="${SR.siteUrl}/intakes.html" style="color:#007E8A;font-weight:bold">打開新朋友名單後台</a></p>
    <p style="color:#A99B89;font-size:13px">這封信由 CLC SR 加樂團契系統自動寄出。通知信箱可以在「名單後台 → 小組」修改。</p>
  </div>`;
}


// ================================================================ Firestore REST 小工具（每個函式第一個參數是站台）
const base_ = site => `https://firestore.googleapis.com/v1/projects/${site.projectId}/databases/(default)/documents`;
const docName_ = (site, col, id) => `projects/${site.projectId}/databases/(default)/documents/${col}/${id}`;
function api_(method, url, body) {
  const res = UrlFetchApp.fetch(url, {
    method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: body ? JSON.stringify(body) : undefined
  });
  const code = res.getResponseCode(), text = res.getContentText();
  if (code >= 300) {
    const err = new Error(`Firestore ${method} ${code}：${text.slice(0, 300)}`);
    err.code = code; throw err;
  }
  return text ? JSON.parse(text) : {};
}
function listAll_(site, col) {
  const out = []; let token = '';
  do {
    const r = api_('get', `${base_(site)}/${col}?pageSize=300${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
    (r.documents || []).forEach(d => out.push(fromDoc_(d)));
    token = r.nextPageToken || '';
  } while (token);
  return out;
}
function runQuery_(site, col, field, value, limit) {
  const r = api_('post', `${base_(site)}:runQuery`, { structuredQuery: {
    from: [{ collectionId: col }],
    where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: toValue_(value) } },
    limit
  } });
  return r.filter(x => x.document).map(x => fromDoc_(x.document));
}
function getDoc_(site, col, id) {
  try { return fromDoc_(api_('get', `${base_(site)}/${col}/${encodeURIComponent(id)}`)); }
  catch (err) { if (err.code === 404) return null; throw err; }
}
// 整份文件寫入（取代原內容）
function set_(site, col, id, fields) {
  return api_('patch', `https://firestore.googleapis.com/v1/${docName_(site, col, id)}`, { fields: toFields_(fields) });
}
function patch_(name, fields) {
  const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  return api_('patch', `https://firestore.googleapis.com/v1/${name}?${mask}`, { fields: toFields_(fields) });
}
function createIfAbsent_(site, col, id, fields) {
  try { api_('post', `${base_(site)}/${col}?documentId=${encodeURIComponent(id)}`, { fields: toFields_(fields) }); return true; }
  catch (err) { if (err.code === 409) return false; throw err; }
}
function fromDoc_(d) {
  return { name: d.name, id: d.name.split('/').pop(), data: Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromValue_(v)])) };
}
function fromValue_(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromValue_(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue_);
  return null;
}
function toValue_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue_) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields_(v) } };
  return { stringValue: String(v) };
}
function toFields_(o) { return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue_(v)])); }
function esc_(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
