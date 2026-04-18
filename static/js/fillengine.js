// fillengine.js — 填色引擎：方案一智能感應填色 / 方案二紋理補丁

var FillEngine = (function () {

  // 目前模式：'autofill' | 'patch'
  var mode = 'patch';

  // 補丁模式：來源矩形
  var patchSource = null;
  var patchSelecting = false; // 是否正在選取來源區域

  // [Plan B] 持久離屏 canvas，複用於每次 applyPatch，避免高頻建立/GC
  var _patchCanvas = null;
  var _maskCanvas  = null;

  // ── 模式切換 ──
  function setMode(m) {
    mode = m;
    patchSource = null;
    patchSelecting = false;

    document.getElementById('btn-autofill').classList.toggle('active', m === 'autofill');
    document.getElementById('btn-patch').classList.toggle('active', m === 'patch');

    var autofillHint = document.getElementById('autofill-hint');
    var patchHint = document.getElementById('patch-hint');
    if (autofillHint) autofillHint.style.display = m === 'autofill' ? 'block' : 'none';
    if (patchHint) patchHint.style.display = m === 'patch' ? 'block' : 'none';

    var sourcePreview = document.getElementById('patch-source-preview');
    if (sourcePreview) sourcePreview.style.display = 'none';

    // 切換到智能填色時移除警示；切換回補丁時恢復「必填」狀態
    var hint = document.getElementById('patch-hint');
    var badge = document.getElementById('patchRequiredBadge');
    var btnSel = document.getElementById('btnPatchSelect');
    if (m === 'autofill') {
      if (hint) hint.classList.remove('needs-source', 'pulse');
    } else {
      // 回到 patch 模式，source 已被清空，恢復必填狀態
      if (badge) { badge.textContent = '必填'; badge.style.background = 'var(--red)'; }
      if (btnSel) { btnSel.style.borderColor = ''; btnSel.style.color = ''; }
    }

    App.setSt(m === 'autofill'
      ? '模式：智能填色 — 框選後自動取樣背景色並羽化邊緣'
      : '模式：紋理補丁 — 請先點「點此選取來源」設定來源區域，再框選價格位置');
  }

  function getMode() { return mode; }

  function isPatchSelecting() { return patchSelecting; }
  function setPatchSelecting(v) { patchSelecting = v; }
  function getPatchSource() { return patchSource; }

  function startPatchSelect() {
    patchSource = null; // clear old source
    patchSelecting = true;

    // Reset preview
    var preview = document.getElementById('patch-source-preview');
    if (preview) { preview.style.display = 'none'; preview.src = ''; }

    // Update badge + button to "selecting" state
    var badge = document.getElementById('patchRequiredBadge');
    if (badge) { badge.textContent = '選取中…'; badge.style.background = '#E67E22'; }
    var btn = document.getElementById('btnPatchSelect');
    if (btn) {
      btn.classList.add('selecting');
      btn.textContent = '拖拉框選來源區域…';
    }
    // 重新選取時隱藏遮罩按鈕（直到新來源設定完成）
    var btnMask = document.getElementById('btnMaskDraw');
    if (btnMask) { btnMask.style.display = 'none'; btnMask.classList.remove('active'); }
    App.setSt('請在空白背景處拖拉框選來源紋理區域（黑色虛線框）');
  }

  function setPatchSource(src) {
    patchSource = src;
    patchSelecting = false;

    // Restore button from selecting state
    var btn2 = document.getElementById('btnPatchSelect');
    if (btn2) {
      btn2.classList.remove('selecting');
      btn2.textContent = '重新選取來源';
    }

    // 顯示來源預覽縮圖
    var canvas = Canvas.getCanvas();
    var ctx = Canvas.getCtx();
    var zoom = Canvas.getZoom();
    if (!canvas) return;

    var preview = document.getElementById('patch-source-preview');
    if (preview) {
      // 擷取來源區域像素畫到縮圖 canvas
      var tmpC = document.createElement('canvas');
      tmpC.width = src.w;
      tmpC.height = src.h;
      tmpC.getContext('2d').drawImage(canvas, src.x, src.y, src.w, src.h, 0, 0, src.w, src.h);
      preview.src = tmpC.toDataURL();
      preview.style.display = 'block';
    }
    App.setSt('✅ 來源區域已設定 (' + Math.round(src.w) + 'x' + Math.round(src.h) + 'px)，現在可以框選要覆蓋的價格位置');
    // 解除阻擋警示
    var hint = document.getElementById('patch-hint');
    if (hint) hint.classList.remove('needs-source', 'pulse');
    var badge = document.getElementById('patchRequiredBadge');
    if (badge) { badge.textContent = '✓ 已設定'; badge.style.background = '#27AE60'; }
    var btnSel = document.getElementById('btnPatchSelect');
    if (btnSel) { btnSel.style.borderColor = ''; btnSel.style.color = ''; }
    // 來源設定完成 → 顯示「覆蓋遮罩」按鈕
    var btnMask = document.getElementById('btnMaskDraw');
    if (btnMask) btnMask.style.display = '';
  }

  // ── 方案一：環狀取樣平均色 + 邊緣羽化 ──
  function applyAutoFill(ctx, canvas, box, featherPx) {
    featherPx = featherPx !== undefined ? featherPx : 2;
    var ringSize = 6; // 向外擴張幾 px 取樣

    // 取四邊環狀像素（上下左右各 ringSize px 帶狀）
    var colors = [];
    var x = Math.round(box.x), y = Math.round(box.y);
    var w = Math.round(box.w), h = Math.round(box.h);

    function sampleStrip(sx, sy, sw, sh) {
      sx = Math.max(0, sx);
      sy = Math.max(0, sy);
      sw = Math.min(sw, canvas.width - sx);
      sh = Math.min(sh, canvas.height - sy);
      if (sw <= 0 || sh <= 0) return;
      var data = ctx.getImageData(sx, sy, sw, sh).data;
      for (var i = 0; i < data.length; i += 4) {
        colors.push([data[i], data[i+1], data[i+2], data[i+3]]);
      }
    }

    // 上帶
    sampleStrip(x - ringSize, y - ringSize, w + ringSize * 2, ringSize);
    // 下帶
    sampleStrip(x - ringSize, y + h, w + ringSize * 2, ringSize);
    // 左帶
    sampleStrip(x - ringSize, y, ringSize, h);
    // 右帶
    sampleStrip(x + w, y, ringSize, h);

    if (!colors.length) {
      // fallback：直接取矩形內部
      sampleStrip(x, y, w, h);
    }

    // 計算平均 RGBA，過濾極端值（去掉最亮5%和最暗5%）
    var rs = [], gs = [], bs = [];
    for (var i = 0; i < colors.length; i++) {
      rs.push(colors[i][0]);
      gs.push(colors[i][1]);
      bs.push(colors[i][2]);
    }
    function trimmedMean(arr) {
      arr.sort(function(a,b){return a-b;});
      var cut = Math.floor(arr.length * 0.05);
      var slice = arr.slice(cut, arr.length - cut);
      if (!slice.length) slice = arr;
      var sum = 0;
      for (var i = 0; i < slice.length; i++) sum += slice[i];
      return Math.round(sum / slice.length);
    }
    var avgR = trimmedMean(rs);
    var avgG = trimmedMean(gs);
    var avgB = trimmedMean(bs);

    // 先儲存目前 filter 設定
    var prevFilter = ctx.filter;
    var prevComposite = ctx.globalCompositeOperation;

    if (featherPx > 0) {
      // 羽化：先畫稍大一圈的模糊遮蓋層
      ctx.filter = 'blur(' + featherPx + 'px)';
    }

    ctx.fillStyle = 'rgb(' + avgR + ',' + avgG + ',' + avgB + ')';
    // 畫稍大一點讓 blur 邊緣完整
    ctx.fillRect(x - featherPx, y - featherPx, w + featherPx * 2, h + featherPx * 2);

    if (featherPx > 0) {
      ctx.filter = 'none';
      // 中央再畫一層不模糊的實色，確保覆蓋乾淨
      ctx.fillStyle = 'rgb(' + avgR + ',' + avgG + ',' + avgB + ')';
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    }

    ctx.filter = prevFilter !== undefined ? prevFilter : 'none';
    ctx.globalCompositeOperation = prevComposite;

    return { r: avgR, g: avgG, b: avgB };
  }

  // ── 方案二：紋理補丁 + Alpha 遮罩羽化 ──
  // [Plan B] 複用持久 canvas，重設 width/height 即可清空，不再高頻 createElement
  function applyPatch(ctx, canvas, box, source, featherPx) {
    featherPx = featherPx !== undefined ? featherPx : 5;
    if (!source) return false;

    var tx = Math.round(box.x), ty = Math.round(box.y);
    var tw = Math.round(box.w), th = Math.round(box.h);
    var sx = Math.round(source.x), sy = Math.round(source.y);
    var sw = Math.round(source.w), sh = Math.round(source.h);
    if (tw < 1 || th < 1) return false;

    // 複用補丁 canvas（重設尺寸自動清空）
    if (!_patchCanvas) _patchCanvas = document.createElement('canvas');
    _patchCanvas.width  = tw;
    _patchCanvas.height = th;
    var pCtx = _patchCanvas.getContext('2d');

    // 把來源區域平鋪/縮放貼到補丁大小
    pCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, tw, th);

    // 複用遮罩 canvas
    if (!_maskCanvas) _maskCanvas = document.createElement('canvas');
    _maskCanvas.width  = tw;
    _maskCanvas.height = th;
    var mCtx = _maskCanvas.getContext('2d');

    // 矩形羽化遮罩：四邊各做一條漸層
    mCtx.fillStyle = '#fff';
    mCtx.fillRect(featherPx, featherPx, tw - featherPx * 2, th - featherPx * 2);

    function addGrad(x0, y0, x1, y1, rx0, ry0, rw, rh) {
      var g = mCtx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      mCtx.fillStyle = g;
      mCtx.fillRect(rx0, ry0, rw, rh);
    }
    addGrad(0, 0, featherPx, 0,         0, 0, featherPx, th); // 左
    addGrad(tw, 0, tw-featherPx, 0,     tw-featherPx, 0, featherPx, th); // 右
    addGrad(0, 0, 0, featherPx,         0, 0, tw, featherPx); // 上
    addGrad(0, th, 0, th-featherPx,     0, th-featherPx, tw, featherPx); // 下

    // 把遮罩套到補丁（destination-in）
    pCtx.globalCompositeOperation = 'destination-in';
    pCtx.drawImage(_maskCanvas, 0, 0);
    pCtx.globalCompositeOperation = 'source-over';

    // 將補丁貼到主 canvas
    ctx.drawImage(_patchCanvas, tx, ty);
    return true;
  }

  // ── 主入口：依模式選擇填色方案 ──
  function apply(ctx, canvas, box, options) {
    options = options || {};
    var boxMode = options.fillMode || mode; // 優先使用 box 自己的 fillMode

    if (boxMode === 'patch') {
      var src = options.patchSource || patchSource;
      if (!src) {
        // 沒有來源時 fallback 到方案一
        return applyAutoFill(ctx, canvas, box, 2);
      }
      return applyPatch(ctx, canvas, box, src, options.feather !== undefined ? options.feather : 5);
    } else {
      return applyAutoFill(ctx, canvas, box, options.feather !== undefined ? options.feather : 2);
    }
  }

  // ── 羽化強度（供 UI 調整）──
  var featherLevel = { autofill: 2, patch: 5 };

  function setFeather(m, v) {
    featherLevel[m] = parseInt(v) || 0;
  }
  function getFeather(m) {
    return featherLevel[m !== undefined ? m : mode];
  }

  return {
    setMode: setMode,
    getMode: getMode,
    isPatchSelecting: isPatchSelecting,
    setPatchSelecting: setPatchSelecting,
    getPatchSource: getPatchSource,
    setPatchSource: setPatchSource,
    startPatchSelect: startPatchSelect,
    applyAutoFill: applyAutoFill,
    applyPatch: applyPatch,
    apply: apply,
    setFeather: setFeather,
    getFeather: getFeather
  };

})();
