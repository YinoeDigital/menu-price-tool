// canvas.js — Canvas 框選、縮放、平移、拖曳對齊

var Canvas = (function() {
  var mc, ctx, cc, cw;
  var img = null;
  var drawing = false;
  var startX = 0, startY = 0;
  var curBox = null;
  var zoomLevel = 1;
  var panX = 0, panY = 0;
  var isPanning = false;
  var panSX = 0, panSY = 0, panOX = 0, panOY = 0;
  var onBoxDraw = null;
  var lastW = 0, lastH = 0;

  // ── 拖曳狀態 ──
  var isDragging = false;
  var dragBox = null;
  var dragOffX = 0, dragOffY = 0;
  var dragOrigX = 0, dragOrigY = 0;
  var dragMoved = false;
  var SNAP_X = 8; // X 軸吸附閾值（左右對齊用，8px）
  var SNAP_Y = 2; // Y 軸吸附閾值（極小，避免意外垂直吸附）

  // ── 鍵盤狀態追蹤 ──
  var spaceHeld = false;

  // ── 多選模式 ──
  var capsMode = false;
  var isMultiSel = false;
  var selStartC = null, selEndC = null;
  var selectedIds = [];

  function init(canvasId, containerId, onDraw) {
    mc = document.getElementById(canvasId);
    ctx = mc.getContext('2d');
    cc = document.getElementById('cc');
    cw = document.getElementById(containerId);
    onBoxDraw = onDraw;
    bindEvents();
  }

  function bindEvents() {
    mc.addEventListener('mousedown', onMouseDown);
    mc.addEventListener('mousemove', onMouseMove);
    mc.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    cw.addEventListener('wheel', onWheel, { passive: false });

    // 追蹤 Space 鍵（排除在輸入框內）
    window.addEventListener('keydown', function(e) {
      if (e.code === 'Space') {
        var tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          spaceHeld = true;
          e.preventDefault(); // 防止頁面捲動
        }
      }
    });
    window.addEventListener('keyup', function(e) {
      if (e.code === 'Space') {
        spaceHeld = false;
        // 若拖曳中途放開空白鍵，重設游標
        if (!isDragging && mc) mc.style.cursor = 'crosshair';
      }
    });

    // CapsLock / 中英 → 多選模式切換（toggle）
    window.addEventListener('keydown', function(e) {
      if (e.code === 'CapsLock') {
        capsMode = !capsMode;
        if (mc) mc.style.cursor = capsMode ? 'cell' : 'crosshair';
        if (!capsMode) {
          clearMultiSel();
          if (typeof App !== 'undefined') App.setSt('');
        } else {
          if (typeof App !== 'undefined') App.setSt('🟢 多選模式（再按 CapsLock / 中英 退出，或按 Esc）');
        }
        e.preventDefault();
      }
      if (e.code === 'Escape') {
        // 優先關閉 FloatPanel（無論焦點在哪）
        var fp = document.getElementById('fp');
        if (fp && fp.classList.contains('open')) {
          if (typeof FloatPanel !== 'undefined') FloatPanel.reqClose();
          return;
        }
        // 退出多選模式
        if (capsMode || selectedIds.length) {
          capsMode = false;
          if (mc) mc.style.cursor = 'crosshair';
          clearMultiSel();
          if (typeof App !== 'undefined') App.setSt('');
        }
      }
    });
    cw.addEventListener('mousedown', function(e) {
      if (!document.getElementById('fp').classList.contains('open')) return;
      if (document.getElementById('fp').contains(e.target)) return;
      if (e.altKey) return; // Alt+拖曳移動框需要穿透到 canvas
      e.stopPropagation();
      e.preventDefault();
      if (window.FloatPanel) FloatPanel.nudgeButtons();
    }, true);
  }

  // ── 對齊輔助計算 ──
  function computeGuides(x, y, w, h) {
    var boxes = App.getBoxes();
    var bestDX = SNAP_X, bestDY = SNAP_Y;
    var snapX = null, snapY = null;
    var vLines = [], hLines = [];

    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (dragBox && b.id === dragBox.id) continue;
      var bx = b.x, by = b.y, bw = b.w, bh = b.h;

      // X 候選：[拖曳邊位置, 參考邊位置, 吸附後的 x]
      var xCands = [
        [x,       bx,        bx,        bx],          // 左←左
        [x,       bx + bw,   bx + bw,   bx + bw],     // 左←右
        [x + w,   bx,        bx,        bx - w],      // 右←左
        [x + w,   bx + bw,   bx + bw,   bx + bw - w], // 右←右
        [x + w/2, bx + bw/2, bx + bw/2, bx + bw/2 - w/2], // 中←中
      ];
      for (var xi = 0; xi < xCands.length; xi++) {
        var d = Math.abs(xCands[xi][0] - xCands[xi][1]);
        if (d < bestDX) {
          bestDX = d;
          snapX = xCands[xi][3];
          vLines = [xCands[xi][2]];
        }
      }

      // Y 候選
      var yCands = [
        [y,       by,        by,        by],
        [y,       by + bh,   by + bh,   by + bh],
        [y + h,   by,        by,        by - h],
        [y + h,   by + bh,   by + bh,   by + bh - h],
        [y + h/2, by + bh/2, by + bh/2, by + bh/2 - h/2],
      ];
      for (var yi = 0; yi < yCands.length; yi++) {
        var dy = Math.abs(yCands[yi][0] - yCands[yi][1]);
        if (dy < bestDY) {
          bestDY = dy;
          snapY = yCands[yi][3];
          hLines = [yCands[yi][2]];
        }
      }
    }
    // ── 尺標參考線吸附（H guide → Y 軸，V guide → X 軸）──
    var SNAP_GUIDE = 8;
    if (typeof Rulers !== 'undefined') {
      var rg = Rulers.getGuides();

      // V guides（垂直線）→ 吸附 X 軸
      for (var gi = 0; gi < rg.v.length; gi++) {
        var gv = rg.v[gi];
        var gxCands = [
          [x,       gv, gv - 0,   gv],         // 左←guide
          [x + w,   gv, gv,       gv - w],      // 右←guide
          [x + w/2, gv, gv,       gv - w/2],    // 中←guide
        ];
        for (var gxi = 0; gxi < gxCands.length; gxi++) {
          var dgx = Math.abs(gxCands[gxi][0] - gxCands[gxi][1]);
          if (dgx < SNAP_GUIDE && dgx < bestDX) {
            bestDX = dgx; snapX = gxCands[gxi][3]; vLines = [gxCands[gxi][2]];
          }
        }
      }

      // H guides（水平線）→ 吸附 Y 軸
      for (var gj = 0; gj < rg.h.length; gj++) {
        var gh = rg.h[gj];
        var gyCands = [
          [y,       gh, gh,       gh],          // 上←guide
          [y + h,   gh, gh,       gh - h],      // 下←guide
          [y + h/2, gh, gh,       gh - h/2],    // 中←guide
        ];
        for (var gyi = 0; gyi < gyCands.length; gyi++) {
          var dgy = Math.abs(gyCands[gyi][0] - gyCands[gyi][1]);
          if (dgy < SNAP_GUIDE && dgy < bestDY) {
            bestDY = dgy; snapY = gyCands[gyi][3]; hLines = [gyCands[gyi][2]];
          }
        }
      }
    }

    return { snapX: snapX, snapY: snapY, vLines: vLines, hLines: hLines };
  }

  function drawGuides(g) {
    if (!img) return;
    if (!g.vLines.length && !g.hLines.length) return;
    ctx.save();
    ctx.strokeStyle = '#2980B9';
    ctx.lineWidth = 1.5 / zoomLevel;
    ctx.setLineDash([6 / zoomLevel, 3 / zoomLevel]);
    ctx.globalAlpha = 0.85;
    for (var i = 0; i < g.vLines.length; i++) {
      ctx.beginPath();
      ctx.moveTo(g.vLines[i], 0);
      ctx.lineTo(g.vLines[i], img.height);
      ctx.stroke();
    }
    for (var j = 0; j < g.hLines.length; j++) {
      ctx.beginPath();
      ctx.moveTo(0, g.hLines[j]);
      ctx.lineTo(img.width, g.hLines[j]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── 多選模式輔助 ──
  function canvasToScreen(cx, cy) {
    var ccRect = cc.getBoundingClientRect();
    var cwRect = cw.getBoundingClientRect();
    return {
      x: (ccRect.left - cwRect.left) + cx * zoomLevel,
      y: (ccRect.top  - cwRect.top)  + cy * zoomLevel
    };
  }

  function drawMultiSelRect() {
    if (!selStartC || !selEndC) return;
    var x = Math.min(selStartC.x, selEndC.x);
    var y = Math.min(selStartC.y, selEndC.y);
    var w = Math.abs(selEndC.x - selStartC.x);
    var h = Math.abs(selEndC.y - selStartC.y);
    ctx.save();
    ctx.strokeStyle = '#27ae60';
    ctx.lineWidth = 2 / zoomLevel;
    ctx.setLineDash([6 / zoomLevel, 3 / zoomLevel]);
    ctx.globalAlpha = 0.9;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(39,174,96,0.08)';
    ctx.fillRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function showAlignBar(selX1, selY1, selX2, selY2) {
    var bar = document.getElementById('alignBar');
    if (!bar) return;
    var tr = canvasToScreen(selX2, selY1); // top-right corner of selection
    bar.style.left = (tr.x + 6) + 'px';
    bar.style.top  = tr.y + 'px';
    bar.style.display = 'flex';
  }

  function hideAlignBar() {
    var bar = document.getElementById('alignBar');
    if (bar) bar.style.display = 'none';
  }

  function clearMultiSel() {
    isMultiSel = false;
    selStartC  = null;
    selEndC    = null;
    selectedIds = [];
    hideAlignBar();
    if (img) App.redraw();
  }

  function drawSelOverlays() {
    if (!selectedIds.length || !img) return;
    var boxes = App.getBoxes();
    ctx.save();
    ctx.strokeStyle = '#27ae60';
    ctx.lineWidth = 2.5 / zoomLevel;
    ctx.setLineDash([]);
    for (var i = 0; i < boxes.length; i++) {
      if (selectedIds.indexOf(boxes[i].id) >= 0) {
        var b = boxes[i];
        ctx.strokeRect(b.x - 2 / zoomLevel, b.y - 2 / zoomLevel,
                       b.w + 4 / zoomLevel, b.h + 4 / zoomLevel);
      }
    }
    ctx.restore();
  }

  // ── 滑鼠事件 ──
  function onMouseDown(e) {
    if (!img) return;

    // CapsLock 多選模式 → 開始框選（Shift 鍵例外：優先執行「複製上次框大小」）
    if (capsMode && !e.shiftKey) {
      var p0 = toCanvas(e.clientX, e.clientY);
      isMultiSel = true;
      selStartC = { x: p0.x, y: p0.y };
      selEndC   = { x: p0.x, y: p0.y };
      selectedIds = [];
      hideAlignBar();
      e.preventDefault();
      return;
    }

    // Space / 中鍵 → 平移（不受 float panel 影響）
    if (spaceHeld || e.button === 1) {
      isPanning = true;
      panSX = e.clientX; panSY = e.clientY;
      panOX = panX; panOY = panY;
      mc.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    var p = toCanvas(e.clientX, e.clientY);

    // Alt / Option + 點擊既有矩形 → 拖曳移動模式
    if (e.altKey) {
      var boxes = App.getBoxes();
      for (var bi = boxes.length - 1; bi >= 0; bi--) {
        var bx = boxes[bi];
        if (p.x >= bx.x && p.x <= bx.x + bx.w && p.y >= bx.y && p.y <= bx.y + bx.h) {
          isDragging = true;
          dragBox = bx;
          dragOffX = p.x - bx.x;
          dragOffY = p.y - bx.y;
          dragOrigX = bx.x;
          dragOrigY = bx.y;
          dragMoved = false;
          mc.style.cursor = 'grabbing';
          e.preventDefault();
          return;
        }
      }
    }

    // Guide delete: click within threshold of a guide line
    if (typeof Rulers !== 'undefined' && !spaceHeld && !e.altKey) {
      if (Rulers.tryDeleteGuide(p.x, p.y)) { e.preventDefault(); return; }
    }

    if (document.getElementById('fp').classList.contains('open')) return;

    // 若紋理補丁模式但尚未設定來源 → 抖動提示，阻擋繪製
    if (typeof FillEngine !== 'undefined' &&
        FillEngine.getMode() === 'patch' &&
        !FillEngine.getPatchSource() &&
        !FillEngine.isPatchSelecting()) {
      App.setSt('⚠️ 請先點擊「點此選取來源」設定紋理補丁來源區域');
      var patchCard = document.getElementById('patch-hint');
      if (patchCard) {
        patchCard.classList.add('needs-source', 'shake');
        setTimeout(function() { patchCard.classList.remove('shake'); }, 500);
      }
      e.preventDefault();
      return;
    }

    // 普通點擊：小移動 = 點擊編輯（mouseup 觸發），大移動 = 繪製新框
    startX = p.x; startY = p.y;
    drawing = true;
    curBox = { x: p.x, y: p.y, w: 0, h: 0 };
  }

  function onMouseMove(e) {
    if (!img) return;
    var p = toCanvas(e.clientX, e.clientY);
    var shiftHeld = e.shiftKey;

    // CapsLock 多選模式 → 更新框選範圍（Shift 鍵時讓出給複製框大小）
    if (capsMode && isMultiSel && !e.shiftKey) {
      selEndC = { x: p.x, y: p.y };
      App.fastRedraw();
      drawSelOverlays();
      drawMultiSelRect();
      return;
    }

    // Space 游標（平移提示）
    if (spaceHeld && !isPanning && !isDragging && !drawing) {
      mc.style.cursor = 'grab';
    }

    // 平移中
    if (isPanning) {
      panX = panOX + (e.clientX - panSX);
      panY = panOY + (e.clientY - panSY);
      applyTransform();
      document.getElementById('coordTxt').textContent = 'x:' + Math.round(toCanvas(e.clientX, e.clientY).x) + ' y:' + Math.round(toCanvas(e.clientX, e.clientY).y);
      return;
    }

    // 拖曳中
    if (isDragging && dragBox) {
      var newX = p.x - dragOffX;
      var newY = p.y - dragOffY;

      // 計算對齊
      var g = computeGuides(newX, newY, dragBox.w, dragBox.h);
      if (g.snapX !== null) newX = g.snapX;
      if (g.snapY !== null) newY = g.snapY;

      dragBox.x = newX;
      dragBox.y = newY;
      dragMoved = true;

      App.fastRedraw();
      drawGuides(g);
      document.getElementById('coordTxt').textContent =
        'x:' + Math.round(newX) + ' y:' + Math.round(newY);
      return;
    }

    if (!drawing) {
      if (spaceHeld) { mc.style.cursor = 'grab'; return; }
      var overBox = false;
      var boxes = App.getBoxes();
      for (var bi = 0; bi < boxes.length; bi++) {
        var bx = boxes[bi];
        if (p.x >= bx.x && p.x <= bx.x + bx.w && p.y >= bx.y && p.y <= bx.y + bx.h) {
          overBox = true; break;
        }
      }
      if (e.altKey) {
        mc.style.cursor = overBox ? 'move' : 'crosshair';
      } else {
        mc.style.cursor = overBox ? 'pointer' : 'crosshair';
      }

      if (shiftHeld && lastW > 0) {
        document.getElementById('coordTxt').textContent = '⇧ Shift：複製上次尺寸 ' + lastW + '×' + lastH + ' px';
      } else {
        document.getElementById('coordTxt').textContent = 'x:' + Math.round(p.x) + ' y:' + Math.round(p.y);
      }
      return;
    }

    document.getElementById('coordTxt').textContent = 'x:' + Math.round(p.x) + ' y:' + Math.round(p.y);

    if (isPanning) {
      panX = panOX + (e.clientX - panSX);
      panY = panOY + (e.clientY - panSY);
      applyTransform();
      return;
    }

    if (shiftHeld && lastW > 0 && lastH > 0) {
      curBox.w = lastW;
      curBox.h = lastH;
    } else {
      curBox.w = p.x - startX;
      curBox.h = p.y - startY;
    }
    App.redraw();
    if (curBox.w !== 0 && curBox.h !== 0) {
      var isPatchSel = typeof FillEngine !== 'undefined' && FillEngine.isPatchSelecting();
      if (isPatchSel) {
        // 黑色框：來源選取模式（與紅色價格框做出區別）
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 2 / zoomLevel;
        ctx.setLineDash([6 / zoomLevel, 4 / zoomLevel]);
      } else if (shiftHeld && lastW > 0) {
        ctx.strokeStyle = '#2980B9';
        ctx.lineWidth = 2 / zoomLevel;
        ctx.setLineDash([5 / zoomLevel, 3 / zoomLevel]);
      } else {
        ctx.strokeStyle = '#C0392B';
        ctx.lineWidth = 2 / zoomLevel;
        ctx.setLineDash([5 / zoomLevel, 3 / zoomLevel]);
      }
      ctx.strokeRect(curBox.x, curBox.y, curBox.w, curBox.h);
      ctx.setLineDash([]);
    }
  }

  // window 層級的 mousemove：讓拖曳超出 canvas 也能追蹤
  function onWindowMouseMove(e) {
    // 處理 shift pan 超出 canvas
    if (isPanning && !isDragging) {
      panX = panOX + (e.clientX - panSX);
      panY = panOY + (e.clientY - panSY);
      applyTransform();
      return;
    }
    // CapsLock 多選模式（超出 canvas 也能追蹤，Shift 時讓出）
    if (capsMode && isMultiSel && img && !(e.shiftKey)) {
      var pc = toCanvas(e.clientX, e.clientY);
      selEndC = { x: pc.x, y: pc.y };
      App.fastRedraw();
      drawSelOverlays();
      drawMultiSelRect();
      return;
    }
    if (!isDragging || !dragBox || !img) return;
    var p = toCanvas(e.clientX, e.clientY);
    var newX = p.x - dragOffX;
    var newY = p.y - dragOffY;
    var g = computeGuides(newX, newY, dragBox.w, dragBox.h);
    if (g.snapX !== null) newX = g.snapX;
    if (g.snapY !== null) newY = g.snapY;
    dragBox.x = newX;
    dragBox.y = newY;
    dragMoved = true;
    App.fastRedraw();
    drawGuides(g);
  }

  function onMouseUp(e) {
    if (isPanning) { isPanning = false; mc.style.cursor = spaceHeld ? 'grab' : 'crosshair'; return; }

    // CapsLock 多選結束 → 計算選中框
    if (capsMode && isMultiSel) {
      isMultiSel = false;
      if (selStartC && selEndC) {
        var sx = Math.min(selStartC.x, selEndC.x);
        var sy = Math.min(selStartC.y, selEndC.y);
        var sw = Math.abs(selEndC.x - selStartC.x);
        var sh = Math.abs(selEndC.y - selStartC.y);
        if (sw >= 4 && sh >= 4) {
          // 拖曳夠大 → 框選多選
          var allBoxes = App.getBoxes();
          selectedIds = [];
          for (var si = 0; si < allBoxes.length; si++) {
            var sb = allBoxes[si];
            if (sb.x < sx + sw && sb.x + sb.w > sx &&
                sb.y < sy + sh && sb.y + sb.h > sy) {
              selectedIds.push(sb.id);
            }
          }
          App.fastRedraw();
          drawSelOverlays();
          if (selectedIds.length > 0) showAlignBar(sx, sy, sx + sw, sy + sh);
        } else {
          // 小移動（點擊）→ 嘗試開啟編輯面板，行為同一般點擊
          App.redraw();
          var clickBoxes = App.getBoxes();
          var cx = selStartC ? selStartC.x : sx;
          var cy = selStartC ? selStartC.y : sy;
          for (var ci2 = clickBoxes.length - 1; ci2 >= 0; ci2--) {
            var cb = clickBoxes[ci2];
            if (cx >= cb.x && cx <= cb.x + cb.w && cy >= cb.y && cy <= cb.y + cb.h) {
              FloatPanel.openEdit(cb);
              return;
            }
          }
        }
      }
      return;
    }

    // 拖曳結束
    if (isDragging) {
      isDragging = false;
      mc.style.cursor = 'grab';
      if (!dragMoved) {
        // 沒有移動 → 視為點擊，還原位置並開啟編輯
        dragBox.x = dragOrigX;
        dragBox.y = dragOrigY;
        App.redraw();
        FloatPanel.openEdit(dragBox);
      } else {
        // 有移動 → 更新位置
        App.updateBox(dragBox.id, { x: dragBox.x, y: dragBox.y });
      }
      dragBox = null;
      return;
    }

    if (!drawing || !img) return;
    drawing = false;
    var w = Math.abs(curBox.w);
    var h = Math.abs(curBox.h);
    var x = curBox.w < 0 ? curBox.x + curBox.w : curBox.x;
    var y = curBox.h < 0 ? curBox.y + curBox.h : curBox.y;
    curBox = null;

    if (w < 6 || h < 6) {
      App.redraw();
      // 小移動 = 點擊，嘗試開啟編輯
      var p2 = toCanvas(e.clientX, e.clientY);
      var boxes2 = App.getBoxes();
      for (var bi2 = boxes2.length - 1; bi2 >= 0; bi2--) {
        var bx2 = boxes2[bi2];
        if (p2.x >= bx2.x && p2.x <= bx2.x + bx2.w && p2.y >= bx2.y && p2.y <= bx2.y + bx2.h) {
          FloatPanel.openEdit(bx2);
          return;
        }
      }
      return;
    }

    // 補丁模式
    if (typeof FillEngine !== 'undefined' && FillEngine.getMode() === 'patch' && FillEngine.isPatchSelecting()) {
      FillEngine.setPatchSource({ x: x, y: y, w: w, h: h });
      App.redraw();
      return;
    }

    if (onBoxDraw) onBoxDraw(x, y, w, h);
  }

  function onWindowMouseUp(e) {
    if (isPanning && !isDragging) { isPanning = false; mc.style.cursor = spaceHeld ? 'grab' : 'crosshair'; return; }

    // CapsLock 多選（滑鼠在 canvas 外釋放）
    if (capsMode && isMultiSel) {
      isMultiSel = false;
      if (selStartC && selEndC) {
        var sx = Math.min(selStartC.x, selEndC.x);
        var sy = Math.min(selStartC.y, selEndC.y);
        var sw = Math.abs(selEndC.x - selStartC.x);
        var sh = Math.abs(selEndC.y - selStartC.y);
        if (sw >= 4 && sh >= 4) {
          // 拖曳夠大 → 框選多選
          var allBoxes = App.getBoxes();
          selectedIds = [];
          for (var si = 0; si < allBoxes.length; si++) {
            var sb = allBoxes[si];
            if (sb.x < sx + sw && sb.x + sb.w > sx &&
                sb.y < sy + sh && sb.y + sb.h > sy) {
              selectedIds.push(sb.id);
            }
          }
          App.fastRedraw();
          drawSelOverlays();
          if (selectedIds.length > 0) showAlignBar(sx, sy, sx + sw, sy + sh);
        } else {
          // 小移動（點擊）→ 嘗試開啟編輯面板
          App.redraw();
          var clickBoxes2 = App.getBoxes();
          var cx2 = selStartC ? selStartC.x : sx;
          var cy2 = selStartC ? selStartC.y : sy;
          for (var ci3 = clickBoxes2.length - 1; ci3 >= 0; ci3--) {
            var cb2 = clickBoxes2[ci3];
            if (cx2 >= cb2.x && cx2 <= cb2.x + cb2.w && cy2 >= cb2.y && cy2 <= cb2.y + cb2.h) {
              FloatPanel.openEdit(cb2);
              return;
            }
          }
        }
      }
      return;
    }

    if (isDragging) {
      isDragging = false;
      mc.style.cursor = 'grab';
      if (!dragMoved) {
        dragBox.x = dragOrigX;
        dragBox.y = dragOrigY;
        App.redraw();
        FloatPanel.openEdit(dragBox);
      } else {
        App.updateBox(dragBox.id, { x: dragBox.x, y: dragBox.y });
      }
      dragBox = null;
      return;
    }
    // 滑鼠在 canvas 外釋放時，同樣要結束繪製流程
    // 否則 drawing / patchSelecting 狀態會卡住，導致下次拖拉行為異常
    if (drawing && img && curBox) {
      drawing = false;
      var w = Math.abs(curBox.w);
      var h = Math.abs(curBox.h);
      var x = curBox.w < 0 ? curBox.x + curBox.w : curBox.x;
      var y = curBox.h < 0 ? curBox.y + curBox.h : curBox.y;
      curBox = null;
      if (w >= 6 && h >= 6) {
        if (typeof FillEngine !== 'undefined' && FillEngine.getMode() === 'patch' && FillEngine.isPatchSelecting()) {
          FillEngine.setPatchSource({ x: x, y: y, w: w, h: h });
          App.redraw();
        } else if (!document.getElementById('fp').classList.contains('open')) {
          if (onBoxDraw) onBoxDraw(x, y, w, h);
        }
      } else {
        App.redraw();
      }
    }
  }

  function onWheel(e) {
    // 若滾輪發生在 fp 面板內，直接略過（不縮放畫布）
    var fpEl = document.getElementById('fp');
    if (fpEl && fpEl.contains(e.target)) return;
    e.preventDefault();
    var r = cw.getBoundingClientRect();
    var mx = e.clientX - r.left;
    var my = e.clientY - r.top;
    var prev = zoomLevel;
    var d = e.deltaY < 0 ? 0.1 : -0.1;
    zoomLevel = Math.min(4, Math.max(0.15, zoomLevel + d));
    panX = mx - (mx - panX) * (zoomLevel / prev);
    panY = my - (my - panY) * (zoomLevel / prev);
    applyTransform();
    updateZoomVal();
  }

  function toCanvas(sx, sy) {
    var r = cc.getBoundingClientRect();
    return { x: (sx - r.left) / zoomLevel, y: (sy - r.top) / zoomLevel };
  }

  function applyTransform() {
    cc.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoomLevel + ')';
    cc.style.transformOrigin = '0 0';
    if (typeof Rulers !== 'undefined') Rulers.redraw();
  }

  function updateZoomVal() {
    document.getElementById('zoomVal').textContent = Math.round(zoomLevel * 100) + '%';
  }

  function fitToWindow() {
    if (!img) return;
    var W = cw.clientWidth - 48;
    var H = cw.clientHeight - 48;
    zoomLevel = Math.min(1, W / img.width, H / img.height);
    panX = Math.max(0, (cw.clientWidth - img.width * zoomLevel) / 2);
    panY = Math.max(0, (cw.clientHeight - img.height * zoomLevel) / 2);
    applyTransform();
    updateZoomVal();
    if (typeof Rulers !== 'undefined') Rulers.redraw();
  }

  function zoom(delta) {
    var prev = zoomLevel;
    zoomLevel = Math.min(4, Math.max(0.15, zoomLevel + delta));
    var cx = cw.clientWidth / 2;
    var cy = cw.clientHeight / 2;
    panX = cx - (cx - panX) * (zoomLevel / prev);
    panY = cy - (cy - panY) * (zoomLevel / prev);
    applyTransform();
    updateZoomVal();
  }

  function resetZoom() { fitToWindow(); }

  function setImage(imgObj) {
    img = imgObj;
    mc.width = imgObj.width;
    mc.height = imgObj.height;
  }

  function setLastSize(w, h) { lastW = Math.round(w); lastH = Math.round(h); }
  function getLastSize() { return { w: lastW, h: lastH }; }
  function getCtx() { return ctx; }
  function getCanvas() { return mc; }
  function getImage() { return img; }
  function getZoom() { return zoomLevel; }
  function getPendingBox() { return curBox; }

  return {
    init: init,
    fitToWindow: fitToWindow,
    zoom: zoom,
    resetZoom: resetZoom,
    setImage: setImage,
    getCtx: getCtx,
    getCanvas: getCanvas,
    getImage: getImage,
    getZoom: getZoom,
    setLastSize: setLastSize,
    getLastSize: getLastSize,
    drawSelOverlays: drawSelOverlays,
    getSelectedIds: function() { return selectedIds.slice(); },
    clearMultiSel: clearMultiSel,
    isCapsMode: function() { return capsMode; }
  };
})();
