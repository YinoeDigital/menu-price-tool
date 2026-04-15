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
  var SNAP = 8; // 吸附閾值（圖片像素）

  // ── 鍵盤狀態追蹤 ──
  var spaceHeld = false;

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
    cw.addEventListener('mousedown', function(e) {
      if (!document.getElementById('fp').classList.contains('open')) return;
      if (document.getElementById('fp').contains(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
      if (window.FloatPanel) FloatPanel.reqClose();
    }, true);
  }

  // ── 對齊輔助計算 ──
  function computeGuides(x, y, w, h) {
    var boxes = App.getBoxes();
    var bestDX = SNAP, bestDY = SNAP;
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

  // ── 滑鼠事件 ──
  function onMouseDown(e) {
    if (!img) return;
    // Ctrl + Space / Alt / 中鍵 → 平移（不受 float panel 影響）
    if ((e.ctrlKey && spaceHeld) || e.button === 1 || e.altKey) {
      isPanning = true;
      panSX = e.clientX; panSY = e.clientY;
      panOX = panX; panOY = panY;
      mc.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    var p = toCanvas(e.clientX, e.clientY);

    // ⌘ Command + 點擊既有矩形 → 拖曳移動模式
    if (e.metaKey) {
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

    if (document.getElementById('fp').classList.contains('open')) return;

    // 普通點擊：小移動 = 點擊編輯（mouseup 觸發），大移動 = 繪製新框
    startX = p.x; startY = p.y;
    drawing = true;
    curBox = { x: p.x, y: p.y, w: 0, h: 0 };
  }

  function onMouseMove(e) {
    if (!img) return;
    var p = toCanvas(e.clientX, e.clientY);
    var shiftHeld = e.shiftKey;

    // Ctrl + Space 游標（平移提示）
    if (e.ctrlKey && spaceHeld && !isPanning && !isDragging && !drawing) {
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
      if (e.ctrlKey && spaceHeld) { mc.style.cursor = 'grab'; return; }
      var overBox = false;
      var boxes = App.getBoxes();
      for (var bi = 0; bi < boxes.length; bi++) {
        var bx = boxes[bi];
        if (p.x >= bx.x && p.x <= bx.x + bx.w && p.y >= bx.y && p.y <= bx.y + bx.h) {
          overBox = true; break;
        }
      }
      if (e.metaKey) {
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
      ctx.strokeStyle = (shiftHeld && lastW > 0) ? '#2980B9' : '#C0392B';
      ctx.lineWidth = 2 / zoomLevel;
      ctx.setLineDash([5 / zoomLevel, 3 / zoomLevel]);
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
    if (isPanning) { isPanning = false; mc.style.cursor = (e.ctrlKey && spaceHeld) ? 'grab' : 'crosshair'; return; }

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
    if (isPanning && !isDragging) { isPanning = false; mc.style.cursor = (e.ctrlKey && spaceHeld) ? 'grab' : 'crosshair'; return; }
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
    }
  }

  function onWheel(e) {
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
    getLastSize: getLastSize
  };
})();
