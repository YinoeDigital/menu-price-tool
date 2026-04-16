// FloatPanel.js — 左側懸浮輸入面板

var FloatPanel = (function() {

  // ── 千分位格式工具 ──
  function formatCommas(n) {
    if (!n && n !== 0) return '';
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function stripCommas(s) {
    return String(s || '').replace(/,/g, '');
  }

  var pendingBox = null;
  var fpOrient = 'vertical';
  var fpGroup = null;
  var editingId = null;
  var stickyFontSize = 0;
  var stickyRound10 = false;
  var stickyRound5 = false;
  var stickyFontColor = ''; // '' = 自動
  var stickyFontFamily = 'Noto Serif TC';
  var stickyLetterSpacing = 0; // px，0 = 預設
  var stickyBold = false;
  var stickyItalic = false;
  var stickyStrikethrough = false;
  var stickyTextAlign = 'center'; // 'left' | 'center' | 'right'

  function init() {
    var valEl = document.getElementById('fpVal');

    // 千分位格式化輸入
    valEl.addEventListener('input', function() {
      var raw = stripCommas(this.value).replace(/[^0-9]/g, '');
      if (raw === '') { this.value = ''; updateNewPrice(); this.classList.remove('err'); return; }
      var selPos = this.selectionStart;
      var prevLen = this.value.length;
      var formatted = formatCommas(parseInt(raw, 10));
      this.value = formatted;
      var diff = formatted.length - prevLen;
      var newPos = Math.max(0, selPos + diff);
      try { this.setSelectionRange(newPos, newPos); } catch(e) {}
      updateNewPrice();
      this.classList.remove('err');
    });
    // change: spinner / 貼上補捉
    valEl.addEventListener('change', function() {
      var raw = stripCommas(this.value).replace(/[^0-9]/g, '');
      this.value = raw ? formatCommas(parseInt(raw, 10)) : '';
      updateNewPrice();
      this.classList.remove('err');
    });
    // 聚焦時全選
    valEl.addEventListener('focus', function() { this.select(); });
    valEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') reqClose();
    });
    // 字體顏色：雙擊還原自動
    document.getElementById('fpFontColor').addEventListener('dblclick', function() {
      FloatPanel.resetColor();
    });
  }

  function onFontChange() {
    stickyFontFamily = document.getElementById('fpFontSel').value;
    // 同步全域 fontSel（供即時預覽 redraw 使用）
    document.getElementById('fontSel').value = stickyFontFamily;
    App.redraw();
  }

  function setColorUI(color) {
    var isAuto = !color;
    document.getElementById('fpFontColor').value = color || '#3D1A10';
    document.getElementById('fpFontColor').style.opacity = isAuto ? '0.3' : '1';
    var lbl = document.getElementById('fpColorLabel');
    if (lbl) { lbl.textContent = isAuto ? '自動' : color; lbl.style.color = isAuto ? 'var(--gmd)' : color; }
  }

  function onColorInput() {
    stickyFontColor = document.getElementById('fpFontColor').value;
    document.getElementById('fpFontColor').style.opacity = '1';
    var lbl = document.getElementById('fpColorLabel');
    if (lbl) { lbl.textContent = stickyFontColor; lbl.style.color = stickyFontColor; }
  }

  function resetColor() {
    stickyFontColor = '';
    setColorUI('');
  }

  // ── 計算新價格（含四捨五入選項）──
  function calcNewPrice(rawVal) {
    rawVal = parseFloat(stripCommas(String(rawVal)));
    var g = fpGroup ? Groups.getById(fpGroup) : null;
    var pct = g ? g.pct : App.getGlobalPct();
    var nv = Math.round(rawVal * (1 + pct / 100));
    var r5 = document.getElementById('ckRound5').checked;
    var r10 = document.getElementById('ckRound10').checked;
    if (r5)  nv = Math.ceil(nv / 5) * 5;
    if (r10) nv = Math.round(nv / 10) * 10;
    return nv;
  }

  function updateNewPrice() {
    var v = parseFloat(stripCommas(document.getElementById('fpVal').value));
    if (v && v > 0) {
      var g = fpGroup ? Groups.getById(fpGroup) : null;
      var pct = g ? g.pct : App.getGlobalPct();
      var rawNv = Math.round(v * (1 + pct / 100));
      document.getElementById('fpCalc').textContent = rawNv;
      document.getElementById('fpNew').value = calcNewPrice(v);
    } else {
      document.getElementById('fpCalc').textContent = '—';
      document.getElementById('fpNew').value = '';
    }
  }

  function onRoundChange(src) {
    // 互斥：勾選其中一個時取消另一個
    if (src === '10' && document.getElementById('ckRound10').checked) {
      document.getElementById('ckRound5').checked = false;
    } else if (src === '5' && document.getElementById('ckRound5').checked) {
      document.getElementById('ckRound10').checked = false;
    }
    stickyRound10 = document.getElementById('ckRound10').checked;
    stickyRound5  = document.getElementById('ckRound5').checked;
    updateNewPrice();
  }

  function open(x, y, w, h) {
    editingId = null;
    pendingBox = { x: x, y: y, w: w, h: h };
    fpGroup = null;
    fpOrient = w > h ? 'horizontal' : 'vertical';
    setOrient(fpOrient);
    document.getElementById('fp').querySelector('.fp-title').textContent = '輸入價格資訊';
    document.getElementById('fpSub').textContent = '框選區域：' + Math.round(w) + '×' + Math.round(h) + ' px';
    document.getElementById('fpSz').textContent = Math.round(w) + '×' + Math.round(h) + ' px';
    document.getElementById('fpFontSel').value = stickyFontFamily;
    document.getElementById('fpFontSize').value = stickyFontSize > 0 ? stickyFontSize : '';
    document.getElementById('fpLetterSpacing').value = stickyLetterSpacing !== 0 ? stickyLetterSpacing : '';
    setColorUI(stickyFontColor);
    setBoldUI(stickyBold);
    setItalicUI(stickyItalic);
    setStrikethroughUI(stickyStrikethrough);
    setAlignUI(stickyTextAlign);
    document.getElementById('ckRound10').checked = stickyRound10;
    document.getElementById('ckRound5').checked  = stickyRound5;
    updateGroupInfo();
    Groups.renderChips(fpGroup);
    document.getElementById('fpCalc').textContent = '—';
    document.getElementById('fpVal').value = '';
    document.getElementById('fpNew').value = '';
    document.getElementById('fpVal').classList.remove('err');
    document.getElementById('fp').classList.add('open');
    setTimeout(function() { document.getElementById('fpVal').focus(); }, 260);

    // OCR 自動偵測數字
    if (App.isOcrReady()) {
      var fpValEl = document.getElementById('fpVal');
      fpValEl.placeholder = '識別中…';
      App.detectPrice(x, y, w, h, function(num) {
        fpValEl.placeholder = '例：880';
        if (num && !fpValEl.value) {
          fpValEl.value = formatCommas(num);
          updateNewPrice();
          App.setSt('✦ 識別到價格：' + num + '，如有誤請直接修改');
          fpValEl.select();
        } else {
          App.setSt('請在左側面板輸入原始價格數值');
        }
      });
    } else {
      App.setSt('請在左側面板輸入原始價格數值');
    }
  }

  function openEdit(box) {
    editingId = box.id;
    pendingBox = { x: box.x, y: box.y, w: box.w, h: box.h };
    fpGroup = box.group || null;
    fpOrient = box.orient || 'vertical';
    setOrient(fpOrient);
    document.getElementById('fp').querySelector('.fp-title').textContent = '編輯價格資訊';
    document.getElementById('fpSub').textContent = '框選區域：' + Math.round(box.w) + '×' + Math.round(box.h) + ' px';
    document.getElementById('fpSz').textContent = Math.round(box.w) + '×' + Math.round(box.h) + ' px';
    var bfs = box.fontSize || 0;
    document.getElementById('fpFontSel').value = box.fontFamily || stickyFontFamily;
    document.getElementById('fpFontSize').value = bfs > 0 ? bfs : '';
    var bls = box.letterSpacing !== undefined ? box.letterSpacing : stickyLetterSpacing;
    document.getElementById('fpLetterSpacing').value = bls !== 0 ? bls : '';
    setColorUI(box.fontColor || stickyFontColor || '');
    setBoldUI(box.bold !== undefined ? box.bold : stickyBold);
    setItalicUI(box.italic !== undefined ? box.italic : stickyItalic);
    setStrikethroughUI(box.strikethrough !== undefined ? box.strikethrough : stickyStrikethrough);
    setAlignUI(box.textAlign || stickyTextAlign);
    document.getElementById('ckRound10').checked = stickyRound10;
    document.getElementById('ckRound5').checked  = stickyRound5;
    updateGroupInfo();
    Groups.renderChips(fpGroup);
    document.getElementById('fpVal').value = formatCommas(box.value);
    document.getElementById('fpVal').classList.remove('err');
    // 顯示原始計算值（參考）與最終值
    var g2 = fpGroup ? Groups.getById(fpGroup) : null;
    var pct2 = g2 ? g2.pct : App.getGlobalPct();
    document.getElementById('fpCalc').textContent = Math.round(box.value * (1 + pct2 / 100));
    var displayNew = box.newValue > 0 ? box.newValue : calcNewPrice(box.value);
    document.getElementById('fpNew').value = displayNew;
    document.getElementById('fp').classList.add('open');
    setTimeout(function() { document.getElementById('fpVal').focus(); document.getElementById('fpVal').select(); }, 260);
    App.setSt('編輯已框選的價格');
  }

  function reqClose() {
    var v = document.getElementById('fpVal').value;
    if (v && parseFloat(v) > 0) {
      App.showCD('尚未儲存的資料', '已輸入價格但尚未確認。確定捨棄？', '返回編輯', '捨棄離開', function() { close(); });
    } else {
      close();
    }
  }

  function close() {
    document.getElementById('fp').classList.remove('open');
    document.getElementById('fp').querySelector('.fp-title').textContent = '輸入價格資訊';
    pendingBox = null;
    editingId = null;
    App.redraw();
  }

  function confirm() {
    var v = parseFloat(stripCommas(document.getElementById('fpVal').value));
    if (!v || v <= 0) {
      document.getElementById('fpVal').classList.add('err');
      document.getElementById('fpVal').focus();
      return;
    }
    if (!pendingBox) return;

    // 讀取字型
    stickyFontFamily = document.getElementById('fpFontSel').value;
    document.getElementById('fontSel').value = stickyFontFamily;

    // 讀取字體大小
    var fsInput = parseInt(document.getElementById('fpFontSize').value);
    var fontSize = (fsInput > 0) ? fsInput : 0;
    stickyFontSize = fontSize;

    // 讀取字體間距
    var lsInput = parseFloat(document.getElementById('fpLetterSpacing').value);
    var letterSpacing = isNaN(lsInput) ? 0 : lsInput;
    stickyLetterSpacing = letterSpacing;

    // 讀取粗體 / 斜體 / 雙刪除線
    var bold = document.getElementById('fpBold').classList.contains('active');
    stickyBold = bold;
    var italic = document.getElementById('fpItalic').classList.contains('active');
    stickyItalic = italic;
    var strikethrough = document.getElementById('fpStrike').classList.contains('active');
    stickyStrikethrough = strikethrough;

    // 讀取文字對齊
    var textAlign = stickyTextAlign;

    // 讀取字體顏色
    var fontColor = stickyFontColor; // '' = 自動

    // 讀取最終新價格（可能是使用者手動覆蓋的）
    var newValInput = parseInt(document.getElementById('fpNew').value);
    var newValue = (newValInput > 0) ? newValInput : calcNewPrice(v);

    var currentMode = (typeof FillEngine !== 'undefined') ? FillEngine.getMode() : 'autofill';

    if (editingId !== null) {
      App.updateBox(editingId, {
        value: v, orient: fpOrient, group: fpGroup,
        fontSize: fontSize, newValue: newValue, fontColor: fontColor,
        fontFamily: stickyFontFamily, letterSpacing: letterSpacing,
        bold: bold, italic: italic, strikethrough: strikethrough, textAlign: textAlign
      });
      document.getElementById('fp').querySelector('.fp-title').textContent = '輸入價格資訊';
      App.setSt('已更新價格：' + v + ' → ' + newValue);
    } else {
      App.addBox({
        id: Date.now() + '' + Math.floor(Math.random() * 10000),
        x: pendingBox.x, y: pendingBox.y,
        w: pendingBox.w, h: pendingBox.h,
        value: v, orient: fpOrient, group: fpGroup,
        fontSize: fontSize, newValue: newValue, fontColor: fontColor,
        fontFamily: stickyFontFamily, letterSpacing: letterSpacing,
        bold: bold, italic: italic, strikethrough: strikethrough, textAlign: textAlign,
        fillMode: currentMode,
        patchSource: (currentMode === 'patch' && typeof FillEngine !== 'undefined') ? FillEngine.getPatchSource() : null
      });
      App.setSt('已新增價格框：' + v + ' → ' + newValue);
    }
    document.getElementById('fp').classList.remove('open');
    pendingBox = null;
    editingId = null;
  }

  function setOrient(o) {
    fpOrient = o;
    document.getElementById('foH').classList.toggle('active', o === 'horizontal');
    document.getElementById('foV').classList.toggle('active', o === 'vertical');
  }

  function selectGroup(id, e) {
    fpGroup = id;
    document.querySelectorAll('.grp-chip').forEach(function(c) { c.classList.remove('active'); });
    e.target.classList.add('active');
    updateGroupInfo();
    updateNewPrice();
  }

  function updateGroupInfo() {
    var g = fpGroup ? Groups.getById(fpGroup) : null;
    var pct = g ? g.pct : App.getGlobalPct();
    document.getElementById('fpGrpName').textContent = g ? g.name : '全域';
    document.getElementById('fpGrpName').style.color = g ? g.color : '#C0392B';
    document.getElementById('fpPct').textContent = (pct >= 0 ? '+' : '') + pct + '%';
    updateNewPrice();
  }

  function setBoldUI(b) {
    document.getElementById('fpBold').classList.toggle('active', !!b);
  }
  function toggleBold() {
    var btn = document.getElementById('fpBold');
    btn.classList.toggle('active');
    stickyBold = btn.classList.contains('active');
  }

  function setItalicUI(b) {
    document.getElementById('fpItalic').classList.toggle('active', !!b);
  }
  function toggleItalic() {
    var btn = document.getElementById('fpItalic');
    btn.classList.toggle('active');
    stickyItalic = btn.classList.contains('active');
  }

  function setStrikethroughUI(b) {
    document.getElementById('fpStrike').classList.toggle('active', !!b);
  }
  function toggleStrikethrough() {
    var btn = document.getElementById('fpStrike');
    btn.classList.toggle('active');
    stickyStrikethrough = btn.classList.contains('active');
  }

  function setAlignUI(a) {
    stickyTextAlign = a || 'center';
    document.querySelectorAll('.fp-align-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.align === stickyTextAlign);
    });
  }

  function setAlign(a) {
    stickyTextAlign = a;
    setAlignUI(a);
  }

  function applyToAll() {
    var count = App.getBoxes().length;
    if (count === 0) { App.setSt('目前沒有任何價格框'); return; }

    // 讀取目前面板的字樣設定
    stickyFontFamily = document.getElementById('fpFontSel').value;
    var fsInput = parseInt(document.getElementById('fpFontSize').value);
    stickyFontSize = (fsInput > 0) ? fsInput : 0;
    var lsInput = parseFloat(document.getElementById('fpLetterSpacing').value);
    stickyLetterSpacing = isNaN(lsInput) ? 0 : lsInput;
    stickyBold = document.getElementById('fpBold').classList.contains('active');
    stickyItalic = document.getElementById('fpItalic').classList.contains('active');
    stickyStrikethrough = document.getElementById('fpStrike').classList.contains('active');

    var settings = {
      fontFamily: stickyFontFamily,
      fontSize: stickyFontSize,
      letterSpacing: stickyLetterSpacing,
      fontColor: stickyFontColor,
      bold: stickyBold,
      italic: stickyItalic,
      strikethrough: stickyStrikethrough,
      textAlign: stickyTextAlign
    };

    App.showCD(
      '套用至全部 ' + count + ' 個價格框',
      '目前的字樣設定（字型、大小、間距、顏色、格式、對齊）將覆蓋所有價格框的設定，無法還原。',
      '返回編輯',
      '確認全部變更',
      function() {
        App.applyFontToAll(settings);
        document.getElementById('fp').classList.remove('open');
        pendingBox = null;
        editingId = null;
      }
    );
  }

  // ── 群組引導 Spotlight ──
  function showGroupGuide() {
    var tab = document.getElementById('tab-batch');
    if (!tab) return;
    var rect = tab.getBoundingClientRect();
    var sp = document.getElementById('grpSpotlight');
    if (sp) {
      sp.style.left   = (rect.left   - 6) + 'px';
      sp.style.top    = (rect.top    - 6) + 'px';
      sp.style.width  = (rect.width  + 12) + 'px';
      sp.style.height = (rect.height + 12) + 'px';
    }
    var ov = document.getElementById('grpGuideOv');
    if (ov) ov.classList.add('open');
  }

  function closeGroupGuide() {
    var ov = document.getElementById('grpGuideOv');
    if (ov) ov.classList.remove('open');
    App.showTab('batch');
  }

  function getGroup() { return fpGroup; }
  function getStickyFontSize() { return stickyFontSize; }

  return {
    init: init,
    open: open,
    openEdit: openEdit,
    reqClose: reqClose,
    close: close,
    confirm: confirm,
    setOrient: setOrient,
    selectGroup: selectGroup,
    updateGroupInfo: updateGroupInfo,
    onRoundChange: onRoundChange,
    onColorInput: onColorInput,
    resetColor: resetColor,
    onFontChange: onFontChange,
    toggleBold: toggleBold,
    toggleItalic: toggleItalic,
    toggleStrikethrough: toggleStrikethrough,
    setAlign: setAlign,
    applyToAll: applyToAll,
    getGroup: getGroup,
    getStickyFontSize: getStickyFontSize,
    showGroupGuide: showGroupGuide,
    closeGroupGuide: closeGroupGuide
  };
})();
