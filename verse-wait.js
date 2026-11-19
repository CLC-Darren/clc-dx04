(function () {
  if (window.clcVerseWait) return;
  // 等待時顯示的經文（和合本，與「忍耐、等候」有關的金句），每次隨機一段。
  const VERSES = [
    ['但忍耐也當成功，使你們成全完備，毫無缺欠。', '雅各書 1:4'],
    ['在指望中要喜樂，在患難中要忍耐，禱告要恆切。', '羅馬書 12:12'],
    ['你們必須忍耐，使你們行完了神的旨意，就可以得著所應許的。', '希伯來書 10:36'],
    ['我們行善，不可喪志；若不灰心，到了時候就要收成。', '加拉太書 6:9'],
    ['但那等候耶和華的必從新得力。他們必如鷹展翅上騰；他們奔跑卻不困倦，行走卻不疲乏。', '以賽亞書 40:31'],
    ['要等候耶和華！當壯膽，堅固你的心！我再說，要等候耶和華！', '詩篇 27:14'],
    ['你當默然倚靠耶和華，耐性等候他', '詩篇 37:7'],
    ['愛是恆久忍耐，又有恩慈', '哥林多前書 13:4'],
    ['事情的終局強如事情的起頭；存心忍耐的，勝過居心驕傲的。', '傳道書 7:8'],
    ['因為知道患難生忍耐，忍耐生老練，老練生盼望', '羅馬書 5:3-4'],
    ['弟兄們哪，你們要忍耐，直到主來。看哪，農夫忍耐等候地裡寶貴的出產，直到得了秋雨春雨。', '雅各書 5:7'],
    ['忍受試探的人是有福的，因為他經過試驗以後，必得生命的冠冕；這是主應許給那些愛他之人的。', '雅各書 1:12'],
    ['那先前忍耐的人，我們稱他們是有福的。', '雅各書 5:11'],
    ['聖靈所結的果子，就是仁愛、喜樂、和平、忍耐、恩慈、良善、信實、溫柔、節制。', '加拉太書 5:22-23'],
    ['存心忍耐，奔那擺在我們前頭的路程', '希伯來書 12:1'],
    ['並且不懈怠，總要效法那些憑信心和忍耐承受應許的人。', '希伯來書 6:12'],
    ['人仰望耶和華，靜默等候他的救恩，這原是好的。', '耶利米哀歌 3:26'],
    ['我曾耐性等候耶和華；他垂聽我的呼求。', '詩篇 40:1'],
    ['我的心哪，你當默默無聲，專等候神，因為我的盼望是從他而來。', '詩篇 62:5'],
    ['至於我，我要仰望耶和華，要等候那救我的神；我的神必應允我。', '彌迦書 7:7'],
    ['不輕易發怒的，勝過勇士；治服己心的，強如取城。', '箴言 16:32'],
    ['不輕易發怒的，大有聰明；性情暴躁的，大顯愚妄。', '箴言 14:29'],
    ['凡事謙虛、溫柔、忍耐，用愛心互相寬容', '以弗所書 4:2'],
    ['你們常存忍耐，就必保全靈魂。', '路加福音 21:19'],
    ['主所應許的尚未成就，有人以為他是耽延，其實不是耽延，乃是寬容你們，不願有一人沉淪，乃願人人都悔改。', '彼得後書 3:9'],
    ['但我們若盼望那所不見的，就必忍耐等候。', '羅馬書 8:25'],
    ['但願賜忍耐、安慰的神叫你們彼此同心，效法基督耶穌', '羅馬書 15:5'],
    ['照他榮耀的權能，得以在各樣的力上加力，好叫你們凡事歡歡喜喜地忍耐寬容', '歌羅西書 1:11']
  ];

  let pending = 0, timer, overlay, shownAt, hideTimer;
  window.clcVerseWait = function ({ timeout = 8000 } = {}) {
    clearTimeout(hideTimer);
    if (++pending === 1 && !overlay) {
      timer = setTimeout(() => {
        if (!document.body) return;
        const v = VERSES[Math.floor(Math.random() * VERSES.length)];
        const el = document.createElement('div');
        el.id = 'clc-sso-busy';
        el.setAttribute('role', 'status'); el.setAttribute('aria-busy', 'true');
        el.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(9,10,15,.6);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);opacity:0;transition:opacity .25s;';
        el.innerHTML = '<style>@keyframes clcSsoSpin{to{transform:rotate(360deg)}}</style>' +
          '<div style="display:flex;align-items:flex-start;gap:14px;max-width:min(92vw,460px);padding:18px 22px;border-radius:18px;background:#161924;color:#f1f5f9;border:1px solid rgba(255,255,255,.12);box-shadow:0 12px 40px rgba(0,0,0,.45);font-family:Arial,&quot;Microsoft JhengHei&quot;,sans-serif;">' +
          '<span style="flex:none;margin-top:3px;width:18px;height:18px;border-radius:50%;border:2.5px solid rgba(255,255,255,.25);border-top-color:#00A3B4;animation:clcSsoSpin .8s linear infinite;"></span>' +
          '<div><p data-v style="margin:0;font-size:15px;line-height:1.75;letter-spacing:.02em;"></p>' +
          '<p data-r style="margin:6px 0 0;font-size:12.5px;color:#94a3b8;text-align:right;"></p></div></div>';
        el.querySelector('[data-v]').textContent = v[0];
        el.querySelector('[data-r]').textContent = '— ' + v[1];
        document.body.appendChild(el);
        requestAnimationFrame(() => { if (overlay === el) el.style.opacity = '1'; });
        overlay = el;
        overlay.style.pointerEvents = 'none';
        shownAt = Date.now();
      }, 200);
    }
    let finished = false;
    const deadline = timeout ? setTimeout(finish, timeout) : null;
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      if (--pending) return;
      clearTimeout(timer);
      if (overlay) {
        hideTimer = setTimeout(() => {
          overlay.remove();
          overlay = null;
        }, Math.max(0, 1000 - (Date.now() - shownAt)));
      }
    }
    return finish;
  };
})();
