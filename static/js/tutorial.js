// tutorial.js — 首次使用快速教學與完整使用說明

var Tutorial = (function() {
  var HIDE_KEY = 'menuToolTutorialHiddenUntil';
  var mode = 'quick';
  var idx = 0;

  var quickSteps = [
    { title: '歡迎使用菜單價格調整工具', body: '這裡可以上傳菜單、框選價格、套用抽成或 Deal%，再用 Canvas 覆蓋新價格並匯出圖片。', target: null },
    { title: '上傳菜單圖片', body: '點擊或拖曳圖片到這裡。支援 JPG、PNG、WEBP、HEIC、HEIF；iPhone 的 HEIC 會在瀏覽器內轉成 JPG 後載入。', target: '#uploadZone' },
    { title: '設定商家抽成', body: '開啟後會用原價除以「1 - 抽成」換算新價格。關閉時，這個因子不會參與右側計算過程。', target: '#commissionInputRow' },
    { title: '設定 Deal %', body: '需要活動折扣時開啟。系統只會把已開啟的因子放進計算，所以 Deal 可以獨立於商家抽成使用。', target: '#dealInputRow' },
    { title: '選擇覆蓋填色方案', body: '紋理補丁適合大多數菜單，會用乾淨背景覆蓋舊價格；智能填色適合背景很單純的菜單。', target: '#patch-hint' },
    { title: '先選取紋理來源', body: '使用紋理補丁時，請先點「點此選取來源」，再到菜單空白背景拖拉一塊乾淨區域作為覆蓋材質。', target: '#btnPatchSelect' },
    { title: '框選價格位置', body: '按住 Tab 並在菜單上拖拉，框選要替換的價格。框好後會打開價格編輯面板。', target: '#mc' },
    { title: '輸入價格與確認新價格', body: '在面板輸入原始價格，系統會依目前啟用的抽成、Deal 與四捨五入設定計算新價格，也可以手動修改。', target: '#fp' },
    { title: '預覽修改效果', body: '按「預覽效果」可以切換查看最終覆蓋後的樣子，方便在匯出前檢查是否自然。', target: '#tbPrev' },
    { title: '匯出圖片', body: '確認沒問題後，點右上角匯出圖片。你的資料都保存在本機瀏覽器與 localStorage。', target: '#btnExport' }
  ];

  var fullSteps = [
    { title: '完整使用說明', body: '這套教學會走過所有主要功能：上傳、計算、填色、框選、編輯、批次、菜單庫、快捷鍵、AI 渲染與匯出。', target: null },
    { title: '使用說明入口', body: '右上角的「使用說明」可以隨時重新開啟完整教學，不受「今日不再顯示」限制。', target: '#btnHelp' },
    { title: '上傳菜單圖片', body: '點擊或拖曳圖片到上傳區。支援 JPG、PNG、WEBP、HEIC、HEIF；HEIC/HEIF 會在本機瀏覽器轉成 JPG，不上傳伺服器。', target: '#uploadZone', tab: 'edit' },
    { title: '圖片品質建議', body: '建議使用清晰、正面、不要太暗的菜單圖片。價格文字越清楚，框選、OCR 與覆蓋效果越好。', target: '#uploadZone', tab: 'edit' },
    { title: '商家抽成', body: '開啟後套用公式「原價 ÷ (1 - 抽成)」。關閉時不參與計算，也不會出現在價格編輯面板的計算過程。', target: '#commissionInputRow', tab: 'edit' },
    { title: 'Deal %', body: '開啟後會再套用「÷ Deal%」。Deal 可以獨立使用，系統只會套用目前開啟的計算因子。', target: '#dealInputRow', tab: 'edit' },
    { title: '計算因子啟用邏輯', body: '例如只開 Deal，就只用 Deal；商家抽成和 Deal 都開，才會兩者一起計算。右側計算過程會跟著顯示實際使用的項目。', target: '#commissionInputRow', tab: 'edit' },
    { title: '覆蓋填色方案', body: '這裡決定舊價格被蓋掉時的背景修補方式。紋理補丁更自然，智能填色更快速。', target: '#patch-hint', tab: 'edit' },
    { title: '紋理補丁', body: '適合有紙紋、掃描陰影、背景不均勻的菜單。它會用你選取的乾淨背景作為覆蓋材質。', target: '#btn-patch', tab: 'edit' },
    { title: '選取紋理來源', body: '點「點此選取來源」後，到菜單空白處拖拉一塊乾淨背景。來源越乾淨，覆蓋價格越自然。', target: '#btnPatchSelect', tab: 'edit' },
    { title: '羽化強度', body: '羽化越高，覆蓋邊緣越柔；太低可能有框線，太高可能模糊。建議從預設值開始微調。', target: '#patch-hint', tab: 'edit' },
    { title: '智能填色', body: '智能填色會自動取樣框選矩形周圍背景色，適合純白或單色背景的菜單。', target: '#btn-autofill', tab: 'edit' },
    { title: '覆蓋遮罩', body: '來源選好後可以使用「覆蓋遮罩」先蓋掉不規則區域，處理舊字殘影或價格旁的雜訊。', target: '#patch-hint', tab: 'edit' },
    { title: '框選價格位置', body: '按住 Tab 並在菜單上拖拉，框選要替換的價格。框選完成後會開啟價格編輯面板。', target: '#mc' },
    { title: '複製上次框尺寸', body: '按住 Tab + Shift 拖拉可複製上次框選尺寸，適合同一欄價格寬高一致的菜單。', target: '#mc' },
    { title: '多選與對齊', body: '不按 Tab 直接拖拉可以多選價格框，多選後會出現對齊工具，適合整理整排或整欄位置。', target: '#alignBar' },
    { title: '移動價格框', body: '按住 Alt 拖曳已建立的價格框可以移動位置。多選狀態下也能一起移動。', target: '#mc' },
    { title: '輸入原始價格', body: '在價格編輯面板輸入原始價格，系統會立即計算新價格。按 Enter 可確認數值，第二次 Enter 加入。', target: '#fp' },
    { title: '手動覆寫新價格', body: '不想使用自動計算時，可以直接修改「新價格」欄位，系統會使用你輸入的最終值。', target: '#fpNew' },
    { title: '價格單位', body: '可選無、後綴「元」、前綴「$」以及是否加入空格，讓新價格更貼近原菜單格式。', target: '#selAffix' },
    { title: '四捨五入', body: '可以四捨五入至十位數，或無條件進位至 5 / 10。這些規則會反映在新價格計算結果。', target: '#fpPriceInfoSection' },
    { title: '排列方向', body: '可切換橫式或直式，配合菜單原本價格文字方向。', target: '#fpOrientLabel' },
    { title: '字型與大小', body: '選擇明體、黑體或手寫風字型，並調整字體大小，讓新價格看起來更像原始菜單。', target: '#fpFontSel' },
    { title: '顏色與格式', body: '可調整價格顏色、粗體、斜體與刪除線。雙擊色塊可以還原自動色。', target: '#fpFontColor' },
    { title: '對齊方式', body: '左、中、右對齊可以讓價格在格線中更自然，也能避免貼邊。', target: '.fp-align-btn.active' },
    { title: '全部變更', body: '「全部變更」會把目前字樣設定套用到所有價格框，適合統一整張菜單的價格樣式。', target: '.btn-apply-all' },
    { title: '文字工具', body: '右側 T 工具可以新增自由文字框，例如補上新品項名稱、備註或額外價格。快捷鍵是 T。', target: '#tbTextTool' },
    { title: '編輯清單', body: '點「編輯清單」可查看所有已框選價格，點清單項目可回到該價格框編輯。', target: '#btnEditList' },
    { title: 'Undo / Redo', body: '上方箭頭可還原或重做操作；Mac 可用 Cmd+Z / Cmd+Shift+Z，Windows 可用 Ctrl+Z / Ctrl+Y。', target: '#btnUndo' },
    { title: '快捷 Tips', body: '快捷 Tips 收納常用鍵盤操作，例如 Tab 框選、Alt 移動、Space 平移、T 文字工具與儲存快捷鍵。', target: '#btnTips' },
    { title: '縮放與平移', body: '上方縮放控制可調整檢視比例；也可以用滾輪縮放，按 Space 拖曳平移畫布。', target: '.zoom-ctrl' },
    { title: '參考線與尺規', body: '尺規可拖出水平或垂直參考線，輔助對齊價格欄位；左上眼睛按鈕可顯示或隱藏參考線。', target: '#btnGuides' },
    { title: '批次群組', body: '批次頁可以建立不同群組，讓不同區域或類別套用不同百分比，例如肉類、飲料、套餐。', target: '#pane-batch', tab: 'batch' },
    { title: '建立群組', body: '輸入群組名稱後點加號建立群組。每個群組可以設定百分比與顏色，方便在畫布上辨識。', target: '#newGrpName', tab: 'batch' },
    { title: '套用群組', body: '回到價格編輯面板後，可在「套用群組」選擇批次群組，該價格框就會使用群組百分比。', target: '#fpGroupRow', tab: 'edit' },
    { title: '儲存至菜單庫', body: '左側「儲存至菜單庫」會保存菜單圖片、框選、群組與樣式設定，方便下次繼續編輯。', target: '#pane-lib', tab: 'lib' },
    { title: '菜單庫', body: '菜單庫資料存在本機瀏覽器 IndexedDB，最多保留 10 筆；清除瀏覽器資料時也會一併刪除。', target: '#libList', tab: 'lib' },
    { title: '預覽效果', body: '預覽效果會切換查看修改後結果，適合在匯出前檢查文字大小、位置與覆蓋是否自然。', target: '#tbPrev' },
    { title: 'AI 渲染', body: 'AI 渲染可在最後階段協助讓價格與背景融合得更自然，適合完成主要框選後再使用。', target: '#tbEnhance' },
    { title: '匯出圖片', body: '完成後點右上角「匯出圖片」下載結果。匯出前建議先預覽一次，確認沒有漏框或字體不合。', target: '#btnExport' },
    { title: '資料儲存位置', body: '本工具主要使用 localStorage / IndexedDB 保存在你的瀏覽器本機。換瀏覽器或清除網站資料可能會遺失。', target: null }
  ];

  var activeSteps = quickSteps;
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

    if (shouldShow()) setTimeout(openQuick, 600);
  }

  function openQuick() { openWithSteps(quickSteps, 'quick'); }
  function openFull() { openWithSteps(fullSteps, 'full'); }

  function openWithSteps(list, nextMode) {
    mode = nextMode || 'quick';
    activeSteps = list || quickSteps;
    idx = 0;
    ov.classList.add('show');
    ov.setAttribute('aria-hidden', 'false');
    render();
  }

  function open() { openQuick(); }

  function close() {
    clearStepState();
    ov.classList.remove('show');
    ov.setAttribute('aria-hidden', 'true');
  }

  function prev() {
    if (idx > 0) { idx--; render(); }
  }

  function next() {
    if (idx >= activeSteps.length - 1) { close(); return; }
    idx++;
    render();
  }

  function clearStepState() {
    var fp = document.getElementById('fp');
    if (fp) fp.classList.remove('tutorial-open');
  }

  function applyStepState(step) {
    clearStepState();
    if (step.tab && typeof App !== 'undefined' && App.showTab) App.showTab(step.tab);
    if (step.target === '#fp' || step.target === '#fpNew' || step.target === '#selAffix' ||
        step.target === '#fpPriceInfoSection' || step.target === '#fpOrientLabel' ||
        step.target === '#fpFontSel' || step.target === '#fpFontColor' ||
        step.target === '.fp-align-btn.active' || step.target === '.btn-apply-all' ||
        step.target === '#fpGroupRow') {
      var fp = document.getElementById('fp');
      if (fp && !fp.classList.contains('open')) fp.classList.add('tutorial-open');
    }
  }

  function render() {
    var step = activeSteps[idx];
    applyStepState(step);
    title.textContent = step.title;
    body.textContent = step.body;
    meta.textContent = (idx + 1) + ' / ' + activeSteps.length;
    prevBtn.disabled = idx === 0;
    nextBtn.textContent = idx === activeSteps.length - 1 ? '完成' : '下一步';
    todayBtn.style.display = mode === 'quick' ? '' : 'none';
    setTimeout(position, 20);
    if (step.target && step.target.indexOf('#fp') === 0) setTimeout(position, 80);
  }

  function position() {
    if (!ov || !ov.classList.contains('show')) return;
    var step = activeSteps[idx];
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

  return { init: init, open: open, openQuick: openQuick, openFull: openFull, close: close };
})();
