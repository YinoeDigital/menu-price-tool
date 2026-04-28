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
  var currentBox = null;
  var _pollTimer = null;
  var _pollLast = '';
  var editingId = null;
  var _isTextBox = false; // 目前面板是否為文字工具模式
  var _detectToken = 0;  // OCR 競態防護：每次 open() 遞增，callback 比對 token 後才套用結果
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
  var stickyPriceAffix = 'none'; // 'none' | 'yuan' | 'dollar'

  // ── fpVal 打勾 icon 狀態 ──
  function setFpValCheck(active) {
    var el = document.getElementById('fpValCheck');
    if (!el) return;
    el.classList.toggle('active', !!active);
    // 直接設 style.color 確保 CSS transition 外仍能即時生效
    el.style.color = active ? '#27AE60' : '#D0D0D0';
    el.style.cursor = active ? 'default' : 'pointer';
    el.title = active ? '✓ 數值已記錄' : '點擊確認數值';
  }

  function init() {
    var valEl = document.getElementById('fpVal');

    // 即時計算：每次按鍵立即更新新價格（不在此做格式化，避免干擾計算）
    valEl.addEventListener('input', function() {
      updateNewPrice();
      this.classList.remove('err');
      // 欄位清空 → 打勾變灰
      if (!stripCommas(this.value).replace(/[^0-9]/g, '')) setFpValCheck(false);
    });

    // keyup：補捉 input 未觸發的情況；同步清空判斷
    valEl.addEventListener('keyup', function(e) {
      if (e.key === 'Enter') return; // Enter 由 keydown 處理
      updateNewPrice();
      this.classList.remove('err');
      if (!stripCommas(this.value).replace(/[^0-9]/g, '')) setFpValCheck(false);
    });

    // 千分位格式化：只在離開欄位時套用，不干擾輸入過程
    valEl.addEventListener('blur', function() {
      // 停止輪詢
      if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
      var raw = stripCommas(this.value).replace(/[^0-9]/g, '');
      if (raw) this.value = formatCommas(parseInt(raw, 10));
      updateNewPrice();
    });

    // change: 貼上 / 外部賦值補捉（失焦時再確認一次）
    valEl.addEventListener('change', function() {
      updateNewPrice();
      this.classList.remove('err');
    });

    // 聚焦時全選 + 啟動輪詢（防止 input/keyup 未觸發時的漏網）
    valEl.addEventListener('focus', function() {
      this.select();
      _pollLast = this.value;
      if (_pollTimer) clearInterval(_pollTimer);
      _pollTimer = setInterval(function() {
        var cur = valEl.value;
        if (cur !== _pollLast) {
          _pollLast = cur;
          updateNewPrice();
          valEl.classList.remove('err');
        }
      }, 80);
    });

    valEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var checkEl = document.getElementById('fpValCheck');
        var isConfirmed = checkEl && checkEl.classList.contains('active');

        if (isConfirmed) {
          // 打勾已是綠色 → 第二次 Enter = 觸發「加入」按鈕
          confirm();
        } else {
          // 打勾是灰色 → 第一次 Enter = 確認數值並轉綠
          var raw = stripCommas(this.value).replace(/[^0-9]/g, '');
          if (raw) {
            this.value = formatCommas(parseInt(raw, 10));
            _pollLast = this.value;
            updateNewPrice();
            setFpValCheck(true);
          } else {
            setFpValCheck(false);
          }
        }
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') reqClose();
    });

    // 打勾 icon 可點擊：灰色時點擊 → 確認當前數值並轉綠
    var checkEl = document.getElementById('fpValCheck');
    if (checkEl) {
      checkEl.addEventListener('click', function() {
        // 已是綠色（已確認）時不再做事
        if (this.classList.contains('active')) return;
        var raw = stripCommas(valEl.value).replace(/[^0-9]/g, '');
        if (raw) {
          valEl.value = formatCommas(parseInt(raw, 10));
          _pollLast = valEl.value;
          updateNewPrice();
          setFpValCheck(true);
          valEl.focus();
        }
      });
    }

    // 字體顏色：雙擊還原自動
    document.getElementById('fpFontColor').addEventListener('dblclick', function() {
      FloatPanel.resetColor();
    });

    // fpTextContent：Escape 關閉面板
    var tcEl = document.getElementById('fpTextContent');
    if (tcEl) {
      tcEl.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') reqClose();
      });
    }

    // 防止滾輪事件穿透到畫布（避免在 fp 面板內滾動時觸發畫布縮放）
    document.getElementById('fp').addEventListener('wheel', function(e) {
      e.stopPropagation();
    }, { passive: false });
  }

  // ── 文字工具模式切換（顯示/隱藏對應 UI 區塊）──
  function _setTextMode(isText) {
    _isTextBox = isText;
    var priceValRow     = document.getElementById('fpPriceValRow');
    var priceInfoSection = document.getElementById('fpPriceInfoSection');
    var groupRow        = document.getElementById('fpGroupRow');
    var textSection     = document.getElementById('fpTextSection');
    if (priceValRow)      priceValRow.style.display      = isText ? 'none' : '';
    if (priceInfoSection) priceInfoSection.style.display  = isText ? 'none' : '';
    if (groupRow)         groupRow.style.display          = isText ? 'none' : '';
    if (textSection)      textSection.style.display       = isText ? '' : 'none';
  }

  // ── 開啟文字工具 FloatPanel（T+拖拉後呼叫）──
  function openText(x, y, w, h) {
    ++_detectToken; // 失效任何進行中的 OCR callback
    editingId = null;
    pendingBox = { x: x, y: y, w: w, h: h };
    fpOrient = w > h ? 'horizontal' : 'vertical';
    setOrient(fpOrient);
    document.getElementById('fp').querySelector('.fp-title').textContent = '輸入文字內容';
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
    document.getElementById('fpTextContent').value = '';
    document.getElementById('fpTextContent').classList.remove('err');
    _setTextMode(true);
    document.getElementById('fp').classList.add('open');
    setTimeout(function() { document.getElementById('fpTextContent').focus(); }, 260);
    _applyAutoDetect(x, y, w, h);
    App.setSt('請在左側面板輸入文字內容');
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

  // ── 計算新價格（商家抽成 + Deal % + 四捨五入）──
  function calcNewPrice(rawVal) {
    rawVal = parseFloat(stripCommas(String(rawVal)));
    if (!App.commissionIsActive()) return rawVal; // 抽成關閉 → 直接回傳原價
    var g = fpGroup ? Groups.getById(fpGroup) : null;
    var commission = g ? g.pct : App.getGlobalPct();
    if (commission >= 100) return rawVal;
    var nv = Math.floor(rawVal / (1 - commission / 100));
    if (App.dealIsActive()) {
      var deal = App.getGlobalDeal();
      if (deal > 0 && deal < 100) nv = Math.floor(nv / (deal / 100));
    }
    var r5  = document.getElementById('ckRound5').checked;
    var r10 = document.getElementById('ckRound10').checked;
    if (r5)  nv = Math.ceil(nv / 5) * 5;
    if (r10) nv = Math.round(nv / 10) * 10;
    return nv;
  }

  // ── 商家抽成開關切換時更新 FloatPanel UI ──
  function updateCommissionUI() {
    var active = App.commissionIsActive();
    var calcGroup = document.getElementById('fpCalcGroup');
    var pctRow = document.getElementById('fpPct');
    var dealRow = document.getElementById('fpDealRow');
    if (calcGroup) calcGroup.style.display = active ? '' : 'none';
    if (pctRow) {
      pctRow.textContent = active ? (App.getEffPct(currentBox || {}) || App.getGlobalPct()) + '%' : '關閉';
      pctRow.style.color = active ? '' : 'var(--gmd)';
    }
    // Deal % 列跟著抽成一起隱藏
    if (dealRow) dealRow.style.display = (active && App.dealIsActive()) ? '' : 'none';
    // 重新計算新價格顯示
    updateNewPrice();
  }

  function updateNewPrice() {
    var v = parseFloat(stripCommas(document.getElementById('fpVal').value));
    if (v && v > 0) {
      document.getElementById('fpCalc').textContent = calcNewPrice(v);
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
    document.getElementById('selAffix').value     = stickyPriceAffix;
    updateGroupInfo();
    Groups.renderChips(fpGroup);
    document.getElementById('fpCalc').textContent = '—';
    document.getElementById('fpVal').value = '';
    document.getElementById('fpNew').value = '';
    document.getElementById('fpVal').classList.remove('err');
    setFpValCheck(false); // 重置打勾狀態
    document.getElementById('fp').classList.add('open');
    setTimeout(function() { document.getElementById('fpVal').focus(); }, 260);

    // ── 自動偵測字體樣式（顏色、大小、方向、字距）──
    _applyAutoDetect(x, y, w, h);

    // OCR 自動偵測數字（帶 token 防止快速連續框選時舊結果覆蓋新面板）
    var _myToken = ++_detectToken;
    if (App.isOcrReady()) {
      var fpValEl = document.getElementById('fpVal');
      fpValEl.placeholder = '識別中…';
      App.detectPrice(x, y, w, h, function(num) {
        fpValEl.placeholder = '例：880';
        if (_detectToken !== _myToken) return; // 面板已重開，丟棄此過期結果
        if (num && !fpValEl.value) {
          fpValEl.value = formatCommas(num);
          fpValEl.focus();   // 確保焦點在欄位上（觸發 focus → 啟動輪詢 + select）
          updateNewPrice();
          _pollLast = fpValEl.value; // 同步輪詢基準值，避免立刻誤判為「有變動」
          setFpValCheck(true); // OCR 偵測成功 → 綠勾
          App.setSt('✦ 識別到價格：' + num + '，如有誤請直接修改後按 Enter 確認');
        } else {
          App.setSt('請在左側面板輸入原始價格數值');
        }
      });
    } else {
      App.setSt('請在左側面板輸入原始價格數值');
    }
  }

  // 執行自動偵測並填入欄位（新框才觸發，附帶 🔍 標記）
  function _applyAutoDetect(x, y, w, h) {
    if (typeof App === 'undefined' || !App.autoDetectBoxStyle) return;
    var result = App.autoDetectBoxStyle(x, y, w, h);
    if (!result) return;

    // 顏色：若 sticky 為自動（空字串）才填入，避免覆蓋使用者手動設定
    if (!stickyFontColor && result.color) {
      stickyFontColor = result.color;
      setColorUI(result.color);
      _markAutoDetect('fpColorLabel', true);
    }

    // 字體大小：若 sticky 為 0（未設定）才填入
    if (!stickyFontSize && result.fontSize > 0) {
      stickyFontSize = result.fontSize;
      document.getElementById('fpFontSize').value = result.fontSize;
      _markAutoDetect('fpFontSizeLabel', true);
    }

    // 排列方向：僅新框時套用偵測結果
    if (result.orient) {
      setOrient(result.orient);
      _markAutoDetect('fpOrientLabel', true);
    }

    // 字距：不自動偵測，維持 sticky 值或使用者手動設定
  }

  // 在 label 旁加 / 移除 🔍 自動偵測標記
  function _markAutoDetect(labelId, show) {
    var el = document.getElementById(labelId);
    if (!el) return;
    // 移除舊標記
    var old = el.querySelector('.auto-detect-badge');
    if (old) old.parentNode.removeChild(old);
    if (!show) return;
    var badge = document.createElement('span');
    badge.className = 'auto-detect-badge';
    badge.title = '根據框選區域原圖自動偵測，可手動修改';
    badge.style.cssText = 'font-size:9px;color:var(--gmd);margin-left:3px;vertical-align:middle;cursor:help;';
    badge.textContent = '🔍';
    el.appendChild(badge);
  }

  function openEdit(box) {
    // 遮罩框不開編輯面板，改為詢問是否刪除
    if (box.isMask) {
      App.showCD('覆蓋遮罩', '點擊可刪除此遮罩框，刪除後可重新繪製。', '取消', '刪除遮罩', function() {
        App.deleteBox(box.id);
      });
      return;
    }
    // 文字框：開啟文字編輯模式
    if (box.isTextBox) {
      currentBox = box;
      editingId = box.id;
      pendingBox = { x: box.x, y: box.y, w: box.w, h: box.h };
      fpOrient = box.orient || 'vertical';
      setOrient(fpOrient);
      document.getElementById('fp').querySelector('.fp-title').textContent = '編輯文字內容';
      document.getElementById('fpSub').textContent = '框選區域：' + Math.round(box.w) + '×' + Math.round(box.h) + ' px';
      document.getElementById('fpSz').textContent = Math.round(box.w) + '×' + Math.round(box.h) + ' px';
      document.getElementById('fpFontSel').value = box.fontFamily || stickyFontFamily;
      document.getElementById('fpFontSize').value = (box.fontSize > 0) ? box.fontSize : '';
      var _eLs = box.letterSpacing !== undefined ? box.letterSpacing : stickyLetterSpacing;
      document.getElementById('fpLetterSpacing').value = _eLs !== 0 ? _eLs : '';
      setColorUI(box.fontColor || stickyFontColor || '');
      setBoldUI(box.bold !== undefined ? box.bold : stickyBold);
      setItalicUI(box.italic !== undefined ? box.italic : stickyItalic);
      setStrikethroughUI(box.strikethrough !== undefined ? box.strikethrough : stickyStrikethrough);
      setAlignUI(box.textAlign || stickyTextAlign);
      document.getElementById('fpTextContent').value = box.textContent || '';
      document.getElementById('fpTextContent').classList.remove('err');
      _setTextMode(true);
      document.getElementById('fp').classList.add('open');
      setTimeout(function() {
        var tc = document.getElementById('fpTextContent');
        tc.focus(); tc.select();
      }, 260);
      App.setSt('編輯文字框內容');
      return;
    }
    // 價格框：重置為價格模式
    ++_detectToken; // 失效任何進行中的 OCR callback
    _setTextMode(false);
    currentBox = box;
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
    document.getElementById('selAffix').value     = box.priceAffix || (box.showYuan ? 'yuan' : 'none');
    updateGroupInfo();
    updateCommissionUI();
    Groups.renderChips(fpGroup);
    document.getElementById('fpVal').value = formatCommas(box.value);
    document.getElementById('fpVal').classList.remove('err');
    setFpValCheck(box.value > 0); // 已有值 → 綠勾
    // 顯示計算值（參考）與最終值
    var displayNew = box.newValue > 0 ? box.newValue : calcNewPrice(box.value);
    document.getElementById('fpCalc').textContent = calcNewPrice(box.value);
    document.getElementById('fpNew').value = displayNew;
    document.getElementById('fp').classList.add('open');
    setTimeout(function() { document.getElementById('fpVal').focus(); document.getElementById('fpVal').select(); }, 260);
    App.setSt('編輯已框選的價格');
  }

  // 點擊 fp 外部區域 → 抖動底部按鈕群提示，不彈出確認視窗
  function nudgeButtons() {
    var foot = document.getElementById('fpFoot');
    if (!foot) return;
    foot.classList.remove('shake');
    // force reflow 讓動畫可重複觸發
    void foot.offsetWidth;
    foot.classList.add('shake');
    setTimeout(function() { foot.classList.remove('shake'); }, 500);
  }

  function reqClose() {
    close();
  }

  function close() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    _setTextMode(false); // 重置文字工具模式 UI
    document.getElementById('fp').classList.remove('open');
    document.getElementById('fp').querySelector('.fp-title').textContent = '輸入價格資訊';
    pendingBox = null;
    editingId = null;
    App.redraw();
  }

  function confirm() {
    // ── 文字工具模式：儲存 textContent ──
    if (_isTextBox) {
      var textContent = document.getElementById('fpTextContent').value;
      if (!textContent.trim()) {
        document.getElementById('fpTextContent').classList.add('err');
        document.getElementById('fpTextContent').focus();
        return;
      }
      if (!pendingBox) return;
      stickyFontFamily = document.getElementById('fpFontSel').value;
      document.getElementById('fontSel').value = stickyFontFamily;
      var _tFsInput = parseInt(document.getElementById('fpFontSize').value);
      var _tFontSize = (_tFsInput > 0) ? _tFsInput : 0;
      stickyFontSize = _tFontSize;
      var _tLsInput = parseFloat(document.getElementById('fpLetterSpacing').value);
      var _tLetterSpacing = isNaN(_tLsInput) ? 0 : _tLsInput;
      stickyLetterSpacing = _tLetterSpacing;
      var _tBold = document.getElementById('fpBold').classList.contains('active');
      stickyBold = _tBold;
      var _tItalic = document.getElementById('fpItalic').classList.contains('active');
      stickyItalic = _tItalic;
      var _tStrike = document.getElementById('fpStrike').classList.contains('active');
      stickyStrikethrough = _tStrike;
      var _tFontColor = stickyFontColor;
      var _tTextAlign = stickyTextAlign;
      var _tMode = (typeof FillEngine !== 'undefined') ? FillEngine.getMode() : 'autofill';
      if (editingId !== null) {
        App.updateBox(editingId, {
          isTextBox: true, textContent: textContent,
          orient: fpOrient, fontSize: _tFontSize, fontColor: _tFontColor,
          fontFamily: stickyFontFamily, letterSpacing: _tLetterSpacing,
          bold: _tBold, italic: _tItalic, strikethrough: _tStrike, textAlign: _tTextAlign
        });
        App.setSt('已更新文字框');
      } else {
        App.addBox({
          id: Date.now() + '' + Math.floor(Math.random() * 10000),
          x: pendingBox.x, y: pendingBox.y, w: pendingBox.w, h: pendingBox.h,
          isTextBox: true, textContent: textContent,
          orient: fpOrient, fontSize: _tFontSize, fontColor: _tFontColor,
          fontFamily: stickyFontFamily, letterSpacing: _tLetterSpacing,
          bold: _tBold, italic: _tItalic, strikethrough: _tStrike, textAlign: _tTextAlign,
          fillMode: _tMode,
          patchSource: (_tMode === 'patch' && typeof FillEngine !== 'undefined') ? FillEngine.getPatchSource() : null
        });
        App.setSt('已新增文字框：' + textContent);
      }
      document.getElementById('fp').classList.remove('open');
      _setTextMode(false);
      pendingBox = null;
      editingId = null;
      return;
    }

    // ── 價格模式 ──
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

    // 讀取前後綴選項
    var priceAffix = document.getElementById('selAffix').value;
    stickyPriceAffix = priceAffix;

    // 讀取最終新價格（可能是使用者手動覆蓋的）
    var newValInput = parseInt(document.getElementById('fpNew').value);
    var newValue = (newValInput > 0) ? newValInput : calcNewPrice(v);

    var currentMode = (typeof FillEngine !== 'undefined') ? FillEngine.getMode() : 'autofill';

    if (editingId !== null) {
      App.updateBox(editingId, {
        value: v, orient: fpOrient, group: fpGroup,
        fontSize: fontSize, newValue: newValue, fontColor: fontColor,
        fontFamily: stickyFontFamily, letterSpacing: letterSpacing,
        bold: bold, italic: italic, strikethrough: strikethrough, textAlign: textAlign,
        priceAffix: priceAffix
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
        priceAffix: priceAffix,
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
    document.getElementById('fpPct').textContent = pct + '%';
    // Deal % 列：開啟時顯示
    var dealRow = document.getElementById('fpDealRow');
    var dealEl  = document.getElementById('fpDeal');
    if (dealRow && dealEl) {
      var on = App.dealIsActive();
      dealRow.style.display = on ? '' : 'none';
      if (on) dealEl.textContent = App.getGlobalDeal() + '%';
    }
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

  function onAffixChange() {
    stickyPriceAffix = document.getElementById('selAffix').value;
    if (App.isPreview()) App.redraw();
  }

  // ── 刪除當前價格框 ──
  function deleteCurrentBox() {
    if (editingId !== null) {
      // 編輯既有框：詢問確認
      var id = editingId;
      App.showCD(
        '刪除價格框',
        '確定刪除這個價格框？刪除後可透過「上一步」還原。',
        '返回',
        '確認刪除',
        function() {
          close();
          App.deleteBox(id);
        }
      );
    } else {
      // 新建框尚未儲存：直接關閉（相當於取消）
      close();
    }
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

    stickyRound10 = document.getElementById('ckRound10').checked;
    stickyRound5  = document.getElementById('ckRound5').checked;

    var settings = {
      fontFamily: stickyFontFamily,
      fontSize: stickyFontSize,
      letterSpacing: stickyLetterSpacing,
      fontColor: stickyFontColor,
      bold: stickyBold,
      italic: stickyItalic,
      strikethrough: stickyStrikethrough,
      textAlign: stickyTextAlign,
      round5: stickyRound5,
      round10: stickyRound10
    };

    App.showCD(
      '套用至全部 ' + count + ' 個價格框',
      '目前的字樣設定（字型、大小、間距、顏色、格式、對齊、四捨五入）將覆蓋所有價格框的設定，無法還原。',
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
    openText: openText,
    openEdit: openEdit,
    reqClose: reqClose,
    nudgeButtons: nudgeButtons,
    close: close,
    confirm: confirm,
    setOrient: setOrient,
    selectGroup: selectGroup,
    updateGroupInfo: updateGroupInfo,
    updateCommissionUI: updateCommissionUI,
    updateNewPrice: updateNewPrice,
    onRoundChange: onRoundChange,
    onColorInput: onColorInput,
    resetColor: resetColor,
    onFontChange: onFontChange,
    toggleBold: toggleBold,
    toggleItalic: toggleItalic,
    toggleStrikethrough: toggleStrikethrough,
    setAlign: setAlign,
    onAffixChange: onAffixChange,
    applyToAll: applyToAll,
    getGroup: getGroup,
    getStickyFontSize: getStickyFontSize,
    showGroupGuide: showGroupGuide,
    closeGroupGuide: closeGroupGuide,
    deleteCurrentBox: deleteCurrentBox
  };
})();
