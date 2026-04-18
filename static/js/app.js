// app.js — 主程式邏輯

var App = (function() {
  var boxes = [];
  var previewMode = false;
  var orientation = 'vertical';
  var currentImgB64 = null;
  var hist = [];
  var confirmCB = null;
  var enhancementApplied = false;
  var globalDeal = 80;
  var isDealEnabled = false;
  var isCommissionEnabled = true;

  // ── UNDO / REDO ──
  var undoStack = [];
  var redoStack = [];
  var MAX_UNDO = 30;

  function saveState() {
    undoStack.push(JSON.stringify(boxes));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
    _updateUndoUI();
  }

  function undo() {
    if (!undoStack.length) { setSt('沒有可復原的操作'); return; }
    redoStack.push(JSON.stringify(boxes));
    boxes = JSON.parse(undoStack.pop());
    renderPriceList();
    if (typeof Canvas !== 'undefined' && typeof Canvas.clearMultiSel === 'function') Canvas.clearMultiSel();
    redraw();
    _updateUndoUI();
    setSt('↩ 已復原');
  }

  function redo() {
    if (!redoStack.length) { setSt('沒有可重做的操作'); return; }
    undoStack.push(JSON.stringify(boxes));
    boxes = JSON.parse(redoStack.pop());
    renderPriceList();
    if (typeof Canvas !== 'undefined' && typeof Canvas.clearMultiSel === 'function') Canvas.clearMultiSel();
    redraw();
    _updateUndoUI();
    setSt('↪ 已重做');
  }

  function _updateUndoUI() {
    var u = document.getElementById('btnUndo');
    var r = document.getElementById('btnRedo');
    if (u) u.disabled = undoStack.length === 0;
    if (r) r.disabled = redoStack.length === 0;
  }

  try { hist = JSON.parse(localStorage.getItem('mhist') || '[]'); } catch(e) {}

  // ── INIT ──
  function init() {
    Canvas.init('mc', 'cw', function(x, y, w, h, isMask) {
      if (isMask) {
        // 覆蓋遮罩框：直接建立，不開 FloatPanel
        var pSrc = (typeof FillEngine !== 'undefined') ? FillEngine.getPatchSource() : null;
        addBox({
          id: Date.now() + '' + Math.round(Math.random() * 1e6),
          x: x, y: y, w: w, h: h,
          isMask: true,
          fillMode: 'patch',
          patchSource: pSrc,
          value: 0, newValue: 0,
          orient: orientation
        });
      } else {
        FloatPanel.open(x, y, w, h);
      }
    });
    bindUI();
    Groups.render(boxes);
    Library.render();
    renderHist();
    FloatPanel.init();
  }

  function bindUI() {
    document.getElementById('fi').addEventListener('change', handleFileUpload);
    var jiEl = document.getElementById('ji');
    if (jiEl) jiEl.addEventListener('change', handleJSONLoad);

    // 商家抽成
    document.getElementById('pctIn').addEventListener('input', function() {
      var v = parseFloat(this.value) || 0;
      document.getElementById('pctBadge').textContent = v + '%';
      renderPriceList();
      if (previewMode) redraw();
      if (document.getElementById('fp').classList.contains('open')) {
        FloatPanel.updateGroupInfo();
      }
    });

    // Deal % toggle
    document.getElementById('dealToggle').addEventListener('change', function() {
      isDealEnabled = this.checked;
      var dealRow = document.getElementById('dealInputRow');
      if (dealRow) dealRow.classList.toggle('deal-disabled', !isDealEnabled);
      document.getElementById('dealBadge').textContent = isDealEnabled ? globalDeal + '%' : '—';
      renderPriceList();
      if (previewMode) redraw();
      if (document.getElementById('fp').classList.contains('open')) {
        FloatPanel.updateGroupInfo();
      }
    });

    // 商家抽成開關
    document.getElementById('commissionToggle').addEventListener('change', function() {
      isCommissionEnabled = this.checked;
      var inputRow = document.getElementById('commissionInputRow');
      var hint = document.getElementById('commissionHint');
      if (inputRow) inputRow.classList.toggle('deal-disabled', !isCommissionEnabled);
      if (hint) hint.style.display = isCommissionEnabled ? '' : 'none';
      renderPriceList();
      if (previewMode) redraw();
      if (document.getElementById('fp').classList.contains('open')) {
        FloatPanel.updateCommissionUI();
      }
    });

    // Deal % 數值
    document.getElementById('dealIn').addEventListener('input', function() {
      globalDeal = parseFloat(this.value) || 80;
      if (isDealEnabled) {
        document.getElementById('dealBadge').textContent = globalDeal + '%';
        renderPriceList();
        if (previewMode) redraw();
        if (document.getElementById('fp').classList.contains('open')) {
          FloatPanel.updateGroupInfo();
        }
      }
    });
  }

  // ── 計算單一 box 最終新價格 ──
  function calcBoxPrice(box) {
    if (!isCommissionEnabled) return box.newValue > 0 ? box.newValue : box.value;
    var commission = getEffPct(box);
    if (commission >= 100) return box.value; // 防止除以零
    var nv = Math.floor(box.value / (1 - commission / 100));
    if (isDealEnabled && globalDeal > 0 && globalDeal < 100) {
      nv = Math.floor(nv / (globalDeal / 100));
    }
    return nv;
  }

  // ── FILE UPLOAD ──
  function handleFileUpload(e) {
    var f = e.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function(ev) {
      currentImgB64 = ev.target.result;
      var i = new Image();
      i.onload = function() {
        _origImgCanvas = null; _origImgCtx = null; // 清除舊圖快取
        Canvas.setImage(i);
        document.getElementById('emptySt').style.display = 'none';
        document.getElementById('cc').style.display = 'block';
        var mc = Canvas.getCanvas();
        mc.dataset.fmt = f.name.split('.').pop().toLowerCase();
        mc.dataset.name = f.name;
        var nm = f.name.length > 22 ? f.name.substring(0, 20) + '…' : f.name;
        document.getElementById('ulbl').textContent = nm;
        Canvas.fitToWindow();
        redraw();
        setSt('已載入：' + f.name + '（' + i.width + '×' + i.height + 'px）');
        // 背景初始化 OCR 引擎
        setTimeout(initOcr, 800);
      };
      i.src = ev.target.result;
    };
    rd.readAsDataURL(f);
  }

  // ── 前後綴溢出背景填色 ──
  // 注意：只填 box 邊界「外側」的溢出部分，不覆蓋 box 內部（FillEngine 已填色）
  function fillAffixOverflow(ctx, ns, tx, box, bgColor) {
    var tw = ctx.measureText(ns).width;
    var textLeft  = ctx.textAlign === 'left' ? tx : ctx.textAlign === 'right' ? tx - tw : tx - tw / 2;
    var textRight = textLeft + tw;
    var hasLeft  = textLeft  < box.x;
    var hasRight = textRight > box.x + box.w;
    if (!hasLeft && !hasRight) return;

    ctx.save();
    // 左側溢出：從 box 左邊向外填
    if (hasLeft) {
      // 從 box 左側邊緣取樣填充色（避免硬邊，patch 模式也能取到邊緣紋理色）
      var lc = _sampleEdge(ctx, box.x + 2, box.y + box.h / 2, bgColor);
      ctx.fillStyle = lc;
      ctx.fillRect(textLeft - 2, box.y, box.x - (textLeft - 2), box.h);
    }
    // 右側溢出：從 box 右邊向外填
    if (hasRight) {
      var rc = _sampleEdge(ctx, box.x + box.w - 3, box.y + box.h / 2, bgColor);
      ctx.fillStyle = rc;
      ctx.fillRect(box.x + box.w, box.y, (textRight + 2) - (box.x + box.w), box.h);
    }
    ctx.restore();
  }

  // 從 canvas 取樣單一像素色；若越界或失敗則回退到 bgColor
  function _sampleEdge(ctx, x, y, bgColor) {
    try {
      var d = ctx.getImageData(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), 1, 1).data;
      return 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')';
    } catch(e) {
      var fr = bgColor && bgColor.r !== undefined ? bgColor.r : 220;
      var fg = bgColor && bgColor.g !== undefined ? bgColor.g : 220;
      var fb = bgColor && bgColor.b !== undefined ? bgColor.b : 220;
      return 'rgb(' + fr + ',' + fg + ',' + fb + ')';
    }
  }

  // ── Plan A：自動採樣原圖墨水色（讓新數字顏色貼近原菜單字體色）──
  var _origImgCanvas = null;
  var _origImgCtx    = null;

  function _getOrigCtx() {
    var imgEl = Canvas.getImage();
    if (!imgEl) return null;
    if (!_origImgCanvas || _origImgCanvas.width !== imgEl.width || _origImgCanvas.height !== imgEl.height) {
      _origImgCanvas = document.createElement('canvas');
      _origImgCanvas.width  = imgEl.width;
      _origImgCanvas.height = imgEl.height;
      _origImgCtx = _origImgCanvas.getContext('2d');
      _origImgCtx.drawImage(imgEl, 0, 0);
    }
    return _origImgCtx;
  }

  // 在原圖的 box 上下各取 20px 細帶，找出墨水色（亮背景取最暗，暗背景取最亮）
  function _sampleInkColor(box) {
    var origCtx = _getOrigCtx();
    if (!origCtx) return null;
    var imgEl = Canvas.getImage();
    var bx = Math.max(0, Math.round(box.x));
    var bw = Math.min(Math.round(box.w), imgEl.width - bx);
    if (bw < 2) return null;

    var stripH = Math.min(20, Math.round(box.h));
    var samples = [];

    try {
      // 上方帶
      var ay = Math.max(0, Math.round(box.y) - stripH);
      var ah = Math.min(stripH, Math.round(box.y) - ay);
      if (ah > 0) {
        var d1 = origCtx.getImageData(bx, ay, bw, ah).data;
        for (var i = 0; i < d1.length; i += 4) {
          samples.push({ r: d1[i], g: d1[i+1], b: d1[i+2],
            l: 0.299*d1[i] + 0.587*d1[i+1] + 0.114*d1[i+2] });
        }
      }
      // 下方帶
      var by2 = Math.min(Math.round(box.y + box.h), imgEl.height);
      var bh2 = Math.min(stripH, imgEl.height - by2);
      if (bh2 > 0) {
        var d2 = origCtx.getImageData(bx, by2, bw, bh2).data;
        for (var j = 0; j < d2.length; j += 4) {
          samples.push({ r: d2[j], g: d2[j+1], b: d2[j+2],
            l: 0.299*d2[j] + 0.587*d2[j+1] + 0.114*d2[j+2] });
        }
      }
    } catch(e) { return null; }

    if (samples.length < 5) return null;

    // 求亮度中位數判斷背景明暗
    var lums = samples.map(function(s){ return s.l; }).sort(function(a,b){ return a-b; });
    var medLum = lums[Math.floor(lums.length / 2)];
    var lightBg = medLum > 128;

    // 依背景明暗選墨水像素（最暗或最亮 15%）
    samples.sort(function(a, b){ return a.l - b.l; });
    var inkCount = Math.max(3, Math.floor(samples.length * 0.15));
    var inkPx = lightBg ? samples.slice(0, inkCount) : samples.slice(samples.length - inkCount);

    var rs = inkPx.map(function(p){ return p.r; }).sort(function(a,b){ return a-b; });
    var gs = inkPx.map(function(p){ return p.g; }).sort(function(a,b){ return a-b; });
    var bs = inkPx.map(function(p){ return p.b; }).sort(function(a,b){ return a-b; });
    var mid = Math.floor(rs.length / 2);
    return 'rgb(' + rs[mid] + ',' + gs[mid] + ',' + bs[mid] + ')';
  }

  // ── REDRAW ──

  // 拖曳期間單一框的 FillEngine + 文字渲染（被 dragRedraw 呼叫）
  function _renderBoxPreview(ctx, mc, box) {
    // 遮罩框：只填色，不渲染文字
    if (box.isMask) {
      FillEngine.apply(ctx, mc, box, {
        fillMode: 'patch',
        patchSource: box.patchSource,
        feather: FillEngine.getFeather('patch')
      });
      return;
    }
    var globalFont = document.getElementById('fontSel').value;
    var font = box.fontFamily || globalFont;
    var nv = (box.newValue > 0) ? box.newValue : calcBoxPrice(box);
    var bgColor = FillEngine.apply(ctx, mc, box, {
      fillMode: box.fillMode,
      patchSource: box.patchSource,
      feather: box.fillMode === 'patch' ? FillEngine.getFeather('patch') : FillEngine.getFeather('autofill')
    });
    // ── Plan A：優先用原圖墨水色，fallback 用亮度判斷 ──
    var tc;
    if (box.fontColor) {
      tc = box.fontColor;
    } else {
      var sampledInk = _sampleInkColor(box);
      if (sampledInk) {
        tc = sampledInk;
      } else {
        var r2, gv2, b2;
        if (bgColor && bgColor.r !== undefined) {
          r2 = bgColor.r; gv2 = bgColor.g; b2 = bgColor.b;
        } else {
          try {
            var sid = ctx.getImageData(Math.max(0, box.x + 2), Math.max(0, box.y + 2), 4, 4);
            r2 = sid.data[0]; gv2 = sid.data[1]; b2 = sid.data[2];
          } catch(e) { r2 = 60; gv2 = 30; b2 = 20; }
        }
        var lum = r2 * 0.299 + gv2 * 0.587 + b2 * 0.114;
        tc = lum > 128 ? '#3D1A10' : '#FAF0E0';
      }
    }
    var _affix = box.priceAffix || (box.showYuan ? 'yuan' : 'none');
    var ns;
    switch (_affix) {
      case 'yuan':      ns = String(nv) + '元'; break;
      case 'yuan_sp':   ns = String(nv) + ' 元'; break;
      case 'dollar':    ns = '$' + String(nv); break;
      case 'dollar_sp': ns = '$ ' + String(nv); break;
      default:          ns = String(nv);
    }
    var bls = (box.letterSpacing || 0) + 'px';
    var bStyle = (box.bold ? 'bold ' : '') + (box.italic ? 'italic ' : '');
    var bAlign = box.textAlign || 'center';
    if ('letterSpacing' in ctx) ctx.letterSpacing = bls;
    if (box.orient === 'vertical') {
      var ch = box.h / ns.length;
      var fs = box.fontSize > 0 ? box.fontSize : Math.min(ch * 0.88, box.w * 0.92);
      ctx.font = bStyle + Math.round(fs) + "px '" + font + "',serif";
      ctx.fillStyle = tc; ctx.textAlign = bAlign;
      var charX = bAlign === 'right' ? box.x + box.w - 3 : bAlign === 'left' ? box.x + 3 : box.x + box.w / 2;
      // Plan B：垂直文字柔化
      if ('filter' in ctx) ctx.filter = 'blur(0.4px)';
      for (var ci = 0; ci < ns.length; ci++) {
        ctx.fillText(ns[ci], charX, box.y + ch * (ci + 0.8));
      }
      if ('filter' in ctx) ctx.filter = 'none';
    } else {
      var fs2 = box.fontSize > 0 ? box.fontSize : Math.min(box.h * 0.82, box.w / (ns.length * 0.6));
      ctx.font = bStyle + Math.round(fs2) + "px '" + font + "',serif";
      var vAl = box.verticalAlign || 'middle';
      var ty  = vAl === 'top' ? box.y + Math.round(fs2 * 0.82) : box.y + box.h / 2;
      ctx.fillStyle = tc; ctx.textBaseline = vAl === 'top' ? 'alphabetic' : 'middle';
      var tx = bAlign === 'left' ? box.x + 4 : bAlign === 'right' ? box.x + box.w - 4 : box.x + box.w / 2;
      ctx.textAlign = bAlign;
      fillAffixOverflow(ctx, ns, tx, box, bgColor);
      // Plan B：水平文字柔化
      if ('filter' in ctx) ctx.filter = 'blur(0.4px)';
      ctx.fillText(ns, tx, ty);
      if ('filter' in ctx) ctx.filter = 'none';
      if (box.strikethrough) {
        var tw = ctx.measureText(ns).width;
        var lx0 = bAlign === 'left' ? tx : bAlign === 'right' ? tx - tw : tx - tw / 2;
        var lw2 = Math.max(1, fs2 * 0.07);
        ctx.strokeStyle = tc; ctx.lineWidth = lw2; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(lx0, ty - fs2 * 0.12); ctx.lineTo(lx0 + tw, ty - fs2 * 0.12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(lx0, ty + fs2 * 0.08); ctx.lineTo(lx0 + tw, ty + fs2 * 0.08); ctx.stroke();
      }
      ctx.textBaseline = 'alphabetic';
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  // ── 拖曳背景 pre-bake（排除被拖曳的框，先算一次存入離屏 canvas）──
  var _dragBgCanvas = null;

  function prepareDragBackground(excludeIds) {
    var img = Canvas.getImage();
    if (!img) { _dragBgCanvas = null; return; }
    var mc = Canvas.getCanvas();
    _dragBgCanvas = document.createElement('canvas');
    _dragBgCanvas.width  = mc.width;
    _dragBgCanvas.height = mc.height;
    var bCtx = _dragBgCanvas.getContext('2d');

    // ── 直接快照當前 canvas（已含所有 FillEngine fills）──
    bCtx.drawImage(mc, 0, 0);

    // ── 抹除被拖曳框的舊位置，還原為原始圖片像素 ──
    if (excludeIds && excludeIds.length > 0) {
      for (var i = 0; i < boxes.length; i++) {
        if (excludeIds.indexOf(boxes[i].id) < 0) continue;
        var box = boxes[i];
        var pad = 2; // 多清 2px 邊緣，避免殘影
        var cx = Math.max(0, Math.round(box.x) - pad);
        var cy = Math.max(0, Math.round(box.y) - pad);
        var cw2 = Math.min(Math.round(box.w) + pad * 2, mc.width  - cx);
        var ch2 = Math.min(Math.round(box.h) + pad * 2, mc.height - cy);
        bCtx.drawImage(img, cx, cy, cw2, ch2, cx, cy, cw2, ch2);
      }
    }
  }

  function clearDragBackground() {
    _dragBgCanvas = null;
  }

  // 拖曳期間渲染：drawImage(dragBgCanvas) 復原背景（一次貼圖）+ 拖曳框 FillEngine
  function dragRedraw(draggedIds) {
    var img = Canvas.getImage();
    if (!img) return;
    var ctx = Canvas.getCtx();
    var mc  = Canvas.getCanvas();
    var zoom = Canvas.getZoom();
    ctx.clearRect(0, 0, mc.width, mc.height);

    // 貼背景（pre-baked 或 原圖）
    if (_dragBgCanvas) {
      ctx.drawImage(_dragBgCanvas, 0, 0);
    } else {
      ctx.drawImage(img, 0, 0);
    }

    // 只渲染拖曳中的框
    var lw = Math.max(1, 1.5 / zoom);
    for (var i = 0; i < boxes.length; i++) {
      if (!draggedIds || draggedIds.indexOf(boxes[i].id) < 0) continue;
      var box = boxes[i];
      if (previewMode) {
        _renderBoxPreview(ctx, mc, box);
      } else {
        var g = box.group ? Groups.getById(box.group) : null;
        var bc = g ? g.color : '#C0392B';
        ctx.strokeStyle = bc; ctx.lineWidth = lw; ctx.setLineDash([4/zoom, 3/zoom]);
        ctx.strokeRect(box.x, box.y, box.w, box.h);
        ctx.setLineDash([]);
      }
    }
    if (typeof Canvas.drawSelOverlays === 'function') Canvas.drawSelOverlays();
  }

  // 拖曳期間輕量渲染：只畫框線，跳過 FillEngine（避免 lag）
  function fastRedraw() {
    var img = Canvas.getImage();
    if (!img) return;
    var ctx = Canvas.getCtx();
    var mc = Canvas.getCanvas();
    var zoom = Canvas.getZoom();
    ctx.clearRect(0, 0, mc.width, mc.height);
    ctx.drawImage(img, 0, 0);
    var lw = Math.max(1, 1.5 / zoom);
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var g = box.group ? Groups.getById(box.group) : null;
      var bc = g ? g.color : '#C0392B';
      ctx.strokeStyle = bc; ctx.lineWidth = lw; ctx.setLineDash([4/zoom, 3/zoom]);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.setLineDash([]);
    }
    if (typeof Canvas.drawSelOverlays === 'function') Canvas.drawSelOverlays();
  }

  function redraw() {
    // Reset enhancement flag when canvas is re-rendered from scratch
    if (enhancementApplied) {
      enhancementApplied = false;
      var eb = document.getElementById('tbEnhance');
      if (eb) eb.classList.remove('active');
    }
    var img = Canvas.getImage();
    if (!img) return;
    var ctx = Canvas.getCtx();
    var mc = Canvas.getCanvas();
    var zoom = Canvas.getZoom();
    ctx.clearRect(0, 0, mc.width, mc.height);
    ctx.drawImage(img, 0, 0);
    var globalFont = document.getElementById('fontSel').value;
    var lw = Math.max(1, 1.5 / zoom);
    var pct = getGlobalPct();
    var groups = Groups.getAll();

    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var font = box.fontFamily || globalFont;
      var nv = (box.newValue > 0) ? box.newValue : calcBoxPrice(box);
      var g = box.group ? Groups.getById(box.group) : null;
      var bc = g ? g.color : '#C0392B';

      if (previewMode) {
        // 遮罩框：只填色不印字
        if (box.isMask) {
          FillEngine.apply(ctx, mc, box, {
            fillMode: 'patch',
            patchSource: box.patchSource,
            feather: FillEngine.getFeather('patch')
          });
          continue;
        }
        // 使用 FillEngine 填色
        var bgColor = FillEngine.apply(ctx, mc, box, {
          fillMode: box.fillMode,
          patchSource: box.patchSource,
          feather: box.fillMode === 'patch' ? FillEngine.getFeather('patch') : FillEngine.getFeather('autofill')
        });

        // ── Plan A：優先用原圖墨水色，fallback 用亮度判斷 ──
        var tc;
        if (box.fontColor) {
          tc = box.fontColor;
        } else {
          var sampledInk = _sampleInkColor(box);
          if (sampledInk) {
            tc = sampledInk;
          } else {
            var r2, gv2, b2;
            if (bgColor && bgColor.r !== undefined) {
              r2 = bgColor.r; gv2 = bgColor.g; b2 = bgColor.b;
            } else {
              try {
                var sid = ctx.getImageData(Math.max(0, box.x + 2), Math.max(0, box.y + 2), 4, 4);
                r2 = sid.data[0]; gv2 = sid.data[1]; b2 = sid.data[2];
              } catch(e) { r2 = 60; gv2 = 30; b2 = 20; }
            }
            var lum = r2 * 0.299 + gv2 * 0.587 + b2 * 0.114;
            tc = lum > 128 ? '#3D1A10' : '#FAF0E0';
          }
        }
        var _affix = box.priceAffix || (box.showYuan ? 'yuan' : 'none');
        var ns;
        switch (_affix) {
          case 'yuan':      ns = String(nv) + '元'; break;
          case 'yuan_sp':   ns = String(nv) + ' 元'; break;
          case 'dollar':    ns = '$' + String(nv); break;
          case 'dollar_sp': ns = '$ ' + String(nv); break;
          default:          ns = String(nv);
        }
        var bls = (box.letterSpacing || 0) + 'px';
        var bStyle = (box.bold ? 'bold ' : '') + (box.italic ? 'italic ' : '');
        var bAlign = box.textAlign || 'center';
        if ('letterSpacing' in ctx) ctx.letterSpacing = bls;
        if (box.orient === 'vertical') {
          var ch = box.h / ns.length;
          var fs = box.fontSize > 0 ? box.fontSize : Math.min(ch * 0.88, box.w * 0.92);
          ctx.font = bStyle + Math.round(fs) + "px '" + font + "',serif";
          ctx.fillStyle = tc; ctx.textAlign = bAlign;
          var charX = bAlign === 'right' ? box.x + box.w - 3 : bAlign === 'left' ? box.x + 3 : box.x + box.w / 2;
          // Plan B：垂直文字柔化
          if ('filter' in ctx) ctx.filter = 'blur(0.4px)';
          for (var ci = 0; ci < ns.length; ci++) {
            ctx.fillText(ns[ci], charX, box.y + ch * (ci + 0.8));
          }
          if ('filter' in ctx) ctx.filter = 'none';
        } else {
          var fs2 = box.fontSize > 0 ? box.fontSize : Math.min(box.h * 0.82, box.w / (ns.length * 0.6));
          ctx.font = bStyle + Math.round(fs2) + "px '" + font + "',serif";
          var vAl = box.verticalAlign || 'middle';
          var ty  = vAl === 'top' ? box.y + Math.round(fs2 * 0.82) : box.y + box.h / 2;
          ctx.fillStyle = tc; ctx.textBaseline = vAl === 'top' ? 'alphabetic' : 'middle';
          var tx = bAlign === 'left' ? box.x + 4 : bAlign === 'right' ? box.x + box.w - 4 : box.x + box.w / 2;
          ctx.textAlign = bAlign;
          fillAffixOverflow(ctx, ns, tx, box, bgColor);
          // Plan B：水平文字柔化
          if ('filter' in ctx) ctx.filter = 'blur(0.4px)';
          ctx.fillText(ns, tx, ty);
          if ('filter' in ctx) ctx.filter = 'none';
          // 雙刪除線
          if (box.strikethrough) {
            var tw = ctx.measureText(ns).width;
            var lx0 = bAlign === 'left' ? tx : bAlign === 'right' ? tx - tw : tx - tw / 2;
            var lw2 = Math.max(1, fs2 * 0.07);
            ctx.strokeStyle = tc; ctx.lineWidth = lw2; ctx.setLineDash([]);
            ctx.beginPath(); ctx.moveTo(lx0, ty - fs2 * 0.12); ctx.lineTo(lx0 + tw, ty - fs2 * 0.12); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(lx0, ty + fs2 * 0.08); ctx.lineTo(lx0 + tw, ty + fs2 * 0.08); ctx.stroke();
          }
          ctx.textBaseline = 'alphabetic';
        }
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      } else {
        if (box.isMask) {
          // 遮罩框：灰色虛線框，與價格框視覺區分
          ctx.strokeStyle = '#888'; ctx.lineWidth = lw; ctx.setLineDash([3/zoom, 3/zoom]);
          ctx.strokeRect(box.x, box.y, box.w, box.h);
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(120,120,120,0.10)';
          ctx.fillRect(box.x, box.y, box.w, box.h);
          ctx.fillStyle = '#888';
          ctx.font = Math.round(10 / zoom) + 'px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('遮罩', box.x + 2, box.y - 3 / zoom);
        } else {
          ctx.strokeStyle = bc; ctx.lineWidth = lw; ctx.setLineDash([]);
          ctx.strokeRect(box.x, box.y, box.w, box.h);
          ctx.fillStyle = Groups.hexAlpha(bc, 0.09);
          ctx.fillRect(box.x, box.y, box.w, box.h);
          ctx.fillStyle = bc;
          ctx.font = 'bold ' + Math.round(11 / zoom) + 'px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('#' + (i+1) + '  ' + box.value + '→' + nv, box.x + 2, box.y - 3 / zoom);
        }
      }
    }
    if (typeof Canvas.drawSelOverlays === 'function') Canvas.drawSelOverlays();
  }

  // ── PRICE LIST ──
  function toggleEditList() {
    var rp = document.getElementById('rp');
    rp.classList.toggle('open');
    var btn = document.getElementById('btnEditList');
    if (btn) btn.classList.toggle('active', rp.classList.contains('open'));
  }

  // ── TIPS PANEL ──
  var tipsOpen = false;
  function toggleTips() {
    tipsOpen = !tipsOpen;
    document.getElementById('tipsPanel').classList.toggle('open', tipsOpen);
    document.getElementById('btnTips').classList.toggle('active', tipsOpen);
    if (tipsOpen) {
      var isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform) || (navigator.userAgent.includes('Mac') && !navigator.userAgent.includes('Windows'));
      setTipsOS(isMac ? 'mac' : 'win');
    }
  }
  function setTipsOS(os) {
    document.querySelectorAll('.tips-mac').forEach(function(el) { el.style.display = os === 'mac' ? '' : 'none'; });
    document.querySelectorAll('.tips-win').forEach(function(el) { el.style.display = os === 'win' ? '' : 'none'; });
    document.getElementById('tipsMac').classList.toggle('active', os === 'mac');
    document.getElementById('tipsWin').classList.toggle('active', os === 'win');
  }
  // 點外部關閉 Tips
  document.addEventListener('click', function(e) {
    if (!tipsOpen) return;
    var panel = document.getElementById('tipsPanel');
    var btn = document.getElementById('btnTips');
    if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
      tipsOpen = false;
      panel.classList.remove('open');
      btn.classList.remove('active');
    }
  });

  function renderPriceList() {
    var cnt = boxes.filter(function(b) { return !b.isMask; }).length;
    document.getElementById('pcnt').textContent = cnt;
    var rpSub = document.getElementById('rpSub');
    if (rpSub) rpSub.textContent = '共 ' + cnt + ' 個價格框';
    var el = document.getElementById('plist');
    if (!cnt) {
      el.innerHTML = '<div style="text-align:center;padding:13px;color:var(--gmd);font-size:12px;">尚未框選任何價格</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b.isMask) continue; // 遮罩框不顯示在價格清單
      var nv = (b.newValue > 0) ? b.newValue : calcBoxPrice(b);
      var g = b.group ? Groups.getById(b.group) : null;
      var col = g ? g.color : '#C0392B';
      html += '<div class="pi" style="cursor:pointer" onclick="FloatPanel.openEdit(App.getBoxById(\'' + b.id + '\'))">';
      html += '<div class="dot" style="background:' + col + '"></div>';
      html += '<div class="info"><span class="val">' + b.value + '</span><span class="arr"> → </span>';
      html += '<span class="nval" style="color:' + col + '">' + nv + '</span>';
      html += '<span class="otag">' + (b.orient === 'vertical' ? '直' : '橫') + (g ? ' · ' + g.name : '') + '</span></div>';
      html += '<button class="delbtn" onclick="event.stopPropagation();App.deleteBox(\'' + b.id + '\')">';
      html += '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      html += '</button></div>';
    }
    el.innerHTML = html;
  }

  function addBox(box) {
    saveState();
    boxes.push(box);
    Canvas.setLastSize(box.w, box.h);
    renderPriceList();
    redraw();
  }

  // skipHistory=true 時跳過 saveState（拖曳結束時用，狀態已在 dragStart 時存入）
  function updateBox(id, changes, skipHistory) {
    if (!skipHistory) saveState();
    for (var i = 0; i < boxes.length; i++) {
      if (String(boxes[i].id) === String(id)) {
        Object.assign(boxes[i], changes);
        break;
      }
    }
    renderPriceList();
    redraw();
  }

  function getBoxById(id) {
    for (var i = 0; i < boxes.length; i++) {
      if (String(boxes[i].id) === String(id)) return boxes[i];
    }
    return null;
  }

  function deleteBox(id) {
    saveState();
    boxes = boxes.filter(function(b) { return String(b.id) !== String(id); });
    renderPriceList();
    redraw();
  }

  function clearAll() {
    if (!boxes.length) return;
    showCD('清除全部', '確定清除所有框選？', '取消', '清除', function() {
      saveState();
      boxes = [];
      renderPriceList();
      redraw();
    });
  }

  // ── PREVIEW ──
  function togglePreview() {
    previewMode = !previewMode;
    document.getElementById('tbPrev').classList.toggle('active', previewMode);
    redraw();
    setSt(previewMode ? '預覽模式：顯示修改後效果' : '框選模式：點擊拖拉框選價格位置');
  }

  // ── ORIENTATION ──
  function setOrient(o) {
    orientation = o;
    document.getElementById('oH').classList.toggle('active', o === 'horizontal');
    document.getElementById('oV').classList.toggle('active', o === 'vertical');
    document.getElementById('oA').classList.toggle('active', o === 'auto');
  }

  // ── EXPORT ──
  function exportImage() {
    var img = Canvas.getImage();
    if (!img) { alert('請先載入圖片'); return; }
    var mc = Canvas.getCanvas();
    var off = document.createElement('canvas');
    off.width = img.width; off.height = img.height;
    var oc = off.getContext('2d');
    oc.drawImage(img, 0, 0);
    var globalFont2 = document.getElementById('fontSel').value;
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var font = box.fontFamily || globalFont2;
      var nv = (box.newValue > 0) ? box.newValue : calcBoxPrice(box);

      // 遮罩框：只填色不印字
      if (box.isMask) {
        FillEngine.apply(oc, off, box, {
          fillMode: 'patch',
          patchSource: box.patchSource,
          feather: FillEngine.getFeather('patch')
        });
        continue;
      }
      // 使用 FillEngine 填色
      var bgColor = FillEngine.apply(oc, off, box, {
        fillMode: box.fillMode,
        patchSource: box.patchSource,
        feather: box.fillMode === 'patch' ? FillEngine.getFeather('patch') : FillEngine.getFeather('autofill')
      });

      // ── Plan A：優先用原圖墨水色 ──
      var tc;
      if (box.fontColor) {
        tc = box.fontColor;
      } else {
        var sampledInkEx = _sampleInkColor(box);
        if (sampledInkEx) {
          tc = sampledInkEx;
        } else {
          var r2, gv2, b2;
          if (bgColor && bgColor.r !== undefined) {
            r2 = bgColor.r; gv2 = bgColor.g; b2 = bgColor.b;
          } else {
            try {
              var sid = oc.getImageData(Math.max(0, box.x + 2), Math.max(0, box.y + 2), 4, 4);
              r2 = sid.data[0]; gv2 = sid.data[1]; b2 = sid.data[2];
            } catch(e) { r2 = 60; gv2 = 30; b2 = 20; }
          }
          var lum = r2 * 0.299 + gv2 * 0.587 + b2 * 0.114;
          tc = lum > 128 ? '#3D1A10' : '#FAF0E0';
        }
      }
      var _affix = box.priceAffix || (box.showYuan ? 'yuan' : 'none');
      var ns;
      switch (_affix) {
        case 'yuan':      ns = String(nv) + '元'; break;
        case 'yuan_sp':   ns = String(nv) + ' 元'; break;
        case 'dollar':    ns = '$' + String(nv); break;
        case 'dollar_sp': ns = '$ ' + String(nv); break;
        default:          ns = String(nv);
      }
      var bls2 = (box.letterSpacing || 0) + 'px';
      var bStyle2 = (box.bold ? 'bold ' : '') + (box.italic ? 'italic ' : '');
      var bAlign2 = box.textAlign || 'center';
      if ('letterSpacing' in oc) oc.letterSpacing = bls2;
      if (box.orient === 'vertical') {
        var ch = box.h / ns.length;
        var fs = box.fontSize > 0 ? box.fontSize : Math.min(ch * 0.88, box.w * 0.92);
        oc.font = bStyle2 + Math.round(fs) + "px '" + font + "',serif";
        oc.fillStyle = tc; oc.textAlign = bAlign2;
        var charX2 = bAlign2 === 'right' ? box.x + box.w - 3 : bAlign2 === 'left' ? box.x + 3 : box.x + box.w / 2;
        // Plan B：匯出也柔化
        if ('filter' in oc) oc.filter = 'blur(0.4px)';
        for (var ci = 0; ci < ns.length; ci++) {
          oc.fillText(ns[ci], charX2, box.y + ch * (ci + 0.8));
        }
        if ('filter' in oc) oc.filter = 'none';
      } else {
        var fs2 = box.fontSize > 0 ? box.fontSize : Math.min(box.h * 0.82, box.w / (ns.length * 0.6));
        oc.font = bStyle2 + Math.round(fs2) + "px '" + font + "',serif";
        var vAl2 = box.verticalAlign || 'middle';
        var ty2  = vAl2 === 'top' ? box.y + Math.round(fs2 * 0.82) : box.y + box.h / 2;
        oc.fillStyle = tc; oc.textBaseline = vAl2 === 'top' ? 'alphabetic' : 'middle';
        var tx2 = bAlign2 === 'left' ? box.x + 4 : bAlign2 === 'right' ? box.x + box.w - 4 : box.x + box.w / 2;
        oc.textAlign = bAlign2;
        fillAffixOverflow(oc, ns, tx2, box, bgColor);
        // Plan B：匯出也柔化
        if ('filter' in oc) oc.filter = 'blur(0.4px)';
        oc.fillText(ns, tx2, ty2);
        if ('filter' in oc) oc.filter = 'none';
        if (box.strikethrough) {
          var tw2 = oc.measureText(ns).width;
          var lx2 = bAlign2 === 'left' ? tx2 : bAlign2 === 'right' ? tx2 - tw2 : tx2 - tw2 / 2;
          var lw3 = Math.max(1, fs2 * 0.07);
          oc.strokeStyle = tc; oc.lineWidth = lw3; oc.setLineDash([]);
          oc.beginPath(); oc.moveTo(lx2, ty2 - fs2 * 0.12); oc.lineTo(lx2 + tw2, ty2 - fs2 * 0.12); oc.stroke();
          oc.beginPath(); oc.moveTo(lx2, ty2 + fs2 * 0.08); oc.lineTo(lx2 + tw2, ty2 + fs2 * 0.08); oc.stroke();
        }
        oc.textBaseline = 'alphabetic';
      }
      if ('letterSpacing' in oc) oc.letterSpacing = '0px';
    }
    // 如已套用 AI渲染，匯出時同樣處理邊緣融合
    if (enhancementApplied) {
      var origC3 = document.createElement('canvas');
      origC3.width = img.width; origC3.height = img.height;
      origC3.getContext('2d').drawImage(img, 0, 0);
      for (var ei = 0; ei < boxes.length; ei++) {
        blendBoxEdge(oc, off, origC3, boxes[ei]);
        addGrainToBox(oc, boxes[ei], origC3);
      }
    }
    var fmt = mc.dataset.fmt || 'png';
    var mm = { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
    var a = document.createElement('a');
    a.href = off.toDataURL(mm[fmt] || 'image/png', 0.95);
    a.download = (mc.dataset.name || 'menu').replace(/\.[^.]+$/, '') + '_adjusted.' + fmt;
    a.click();
    saveHist();
    setSt('已匯出：' + a.download);
  }

  // ── LIBRARY ──
  function saveToLib() {
    var img = Canvas.getImage();
    var mc = Canvas.getCanvas();
    if (!img) { alert('請先載入菜單圖片'); return; }
    if (!boxes.length) { alert('尚未框選任何價格'); return; }
    var result = Library.saveEntry(
      currentImgB64, img, boxes, Groups.getAll(),
      document.getElementById('fontSel').value,
      orientation,
      parseFloat(document.getElementById('pctIn').value) || 0,
      mc.dataset.fmt || 'png',
      mc.dataset.name || '未命名'
    );
    if (result.existing) {
      showCD('更新菜單', '「' + result.entry.name + '」已存在，要覆蓋更新嗎？', '取消', '更新', function() {
        Library.updateEntry(result.index, result.entry);
        setSt('菜單庫已更新：' + result.entry.name);
      });
    } else {
      setSt('已儲存至菜單庫：' + result.entry.name);
      showTab('lib');
    }
  }

  function loadFromLib(id) {
    var e = Library.getById(id);
    if (!e) return;
    if (e.font) document.getElementById('fontSel').value = e.font;
    if (e.orientation) setOrient(e.orientation);
    document.getElementById('pctIn').value = e.globalPct || 0;
    document.getElementById('pctBadge').textContent = ((e.globalPct || 0) >= 0 ? '+' : '') + (e.globalPct || 0) + '%';
    // restore groups
    var savedGroups = e.groups ? JSON.parse(JSON.stringify(e.groups)) : [];
    localStorage.setItem('mgrp', JSON.stringify(savedGroups));
    Groups.render(boxes);
    boxes = e.boxes ? JSON.parse(JSON.stringify(e.boxes)) : [];
    renderPriceList();
    Groups.renderChips(null);
    if (e.imgData) {
      currentImgB64 = e.imgData;
      var i = new Image();
      i.onload = function() {
        _origImgCanvas = null; _origImgCtx = null; // 清除舊圖快取
        Canvas.setImage(i);
        var mc = Canvas.getCanvas();
        mc.dataset.fmt = e.fmt || 'png';
        mc.dataset.name = e.name + '.' + e.fmt;
        document.getElementById('emptySt').style.display = 'none';
        document.getElementById('cc').style.display = 'block';
        document.getElementById('ulbl').textContent = e.name;
        Canvas.fitToWindow();
        redraw();
        setSt('已從菜單庫載入：' + e.name + '（含圖片）');
      };
      i.src = e.imgData;
    } else {
      setSt('已載入座標設定，請重新上傳原始圖片「' + e.name + '」');
      redraw();
    }
    showTab('edit');
  }

  function deleteFromLib(id) {
    var e = Library.getById(id);
    if (!e) return;
    showCD('刪除菜單', '確定從菜單庫刪除「' + e.name + '」？', '取消', '刪除', function() {
      Library.removeEntry(id);
      setSt('已刪除：' + e.name);
    });
  }

  // ── GROUPS ──
  function addGroup() {
    var nm = document.getElementById('newGrpName').value.trim();
    if (!nm) return;
    Groups.add(nm);
    document.getElementById('newGrpName').value = '';
    Groups.render(boxes);
    Groups.renderChips(FloatPanel.getGroup());
  }

  function deleteGroup(id) {
    showCD('刪除群組', '此群組的框選將改為套用全域商家抽成，確定刪除？', '取消', '確認刪除', function() {
      Groups.remove(id);
      for (var i = 0; i < boxes.length; i++) {
        if (boxes[i].group === id) boxes[i].group = null;
      }
      Groups.render(boxes);
      renderPriceList();
      redraw();
      Groups.renderChips(FloatPanel.getGroup());
    });
  }

  // ── JSON ──
  function saveJSON() {
    if (!boxes.length) { alert('尚未框選任何價格'); return; }
    var mc = Canvas.getCanvas();
    var d = {
      name: mc.dataset.name || '未命名',
      font: document.getElementById('fontSel').value,
      orientation: orientation,
      globalPct: parseFloat(document.getElementById('pctIn').value) || 0,
      groups: Groups.getAll(),
      boxes: boxes.map(function(b) { return Object.assign({}, b, { id: String(b.id) }); })
    };
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
    a.download = 'menu_coordinates.json';
    a.click();
    setSt('JSON 已匯出');
  }

  function handleJSONLoad(e) {
    var f = e.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function(ev) {
      try {
        var d = JSON.parse(ev.target.result);
        if (d.font) document.getElementById('fontSel').value = d.font;
        if (d.orientation) setOrient(d.orientation);
        if (d.globalPct !== undefined) {
          document.getElementById('pctIn').value = d.globalPct;
          document.getElementById('pctBadge').textContent = (d.globalPct >= 0 ? '+' : '') + d.globalPct + '%';
        }
        if (d.groups) {
          localStorage.setItem('mgrp', JSON.stringify(d.groups));
        }
        boxes = (d.boxes || []).map(function(b) { return Object.assign({}, b, { id: b.id || Date.now() + '' + Math.random() }); });
        Groups.render(boxes);
        renderPriceList();
        Groups.renderChips(null);
        redraw();
        setSt('已載入 JSON：' + boxes.length + ' 個座標');
      } catch(err) { alert('JSON 格式錯誤'); }
    };
    rd.readAsText(f);
  }

  // ── HISTORY ──
  function saveHist() {
    var mc = Canvas.getCanvas();
    var now = new Date();
    hist.unshift({
      name: mc.dataset.name || '未命名',
      date: now.toLocaleDateString('zh-TW'),
      time: now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      cnt: boxes.length
    });
    if (hist.length > 8) hist = hist.slice(0, 8);
    try { localStorage.setItem('mhist', JSON.stringify(hist)); } catch(e) {}
    renderHist();
  }

  function renderHist() {
    var el = document.getElementById('histList');
    if (!el) return; // histList 元素不存在時直接略過
    if (!hist.length) {
      el.innerHTML = '<div style="text-align:center;padding:10px;color:var(--gmd);font-size:12px;">尚無紀錄</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < Math.min(3, hist.length); i++) {
      var h = hist[i];
      var nm = h.name.length > 16 ? h.name.substring(0, 14) + '…' : h.name;
      html += '<div class="hi-item">';
      html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
      html += '<div><div class="hi-name">' + nm + '・' + h.cnt + '個框</div><div class="hi-time">' + h.date + ' ' + h.time + '</div></div>';
      html += '</div>';
    }
    el.innerHTML = html;
  }

  // ── CONFIRM DIALOG ──
  function showCD(title, desc, cancelTxt, okTxt, cb) {
    confirmCB = cb;
    document.getElementById('cdTitle').textContent = title;
    document.getElementById('cdDesc').textContent = desc;
    document.getElementById('cdCancel').textContent = cancelTxt;
    document.getElementById('cdOk').textContent = okTxt;
    document.getElementById('cdov').classList.add('open');
  }

  function closeCD(ok) {
    document.getElementById('cdov').classList.remove('open');
    if (ok && confirmCB) confirmCB();
    confirmCB = null;
  }

  // ── TABS ──
  function showTab(t) {
    ['edit', 'batch', 'lib'].forEach(function(k) {
      document.getElementById('tab-' + k).classList.toggle('active', k === t);
      document.getElementById('pane-' + k).classList.toggle('active', k === t);
    });
  }

  // ── SIDEBAR ──
  function toggleSB() {
    var sb = document.getElementById('sb');
    var isCol = sb.classList.toggle('col');
    setTimeout(function() { Canvas.fitToWindow(); }, 300);
  }

  // ── AI渲染：自動對齊偵測 + 掃描線動畫 + 邊緣融合 ──
  function enhanceQuality() {
    var img = Canvas.getImage();
    if (!img) { setSt('請先上傳菜單圖片'); return; }
    if (!boxes.length) { setSt('尚未設置任何價格框'); return; }

    var btn = document.getElementById('tbEnhance');
    if (btn) btn.disabled = true;

    // Force preview mode so alignment is visible
    if (!previewMode) {
      previewMode = true;
      var pb = document.getElementById('tbPrev');
      if (pb) pb.classList.add('active');
    }

    // Step 1：偵測垂直欄/水平列，自動套用靠右/靠上對齊
    detectColumnAlignment();

    // Step 2：重新繪製（帶新對齊方式；會同時重置 enhancementApplied flag）
    redraw();
    setSt('✨ AI渲染掃描中…');

    setTimeout(function() {
      var canvas = Canvas.getCanvas();
      var ctx    = Canvas.getCtx();
      var sortedBoxes = boxes.slice().sort(function(a, b) { return a.y - b.y; });

      var origC = document.createElement('canvas');
      origC.width = img.width; origC.height = img.height;
      origC.getContext('2d').drawImage(img, 0, 0);

      // ── 建立掃描線 overlay ──
      var cw = document.getElementById('cw');
      var cwRect    = cw.getBoundingClientRect();
      var canvasRect = canvas.getBoundingClientRect();
      var ctop  = (canvasRect.top  - cwRect.top)  + cw.scrollTop;
      var cleft = (canvasRect.left - cwRect.left) + cw.scrollLeft;
      var cdH = canvasRect.height;
      var cdW = canvasRect.width;

      var ov = document.createElement('div');
      ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:50;overflow:hidden;';
      var scanEl = document.createElement('div');
      scanEl.className = 'scan-line-el';
      scanEl.style.left  = cleft + 'px';
      scanEl.style.width = cdW   + 'px';
      scanEl.style.top   = ctop  + 'px';
      ov.appendChild(scanEl);
      cw.appendChild(ov);

      var DURATION  = 1200; // ms，掃描總時長
      var startTime = null;
      var done = {};

      function animFrame(ts) {
        if (!startTime) startTime = ts;
        var progress = Math.min((ts - startTime) / DURATION, 1);

        // 更新掃描線位置
        scanEl.style.top = (ctop + progress * cdH) + 'px';

        // 已掃到的 box 就進行邊緣融合
        var canvasY = progress * canvas.height;
        for (var i = 0; i < sortedBoxes.length; i++) {
          var box = sortedBoxes[i];
          if (!done[box.id] && (box.y + box.h * 0.5) <= canvasY) {
            done[box.id] = true;
            blendBoxEdge(ctx, canvas, origC, box);
            addGrainToBox(ctx, box, origC);
          }
        }

        if (progress < 1) {
          requestAnimationFrame(animFrame);
        } else {
          cw.removeChild(ov);
          enhancementApplied = true;
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>AI渲染';
            btn.classList.add('active');
          }
          setSt('✅ AI渲染完成 — 自動對齊 + 邊界融合已套用，匯出時同步生效');
        }
      }
      requestAnimationFrame(animFrame);
    }, 60);
  }

  // ── 自動對齊偵測：垂直欄→靠右，水平列→靠上 ──
  function detectColumnAlignment() {
    if (boxes.length < 2) return;
    var avgW = boxes.reduce(function(s,b){return s+b.w;},0)/boxes.length;
    var avgH = boxes.reduce(function(s,b){return s+b.h;},0)/boxes.length;
    var X_THRESH = Math.min(80, Math.max(20, avgW * 0.5));
    var Y_THRESH = Math.min(60, Math.max(15, avgH * 0.5));
    var MIN_GRP = 2;
    var inCol = {}, inRow = {};

    // 找垂直欄（center-X 相近）
    boxes.forEach(function(b) {
      if (inCol[b.id]) return;
      var cx = b.x + b.w / 2;
      var grp = boxes.filter(function(b2) { return Math.abs((b2.x + b2.w / 2) - cx) < X_THRESH; });
      if (grp.length >= MIN_GRP) grp.forEach(function(b2) { inCol[b2.id] = true; });
    });

    // 找水平列（center-Y 相近，且不在垂直欄內）
    boxes.forEach(function(b) {
      if (inRow[b.id] || inCol[b.id]) return;
      var cy = b.y + b.h / 2;
      var grp = boxes.filter(function(b2) { return !inCol[b2.id] && Math.abs((b2.y + b2.h / 2) - cy) < Y_THRESH; });
      if (grp.length >= MIN_GRP) grp.forEach(function(b2) { inRow[b2.id] = true; });
    });

    // 套用對齊
    boxes.forEach(function(box) {
      if (inCol[box.id])      { box.textAlign = 'right'; }
      else if (inRow[box.id]) { box.verticalAlign = 'top'; }
    });
  }

  // ── 顆粒/噪點效果：從原圖鄰近區域採樣真實紙張紋理並疊加 ──
  function addGrainToBox(ctx, box, origC) {
    var x = Math.round(box.x), y = Math.round(box.y);
    var w = Math.round(box.w), h = Math.round(box.h);
    if (w <= 2 || h <= 2) return;

    var origCtx2 = origC.getContext('2d');
    var imgW = origC.width, imgH = origC.height;

    // ── 從原圖周圍四個候選區域採樣，取標準差最高（紋理最豐富）的區域 ──
    var PAD = 4; // 間隔原盒邊緣幾像素再取樣
    var SW = Math.min(w, 80), SH = Math.min(h, 80); // 採樣塊最大 80×80
    var candidates = [
      // 上方
      { sx: x, sy: Math.max(0, y - SH - PAD), sw: Math.min(SW, w), sh: Math.min(SH, y - PAD) },
      // 下方
      { sx: x, sy: Math.min(imgH - 1, y + h + PAD), sw: Math.min(SW, w), sh: Math.min(SH, imgH - (y + h + PAD)) },
      // 左方
      { sx: Math.max(0, x - SW - PAD), sy: y, sw: Math.min(SW, x - PAD), sh: Math.min(SH, h) },
      // 右方
      { sx: Math.min(imgW - 1, x + w + PAD), sy: y, sw: Math.min(SW, imgW - (x + w + PAD)), sh: Math.min(SH, h) }
    ];

    var bestResiduals = null, bestStd = -1, bestW = 0, bestH = 0;
    for (var ci = 0; ci < candidates.length; ci++) {
      var c = candidates[ci];
      if (c.sw < 4 || c.sh < 4 || c.sx < 0 || c.sy < 0 || c.sx + c.sw > imgW || c.sy + c.sh > imgH) continue;
      var sd = origCtx2.getImageData(c.sx, c.sy, c.sw, c.sh).data;
      // 計算亮度均值
      var lsum = 0, cnt = c.sw * c.sh;
      var lvals = new Float32Array(cnt);
      for (var pi = 0; pi < cnt; pi++) {
        var L = 0.299 * sd[pi*4] + 0.587 * sd[pi*4+1] + 0.114 * sd[pi*4+2];
        lvals[pi] = L; lsum += L;
      }
      var lmean = lsum / cnt;
      // 計算標準差
      var vsum = 0;
      for (var pi2 = 0; pi2 < cnt; pi2++) { var d = lvals[pi2] - lmean; vsum += d * d; }
      var std = Math.sqrt(vsum / cnt);
      if (std > bestStd) {
        bestStd = std;
        bestW = c.sw; bestH = c.sh;
        // 計算殘差（紋理pattern = 亮度 - 均值）
        bestResiduals = new Float32Array(cnt);
        for (var pi3 = 0; pi3 < cnt; pi3++) { bestResiduals[pi3] = lvals[pi3] - lmean; }
      }
    }

    if (!bestResiduals || bestStd < 1.2) return; // 紋理不夠豐富時跳過

    // 縮放因子：讓輸出顆粒感適中
    var scale = Math.min(1.0, Math.max(0.3, 6.0 / bestStd));

    // ── 取樣填充色（用於判斷文字像素）──
    var sm2 = Math.max(3, Math.floor(Math.min(w, h) * 0.2));
    var cw2 = Math.max(1, w - sm2*2), ch2 = Math.max(1, h - sm2*2);
    var cd2 = ctx.getImageData(x + sm2, y + sm2, cw2, ch2).data;
    var rr2 = [], gg2 = [], bb2 = [];
    for (var ci2 = 0; ci2 < cd2.length; ci2 += 4) {
      rr2.push(cd2[ci2]); gg2.push(cd2[ci2+1]); bb2.push(cd2[ci2+2]);
    }
    rr2.sort(function(a,b){return a-b;}); gg2.sort(function(a,b){return a-b;}); bb2.sort(function(a,b){return a-b;});
    var mid2 = Math.floor(rr2.length / 2);
    var fillR2 = rr2[mid2]||220, fillG2 = gg2[mid2]||220, fillB2 = bb2[mid2]||220;

    // ── 將紋理殘差 tile 至填色區域 ──
    var bd2 = ctx.getImageData(x, y, w, h);
    var d2 = bd2.data;
    for (var py = 0; py < h; py++) {
      for (var px = 0; px < w; px++) {
        var idx = (py * w + px) * 4;
        // 判斷是否為文字像素（與填充色差異大）
        var dr2 = d2[idx]-fillR2, dg2 = d2[idx+1]-fillG2, db2 = d2[idx+2]-fillB2;
        var isText = (dr2*dr2 + dg2*dg2 + db2*db2) > 4500;
        var str = isText ? 0.30 : 1.0; // 文字像素保留 30% 紋理，背景 100%
        // tile 採樣位置
        var tx2 = px % bestW, ty2 = py % bestH;
        var n2 = bestResiduals[ty2 * bestW + tx2] * scale * str;
        d2[idx]   = Math.max(0, Math.min(255, (d2[idx]   + n2) | 0));
        d2[idx+1] = Math.max(0, Math.min(255, (d2[idx+1] + n2) | 0));
        d2[idx+2] = Math.max(0, Math.min(255, (d2[idx+2] + n2) | 0));
      }
    }
    ctx.putImageData(bd2, x, y);
  }

  // 核心像素融合：對單一 box 的邊緣做 smoothstep 融合（保護文字像素）
  function blendBoxEdge(ctx, canvas, origC, box) {
    var FEATHER = Math.min(14, Math.max(6, Math.round(Math.min(box.w, box.h) * 0.22)));
    var x = Math.round(box.x), y = Math.round(box.y);
    var w = Math.round(box.w), h = Math.round(box.h);
    if (w <= 2 || h <= 2) return;

    // 取涵蓋羽化帶的最大範圍
    var rx = Math.max(0, x - 1);
    var ry = Math.max(0, y - 1);
    var rw = Math.min(canvas.width - rx, w + 2);
    var rh = Math.min(canvas.height - ry, h + 2);
    if (rw <= 0 || rh <= 0) return;

    // 讀取合成後像素 & 原始像素
    var composite = ctx.getImageData(rx, ry, rw, rh);
    var origCtx   = origC.getContext('2d');
    var original  = origCtx.getImageData(rx, ry, rw, rh);
    var cd = composite.data;
    var od = original.data;

    // 從 box 中心安全帶取樣填充色（排除文字像素）
    var sm = Math.max(2, Math.min(FEATHER, Math.floor(Math.min(w, h) * 0.3)));
    var srx = Math.max(0, x - rx + sm), sry = Math.max(0, y - ry + sm);
    var srw = Math.max(1, w - sm * 2), srh = Math.max(1, h - sm * 2);
    var rArr = [], gArr = [], bArr = [];
    for (var sy = 0; sy < srh; sy++) {
      for (var sx = 0; sx < srw; sx++) {
        var si = ((sry + sy) * rw + (srx + sx)) * 4;
        var sl = 0.299 * cd[si] + 0.587 * cd[si+1] + 0.114 * cd[si+2];
        if (sl > 25 && sl < 238) {
          rArr.push(cd[si]); gArr.push(cd[si+1]); bArr.push(cd[si+2]);
        }
      }
    }
    rArr.sort(function(a,b){return a-b;});
    gArr.sort(function(a,b){return a-b;});
    bArr.sort(function(a,b){return a-b;});
    var mid = Math.floor(rArr.length / 2);
    var fillR = rArr[mid] !== undefined ? rArr[mid] : 220;
    var fillG = gArr[mid] !== undefined ? gArr[mid] : 220;
    var fillB = bArr[mid] !== undefined ? bArr[mid] : 220;

    // 對 box 邊緣 FEATHER px 內的背景像素做漸進融合
    for (var py = 0; py < rh; py++) {
      for (var px = 0; px < rw; px++) {
        var absX = rx + px, absY = ry + py;

        // 只處理 box 內部像素
        if (absX < x || absX >= x + w || absY < y || absY >= y + h) continue;

        // 到最近邊緣的距離
        var dL = absX - x, dR = (x + w - 1) - absX;
        var dT = absY - y, dB = (y + h - 1) - absY;
        var dist = Math.min(dL, dR, dT, dB);
        if (dist >= FEATHER) continue;   // 深入內部，不處理

        var pi = (py * rw + px) * 4;

        // 判斷是否為新文字像素（合成圖中）：色差過大則跳過
        var dr = cd[pi] - fillR, dg = cd[pi+1] - fillG, db = cd[pi+2] - fillB;
        if ((dr*dr + dg*dg + db*db) > 5000) continue;

        // 關鍵修正：若原始圖片該位置是深色文字，絕對不能融入（避免舊數字透出）
        var oDr = od[pi] - fillR, oDg = od[pi+1] - fillG, oDb = od[pi+2] - fillB;
        if ((oDr*oDr + oDg*oDg + oDb*oDb) > 3600) continue; // 原始像素是文字色 → 保持新覆蓋

        // Smoothstep：dist=0 時 keep=0（完全融入原始），dist=FEATHER 時 keep=1（完全保持）
        var t = dist / FEATHER;
        var keep = t * t * (3 - 2 * t);
        var mix  = 1 - keep;

        cd[pi]   = Math.round(cd[pi]   * keep + od[pi]   * mix) | 0;
        cd[pi+1] = Math.round(cd[pi+1] * keep + od[pi+1] * mix) | 0;
        cd[pi+2] = Math.round(cd[pi+2] * keep + od[pi+2] * mix) | 0;
      }
    }
    ctx.putImageData(composite, rx, ry);
  }

  // ── OCR 價格識別 ──
  var ocrWorker = null;
  var ocrReady = false;
  var ocrIniting = false;

  function initOcr() {
    if (ocrIniting || ocrReady || typeof Tesseract === 'undefined') return;
    ocrIniting = true;
    Tesseract.createWorker('eng', 1, { logger: function() {} })
      .then(function(w) {
        return w.setParameters({
          tessedit_char_whitelist: '0123456789',
          tessedit_pageseg_mode: '7'   // single text line
        }).then(function() {
          ocrWorker = w;
          ocrReady = true;
          setSt('OCR 識別引擎就緒 — 框選後將自動偵測數字');
          setTimeout(function() { setSt(''); }, 3000);
        });
      })
      .catch(function(e) {
        console.warn('OCR init failed:', e);
        ocrIniting = false;
      });
  }

  function detectPrice(bx, by, bw, bh, cb) {
    if (!ocrReady || !ocrWorker) { cb(null); return; }
    var canvas = Canvas.getCanvas();
    if (!canvas) { cb(null); return; }
    bx = Math.round(bx); by = Math.round(by);
    bw = Math.round(bw); bh = Math.round(bh);
    if (bw <= 0 || bh <= 0) { cb(null); return; }

    // Scale up for OCR accuracy
    var scale = Math.min(6, Math.max(2, 96 / Math.min(bw, bh)));
    var tmp = document.createElement('canvas');
    tmp.width  = Math.round(bw * scale);
    tmp.height = Math.round(bh * scale);
    var tCtx = tmp.getContext('2d');
    tCtx.imageSmoothingEnabled = false;
    tCtx.drawImage(canvas, bx, by, bw, bh, 0, 0, tmp.width, tmp.height);

    // Auto-invert if dark background (for light text on dark menus)
    var imgd = tCtx.getImageData(0, 0, tmp.width, tmp.height);
    var sum = 0;
    for (var i = 0; i < imgd.data.length; i += 4) sum += imgd.data[i];
    if (sum / (imgd.data.length / 4) < 128) {
      for (var j = 0; j < imgd.data.length; j += 4) {
        imgd.data[j]   = 255 - imgd.data[j];
        imgd.data[j+1] = 255 - imgd.data[j+1];
        imgd.data[j+2] = 255 - imgd.data[j+2];
      }
      tCtx.putImageData(imgd, 0, 0);
    }

    ocrWorker.recognize(tmp).then(function(result) {
      var digits = '';
      var CONF_THRESH = 65; // 低於此信心值視為非數字字元（元、$、¥ 等被強行對應的結果）
      // 優先使用逐字元信心度過濾：避免「元」被誤讀為「7」等情況
      var words = (result.data && result.data.words) ? result.data.words : [];
      for (var wi = 0; wi < words.length; wi++) {
        var syms = words[wi].symbols || [];
        for (var si = 0; si < syms.length; si++) {
          var sym = syms[si];
          if (/^[0-9]$/.test(sym.text) && sym.confidence >= CONF_THRESH) {
            digits += sym.text;
          }
        }
      }
      // 若 Tesseract 版本不提供 symbol 資料，退回純文字（去除非數字）
      if (!digits && result.data && result.data.text) {
        digits = result.data.text.replace(/[^0-9]/g, '');
      }
      var num = parseInt(digits, 10);
      if (num > 0 && num < 1000000) { cb(num); }
      else { cb(null); }
    }).catch(function() { cb(null); });
  }

  function isOcrReady() { return ocrReady; }

  // ── UTILS ──
  function getGlobalPct() { return parseFloat(document.getElementById('pctIn').value) || 0; }
  function getGlobalDeal() { return globalDeal; }
  function dealIsActive() { return isDealEnabled; }
  function commissionIsActive() { return isCommissionEnabled; }

  function getEffPct(box) {
    if (box.group) {
      var g = Groups.getById(box.group);
      if (g) return g.pct;
    }
    return getGlobalPct();
  }

  // ── 套用字樣至全部框 ──
  function applyFontToAll(settings) {
    saveState();
    var applyRounding = (settings.round5 !== undefined || settings.round10 !== undefined);
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (settings.fontFamily !== undefined)    b.fontFamily    = settings.fontFamily;
      if (settings.fontSize !== undefined)      b.fontSize      = settings.fontSize;
      if (settings.letterSpacing !== undefined) b.letterSpacing = settings.letterSpacing;
      if (settings.fontColor !== undefined)     b.fontColor     = settings.fontColor;
      if (settings.bold !== undefined)          b.bold          = settings.bold;
      if (settings.italic !== undefined)        b.italic        = settings.italic;
      if (settings.strikethrough !== undefined) b.strikethrough = settings.strikethrough;
      if (settings.textAlign !== undefined)     b.textAlign     = settings.textAlign;
      // 四捨五入：重新計算每個框的 newValue
      if (applyRounding && b.value > 0) {
        var nv = calcBoxPrice(b);
        if (settings.round5)  nv = Math.ceil(nv / 5) * 5;
        if (settings.round10) nv = Math.round(nv / 10) * 10;
        b.newValue = nv;
      }
    }
    redraw();
    renderPriceList();
    setSt('✅ 已將字樣設定套用至全部 ' + boxes.length + ' 個價格框');
  }

  function setSt(m) { document.getElementById('stTxt').textContent = m; }

  function getBoxes() { return boxes; }
  function isPreview() { return previewMode; }

  // ── 多選對齊（矩形位置對齊，非文字對齊）──
  function applyMultiAlign(align) {
    var ids = (typeof Canvas.getSelectedIds === 'function') ? Canvas.getSelectedIds() : [];
    if (!ids.length) return;
    saveState();

    var selBoxes = boxes.filter(function(b) { return ids.indexOf(b.id) >= 0; });
    if (!selBoxes.length) return;
    var minX = Infinity, maxRight = -Infinity;
    for (var i = 0; i < selBoxes.length; i++) {
      minX     = Math.min(minX,     selBoxes[i].x);
      maxRight = Math.max(maxRight, selBoxes[i].x + selBoxes[i].w);
    }
    var centerX = (minX + maxRight) / 2;

    for (var j = 0; j < boxes.length; j++) {
      if (ids.indexOf(boxes[j].id) < 0) continue;
      if (align === 'left')   boxes[j].x = minX;
      if (align === 'center') boxes[j].x = Math.round(centerX - boxes[j].w / 2);
      if (align === 'right')  boxes[j].x = maxRight - boxes[j].w;
    }

    var label = align === 'left' ? '靠左' : align === 'right' ? '靠右' : '置中';
    setSt('✅ 已將 ' + ids.length + ' 個價格框「' + label + '」對齊');

    // 對齊後清除選取，回到一般模式
    if (typeof Canvas.clearMultiSel === 'function') Canvas.clearMultiSel();
    // clearMultiSel calls App.redraw() internally, so no extra redraw needed
  }

  return {
    init: init,
    redraw: redraw,
    fastRedraw: fastRedraw,
    renderPriceList: renderPriceList,
    toggleEditList: toggleEditList,
    addBox: addBox,
    updateBox: updateBox,
    getBoxById: getBoxById,
    deleteBox: deleteBox,
    clearAll: clearAll,
    togglePreview: togglePreview,
    setOrient: setOrient,
    exportImage: exportImage,
    saveToLib: saveToLib,
    loadFromLib: loadFromLib,
    deleteFromLib: deleteFromLib,
    addGroup: addGroup,
    deleteGroup: deleteGroup,
    saveJSON: saveJSON,
    showCD: showCD,
    closeCD: closeCD,
    showTab: showTab,
    toggleSB: toggleSB,
    setSt: setSt,
    getBoxes: getBoxes,
    isPreview: isPreview,
    getEffPct: getEffPct,
    getGlobalPct: getGlobalPct,
    getGlobalDeal: getGlobalDeal,
    dealIsActive: dealIsActive,
    commissionIsActive: commissionIsActive,
    toggleTips: toggleTips,
    setTipsOS: setTipsOS,
    applyFontToAll: applyFontToAll,
    isOcrReady: isOcrReady,
    detectPrice: detectPrice,
    enhanceQuality: enhanceQuality,
    applyMultiAlign: applyMultiAlign,
    saveState: saveState,
    undo: undo,
    redo: redo,
    dragRedraw: dragRedraw,
    prepareDragBackground: prepareDragBackground,
    clearDragBackground: clearDragBackground
  };
})();
