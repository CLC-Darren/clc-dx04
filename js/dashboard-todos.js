// 共用 DX 待辦。DX 首頁和 LinFamily 的待辦檢視都在登入後啟動。
window.clcMountTodos = function (dashboard, { focusInput = false } = {}) {
    // 今日待辦：Firestore dx04_todos（僅 Superuser）。文字或語音輸入，會自動辨識日期、時間與 #標籤。
    const todoAreas = new Map();
    const sharedTodoDocs = new Map();
    let stopTodoDiscovery;
    const todoCollection = () => window.db.collection('dx04_todos');
    const todosById = () => todoCollection().orderBy(firebase.firestore.FieldPath.documentId());
    function areaFromDoc(id) {
      return /^~(area-[a-f0-9-]+)~[^~]+$/.exec(id)?.[1];
    }
    function syncTodoAreas() {
      stopTodoDiscovery?.();
      stopTodoDiscovery = null;
      sharedTodoDocs.clear();
      if (!window.isSuperuser || !window.db) return;
      let initial = true;
      stopTodoDiscovery = todosById().startAt('~area-').endBefore('~area-\uf8ff').onSnapshot(snap => {
        if (!window.isSuperuser) return;
        const affected = new Set(snap.docChanges().map(change => areaFromDoc(change.doc.id)).filter(Boolean));
        if (initial) {
          initial = false;
          for (const [widget, entry] of todoAreas) if (entry.prefix) affected.add(widget.dataset.widgetId);
        }
        if (!affected.size) return;
        for (const id of affected) sharedTodoDocs.set(id, []);
        for (const doc of snap.docs) {
          const id = areaFromDoc(doc.id);
          if (affected.has(id)) sharedTodoDocs.get(id).push(doc);
        }
        dashboard.discoverTodoAreas([...affected].filter(id => sharedTodoDocs.get(id).length));
        for (const [widget, entry] of todoAreas) {
          const id = widget.dataset.widgetId;
          if (affected.has(id)) entry.receive(sharedTodoDocs.get(id));
        }
      }, err => console.warn('待辦分區同步失敗', err));
    }
    dashboard.register('todo', (widget, area) => {
      const find = id => dashboard.find(widget, id);
      const prefix = area === 'todo' ? '' : '~' + area + '~';
      const TZ = 'Asia/Taipei';
      const body = find('todoBody');
      const form = find('todoAddForm');
      const input = find('todoAddInput');
      const statusEl = find('todoStatus');
      const summary = find('todoSummary');
      const doneToggle = find('todoDoneToggle');
      const doneList = find('todoDoneList');
      const doneCount = find('todoDoneCount');
      let todos = [], unsub = null, showDone = false;

      // ---------- 日期工具（一律以台北日期計算） ----------
      const fmtYmd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
      const ymd = d => fmtYmd.format(d);
      const today = () => ymd(new Date());
      function addDays(dateStr, n) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d + n));
        return dt.toISOString().slice(0, 10);
      }
      function weekday(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
      function dueLabel(due) {
        if (!due) return '';
        const t = today();
        if (due === t) return '今天';
        if (due === addDays(t, 1)) return '明天';
        if (due === addDays(t, -1)) return '昨天';
        if (due === addDays(t, 2)) return '後天';
        const [, m, d] = due.split('-').map(Number);
        return m + '/' + d + '（' + '日一二三四五六'[weekday(due)] + '）';
      }

      // ---------- 自然語言解析 ----------
      const CN = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
      function cnNum(s) {
        if (/^\d+$/.test(s)) return Number(s);
        if (s === '十') return 10;
        let m = s.match(/^([一二兩两三四五六七八九])?十([一二三四五六七八九])?$/);
        if (m) return (m[1] ? CN[m[1]] : 1) * 10 + (m[2] ? CN[m[2]] : 0);
        if (s.length === 1 && s in CN) return CN[s];
        return NaN;
      }
      const NUM = '(\\d{1,2}|[零〇一二兩两三四五六七八九十]{1,3})';
      const TAGS = { ya: 'CLC YA', sr: 'CLC SR', dx: 'CLC DX04', dx04: 'CLC DX04', 聖誕: 'Christmas', christmas: 'Christmas' };
      function parse(text) {
        let t = ' ' + text.trim() + ' ';
        let due = '', time = '', tag = '';
        const cut = re => { const m = t.match(re); if (m) t = t.replace(m[0], m[0].replace(/[^\n]+/g, ' ')); return m; };

        let m = cut(/[#＃]([^\s#＃]{1,20})/);
        if (m) tag = TAGS[m[1].toLowerCase()] || m[1];

        const base = today();
        if ((m = cut(/大[後后]天/))) due = addDays(base, 3);
        else if ((m = cut(/[後后]天/))) due = addDays(base, 2);
        else if ((m = cut(/明[天日早晚]?/))) due = addDays(base, 1);
        else if ((m = cut(/今[天日早晚]|今晚/))) due = base;
        else if ((m = cut(/(下{1,2})?(?:週|周|星期|禮拜|礼拜)([一二三四五六日天])/))) {
          const want = '日一二三四五六'.indexOf(m[2] === '天' ? '日' : m[2]);
          const diff = (want - weekday(base) + 7) % 7;
          due = addDays(base, m[1] ? nextWeek(base, want, m[1].length) : diff);
        } else if ((m = cut(new RegExp('(?:(\\d{4})[/年-])?(\\d{1,2})\\s*[/月]\\s*(\\d{1,2})\\s*[日號号]?')))) {
          const y0 = Number(base.slice(0, 4));
          let y = m[1] ? Number(m[1]) : y0;
          const mm = String(Number(m[2])).padStart(2, '0'), dd = String(Number(m[3])).padStart(2, '0');
          let cand = y + '-' + mm + '-' + dd;
          if (!m[1] && cand < addDays(base, -60)) cand = (y + 1) + '-' + mm + '-' + dd;
          if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) due = cand;
        }

        // 時間：15:30、下午3點半、晚上七點十五分
        if ((m = cut(/(\d{1,2})[:：](\d{2})/))) {
          time = String(Math.min(23, Number(m[1]))).padStart(2, '0') + ':' + m[2];
        } else if ((m = cut(new RegExp('(早上|上午|中午|下午|傍晚|晚上|凌晨)?\\s*' + NUM + '\\s*[點点時时](?:\\s*(半|' + NUM + '\\s*分?))?')))) {
          let h = cnNum(m[2]);
          let min = m[3] === '半' ? 30 : (m[4] ? cnNum(m[4]) : 0);
          if (!isNaN(h) && h <= 24 && !isNaN(min) && min < 60) {
            if (/下午|傍晚|晚上/.test(m[1] || '') && h < 12) h += 12;
            if (m[1] === '中午' && h < 6) h += 12;
            time = String(h % 24).padStart(2, '0') + ':' + String(min).padStart(2, '0');
          }
        }
        if (time && !due) due = base;

        let title = t.replace(/[^\S\n]+/g, ' ').replace(/^ +| +$/gm, '').trim();
        if (!title) title = text.trim();
        return { title, due, time, tag };
      }
      function nextWeek(base, want, level) {
        // 「下週X」：下一個週一開始的那一週裡的 X；「下下週」再加一週。週日視為一週最後一天。
        const wd = weekday(base) || 7;
        const toNextMonday = 8 - wd;
        const offset = (want === 0 ? 6 : want - 1);
        return toNextMonday + offset + 7 * (level - 1);
      }

      // ---------- 畫面 ----------
      function setStatus(msg) { statusEl.textContent = msg || ''; statusEl.classList.toggle('hidden', !msg); }
      function canUse() { return !!window.isSuperuser && !!window.db; }

      function row(todo, opts) {
        opts = Object.assign({}, opts, { overdue: !todo.done && !!todo.due && todo.due < today() });
        const li = document.createElement('li');
        li.className = 'todo-row';
        li.dataset.sortId = todo.id;
        if (!todo.done) {
          const handle = document.createElement('button');
          handle.type = 'button'; handle.className = 'reorder-handle'; handle.textContent = '⠿';
          handle.setAttribute('aria-label', '拖曳排序：' + todo.title);
          handle.title = '';
          li.append(handle);
        }
        const label = document.createElement('div');
        label.className = 'todo-item';
        const hit = document.createElement('label');
        hit.className = 'todo-ck-hit';
        const ck = document.createElement('input');
        ck.type = 'checkbox';
        ck.className = 'todo-ck' + (opts.overdue ? ' p1' : '');
        ck.checked = !!todo.done;
        ck.setAttribute('aria-label', (todo.done ? '取消完成：' : '完成：') + todo.title);
        ck.addEventListener('change', () => toggleDone(todo, ck.checked));
        hit.append(ck);
        const text = document.createElement('span');
        text.className = 'todo-text';
        text.tabIndex = 0;
        text.setAttribute('role', 'button');
        text.setAttribute('aria-label', '修改：' + todo.title);
        // 滑鼠雙擊、手機點一下編輯；鍵盤 Enter 保留。
        let touchDownAt = 0, lastPointerType = '';
        text.addEventListener('pointerdown', e => {
          lastPointerType = e.pointerType;
          touchDownAt = e.pointerType === 'touch' ? performance.now() : 0;
        });
        text.addEventListener('click', e => {
          const isTouch = (e.pointerType || lastPointerType) === 'touch';
          if (!isTouch) {
            if (e.detail >= 2 || e.detail === 0) startEdit(todo, text);
            return;
          }
          // 手機：點一下就編輯；長按放開不算（那是「−」刪除／拖曳排序）。
          if (touchDownAt && performance.now() - touchDownAt >= 350) return;
          startEdit(todo, text);
        });
        text.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); startEdit(todo, text); } });
        const title = document.createElement('span');
        title.className = 'todo-title';
        title.textContent = todo.title;
        text.append(title);
        const metaParts = [];
        if (todo.due && (opts.showDate || todo.due !== today())) metaParts.push(dueLabel(todo.due));
        if (todo.time) metaParts.push(todo.time);
        if (metaParts.length || todo.tag) {
          const meta = document.createElement('span');
          meta.className = 'todo-meta' + (opts.overdue ? ' is-overdue' : '');
          meta.textContent = metaParts.join(' ');
          if (todo.tag) {
            const tag = document.createElement('span');
            tag.className = 'todo-tag';
            tag.textContent = (metaParts.length ? ' · ' : '') + todo.tag;
            meta.append(tag);
          }
          text.append(meta);
        }
        label.append(hit, text);
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'todo-del';
        del.setAttribute('aria-label', '刪除：' + todo.title);
        del.title = '刪除';
        del.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        del.addEventListener('click', () => removeTodo(todo));
        const move = document.createElement('select');
        move.className = 'todo-move-area';
        move.setAttribute('aria-label', '移動到其他待辦區：' + todo.title);
        move.add(new Option('移動到…', ''));
        move.addEventListener('focus', () => {
          move.options.length = 1;
          for (const destination of todoAreas.keys()) {
            if (destination === widget || destination.hidden) continue;
            const name = destination.querySelector('h2')?.textContent || '代辦事項';
            move.add(new Option(name, destination.dataset.widgetId));
          }
        });
        move.addEventListener('change', async () => {
          const destination = [...todoAreas.keys()].find(card => card.dataset.widgetId === move.value);
          move.value = '';
          if (!destination || !canUse()) return;
          move.disabled = true;
          try { await crossMove(todo.id, { widget: destination }); }
          catch (err) { setStatus(errText(err)); }
          finally { move.disabled = false; }
        });
        li.append(label, move, del);
        if (body.classList.contains('todo-deleting')) {
          const minus = document.createElement('button');
          minus.type = 'button';
          minus.className = 'todo-minus';
          minus.setAttribute('aria-label', '刪除：' + todo.title);
          minus.innerHTML = '<span aria-hidden="true"></span>';
          minus.addEventListener('click', e => { e.stopPropagation(); removeTodo(todo); });
          li.append(minus);
        }
        return li;
      }
      function group(title, cls, items, opts) {
        if (!items.length) return;
        const h = document.createElement('h3');
        h.className = 'todo-group ' + cls;
        h.textContent = title;
        const ul = document.createElement('ul');
        ul.className = 'todo-list';
        items.forEach(t => ul.append(row(t, opts)));
        body.append(h, ul);
      }
      const orderKey = () => 'clc_dx04_todo_order:' + String(window.currentAdminEmail || '').toLowerCase() + (prefix ? ':' + area : '');
      function readOrder() {
        try { const v = JSON.parse(localStorage.getItem(orderKey()) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; }
      }
      const scroll = body.closest('.todo-scroll');
      todoAreas.set(widget, { prefix, body, orderKey, render, receive });
      let highlighted, insertion;
      function crossTarget(node, y, source) {
        highlighted?.classList.remove('todo-area-drop');
        insertion?.classList.remove('todo-drop-before', 'todo-drop-after');
        highlighted = node?.closest('[data-widget="todo"]');
        const destination = todoAreas.get(highlighted);
        if (!destination || highlighted === widget || highlighted.hidden) return null;
        highlighted.classList.add('todo-area-drop');
        const candidate = node.closest('.todo-row');
        insertion = destination.body.contains(candidate) && body.contains(source) ? candidate : null;
        const rect = insertion?.getBoundingClientRect();
        const after = !!rect && y >= rect.top + rect.height / 2;
        insertion?.classList.add(after ? 'todo-drop-after' : 'todo-drop-before');
        return { widget: highlighted, target: insertion?.dataset.sortId, after };
      }

      async function crossMove(id, drop) {
        const destination = todoAreas.get(drop.widget);
        if (!destination || drop.widget.hidden) return;
        const from = col().doc(id);
        const to = col().doc(destination.prefix + col().doc().id);
        const ids = Array.from(destination.body.querySelectorAll('.todo-row'), row => row.dataset.sortId);
        const index = ids.indexOf(drop.target);
        ids.splice(index < 0 ? 0 : index + Number(drop.after), 0, to.id);
        const moved = await window.db.runTransaction(async tx => {
          const doc = await tx.get(from);
          if (!doc.exists) return false;
          tx.set(to, doc.data());
          tx.delete(from);
          return true;
        });
        if (!moved) return;
        try {
          localStorage.setItem(destination.orderKey(), JSON.stringify(ids));
          localStorage.setItem(orderKey(), JSON.stringify(readOrder().filter(item => item !== id)));
        } catch (_) { /* 分區移動已儲存，排序會在瀏覽器允許時保存。 */ }
        destination.render();
      }
      window.clcReorder(scroll, {
        item: '.todo-row', directMouse: true, scroll, allowed: canUse,
        crossTarget, crossMove,
        hold: () => setTodoDeleteMode(true), // 手機長按不動：每一項右上角出現「−」
        move(from, to, after) {
          const rows = Array.from(body.querySelectorAll('.todo-row'));
          const ids = rows.map(el => el.dataset.sortId).filter(id => id !== from);
          if (!ids.includes(to) || !rows.some(row => row.dataset.sortId === from)) return;
          ids.splice(ids.indexOf(to) + (after ? 1 : 0), 0, from);
          localStorage.setItem(orderKey(), JSON.stringify(ids));
          render();
        },
        error: err => setStatus(err.code ? errText(err) : '無法移動或保存排序，請稍後再試。')
      });
      const byNewest = (a, b) => b.created - a.created || b.id.localeCompare(a.id);
      // 刪除模式（手機）：長按任一項 → 每項右上角出現「−」（跟 App 一樣），點旁邊或 Esc 結束。
      function setTodoDeleteMode(on) {
        on = !!on && !!window.isSuperuser;
        if (body.classList.contains('todo-deleting') === on) return;
        body.classList.toggle('todo-deleting', on);
        doneList.classList.toggle('todo-deleting', on);
        if (on && navigator.vibrate) navigator.vibrate(15);
        render();
      }
      document.addEventListener('pointerdown', e => {
        if (body.classList.contains('todo-deleting') && !e.target.closest('.todo-row, .todo-undo-bar')) setTodoDeleteMode(false);
      });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') setTodoDeleteMode(false); });

      function render() {
        body.replaceChildren();
        doneList.replaceChildren();
        if (!window.isSuperuser) {
          summary.textContent = '';
          input.disabled = true;
          input.placeholder = '以 Superuser 登入後可新增待辦';
          doneCount.textContent = '0';
          const p = document.createElement('p');
          p.className = 'todo-empty';
          p.textContent = '這是個人待辦，登入後顯示。';
          body.append(p);
          return;
        }
        input.disabled = false;
        input.placeholder = '新增待辦… 例如「明天下午3點 回覆新朋友 #SR」';
        const t = today();
        const order = readOrder();
        const rank = new Map(order.map((id, i) => [id, i]));
        const byOrder = (a, b) => (rank.get(a.id) ?? -1) - (rank.get(b.id) ?? -1) || byNewest(a, b);
        const open = todos.filter(x => !x.done);
        const overdue = open.filter(x => x.due && x.due < t).sort(byOrder);
        group('待辦', '', open.sort(byOrder), { showDate: true });
        if (!open.length) {
          const p = document.createElement('p');
          p.className = 'todo-empty';
          p.textContent = todos.length ? '今天的事都完成了。' : '還沒有待辦，從上面輸入或按麥克風說一句。';
          body.append(p);
        }
        const weekAgo = Date.now() - 7 * 864e5;
        const done = todos.filter(x => x.done && (x.doneMs || 0) >= weekAgo).sort((a, b) => (b.doneMs || 0) - (a.doneMs || 0));
        const doneToday = done.filter(x => x.doneMs && ymd(new Date(x.doneMs)) === t).length;
        doneCount.textContent = doneToday;
        done.forEach(x => doneList.append(row(x, { showDate: true })));
        doneList.classList.toggle('hidden', !showDone || !done.length);
        summary.textContent = open.length + ' 項未完成' + (overdue.length ? ' · ' : '');
        if (overdue.length) {
          const s = document.createElement('span');
          s.className = 'text-orange-600 dark:text-orange-400';
          s.textContent = overdue.length + ' 項逾期';
          summary.append(s);
        }
      }
      doneToggle.addEventListener('click', () => {
        showDone = !showDone;
        doneToggle.setAttribute('aria-expanded', String(showDone));
        doneToggle.classList.toggle('is-open', showDone);
        render();
      });
      // 跨過午夜時重新分組
      let lastDay = today();
      setInterval(() => { if (today() !== lastDay) { lastDay = today(); render(); } }, 60000);

      // ---------- 資料 ----------
      function errText(err) {
        return err && err.code === 'permission-denied'
          ? '權限不足：請確認已用 Superuser 登入，並已發布最新的 firestore.rules。'
          : '連線失敗，請稍後再試。';
      }
      const col = todoCollection;
      let finishTodoWait;
      function subscribe() {
        finishTodoWait?.();
        if (unsub) { unsub(); unsub = null; }
        todos = [];
        if (!canUse()) { render(); return; }
        if (prefix) {
          receive(sharedTodoDocs.get(area) || []);
          return;
        }
        const finish = finishTodoWait = window.clcVerseWait?.();
        unsub = todosById().endBefore('~').limit(500).onSnapshot(snap => {
          finish?.();
          receive(snap.docs);
        }, err => { finish?.(); console.warn('待辦讀取失敗', err); setStatus(errText(err)); render(); });
      }
      function receive(docs) {
        todos = docs.slice(0, 500).map(d => {
          const x = d.data();
          return {
            raw: x, id: d.id, title: String(x.title || ''), due: x.due || '', time: x.time || '', tag: x.tag || '',
            done: !!x.done,
            doneMs: x.doneAt && x.doneAt.toMillis ? x.doneAt.toMillis() : (x.done ? Date.now() : 0),
            created: x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : Date.now()
          };
        }).filter(x => x.title);
        setStatus('');
        render();
      }
      async function addTodo(text) {
        const p = parse(text);
        const FV = firebase.firestore.FieldValue;
        const existingOrder = readOrder();
        const rank = new Map(existingOrder.map((id, i) => [id, i]));
        const previousIds = todos.filter(t => !t.done).sort((a, b) => (rank.get(a.id) ?? -1) - (rank.get(b.id) ?? -1) || byNewest(a, b)).map(t => t.id);
        const id = col().doc().id;
        const added = col().doc(prefix + id);
        await added.set({
          title: p.title.slice(0, 200), due: p.due, time: p.time, tag: p.tag.slice(0, 20),
          done: false, doneAt: null, createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp()
        });
        try { localStorage.setItem(orderKey(), JSON.stringify([added.id, ...previousIds.filter(id => id !== added.id)])); } catch (_) {}
        render();
      }
      function toggleDone(todo, done) {
        const FV = firebase.firestore.FieldValue;
        col().doc(todo.id).update({ done, doneAt: done ? FV.serverTimestamp() : null, updatedAt: FV.serverTimestamp() })
          .catch(err => { console.warn('待辦更新失敗', err); setStatus(errText(err)); render(); });
      }
      const undoEntries = new Map(), deleting = new Set();
      let undoBar = null, undoBusy = false;
      function showUndo() {
        if (!undoBar) {
          undoBar = document.createElement('div');
          undoBar.className = 'todo-undo-bar';
          undoBar.setAttribute('role', 'status');
          undoBar.setAttribute('aria-live', 'polite');
          undoBar.style.cssText = 'position:fixed;bottom:calc(20px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:1000;max-width:calc(100vw - 32px);padding:12px 18px;border-radius:14px;background:#242a38;color:#fff;box-shadow:0 8px 30px #0006;display:flex;align-items:center;gap:18px;font-size:14px;';
          const message = document.createElement('span'); message.className = 'todo-undo-message';
          const button = document.createElement('button'); button.type = 'button';
          button.innerHTML = '復原<span class="undo-en"> Undo</span>'; button.style.cssText = 'flex:none;background:none;border:0;color:#67e8f9;font:700 14px Arial;padding:8px;cursor:pointer;';
          button.addEventListener('click', undoDelete);
          undoBar.append(message, button); document.body.append(undoBar);
        }
        undoBar.hidden = !undoEntries.size;
        if (undoEntries.size) document.body.append(undoBar);
        undoBar.style.display = undoEntries.size ? 'flex' : 'none';
        undoBar.querySelector('.todo-undo-message').textContent = `已刪除 ${undoEntries.size} 項待辦`;
        undoBar.querySelector('button').disabled = undoBusy;
      }
      function expireUndo(id) {
        const entry = undoEntries.get(id); if (!entry) return;
        clearTimeout(entry.timer); undoEntries.delete(id); showUndo();
      }
      async function removeTodo(todo) {
        if (deleting.has(todo.id) || !canUse()) return;
        deleting.add(todo.id);
        try {
          await col().doc(todo.id).delete();
          const entry = { data: todo.raw, timer: setTimeout(() => expireUndo(todo.id), 5000) };
          undoEntries.set(todo.id, entry); showUndo();
        } catch (err) { console.warn('待辦刪除失敗', err); setStatus(errText(err)); }
        finally { deleting.delete(todo.id); }
      }
      async function undoDelete() {
        if (undoBusy || !canUse()) return;
        undoBusy = true;
        const entries = Array.from(undoEntries.entries());
        entries.forEach(([, entry]) => clearTimeout(entry.timer)); showUndo();
        try {
          for (const [id, entry] of entries) {
            try { await col().doc(id).set(entry.data); undoEntries.delete(id); }
            catch (err) {
              entry.timer = setTimeout(() => expireUndo(id), 5000);
              console.warn('待辦復原失敗', err); setStatus('復原未完成，請再按一次 Undo。' + errText(err));
            }
          }
        } finally { undoBusy = false; showUndo(); }
      }
      // ---------- 修改：點文字變成輸入框，Enter／離開存檔，Esc 取消，清空等於刪除 ----------
      const TAG_SHORT = { 'CLC YA': 'YA', 'CLC SR': 'SR', 'CLC DX04': 'DX04', 'Christmas': '聖誕' };
      function rawText(todo) {
        const parts = [todo.title];
        if (todo.due) { const [, m, d] = todo.due.split('-').map(Number); parts.push(m + '/' + d); }
        if (todo.time) parts.push(todo.time);
        if (todo.tag) parts.push('#' + (TAG_SHORT[todo.tag] || todo.tag.replace(/\s+/g, '')));
        return parts.join(' ');
      }
      function startEdit(todo, textEl) {
        const box = document.createElement('textarea');
        box.rows = Math.max(2, todo.title.split('\n').length);
        box.className = 'todo-edit';
        box.maxLength = 220;
        box.value = rawText(todo);
        box.setAttribute('aria-label', '修改待辦');
        textEl.replaceWith(box);
        box.focus();
        let finished = false;
        const finish = async save => {
          if (finished) return;
          finished = true;
          const v = box.value.trim();
          if (!save || v === rawText(todo)) { render(); return; }
          try {
            if (!v) await col().doc(todo.id).delete();
            else {
              const p = parse(v);
              await col().doc(todo.id).update({ title: p.title.slice(0, 200), due: p.due, time: p.time, tag: p.tag.slice(0, 20), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            }
          } catch (err) { console.warn('待辦修改失敗', err); setStatus(errText(err)); render(); }
        };
        box.addEventListener('keydown', e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); finish(true); }
          else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        });
        box.addEventListener('blur', () => finish(true));
      }

      // ---------- 一次貼上多行：每行一項 ----------
      input.addEventListener('paste', async e => {
        const text = (e.clipboardData || window.clipboardData).getData('text') || '';
        if (!/[\r\n]/.test(text.trim())) return;
        e.preventDefault();
        if (!canUse()) return;
        const lines = text.split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*•・·]|\d+[.)、])\s*/, '').trim()).filter(Boolean).slice(0, 50);
        setStatus('新增 ' + lines.length + ' 項…');
        try { for (const line of lines) await addTodo(line); setStatus(''); }
        catch (err) { console.warn('待辦新增失敗', err); setStatus(errText(err)); }
      });

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          form.requestSubmit();
        }
      });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text || !canUse()) return;
        input.value = '';
        try { await addTodo(text); }
        catch (err) { console.warn('待辦新增失敗', err); if (!input.value) input.value = text; setStatus(errText(err)); }
      });

      // ---------- 語音輸入：預設用瀏覽器內建語音辨識（快）；不支援或失敗（Brave、Firefox 等）時自動改用錄音 + Gemini AI 判讀 ----------
      const mic = find('todoMicBtn');
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function' && typeof MediaRecorder !== 'undefined') {
        mic.classList.remove('hidden');
        let recorder = null, stream = null, chunks = [], before = '', stopTimer = null, busy = false;

        function cleanupMic() {
          if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
          if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
          recorder = null;
          mic.classList.remove('is-listening');
          mic.setAttribute('aria-label', '語音輸入');
        }

        function blobToBase64(blob) {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = String(reader.result || '');
              const idx = res.indexOf(',');
              resolve(idx >= 0 ? res.slice(idx + 1) : '');
            };
            reader.onerror = () => reject(new Error('讀取音訊失敗'));
            reader.readAsDataURL(blob);
          });
        }

        // 內建語音辨識：Chrome、Edge、Safari 有；失敗過一次（例如 Brave 的 network）就記在本機，之後直接用 AI
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        const SPEECH_BROKEN_KEY = 'clc_dx04_speech_broken';
        let speech = null;
        function speechUsable() {
          if (!SpeechRec) return false;
          try { return localStorage.getItem(SPEECH_BROKEN_KEY) !== '1'; } catch (_) { return true; }
        }
        function markSpeechBroken() { try { localStorage.setItem(SPEECH_BROKEN_KEY, '1'); } catch (_) {} }
        function startWebSpeech() {
          const rec = new SpeechRec();
          speech = rec;
          rec.lang = 'zh-TW';
          rec.interimResults = true;
          rec.continuous = false;
          before = input.value.trim();
          let finalText = '', fallback = false;
          rec.onstart = () => { mic.classList.add('is-listening'); mic.setAttribute('aria-label', '停止語音輸入'); setStatus('請說…（說完會自動加入）'); };
          rec.onresult = ev => {
            let interim = '';
            finalText = '';
            for (const r of ev.results) { if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript; }
            input.value = (before ? before + ' ' : '') + (finalText || interim);
          };
          rec.onerror = ev => {
            const e = ev.error;
            if (e === 'no-speech' || e === 'aborted') { setStatus(e === 'no-speech' ? '沒有聽到聲音，再按一次麥克風試試。' : ''); return; }
            // 麥克風被拒：AI 模式也需要麥克風，所以不切換
            if (e === 'not-allowed' || e === 'audio-capture') { setStatus(e === 'audio-capture' ? '找不到麥克風，或麥克風被其他程式占用。' : '麥克風權限被拒絕，請到瀏覽器設定允許此網站使用麥克風。'); return; }
            // network、service-not-allowed、language-not-supported 等：這個瀏覽器用不了內建辨識，改用 AI
            markSpeechBroken();
            fallback = true;
          };
          rec.onend = () => {
            speech = null;
            mic.classList.remove('is-listening');
            mic.setAttribute('aria-label', '語音輸入');
            if (fallback) { input.value = before; setStatus('這個瀏覽器的內建語音辨識無法使用，改用 AI 辨識…'); startAiRecording(); return; }
            if (finalText.trim()) { setStatus(''); form.requestSubmit(); }
          };
          try { rec.start(); } catch (_) { speech = null; markSpeechBroken(); startAiRecording(); }
        }

        mic.addEventListener('click', () => {
          if (!canUse() || busy) return;
          // 正在錄音或聆聽中：再按一次停止
          if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
          if (speech) { speech.stop(); return; }
          if (speechUsable()) startWebSpeech(); else startAiRecording();
        });

        async function startAiRecording() {
          before = input.value.trim();
          chunks = [];
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (err) {
            cleanupMic();
            const name = err && err.name;
            setStatus(name === 'NotAllowedError' || name === 'PermissionDeniedError'
              ? '麥克風權限被拒絕，請到瀏覽器設定允許此網站使用麥克風。'
              : name === 'NotFoundError' || name === 'DevicesNotFoundError'
              ? '找不到麥克風，或麥克風被其他程式占用。'
              : '無法開啟麥克風：' + (name || '未知原因'));
            return;
          }

          const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
          const chosenMime = mimeCandidates.find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
          try {
            recorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);
          } catch (_) {
            cleanupMic();
            setStatus('此瀏覽器不支援錄音格式。');
            return;
          }

          recorder.ondataavailable = ev => { if (ev.data && ev.data.size > 0) chunks.push(ev.data); };
          recorder.onstart = () => {
            mic.classList.add('is-listening');
            mic.setAttribute('aria-label', '停止錄音並辨識');
            setStatus('AI 錄音中… 說完請再按一次麥克風');
            // 最長錄音 30 秒自動停止
            stopTimer = setTimeout(() => { if (recorder && recorder.state === 'recording') recorder.stop(); }, 30000);
          };
          recorder.onstop = async () => {
            const mimeType = (recorder && recorder.mimeType) || chosenMime || 'audio/webm';
            cleanupMic();
            if (!chunks.length) { setStatus('沒有錄到聲音，再按一次麥克風試試。'); return; }
            const blob = new Blob(chunks, { type: mimeType });
            chunks = [];
            if (blob.size < 800) { setStatus('錄音時間太短，沒有聽到聲音。'); return; }

            busy = true;
            mic.disabled = true;
            setStatus('AI 判讀中…');
            try {
              const audio = await blobToBase64(blob);
              // 最多等 50 秒，逾時就顯示錯誤，不會一直卡住
              const ctrl = new AbortController();
              const timer = setTimeout(() => ctrl.abort(), 50000);
              let res;
              try {
                res = await fetch('/api/transcribe', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ audio, mimeType }),
                  signal: ctrl.signal
                });
              } finally { clearTimeout(timer); }
              const data = await res.json().catch(() => ({}));
              if (!res.ok || !data.ok) {
                setStatus((data && data.error) || '語音辨識失敗，請稍後再試。');
                return;
              }
              const text = String(data.text || '').trim();
              if (!text) {
                setStatus('沒有聽到清楚的內容，再按一次麥克風試試。');
                return;
              }
              input.value = (before ? before + ' ' : '') + text;
              setStatus('');
              form.requestSubmit();
            } catch (err) {
              setStatus(err && err.name === 'AbortError' ? 'AI 判讀逾時，請再試一次。' : '連線失敗，無法進行語音辨識。');
            } finally {
              busy = false;
              mic.disabled = false;
            }
          };

          try {
            recorder.start();
          } catch (_) {
            cleanupMic();
            setStatus('語音輸入無法啟動。');
          }
        }
      }

      if (area === 'todo') window.clcTodoParse = parse; // 方便除錯
      render();
      window.addEventListener('clc-admin-changed', subscribe);
      if (window.isSuperuser) subscribe();
      if (focusInput && area === 'todo' && window.isSuperuser) input.focus({ preventScroll: true });
    });
    window.addEventListener('clc-admin-changed', syncTodoAreas);
    syncTodoAreas();
};
