// rulers.js — 尺標 + 可拖曳參考線

var Rulers = (function() {
  var RULER_SZ   = 20;
  var BADGE_W    = 20;   // 刪除 badge 寬
  var BADGE_H    = 18;   // 刪除 badge 高
  var BADGE_R    = 4;    // 圓角半徑
  var BADGE_EDGE = 4;    // badge 距 .cw 邊緣的像素數
  var THRESH_DEL = 12;   // canvas 上點擊刪除的容忍度

  var guides     = { h: [], v: [] }; // image-pixel 座標
  var visible    = true;
  var rulerH, rulerV, guideCanvas, guideCtx;
  var dragging   = null; // { type:'h'|'v', pos:null }
  var hoverBadge = null; // { type:'h'|'v', idx:N } 目前 hover 的 badge

  // ── 多選框選 rect（繪於 guide-canvas，螢幕座標）──
  var _selRect = null; // { startC, endC, fn } in canvas coords

  // ── 初始化 ──────────────────────────────────────────────────────
  function init() {
    rulerH      = document.getElementById('rulerH');
    rulerV      = document.getElementById('rulerV');
    guideCanvas = document.getElementById('guide-canvas');
    if (!rulerH || !rulerV || !guideCanvas) return;
    guideCtx = guideCanvas.getContext('2d');

    // 從尺標拖出新參考線
    rulerH.addEventListener('mousedown', function(e) {
      dragging = { type: 'h', pos: null };
      e.preventDefault();
    });
    rulerV.addEventListener('mousedown', function(e) {
      dragging = { type: 'v', pos: null };
      e.preventDefault();
    });

    // .cw 上偵測 badge hover → 動態切換 pointer-events
    var cw = document.getElementById('cw');
    if (cw) {
      cw.addEventListener('mousemove', onCwMouseMove);
      cw.addEventListener('mouseleave', onCwMouseLeave);
    }

    // guide canvas（pointer-events 由 hover 動態切換）
    guideCanvas.addEventListener('click', onGuideBadgeClick);

    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup',   onDragEnd);
  }

  // ── badge hit-test（回傳 {type,idx} 或 null）──────────────────
  function findBadgeAt(clientX, clientY) {
    if (!visible) return null;
    var cw = document.getElementById('cw');
    var cc = document.getElementById('cc');
    if (!cw || !cc) return null;
    var cwR = cw.getBoundingClientRect();
    var ccR = cc.getBoundingClientRect();
    var zoom = Canvas.getZoom();
    var offX = ccR.left - cwR.left;
    var offY = ccR.top  - cwR.top;
    var mx = clientX - cwR.left;
    var my = clientY - cwR.top;

    // H guide badge：左邊緣，badge X = BADGE_EDGE，Y 對齊 guide
    for (var i = 0; i < guides.h.length; i++) {
      var sy = offY + guides.h[i] * zoom;
      if (mx >= BADGE_EDGE && mx <= BADGE_EDGE + BADGE_W &&
          my >= sy - BADGE_H / 2 && my <= sy + BADGE_H / 2) {
        return { type: 'h', idx: i };
      }
    }
    // V guide badge：上邊緣，badge Y = BADGE_EDGE，X 對齊 guide
    for (var j = 0; j < guides.v.length; j++) {
      var sx = offX + guides.v[j] * zoom;
      if (my >= BADGE_EDGE && my <= BADGE_EDGE + BADGE_H &&
          mx >= sx - BADGE_W / 2 && mx <= sx + BADGE_W / 2) {
        return { type: 'v', idx: j };
      }
    }
    return null;
  }

  // ── .cw mousemove：切換 pointer-events ──────────────────────────
  function onCwMouseMove(e) {
    var badge = findBadgeAt(e.clientX, e.clientY);
    var changed = (JSON.stringify(badge) !== JSON.stringify(hoverBadge));
    hoverBadge = badge;
    if (badge) {
      guideCanvas.style.pointerEvents = 'auto';
      guideCanvas.style.cursor = 'pointer';
    } else {
      guideCanvas.style.pointerEvents = 'none';
      guideCanvas.style.cursor = '';
    }
    if (changed) drawGuides();
  }

  function onCwMouseLeave() {
    if (hoverBadge) { hoverBadge = null; drawGuides(); }
    guideCanvas.style.pointerEvents = 'none';
    guideCanvas.style.cursor = '';
  }

  // ── guide canvas click：刪除 badge 對應的參考線 ─────────────────
  function onGuideBadgeClick(e) {
    var badge = findBadgeAt(e.clientX, e.clientY);
    if (!badge) return;
    if (badge.type === 'h') guides.h.splice(badge.idx, 1);
    else                    guides.v.splice(badge.idx, 1);
    hoverBadge = null;
    guideCanvas.style.pointerEvents = 'none';
    drawRulers();
    drawGuides();
    e.stopPropagation();
  }

  // ── 拖曳移動 ────────────────────────────────────────────────────
  function onDragMove(e) {
    if (!dragging) return;
    var cc = document.getElementById('cc');
    if (!cc) return;
    var r    = cc.getBoundingClientRect();
    var zoom = Canvas.getZoom();
    dragging.pos = dragging.type === 'h'
      ? (e.clientY - r.top)  / zoom
      : (e.clientX - r.left) / zoom;
    drawGuides();
  }

  function onDragEnd(e) {
    if (!dragging) return;
    var placed = false;
    if (dragging.pos !== null) {
      var img = Canvas.getImage();
      if (img) {
        if (dragging.type === 'h' && dragging.pos >= 0 && dragging.pos <= img.height) {
          guides.h.push(dragging.pos); placed = true;
        } else if (dragging.type === 'v' && dragging.pos >= 0 && dragging.pos <= img.width) {
          guides.v.push(dragging.pos); placed = true;
        }
      }
    }
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

  // ── canvas 上點擊刪除（從 canvas.js 呼叫）──────────────────────
  function tryDeleteGuide(imgX, imgY) {
    if (!visible) return false;
    for (var i = guides.h.length - 1; i >= 0; i--) {
      if (Math.abs(guides.h[i] - imgY) <= THRESH_DEL) {
        guides.h.splice(i, 1); drawRulers(); drawGuides(); return true;
      }
    }
    for (var j = guides.v.length - 1; j >= 0; j--) {
      if (Math.abs(guides.v[j] - imgX) <= THRESH_DEL) {
        guides.v.splice(j, 1); drawRulers(); drawGuides(); return true;
      }
    }
    return false;
  }

  // ── 繪製參考線 + badge（在 .cw 層級）───────────────────────────
  function drawGuides() {
    if (!guideCanvas || !guideCtx) return;
    var img = Canvas.getImage();
    var cw  = document.getElementById('cw');
    var cc  = document.getElementById('cc');
    if (!cw || !cc) { guideCtx.clearRect(0,0,guideCanvas.width,guideCanvas.height); return; }

    var cwR  = cw.getBoundingClientRect();
    var ccR  = cc.getBoundingClientRect();
    var cwW  = Math.round(cwR.width);
    var cwH  = Math.round(cwR.height);
    if (guideCanvas.width  !== cwW) guideCanvas.width  = cwW;
    if (guideCanvas.height !== cwH) guideCanvas.height = cwH;
    guideCtx.clearRect(0, 0, cwW, cwH);
    if (!visible || !img) return;

    var zoom = Canvas.getZoom();
    var offX = ccR.left - cwR.left;
    var offY = ccR.top  - cwR.top;

    // 參考線
    var allH = guides.h.slice();
    var allV = guides.v.slice();
    if (dragging && dragging.pos !== null) {
      if (dragging.type === 'h') allH.push(dragging.pos);
      else allV.push(dragging.pos);
    }

    guideCtx.strokeStyle = 'rgba(0,140,255,0.8)';
    guideCtx.lineWidth   = 1;
    guideCtx.setLineDash([6, 4]);
    for (var i = 0; i < allH.length; i++) {
      var sy = offY + allH[i] * zoom;
      if (sy < 0 || sy > cwH) continue;
      guideCtx.beginPath(); guideCtx.moveTo(0, sy); guideCtx.lineTo(cwW, sy); guideCtx.stroke();
    }
    for (var j = 0; j < allV.length; j++) {
      var sx = offX + allV[j] * zoom;
      if (sx < 0 || sx > cwW) continue;
      guideCtx.beginPath(); guideCtx.moveTo(sx, 0); guideCtx.lineTo(sx, cwH); guideCtx.stroke();
    }
    guideCtx.setLineDash([]);

    // 刪除 badge（只在非拖曳狀態下顯示）
    if (!dragging) {
      for (var hi = 0; hi < guides.h.length; hi++) {
        var bsy = offY + guides.h[hi] * zoom;
        if (bsy < 0 || bsy > cwH) continue;
        var isHov = hoverBadge && hoverBadge.type === 'h' && hoverBadge.idx === hi;
        drawBadge(guideCtx, BADGE_EDGE, bsy - BADGE_H / 2, isHov);
      }
      for (var vi = 0; vi < guides.v.length; vi++) {
        var bsx = offX + guides.v[vi] * zoom;
        if (bsx < 0 || bsx > cwW) continue;
        var isHovV = hoverBadge && hoverBadge.type === 'v' && hoverBadge.idx === vi;
        drawBadge(guideCtx, bsx - BADGE_W / 2, BADGE_EDGE, isHovV);
      }
    }

    // 多選選取框（螢幕座標疊加在 guide-canvas）
    if (_selRect && _selRect.startC && _selRect.endC && _selRect.fn) {
      var tl = _selRect.fn(_selRect.startC.x, _selRect.startC.y);
      var br = _selRect.fn(_selRect.endC.x, _selRect.endC.y);
      var rx = Math.min(tl.x, br.x);
      var ry = Math.min(tl.y, br.y);
      var rw = Math.abs(br.x - tl.x);
      var rh = Math.abs(br.y - tl.y);
      var gCtx = guideCanvas.getContext('2d');
      gCtx.save();
      gCtx.strokeStyle = '#27ae60';
      gCtx.lineWidth = 2;
      gCtx.setLineDash([6, 3]);
      gCtx.globalAlpha = 0.9;
      gCtx.strokeRect(rx, ry, rw, rh);
      gCtx.fillStyle = 'rgba(39,174,96,0.07)';
      gCtx.fillRect(rx, ry, rw, rh);
      gCtx.setLineDash([]);
      gCtx.globalAlpha = 1;
      gCtx.restore();
    }
  }

  // ── 多選框選 rect 公開方法 ──
  function drawSelRect(startC, endC, canvasToScreenFn) {
    _selRect = { startC: startC, endC: endC, fn: canvasToScreenFn };
    redraw(); // triggers guide-canvas redraw
  }

  function clearSelRect() {
    _selRect = null;
    redraw();
  }

  // ── 圓角矩形白底 badge ─────────────────────────────────────────
  function drawBadge(ctx, bx, by, isHover) {
    var color = isHover ? '#e74c3c' : '#3a8edf';
    ctx.save();
    ctx.shadowColor   = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur    = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    // 白底
    rrect(ctx, bx, by, BADGE_W, BADGE_H, BADGE_R);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // 邊框
    rrect(ctx, bx, by, BADGE_W, BADGE_H, BADGE_R);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // × icon
    var cx = bx + BADGE_W / 2, cy = by + BADGE_H / 2, r = 3.5;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.8;
    ctx.lineCap     = 'round';
    ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke();
    ctx.restore();
  }

  function rrect(ctx, x, y, w, h, r) {
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

  // ── 尺標刻度 + 簡易 guide 指示標記 ────────────────────────────
  function drawRulers() {
    if (!rulerH || !rulerV) return;
    var img  = Canvas.getImage();
    var zoom = Canvas.getZoom();
    var cw   = document.getElementById('cw');
    var cc   = document.getElementById('cc');
    if (!cw || !cc) return;

    var cwR  = cw.getBoundingClientRect();
    var ccR  = cc.getBoundingClientRect();
    var offX = ccR.left - cwR.left;
    var offY = ccR.top  - cwR.top;

    rulerH.width  = Math.round(cwR.width);  rulerH.height = RULER_SZ;
    rulerV.width  = RULER_SZ; rulerV.height = Math.round(cwR.height);

    var hCtx = rulerH.getContext('2d');
    var vCtx = rulerV.getContext('2d');

    hCtx.fillStyle = '#ebebeb'; hCtx.fillRect(0, 0, rulerH.width, RULER_SZ);
    vCtx.fillStyle = '#ebebeb'; vCtx.fillRect(0, 0, RULER_SZ, rulerV.height);
    hCtx.strokeStyle = '#c0c0c0'; hCtx.lineWidth = 1;
    hCtx.beginPath(); hCtx.moveTo(0, RULER_SZ-1); hCtx.lineTo(rulerH.width, RULER_SZ-1); hCtx.stroke();
    vCtx.strokeStyle = '#c0c0c0'; vCtx.lineWidth = 1;
    vCtx.beginPath(); vCtx.moveTo(RULER_SZ-1, 0); vCtx.lineTo(RULER_SZ-1, rulerV.height); vCtx.stroke();

    if (!img) return;

    var step = pickStep(zoom);
    var imgW = img.width, imgH = img.height;

    hCtx.fillStyle = '#555'; hCtx.font = '9px sans-serif'; hCtx.textBaseline = 'top';
    hCtx.strokeStyle = '#999'; hCtx.lineWidth = 1;
    vCtx.fillStyle = '#555'; vCtx.font = '9px sans-serif'; vCtx.textBaseline = 'top';
    vCtx.strokeStyle = '#999'; vCtx.lineWidth = 1;

    for (var px = 0; px <= imgW; px += step) {
      var sx = offX + px * zoom;
      if (sx < 0 || sx > rulerH.width) continue;
      var isMajor = px % (step * 5) === 0;
      hCtx.beginPath(); hCtx.moveTo(sx, RULER_SZ - (isMajor ? 10 : 5)); hCtx.lineTo(sx, RULER_SZ-1); hCtx.stroke();
      if (isMajor && sx + 2 < rulerH.width) hCtx.fillText(px, sx+2, 1);
    }
    for (var py = 0; py <= imgH; py += step) {
      var sy = offY + py * zoom;
      if (sy < 0 || sy > rulerV.height) continue;
      var isMajorY = py % (step * 5) === 0;
      vCtx.beginPath(); vCtx.moveTo(RULER_SZ - (isMajorY ? 10 : 5), sy); vCtx.lineTo(RULER_SZ-1, sy); vCtx.stroke();
      if (isMajorY && sy + 2 < rulerV.height) {
        vCtx.save(); vCtx.translate(RULER_SZ-11, sy+2); vCtx.rotate(-Math.PI/2); vCtx.fillText(py, 0, 0); vCtx.restore();
      }
    }

    if (!visible) return;

    // 尺標上的 guide 位置指示線（細藍線，不可點擊，僅提示）
    hCtx.strokeStyle = 'rgba(0,140,255,0.6)'; hCtx.lineWidth = 1.5;
    for (var vi = 0; vi < guides.v.length; vi++) {
      var gsx = offX + guides.v[vi] * zoom;
      if (gsx < 0 || gsx > rulerH.width) continue;
      hCtx.beginPath(); hCtx.moveTo(gsx, RULER_SZ - 8); hCtx.lineTo(gsx, RULER_SZ - 1); hCtx.stroke();
    }
    vCtx.strokeStyle = 'rgba(0,140,255,0.6)'; vCtx.lineWidth = 1.5;
    for (var hi = 0; hi < guides.h.length; hi++) {
      var gsy = offY + guides.h[hi] * zoom;
      if (gsy < 0 || gsy > rulerV.height) continue;
      vCtx.beginPath(); vCtx.moveTo(RULER_SZ - 8, gsy); vCtx.lineTo(RULER_SZ - 1, gsy); vCtx.stroke();
    }
  }

  function pickStep(zoom) {
    var steps = [1,2,5,10,20,50,100,200,500,1000];
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] * zoom * 5 >= 25) return steps[i];
    }
    return 1000;
  }

  function toggle() {
    visible = !visible;
    var btn = document.getElementById('btnGuides');
    if (btn) { btn.classList.toggle('active', visible); btn.title = visible ? '隱藏參考線' : '顯示參考線'; }
    if (guideCanvas) guideCanvas.style.display = visible ? '' : 'none';
    drawRulers(); drawGuides();
  }

  function redraw() { drawRulers(); drawGuides(); }

  function clearAll() { guides.h = []; guides.v = []; drawRulers(); drawGuides(); }

  function getGuides() { return { h: guides.h.slice(), v: guides.v.slice() }; }

  return { init: init, redraw: redraw, toggle: toggle, clearAll: clearAll, drawGuides: drawGuides, tryDeleteGuide: tryDeleteGuide, getGuides: getGuides, drawSelRect: drawSelRect, clearSelRect: clearSelRect };
})();
