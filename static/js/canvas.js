// canvas.js — Canvas 框選、縮放、平移

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
  var onBoxDraw = null; // callback(x,y,w,h)
  var lastW = 0, lastH = 0; // 上次確認的矩形尺寸

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
    window.addEventListener('mouseup', function() { isPanning = false; });
    cw.addEventListener('wheel', onWheel, { passive: false });
    cw.addEventListener('mousedown', function(e) {
      if (!document.getElementById('fp').classList.contains('open')) return;
      if (document.getElementById('fp').contains(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
      if (window.FloatPanel) FloatPanel.reqClose();
    }, true);
  }

  function onMouseDown(e) {
    if (!img) return;
    if (document.getElementById('fp').classList.contains('open')) return;
    if (e.button === 1 || e.altKey) {
      isPanning = true;
      panSX = e.clientX; panSY = e.clientY;
      panOX = panX; panOY = panY;
      e.preventDefault();
      return;
    }
    var p = toCanvas(e.clientX, e.clientY);
    startX = p.x; startY = p.y;
    drawing = true;
    curBox = { x: p.x, y: p.y, w: 0, h: 0 };
  }

  function onMouseMove(e) {
    if (!img) return;
    var p = toCanvas(e.clientX, e.clientY);
    var ctrlHeld = e.ctrlKey;

    if (!drawing) {
      // 游標懸停在既有矩形上時改為 pointer
      var boxes = App.getBoxes();
      var overBox = false;
      for (var bi = 0; bi < boxes.length; bi++) {
        var bx = boxes[bi];
        if (p.x >= bx.x && p.x <= bx.x + bx.w && p.y >= bx.y && p.y <= bx.y + bx.h) { overBox = true; break; }
      }
      mc.style.cursor = overBox ? 'pointer' : 'crosshair';

      if (ctrlHeld && lastW > 0) {
        document.getElementById('coordTxt').textContent = '⌃ Ctrl：複製上次尺寸 ' + lastW + '×' + lastH + ' px';
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

    if (ctrlHeld && lastW > 0 && lastH > 0) {
      curBox.w = lastW;
      curBox.h = lastH;
    } else {
      curBox.w = p.x - startX;
      curBox.h = p.y - startY;
    }
    App.redraw();
    if (curBox.w !== 0 && curBox.h !== 0) {
      ctx.strokeStyle = (ctrlHeld && lastW > 0) ? '#2980B9' : '#C0392B';
      ctx.lineWidth = 2 / zoomLevel;
      ctx.setLineDash([5 / zoomLevel, 3 / zoomLevel]);
      ctx.strokeRect(curBox.x, curBox.y, curBox.w, curBox.h);
      ctx.setLineDash([]);
    }
  }

  function onMouseUp(e) {
    if (isPanning) { isPanning = false; return; }
    if (!drawing || !img) return;
    drawing = false;
    var w = Math.abs(curBox.w);
    var h = Math.abs(curBox.h);
    var x = curBox.w < 0 ? curBox.x + curBox.w : curBox.x;
    var y = curBox.h < 0 ? curBox.y + curBox.h : curBox.y;
    curBox = null;

    // 點擊（拖拉距離太小）→ 嘗試點擊既有矩形
    if (w < 6 || h < 6) {
      App.redraw();
      var p = toCanvas(e.clientX, e.clientY);
      var boxes = App.getBoxes();
      for (var bi = boxes.length - 1; bi >= 0; bi--) {
        var bx = boxes[bi];
        if (p.x >= bx.x && p.x <= bx.x + bx.w && p.y >= bx.y && p.y <= bx.y + bx.h) {
          FloatPanel.openEdit(bx);
          return;
        }
      }
      return;
    }

    // 補丁模式：第一次框選是設定來源區域
    if (typeof FillEngine !== 'undefined' && FillEngine.getMode() === 'patch' && FillEngine.isPatchSelecting()) {
      FillEngine.setPatchSource({ x: x, y: y, w: w, h: h });
      App.redraw();
      return;
    }

    if (onBoxDraw) onBoxDraw(x, y, w, h);
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
