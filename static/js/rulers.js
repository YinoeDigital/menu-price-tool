// rulers.js — 尺標 + 可拖曳參考線（貫穿整個畫布區 + 尺標刪除標記）

var Rulers = (function() {
  var RULER_SZ = 20;
  var MARKER_SZ = 7;    // 保留（未使用，備用）
  var THRESH_DEL = 12;  // 尺標上 hover 刪除的像素容忍度（配合較大的圓角矩形 badge）
  var guides = { h: [], v: [] }; // image-pixel coordinates
  var visible = true;
  var rulerH, rulerV, guideCanvas, guideCtx;
  var dragging = null;           // { type:'h'|'v', pos:null }
  var hoverRulerH = null;        // 目前 hover 到的 H ruler 上的 guide index（對應 guides.v）
  var hoverRulerV = null;        // 目前 hover 到的 V ruler 上的 guide index（對應 guides.h）

  function init() {
    rulerH = document.getElementById('rulerH');
    rulerV = document.getElementById('rulerV');
    guideCanvas = document.getElementById('guide-canvas');
    if (!rulerH || !rulerV || !guideCanvas) return;
    guideCtx = guideCanvas.getContext('2d');

    // 從尺標拖曳新參考線
    rulerH.addEventListener('mousedown', function(e) {
      // 若點在既有 guide 標記上 → 刪除而非新增
      var idx = getHoverVGuideIdx(e);
      if (idx !== null) {
        guides.v.splice(idx, 1);
        hoverRulerH = null;
        drawRulers(); drawGuides();
        e.preventDefault(); return;
      }
      dragging = { type: 'h', pos: null };
      e.preventDefault();
    });
    rulerV.addEventListener('mousedown', function(e) {
      var idx = getHoverHGuideIdx(e);
      if (idx !== null) {
        guides.h.splice(idx, 1);
        hoverRulerV = null;
        drawRulers(); drawGuides();
        e.preventDefault(); return;
      }
      dragging = { type: 'v', pos: null };
      e.preventDefault();
    });

    // 尺標 hover：顯示刪除 icon
    rulerH.addEventListener('mousemove', function(e) {
      var idx = getHoverVGuideIdx(e);
      hoverRulerH = idx;
      rulerH.style.cursor = (idx !== null) ? 'pointer' : 's-resize';
      drawRulers();
    });
    rulerH.addEventListener('mouseleave', function() {
      hoverRulerH = null; rulerH.style.cursor = '';
      drawRulers();
    });
    rulerV.addEventListener('mousemove', function(e) {
      var idx = getHoverHGuideIdx(e);
      hoverRulerV = idx;
      rulerV.style.cursor = (idx !== null) ? 'pointer' : 'e-resize';
      drawRulers();
    });
    rulerV.addEventListener('mouseleave', function() {
      hoverRulerV = null; rulerV.style.cursor = '';
      drawRulers();
    });

    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  }

  // 取得 rulerH（頂部橫尺標）上 hover 到的 V guide index
  function getHoverVGuideIdx(e) {
    var zoom = Canvas.getZoom();
    var cc = document.getElementById('cc');
    var cw = document.getElementById('cw');
    if (!cc || !cw) return null;
    var cwR = cw.getBoundingClientRect();
    var ccR = cc.getBoundingClientRect();
    var offX = ccR.left - cwR.left;
    var mouseX = e.clientX - rulerH.getBoundingClientRect().left;
    for (var j = 0; j < guides.v.length; j++) {
      var sx = offX + guides.v[j] * zoom;
      if (Math.abs(mouseX - sx) <= THRESH_DEL) return j;
    }
    return null;
  }

  // 取得 rulerV（左側直尺標）上 hover 到的 H guide index
  function getHoverHGuideIdx(e) {
    var zoom = Canvas.getZoom();
    var cc = document.getElementById('cc');
    var cw = document.getElementById('cw');
    if (!cc || !cw) return null;
    var cwR = cw.getBoundingClientRect();
    var ccR = cc.getBoundingClientRect();
    var offY = ccR.top - cwR.top;
    var mouseY = e.clientY - rulerV.getBoundingClientRect().top;
    for (var i = 0; i < guides.h.length; i++) {
      var sy = offY + guides.h[i] * zoom;
      if (Math.abs(mouseY - sy) <= THRESH_DEL) return i;
    }
    return null;
  }

  function onDragMove(e) {
    if (!dragging) return;
    var cc = document.getElementById('cc');
    if (!cc) return;
    var r = cc.getBoundingClientRect();
    var zoom = Canvas.getZoom();
    if (dragging.type === 'h') {
      dragging.pos = (e.clientY - r.top) / zoom;
    } else {
      dragging.pos = (e.clientX - r.left) / zoom;
    }
    drawGuides();
  }

  function onDragEnd(e) {
    if (!dragging) return;
    var placed = false;
    if (dragging.pos !== null) {
      var img = Canvas.getImage();
      if (img) {
        if (dragging.type === 'h' && dragging.pos >= 0 && dragging.pos <= img.height) {
          guides.h.push(dragging.pos);
          placed = true;
        } else if (dragging.type === 'v' && dragging.pos >= 0 && dragging.pos <= img.width) {
          guides.v.push(dragging.pos);
          placed = true;
        }
      }
    }
    // 若眼睛為關閉狀態且成功拉出新參考線，自動打開眼睛
    if (placed && !visible) {
      visible = true;
      if (guideCanvas) guideCanvas.style.display = '';
      var btn = document.getElementById('btnGuides');
      if (btn) { btn.classList.add('active'); btn.title = '隱藏參考線'; }
    }
    dragging = null;
    drawRulers();
    drawGuides();
  }

  // Called from canvas.js onMouseDown to delete guides on click
  function tryDeleteGuide(imgX, imgY) {
    if (!visible) return false;
    var THRESH = 6;
    for (var i = guides.h.length - 1; i >= 0; i--) {
      if (Math.abs(guides.h[i] - imgY) <= THRESH) {
        guides.h.splice(i, 1);
        drawRulers(); drawGuides();
        return true;
      }
    }
    for (var j = guides.v.length - 1; j >= 0; j--) {
      if (Math.abs(guides.v[j] - imgX) <= THRESH) {
        guides.v.splice(j, 1);
        drawRulers(); drawGuides();
        return true;
      }
    }
    return false;
  }

  // ── 繪製參考線：貫穿整個 .cw 畫布區域 ──
  function drawGuides() {
    if (!guideCanvas || !guideCtx) return;
    var img = Canvas.getImage();
    var cw = document.getElementById('cw');
    var cc = document.getElementById('cc');
    if (!cw || !cc) { guideCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height); return; }

    var cwR = cw.getBoundingClientRect();
    var ccR = cc.getBoundingClientRect();
    var cwW = Math.round(cwR.width);
    var cwH = Math.round(cwR.height);

    // 調整 canvas 尺寸符合 .cw
    if (guideCanvas.width !== cwW)  guideCanvas.width  = cwW;
    if (guideCanvas.height !== cwH) guideCanvas.height = cwH;

    guideCtx.clearRect(0, 0, cwW, cwH);
    if (!visible || !img) return;

    var zoom = Canvas.getZoom();
    var offX = ccR.left - cwR.left; // 圖片左邊緣在 .cw 中的 X
    var offY = ccR.top  - cwR.top;  // 圖片上邊緣在 .cw 中的 Y

    var allH = guides.h.slice();
    var allV = guides.v.slice();
    if (dragging && dragging.pos !== null) {
      if (dragging.type === 'h') allH.push(dragging.pos);
      else allV.push(dragging.pos);
    }

    guideCtx.strokeStyle = 'rgba(0,140,255,0.8)';
    guideCtx.lineWidth = 1;
    guideCtx.setLineDash([6, 4]);

    // 水平參考線（貫穿整個 cw 寬度）
    for (var i = 0; i < allH.length; i++) {
      var sy = offY + allH[i] * zoom;
      if (sy < 0 || sy > cwH) continue;
      guideCtx.beginPath();
      guideCtx.moveTo(0, sy);
      guideCtx.lineTo(cwW, sy);
      guideCtx.stroke();
    }
    // 垂直參考線（貫穿整個 cw 高度）
    for (var j = 0; j < allV.length; j++) {
      var sx = offX + allV[j] * zoom;
      if (sx < 0 || sx > cwW) continue;
      guideCtx.beginPath();
      guideCtx.moveTo(sx, 0);
      guideCtx.lineTo(sx, cwH);
      guideCtx.stroke();
    }
    guideCtx.setLineDash([]);
  }

  // ── 繪製尺標刻度 + guide 標記 ──
  function drawRulers() {
    if (!rulerH || !rulerV) return;
    var img = Canvas.getImage();
    var zoom = Canvas.getZoom();
    var cw = document.getElementById('cw');
    var cc = document.getElementById('cc');
    if (!cw || !cc) return;

    var cwR = cw.getBoundingClientRect();
    var ccR = cc.getBoundingClientRect();
    var offX = ccR.left - cwR.left;
    var offY = ccR.top  - cwR.top;

    // 調整尺標 canvas 大小
    rulerH.width  = Math.round(cwR.width);  rulerH.height = RULER_SZ;
    rulerV.width  = RULER_SZ; rulerV.height = Math.round(cwR.height);

    var hCtx = rulerH.getContext('2d');
    var vCtx = rulerV.getContext('2d');

    // 背景
    hCtx.fillStyle = '#ebebeb'; hCtx.fillRect(0, 0, rulerH.width, RULER_SZ);
    vCtx.fillStyle = '#ebebeb'; vCtx.fillRect(0, 0, RULER_SZ, rulerV.height);
    hCtx.strokeStyle = '#c0c0c0'; hCtx.lineWidth = 1;
    hCtx.beginPath(); hCtx.moveTo(0,RULER_SZ-1); hCtx.lineTo(rulerH.width,RULER_SZ-1); hCtx.stroke();
    vCtx.strokeStyle = '#c0c0c0'; vCtx.lineWidth = 1;
    vCtx.beginPath(); vCtx.moveTo(RULER_SZ-1,0); vCtx.lineTo(RULER_SZ-1,rulerV.height); vCtx.stroke();

    if (!img) return;

    var step = pickStep(zoom);
    var imgW = img.width, imgH = img.height;

    // 刻度
    hCtx.fillStyle = '#555'; hCtx.font = '9px sans-serif'; hCtx.textBaseline = 'top';
    hCtx.strokeStyle = '#999'; hCtx.lineWidth = 1;
    vCtx.fillStyle = '#555'; vCtx.font = '9px sans-serif'; vCtx.textBaseline = 'top';
    vCtx.strokeStyle = '#999'; vCtx.lineWidth = 1;

    for (var px = 0; px <= imgW; px += step) {
      var sx = offX + px * zoom;
      if (sx < 0 || sx > rulerH.width) continue;
      var isMajor = px % (step * 5) === 0;
      var th = isMajor ? 10 : 5;
      hCtx.beginPath(); hCtx.moveTo(sx, RULER_SZ - th); hCtx.lineTo(sx, RULER_SZ - 1); hCtx.stroke();
      if (isMajor && sx + 2 < rulerH.width) hCtx.fillText(px, sx + 2, 1);
    }
    for (var py = 0; py <= imgH; py += step) {
      var sy = offY + py * zoom;
      if (sy < 0 || sy > rulerV.height) continue;
      var isMajorY = py % (step * 5) === 0;
      var tvH = isMajorY ? 10 : 5;
      vCtx.beginPath(); vCtx.moveTo(RULER_SZ - tvH, sy); vCtx.lineTo(RULER_SZ - 1, sy); vCtx.stroke();
      if (isMajorY && sy + 2 < rulerV.height) {
        vCtx.save();
        vCtx.translate(RULER_SZ - 11, sy + 2);
        vCtx.rotate(-Math.PI / 2);
        vCtx.fillText(py, 0, 0);
        vCtx.restore();
      }
    }

    if (!visible) return;

    // ── 在尺標上繪製 guide 標記（三角形 + hover 時顯示 × ）──

    // 頂部橫尺標：顯示垂直線（guides.v）的標記
    for (var j = 0; j < guides.v.length; j++) {
      var gsx = offX + guides.v[j] * zoom;
      if (gsx < 0 || gsx > rulerH.width) continue;
      var isHovH = (hoverRulerH === j);
      drawRulerMarkerH(hCtx, gsx, isHovH);
    }

    // 左側直尺標：顯示水平線（guides.h）的標記
    for (var i = 0; i < guides.h.length; i++) {
      var gsy = offY + guides.h[i] * zoom;
      if (gsy < 0 || gsy > rulerV.height) continue;
      var isHovV = (hoverRulerV === i);
      drawRulerMarkerV(vCtx, gsy, isHovV);
    }
  }

  // 圓角矩形 helper
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // 橫尺標（頂部）：V guide 的刪除標記 — 圓角矩形浮於尺標與線條交接處
  function drawRulerMarkerH(ctx, x, isHover) {
    var BW = 18, BH = 16, BR = 4;
    var bx = x - BW / 2;
    var by = RULER_SZ - BH; // 貼齊尺標底部
    var color = isHover ? '#e74c3c' : '#3a8edf';

    ctx.save();
    // 陰影增加懸浮感
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;

    // 白底圓角矩形
    roundRect(ctx, bx, by, BW, BH, BR);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx, by, BW, BH, BR);
    ctx.stroke();

    // × icon
    var cx = x, cy = by + BH / 2;
    var r = 3.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke();
    ctx.restore();
  }

  // 直尺標（左側）：H guide 的刪除標記 — 圓角矩形浮於尺標與線條交接處
  function drawRulerMarkerV(ctx, y, isHover) {
    var BW = 16, BH = 18, BR = 4;
    var bx = RULER_SZ - BW; // 貼齊尺標右邊
    var by = y - BH / 2;
    var color = isHover ? '#e74c3c' : '#3a8edf';

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;

    // 白底圓角矩形
    roundRect(ctx, bx, by, BW, BH, BR);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx, by, BW, BH, BR);
    ctx.stroke();

    // × icon
    var cx = bx + BW / 2, cy = y;
    var r = 3.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke();
    ctx.restore();
  }

  function pickStep(zoom) {
    var steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] * zoom * 5 >= 25) return steps[i];
    }
    return 1000;
  }

  function toggle() {
    visible = !visible;
    var btn = document.getElementById('btnGuides');
    if (btn) {
      btn.classList.toggle('active', visible);
      btn.title = visible ? '隱藏參考線' : '顯示參考線';
    }
    if (guideCanvas) guideCanvas.style.display = visible ? '' : 'none';
    drawRulers();
    drawGuides();
  }

  function redraw() {
    drawRulers();
    drawGuides();
  }

  function clearAll() {
    guides.h = []; guides.v = [];
    drawRulers();
    drawGuides();
  }

  return { init: init, redraw: redraw, toggle: toggle, clearAll: clearAll, drawGuides: drawGuides, tryDeleteGuide: tryDeleteGuide };
})();
