// library.js — 菜單庫管理

var Library = (function() {
  var library = [];

  function load() {
    try { library = JSON.parse(localStorage.getItem('mlib') || '[]'); } catch(e) { library = []; }
  }

  function save() {
    try {
      localStorage.setItem('mlib', JSON.stringify(library));
    } catch(e) {
      App.setSt('⚠ 儲存空間不足，部分資料未存入');
    }
  }

  function getAll() { return library; }

  function saveEntry(imgB64, imgObj, boxes, groups, fontSel, orientation, globalPct, fmtStr, nameStr) {
    var nm = nameStr.replace(/\.[^.]+$/, '');
    var sizeOk = imgB64 && imgB64.length < 4 * 1024 * 1024;
    var entry = {
      id: 'lib' + Date.now(),
      name: nm,
      date: new Date().toLocaleDateString('zh-TW'),
      time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      font: fontSel,
      orientation: orientation,
      globalPct: globalPct,
      groups: JSON.parse(JSON.stringify(groups)),
      boxes: boxes.map(function(b) { return Object.assign({}, b); }),
      imgData: sizeOk ? imgB64 : null,
      fmt: fmtStr
    };
    if (sizeOk && imgObj) {
      var th = document.createElement('canvas');
      var sc = Math.min(1, 80 / imgObj.width, 60 / imgObj.height);
      th.width = Math.round(imgObj.width * sc);
      th.height = Math.round(imgObj.height * sc);
      th.getContext('2d').drawImage(imgObj, 0, 0, th.width, th.height);
      entry.thumb = th.toDataURL('image/jpeg', 0.6);
    }
    var ex = -1;
    for (var i = 0; i < library.length; i++) {
      if (library[i].name === entry.name) { ex = i; break; }
    }
    if (ex >= 0) {
      return { existing: true, entry: entry, index: ex };
    } else {
      library.unshift(entry);
      save();
      render();
      return { existing: false, entry: entry };
    }
  }

  function updateEntry(index, entry) {
    library[index] = entry;
    save();
    render();
  }

  function removeEntry(id) {
    library = library.filter(function(l) { return l.id !== id; });
    save();
    render();
  }

  function getById(id) {
    for (var i = 0; i < library.length; i++) {
      if (library[i].id === id) return library[i];
    }
    return null;
  }

  function render() {
    document.getElementById('libCnt').textContent = library.length + ' 筆';
    var el = document.getElementById('libList');
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
      var cnt = e.boxes ? e.boxes.length : 0;
      var meta = cnt + '個框・' + e.date + ' ' + e.time + (e.imgData ? '' : '・需補圖');
      html += '<div class="lib-item">';
      html += '<div class="lib-item-hd">';
      html += thumbHtml;
      html += '<div class="lib-info"><div class="lib-name">' + e.name + '</div><div class="lib-meta">' + meta + '</div></div>';
      html += '<div class="lib-acts">';
      html += '<button class="lib-btn" onclick="App.loadFromLib(\'' + e.id + '\')" title="載入繼續編輯"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
      html += '<button class="lib-btn del" onclick="App.deleteFromLib(\'' + e.id + '\')" title="刪除"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>';
      html += '</div></div></div>';
    }
    el.innerHTML = html;
  }

  load();

  return {
    getAll: getAll,
    getById: getById,
    saveEntry: saveEntry,
    updateEntry: updateEntry,
    removeEntry: removeEntry,
    render: render
  };
})();
