// tutorial.js — 首次使用快速教學導覽

var Tutorial = (function() {
  var HIDE_KEY = 'menuToolTutorialHiddenUntil';
  var idx = 0;
  var steps = [
    {
      title: '歡迎使用菜單價格調整工具',
      body: '這裡可以上傳菜單、框選價格、套用抽成或 Deal%，再用 Canvas 覆蓋新價格並匯出圖片。',
      target: null
    },
    {
      title: '上傳菜單圖片',
      body: '點擊或拖曳圖片到這裡。支援 JPG、PNG、WEBP、HEIC、HEIF；iPhone 的 HEIC 會在你的瀏覽器內轉成 JPG 後再載入，不會上傳伺服器。',
      target: '#uploadZone'
    },
    {
      title: '設定商家抽成',
      body: '開啟後會用原價除以「1 - 抽成」換算新價格。關閉時，這個因子不會參與右側計算過程。',
      target: '#commissionInputRow'
    },
    {
      title: '設定 Deal %',
      body: '需要活動折扣時開啟。系統只會把已開啟的因子放進計算，所以 Deal 可以獨立於商家抽成使用。',
      target: '#dealInputRow'
    },
    {
      title: '選擇覆蓋填色方案',
      body: '紋理補丁適合大多數菜單，會用乾淨背景覆蓋舊價格；智能填色適合背景很單純的菜單。',
      target: '#patch-hint'
    },
    {
      title: '先選取紋理來源',
      body: '使用紋理補丁時，請先點「點此選取來源」，再到菜單空白背景拖拉一塊乾淨區域作為覆蓋材質。',
      target: '#btnPatchSelect'
    },
    {
      title: '框選價格位置',
      body: '按住 Tab 並在菜單上拖拉，框選要替換的價格。框好後會打開右側價格編輯面板。',
      target: '#mc'
    },
    {
      title: '輸入價格與確認新價格',
      body: '在右側面板輸入原始價格，系統會依目前啟用的抽成、Deal 與四捨五入設定計算新價格，也可以手動修改。',
      target: '#fp'
    },
    {
      title: '預覽修改效果',
      body: '按「預覽效果」可以切換查看最終覆蓋後的樣子，方便在匯出前檢查是否自然。',
      target: '#tbPrev'
    },
    {
      title: '匯出圖片',
      body: '確認沒問題後，點右上角匯出圖片。你的資料都保存在本機瀏覽器與 localStorage。',
      target: '#btnExport'
    }
  ];

  var ov, spot, arrow, title, body, meta, prevBtn, nextBtn, todayBtn, closeBtn;

  function nextResetAt5am(now) {
    var d = new Date(now.getTime());
    d.setHours(5, 0, 0, 0);
    if (now.getTime() >= d.getTime()) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  function shouldShow() {
    var hiddenUntil = parseInt(localStorage.getItem(HIDE_KEY) || '0', 10);
    return Date.now() >= hiddenUntil;
  }

  function hideToday() {
    localStorage.setItem(HIDE_KEY, String(nextResetAt5am(new Date())));
    close();
  }

  function init() {
    ov = document.getElementById('tutorialOv');
    if (!ov) return;
    spot = document.getElementById('tutorialSpot');
    arrow = document.getElementById('tutorialArrow');
    title = document.getElementById('tutorialTitle');
    body = document.getElementById('tutorialBody');
    meta = document.getElementById('tutorialMeta');
    prevBtn = document.getElementById('tutorialPrev');
    nextBtn = document.getElementById('tutorialNext');
    todayBtn = document.getElementById('tutorialToday');
    closeBtn = document.getElementById('tutorialClose');

    prevBtn.addEventListener('click', prev);
    nextBtn.addEventListener('click', next);
    todayBtn.addEventListener('click', hideToday);
    closeBtn.addEventListener('click', close);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('keydown', function(e) {
      if (!ov.classList.contains('show')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    });

    if (shouldShow()) setTimeout(open, 600);
  }

  function open() {
    idx = 0;
    ov.classList.add('show');
    ov.setAttribute('aria-hidden', 'false');
    render();
  }

  function close() {
    ov.classList.remove('show');
    ov.setAttribute('aria-hidden', 'true');
  }

  function prev() {
    if (idx > 0) { idx--; render(); }
  }

  function next() {
    if (idx >= steps.length - 1) { close(); return; }
    idx++;
    render();
  }

  function render() {
    var step = steps[idx];
    title.textContent = step.title;
    body.textContent = step.body;
    meta.textContent = (idx + 1) + ' / ' + steps.length;
    prevBtn.disabled = idx === 0;
    nextBtn.textContent = idx === steps.length - 1 ? '完成' : '下一步';
    setTimeout(position, 20);
  }

  function position() {
    if (!ov || !ov.classList.contains('show')) return;
    var step = steps[idx];
    var target = step.target ? document.querySelector(step.target) : null;
    if (!target || target.offsetParent === null) {
      spot.style.display = 'none';
      arrow.style.display = 'none';
      return;
    }

    var r = target.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) {
      spot.style.display = 'none';
      arrow.style.display = 'none';
      return;
    }

    var pad = 8;
    spot.style.display = 'block';
    spot.style.left = Math.max(8, r.left - pad) + 'px';
    spot.style.top = Math.max(8, r.top - pad) + 'px';
    spot.style.width = Math.min(window.innerWidth - 16, r.width + pad * 2) + 'px';
    spot.style.height = Math.min(window.innerHeight - 16, r.height + pad * 2) + 'px';

    var card = ov.querySelector('.tutorial-card').getBoundingClientRect();
    var startX = card.left + card.width / 2;
    var startY = card.top + card.height / 2;
    var endX = r.left + r.width / 2;
    var endY = r.top + r.height / 2;
    var dx = endX - startX;
    var dy = endY - startY;
    var len = Math.max(36, Math.sqrt(dx * dx + dy * dy) - 120);
    var ang = Math.atan2(dy, dx) * 180 / Math.PI;

    arrow.style.display = 'block';
    arrow.style.left = startX + 'px';
    arrow.style.top = startY + 'px';
    arrow.style.width = len + 'px';
    arrow.style.transform = 'rotate(' + ang + 'deg)';
  }

  return { init: init, open: open, close: close };
})();
