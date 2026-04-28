// library.js — 菜單庫管理（v1.5.43）
// 圖片存入 IndexedDB（不限大小），metadata 存入 localStorage

var Library = (function() {
  var library = [];
  var MAX_LIB  = 10;                          // 正常筆數上限
  var EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;   // 7 天後自動移除（毫秒）

  // ── IndexedDB ──
  var _db = null;
  var _DB_NAME = 'menuImgDB';
  var _DB_VER  = 1;
  var _STORE   = 'images';

  function _openDB(cb) {
    if (_db) { cb(_db); return; }
    var req = indexedDB.open(_DB_NAME, _DB_VER);
    req.onupgradeneeded = function(e) {
      e.target.result.createObjectStore(_STORE);
    };
    req.onsuccess = function(e) { _db = e.target.result; cb(_db); };
    req.onerror   = function()  { cb(null); };
  }

  function _idbPut(id, dataUrl, cb) {
    _openDB(function(db) {
      if (!db) { if (cb) cb(false); return; }
      var tx = db.transaction(_STORE, 'readwrite');
      tx.objectStore(_STORE).put(dataUrl, id);
      tx.oncomplete = function() { if (cb) cb(true); };
      tx.onerror    = function() { if (cb) cb(false); };
    });
  }

  function _idbGet(id, cb) {
    _openDB(function(db) {
      if (!db) { cb(null); return; }
      var req = db.transaction(_STORE, 'readonly').objectStore(_STORE).get(id);
      req.onsuccess = function() { cb(req.result || null); };
      req.onerror   = function() { cb(null); };
    });
  }

  function _idbDel(id) {
    _openDB(function(db) {
      if (!db) return;
      db.transaction(_STORE, 'readwrite').objectStore(_STORE).delete(id);
    });
  }

  // ── localStorage（只存 metadata + 縮圖，不存完整圖片）──
  function _loadMeta() {
    try { library = JSON.parse(localStorage.getItem('mlib') || '[]'); } catch(e) { library = []; }
    // 向下相容：移除舊版 imgData 欄位，改由 IndexedDB 提供
    library.forEach(function(e) {
      if (e.imgData) {
        // 遷移到 IndexedDB（非同步，不阻塞）
        _idbPut(e.id, e.imgData, function() {});
        delete e.imgData;
      }
    });
    _purgeExpired();
  }

  function _saveMeta() {
    try {
      localStorage.setItem('mlib', JSON.stringify(library));
    } catch(e) {
      if (typeof App !== 'undefined') App.setSt('⚠ 儲存空間不足，部分資料未存入');
    }
  }

  // ── 自動清除到期記錄 ──
  function _purgeExpired() {
    var now  = Date.now();
    var dead = [];
    library  = library.filter(function(e) {
      if (e.expireAt && e.expireAt <= now) { dead.push(e.id); return false; }
      return true;
    });
    if (dead.length) {
      dead.forEach(function(id) { _idbDel(id); });
      _saveMeta();
    }
  }

  // ── 超出上限時對超出部分的最舊記錄標記到期 ──
  function _checkLimit() {
    var now = Date.now();
    // library 已按新到舊排序（index 0 = 最新）
    for (var i = MAX_LIB; i < library.length; i++) {
      if (!library[i].expireAt) {
        library[i].expireAt = now + EXPIRE_MS;
      }
    }
  }

  // ── 剩餘天數文字 ──
  function _expireLabel(expireAt) {
    var ms = expireAt - Date.now();
    if (ms <= 0) return '今日刪除';
    var days = Math.ceil(ms / (24 * 60 * 60 * 1000));
    return days + ' 天後刪除';
  }

  // ── Public API ──
  function getAll() { return library; }

  function getById(id) {
    for (var i = 0; i < library.length; i++) {
      if (library[i].id === id) return library[i];
    }
    return null;
  }

  // 非同步取得圖片（優先 IndexedDB，向下相容 imgData）
  function getImage(id, cb) {
    _idbGet(id, function(data) {
      if (data) { cb(data); return; }
      // fallback（舊版遷移前或遷移失敗）
      var e = getById(id);
      cb(e && e.imgData ? e.imgData : null);
    });
  }

  function saveEntry(imgB64, imgObj, boxes, groups, fontSel, orientation, globalPct, fmtStr, nameStr) {
    var nm = nameStr.replace(/\.[^.]+$/, '');
    var entry = {
      id         : 'lib' + Date.now(),
      name       : nm,
      date       : new Date().toLocaleDateString('zh-TW'),
      time       : new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      font       : fontSel,
      orientation: orientation,
      globalPct  : globalPct,
      groups     : JSON.parse(JSON.stringify(groups)),
      // 剝除不可序列化的快取屬性（防 _fillCache:{} 造成 drawImage 失敗）
      boxes      : boxes.map(function(b) {
        var c = Object.assign({}, b);
        delete c._fillCache; delete c._fillCacheKey; delete c._aiDone;
        return c;
      }),
      fmt        : fmtStr,
      savedAt    : Date.now(),
      expireAt   : null
    };

    // 縮圖（永遠生成，存於 localStorage entry 中）
    if (imgObj) {
      var th = document.createElement('canvas');
      var sc = Math.min(1, 80 / imgObj.width, 60 / imgObj.height);
      th.width  = Math.round(imgObj.width  * sc);
      th.height = Math.round(imgObj.height * sc);
      th.getContext('2d').drawImage(imgObj, 0, 0, th.width, th.height);
      entry.thumb = th.toDataURL('image/jpeg', 0.6);
    }

    // 同名檢查（更新）
    var ex = -1;
    for (var i = 0; i < library.length; i++) {
      if (library[i].name === nm) { ex = i; break; }
    }

    if (ex >= 0) {
      entry.id = library[ex].id; // 沿用舊 id，讓 IndexedDB 覆寫同一筆
      if (imgB64) _idbPut(entry.id, imgB64);
      return { existing: true, entry: entry, index: ex };
    } else {
      if (imgB64) _idbPut(entry.id, imgB64);
      library.unshift(entry);
      _checkLimit();
      _saveMeta();
      render();
      return { existing: false, entry: entry };
    }
  }

  function updateEntry(index, entry) {
    library[index] = entry;
    _checkLimit();
    _saveMeta();
    render();
  }

  function removeEntry(id) {
    library = library.filter(function(l) { return l.id !== id; });
    _idbDel(id);
    _saveMeta();
    render();
  }

  // 再製：複製整筆記錄（含 IndexedDB 圖片）
  function duplicateEntry(id) {
    var src = getById(id);
    if (!src) return;
    var newEntry = JSON.parse(JSON.stringify(src));
    newEntry.id       = 'lib' + Date.now() + '' + Math.round(Math.random() * 1e4);
    newEntry.name     = src.name + '_複本';
    newEntry.date     = new Date().toLocaleDateString('zh-TW');
    newEntry.time     = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    newEntry.savedAt  = Date.now();
    newEntry.expireAt = null;
    library.unshift(newEntry);
    // 非同步複製圖片到新 id
    _idbGet(src.id, function(imgData) {
      if (imgData) _idbPut(newEntry.id, imgData);
    });
    _checkLimit();
    _saveMeta();
    render();
    if (typeof App !== 'undefined') App.setSt('✅ 已再製：' + newEntry.name);
  }

  function render() {
    // 先清除到期記錄（每次 render 觸發，避免 stale 顯示）
    _purgeExpired();

    var normalCount = library.filter(function(e) { return !e.expireAt; }).length;
    var cntEl = document.getElementById('libCnt');
    if (cntEl) {
      cntEl.textContent = normalCount + ' / ' + MAX_LIB + ' 筆';
      // 接近上限 → 加深背景為品牌嫣紅
      if (normalCount >= MAX_LIB) {
        cntEl.style.background = 'var(--red)';
        cntEl.style.color      = '#fff';
      } else {
        cntEl.style.background = '';
        cntEl.style.color      = '';
      }
    }

    var el = document.getElementById('libList');
    if (!el) return;

    if (!library.length) {
      el.innerHTML = '<div class="empty-lib">尚無儲存的菜單<br>在編輯頁點擊「儲存至菜單庫」</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < library.length; i++) {
      var e = library[i];
      var thumbHtml = e.thumb
        ? '<img class="lib-thumb" src="' + e.thumb + '" alt="">'
        : '<div class="lib-thumb-ph"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>';
      var cnt  = e.boxes ? e.boxes.length : 0;
      var meta = cnt + '個框・' + e.date + ' ' + e.time;
      var expireHtml = e.expireAt
        ? '<div class="lib-expire">' + _expireLabel(e.expireAt) + '</div>'
        : '';

      html += '<div class="lib-item">';
      html += '<div class="lib-item-hd">';
      html += thumbHtml;
      html += '<div class="lib-info"><div class="lib-name">' + e.name + '</div>' +
              '<div class="lib-meta">' + meta + '</div>' + expireHtml + '</div>';
      html += '<div class="lib-acts">';
      // 繼續編輯
      html += '<button class="lib-btn" onclick="App.loadFromLib(\'' + e.id + '\')" title="載入繼續編輯">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round">' +
              '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
              '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
      // 再製
      html += '<button class="lib-btn" onclick="Library.duplicateEntry(\'' + e.id + '\')" title="再製一份">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round">' +
              '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
              '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>';
      // 刪除
      html += '<button class="lib-btn del" onclick="App.deleteFromLib(\'' + e.id + '\')" title="刪除">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round">' +
              '<polyline points="3 6 5 6 21 6"/>' +
              '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>';
      html += '</div></div></div>';
    }
    el.innerHTML = html;
  }

  _loadMeta();

  return {
    getAll         : getAll,
    getById        : getById,
    getImage       : getImage,
    saveEntry      : saveEntry,
    updateEntry    : updateEntry,
    removeEntry    : removeEntry,
    duplicateEntry : duplicateEntry,
    render         : render
  };
})();
