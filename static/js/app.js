// app.js — 主程式邏輯

var App = (function() {
  var boxes = [];
  var previewMode = false;
  var orientation = 'vertical';
  var currentImgB64 = null;
  var hist = [];
  var confirmCB = null;

  try { hist = JSON.parse(localStorage.getItem('mhist') || '[]'); } catch(e) {}

  // ── INIT ──
  function init() {
    Canvas.init('mc', 'cw', function(x, y, w, h) {
      FloatPanel.open(x, y, w, h);
    });
    bindUI();
    Groups.render(boxes);
    Library.render();
    renderHist();
    FloatPanel.init();
  }

  function bindUI() {
    document.getElementById('fi').addEventListener('change', handleFileUpload);
    document.getElementById('ji').addEventListener('change', handleJSONLoad);
    document.getElementById('pctIn').addEventListener('input', function() {
      var v = parseFloat(this.value) || 0;
      document.getElementById('pctBadge').textContent = (v >= 0 ? '+' : '') + v + '%';
      renderPriceList();
      if (previewMode) redraw();
    });
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
      };
      i.src = ev.target.result;
    };
    rd.readAsDataURL(f);
  }

  // ── REDRAW ──
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
  }

  function redraw() {
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
      var effPct = getEffPct(box);
      var nv = (box.newValue > 0) ? box.newValue : Math.round(box.value * (1 + effPct / 100));
      var g = box.group ? Groups.getById(box.group) : null;
      var bc = g ? g.color : '#C0392B';

      if (previewMode) {
        // 使用 FillEngine 填色
        var bgColor = FillEngine.apply(ctx, mc, box, {
          fillMode: box.fillMode,
          patchSource: box.patchSource,
          feather: box.fillMode === 'patch' ? FillEngine.getFeather('patch') : FillEngine.getFeather('autofill')
        });

        // 計算文字顏色（依背景亮度）
        var r2, gv2, b2;
        if (bgColor && bgColor.r !== undefined) {
          r2 = bgColor.r; gv2 = bgColor.g; b2 = bgColor.b;
        } else {
          var sid = ctx.getImageData(Math.max(0, box.x + 2), Math.max(0, box.y + 2), 4, 4);
          r2 = sid.data[0]; gv2 = sid.data[1]; b2 = sid.data[2];
        }
        var lum = r2 * 0.299 + gv2 * 0.587 + b2 * 0.114;
        var tc = box.fontColor ? box.fontColor : (lum > 128 ? '#3D1A10' : '#FAF0E0');
        var ns = String(nv);
        var bls = (box.letterSpacing || 0) + 'px';
        var bWeight = box.bold ? 'bold ' : '';
        var bAlign = box.textAlign || 'center';
        if ('letterSpacing' in ctx) ctx.letterSpacing = bls;
        if (box.orient === 'vertical') {
          var ch = box.h / ns.length;
          var fs = box.fontSize > 0 ? box.fontSize : Math.min(ch * 0.88, box.w * 0.92);
          ctx.font = bWeight + Math.round(fs) + "px '" + font + "',serif";
          ctx.fillStyle = tc; ctx.textAlign = 'center';
          for (var ci = 0; ci < ns.length; ci++) {
            ctx.fillText(ns[ci], box.x + box.w / 2, box.y + ch * (ci + 0.8));
          }
        } else {
          var fs2 = box.fontSize > 0 ? box.fontSize : Math.min(box.h * 0.82, box.w / (ns.length * 0.6));
          ctx.font = bWeight + Math.round(fs2) + "px '" + font + "',serif";
          ctx.fillStyle = tc; ctx.textBaseline = 'middle';
          var tx = bAlign === 'left' ? box.x + 4 : bAlign === 'right' ? box.x + box.w - 4 : box.x + box.w / 2;
          ctx.textAlign = bAlign;
          ctx.fillText(String(nv), tx, box.y + box.h / 2);
          ctx.textBaseline = 'alphabetic';
        }
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
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
    var cnt = boxes.length;
    document.getElementById('pcnt').textContent = cnt;
    var rpSub = document.getElementById('rpSub');
    if (rpSub) rpSub.textContent = '共 ' + cnt + ' 個價格框';
    var el = document.getElementById('plist');
    if (!boxes.length) {
      el.innerHTML = '<div style="text-align:center;padding:13px;color:var(--gmd);font-size:12px;">尚未框選任何價格</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      var effPct = getEffPct(b);
      var nv = (b.newValue > 0) ? b.newValue : Math.round(b.value * (1 + effPct / 100));
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
    boxes.push(box);
    Canvas.setLastSize(box.w, box.h);
    renderPriceList();
    redraw();
  }

  function updateBox(id, changes) {
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
    boxes = boxes.filter(function(b) { return String(b.id) !== String(id); });
    renderPriceList();
    redraw();
  }

  function clearAll() {
    if (!boxes.length) return;
    showCD('清除全部', '確定清除所有框選？', '取消', '清除', function() {
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
      var effPct = getEffPct(box);
      var nv = (box.newValue > 0) ? box.newValue : Math.round(box.value * (1 + effPct / 100));

      // 使用 FillEngine 填色
      var bgColor = FillEngine.apply(oc, off, box, {
        fillMode: box.fillMode,
        patchSource: box.patchSource,
        feather: box.fillMode === 'patch' ? FillEngine.getFeather('patch') : FillEngine.getFeather('autofill')
      });

      var r2, gv2, b2;
      if (bgColor && bgColor.r !== undefined) {
        r2 = bgColor.r; gv2 = bgColor.g; b2 = bgColor.b;
      } else {
        var sid = oc.getImageData(Math.max(0, box.x + 2), Math.max(0, box.y + 2), 4, 4);
        r2 = sid.data[0]; gv2 = sid.data[1]; b2 = sid.data[2];
      }
      var lum = r2 * 0.299 + gv2 * 0.587 + b2 * 0.114;
      var tc = box.fontColor ? box.fontColor : (lum > 128 ? '#3D1A10' : '#FAF0E0');
      var ns = String(nv);
      var bls2 = (box.letterSpacing || 0) + 'px';
      var bWeight2 = box.bold ? 'bold ' : '';
      var bAlign2 = box.textAlign || 'center';
      if ('letterSpacing' in oc) oc.letterSpacing = bls2;
      if (box.orient === 'vertical') {
        var ch = box.h / ns.length;
        var fs = box.fontSize > 0 ? box.fontSize : Math.min(ch * 0.88, box.w * 0.92);
        oc.font = bWeight2 + Math.round(fs) + "px '" + font + "',serif";
        oc.fillStyle = tc; oc.textAlign = 'center';
        for (var ci = 0; ci < ns.length; ci++) {
          oc.fillText(ns[ci], box.x + box.w / 2, box.y + ch * (ci + 0.8));
        }
      } else {
        var fs2 = box.fontSize > 0 ? box.fontSize : Math.min(box.h * 0.82, box.w / (ns.length * 0.6));
        oc.font = bWeight2 + Math.round(fs2) + "px '" + font + "',serif";
        oc.fillStyle = tc; oc.textBaseline = 'middle';
        var tx2 = bAlign2 === 'left' ? box.x + 4 : bAlign2 === 'right' ? box.x + box.w - 4 : box.x + box.w / 2;
        oc.textAlign = bAlign2;
        oc.fillText(String(nv), tx2, box.y + box.h / 2);
        oc.textBaseline = 'alphabetic';
      }
      if ('letterSpacing' in oc) oc.letterSpacing = '0px';
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
    showCD('刪除群組', '此群組的框選將改為套用全域百分比，確定刪除？', '取消', '確認刪除', function() {
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

  // ── UTILS ──
  function getGlobalPct() { return parseFloat(document.getElementById('pctIn').value) || 0; }

  function getEffPct(box) {
    if (box.group) {
      var g = Groups.getById(box.group);
      if (g) return g.pct;
    }
    return getGlobalPct();
  }

  function setSt(m) { document.getElementById('stTxt').textContent = m; }

  function getBoxes() { return boxes; }
  function isPreview() { return previewMode; }

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
    toggleTips: toggleTips,
    setTipsOS: setTipsOS
  };
})();
