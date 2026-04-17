// rulers.js — 尺標 + 可拖曳參考線

var Rulers = (function() {
  var RULER_SZ = 20;
  var guides = { h: [], v: [] }; // image-pixel coordinates
  var visible = true;
  var rulerH, rulerV, guideCanvas, guideCtx;
  var dragging = null; // { type:'h'|'v', pos:null }

  function init() {
    rulerH = document.getElementById('rulerH');
    rulerV = document.getElementById('rulerV');
    guideCanvas = document.getElementById('guide-canvas');
    if (!rulerH || !rulerV || !guideCanvas) return;
    guideCtx = guideCanvas.getContext('2d');

    rulerH.addEventListener('mousedown', function(e) {
      dragging = { type: 'h', pos: null };
      e.preventDefault();
    });
    rulerV.addEventListener('mousedown', function(e) {
      dragging = { type: 'v', pos: null };
      e.preventDefault();
    });
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
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
    if (dragging.pos !== null) {
      var img = Canvas.getImage();
      if (img) {
        if (dragging.type === 'h' && dragging.pos >= 0 && dragging.pos <= img.height) {
          guides.h.push(dragging.pos);
        } else if (dragging.type === 'v' && dragging.pos >= 0 && dragging.pos <= img.width) {
          guides.v.push(dragging.pos);
        }
      }
    }
    dragging = null;
    drawGuides();
  }

  // Called from canvas.js onMouseDown to delete guides on click
  function tryDeleteGuide(imgX, imgY) {
    if (!visible) return false;
    var THRESH = 6;
    for (var i = guides.h.length - 1; i >= 0; i--) {
      if (Math.abs(guides.h[i] - imgY) <= THRESH) {
        guides.h.splice(i, 1);
        drawGuides();
        return true;
      }
    }
    for (var j = guides.v.length - 1; j >= 0; j--) {
      if (Math.abs(guides.v[j] - imgX) <= THRESH) {
        guides.v.splice(j, 1);
        drawGuides();
        return true;
      }
    }
    return false;
  }

  function drawGuides() {
    if (!guideCanvas || !guideCtx) return;
    var img = Canvas.getImage();
    if (!img) { guideCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height); return; }
    if (guideCanvas.width !== img.width)  guideCanvas.width  = img.width;
    if (guideCanvas.height !== img.height) guideCanvas.height = img.height;
    guideCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
    if (!visible) return;

    var zoom = Canvas.getZoom();
    guideCtx.strokeStyle = 'rgba(0,140,255,0.75)';
    guideCtx.lineWidth = 1 / zoom;
    guideCtx.setLineDash([6/zoom, 4/zoom]);

    var allH = guides.h.slice();
    var allV = guides.v.slice();
    if (dragging && dragging.pos !== null) {
      if (dragging.type === 'h') allH.push(dragging.pos);
      else allV.push(dragging.pos);
    }
    for (var i = 0; i < allH.length; i++) {
      guideCtx.beginPath();
      guideCtx.moveTo(0, allH[i]);
      guideCtx.lineTo(img.width, allH[i]);
      guideCtx.stroke();
    }
    for (var j = 0; j < allV.length; j++) {
      guideCtx.beginPath();
      guideCtx.moveTo(allV[j], 0);
      guideCtx.lineTo(allV[j], img.height);
      guideCtx.stroke();
    }
    guideCtx.setLineDash([]);
  }

  function drawRulers() {
    if (!rulerH || !rulerV) return;
    var img = Canvas.getImage();
    var zoom = Canvas.getZoom();
    var cc = document.getElementById('cc');
    var rH = document.getElementById('rulerH');
    var rV = document.getElementById('rulerV');
    var cw = document.getElementById('cw');
    if (!cc || !rH || !rV || !cw) return;

    // Resize ruler canvases
    var cwR = cw.getBoundingClientRect();
    var ccR = cc.getBoundingClientRect();
    rH.width  = Math.round(cwR.width);  rH.height = RULER_SZ;
    rV.width  = RULER_SZ; rV.height = Math.round(cwR.height);

    var hCtx = rH.getContext('2d');
    var vCtx = rV.getContext('2d');

    // Background
    hCtx.fillStyle = '#ebebeb'; hCtx.fillRect(0,0,rH.width,RULER_SZ);
    vCtx.fillStyle = '#ebebeb'; vCtx.fillRect(0,0,RULER_SZ,rV.height);
    hCtx.strokeStyle = '#c0c0c0'; hCtx.lineWidth = 1;
    hCtx.beginPath(); hCtx.moveTo(0,RULER_SZ-1); hCtx.lineTo(rH.width,RULER_SZ-1); hCtx.stroke();
    vCtx.strokeStyle = '#c0c0c0'; vCtx.lineWidth = 1;
    vCtx.beginPath(); vCtx.moveTo(RULER_SZ-1,0); vCtx.lineTo(RULER_SZ-1,rV.height); vCtx.stroke();

    if (!img) return;

    // Step size
    var step = pickStep(zoom);
    var imgW = img.width, imgH = img.height;
    var offX = ccR.left - cwR.left; // offset from cw left to cc left
    var offY = ccR.top  - cwR.top;

    hCtx.fillStyle = '#555'; hCtx.font = '9px sans-serif'; hCtx.textBaseline = 'top';
    vCtx.fillStyle = '#555'; vCtx.font = '9px sans-serif'; vCtx.textBaseline = 'top';
    hCtx.strokeStyle = '#999'; hCtx.lineWidth = 1;
    vCtx.strokeStyle = '#999'; vCtx.lineWidth = 1;

    for (var px = 0; px <= imgW; px += step) {
      var sx = offX + px * zoom;
      if (sx < 0 || sx > rH.width) continue;
      var isMajor = px % (step * 5) === 0;
      var th = isMajor ? 10 : 5;
      hCtx.beginPath(); hCtx.moveTo(sx, RULER_SZ-th); hCtx.lineTo(sx, RULER_SZ-1); hCtx.stroke();
      if (isMajor && sx + 2 < rH.width) hCtx.fillText(px, sx+2, 1);
    }
    for (var py = 0; py <= imgH; py += step) {
      var sy = offY + py * zoom;
      if (sy < 0 || sy > rV.height) continue;
      var isMajorY = py % (step * 5) === 0;
      var tvH = isMajorY ? 10 : 5;
      vCtx.beginPath(); vCtx.moveTo(RULER_SZ-tvH, sy); vCtx.lineTo(RULER_SZ-1, sy); vCtx.stroke();
      if (isMajorY && sy + 2 < rV.height) {
        vCtx.save();
        vCtx.translate(RULER_SZ-11, sy+2);
        vCtx.rotate(-Math.PI/2);
        vCtx.fillText(py, 0, 0);
        vCtx.restore();
      }
    }
  }

  function pickStep(zoom) {
    var steps = [1,2,5,10,20,50,100,200,500,1000];
    for (var i=0; i<steps.length; i++) {
      if (steps[i]*zoom*5 >= 25) return steps[i];
    }
    return 1000;
  }

  function toggle() {
    visible = !visible;
    var btn = document.getElementById('btnGuides');
    if (btn) btn.classList.toggle('active', visible);
    var ra = document.getElementById('rulerArea');
    if (ra) {
      ra.querySelector('#rulerH').style.display = visible ? '' : 'none';
      ra.querySelector('#rulerV').style.display = visible ? '' : 'none';
      ra.querySelector('.ruler-corner').style.display = visible ? '' : 'none';
    }
    if (guideCanvas) guideCanvas.style.display = visible ? '' : 'none';
    drawGuides();
  }

  function redraw() {
    drawRulers();
    drawGuides();
  }

  function clearAll() {
    guides.h = []; guides.v = [];
    drawGuides();
  }

  return { init: init, redraw: redraw, toggle: toggle, clearAll: clearAll, drawGuides: drawGuides, tryDeleteGuide: tryDeleteGuide };
})();
