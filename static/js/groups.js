// groups.js — 批次群組管理

var Groups = (function() {
  var groups = [];
  var GROUP_COLORS = ['#C0392B','#2980B9','#27AE60','#8E44AD','#E67E22','#16A085','#D35400','#2C3E50'];

  function load() {
    try { groups = JSON.parse(localStorage.getItem('mgrp') || '[]'); } catch(e) { groups = []; }
  }

  function save() {
    try { localStorage.setItem('mgrp', JSON.stringify(groups)); } catch(e) {}
  }

  function getAll() { return groups; }

  function getById(id) {
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].id === id) return groups[i];
    }
    return null;
  }

  function add(name) {
    var id = 'g' + Date.now();
    var color = GROUP_COLORS[groups.length % GROUP_COLORS.length];
    groups.push({ id: id, name: name, pct: 0, color: color, open: false });
    save();
    return id;
  }

  function remove(id) {
    groups = groups.filter(function(g) { return g.id !== id; });
    save();
  }

  function setPct(id, pct) {
    var g = getById(id);
    if (g) { g.pct = pct; save(); }
  }

  function toggleOpen(id) {
    var g = getById(id);
    if (g) { g.open = !g.open; save(); }
  }

  function hexAlpha(hex, a) {
    var r = parseInt(hex.slice(1,3), 16);
    var gv = parseInt(hex.slice(3,5), 16);
    var b = parseInt(hex.slice(5,7), 16);
    return 'rgba(' + r + ',' + gv + ',' + b + ',' + a + ')';
  }

  function render(boxes) {
    var el = document.getElementById('groupList');
    if (!groups.length) {
      el.innerHTML = '<div style="text-align:center;padding:14px;color:var(--gmd);font-size:12px;border:1px dashed var(--glt);border-radius:var(--r)">尚未建立群組</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var cnt = 0;
      for (var j = 0; j < boxes.length; j++) { if (boxes[j].group === g.id) cnt++; }
      var pctStr = (g.pct >= 0 ? '+' : '') + g.pct + '%';
      html += '<div class="group-item">';
      html += '<div class="group-hd" onclick="Groups.toggleOpen(\'' + g.id + '\'); Groups.render(App.getBoxes());">';
      html += '<div class="group-dot" style="background:' + g.color + '"></div>';
      html += '<div class="group-name">' + g.name + '</div>';
      html += '<div class="group-cnt">' + cnt + '個框</div>';
      html += '<div class="group-pct-badge" style="background:' + hexAlpha(g.color, 0.1) + ';color:' + g.color + '">' + pctStr + '</div>';
      html += '</div>';
      html += '<div class="group-body' + (g.open ? ' open' : '') + '" id="gb-' + g.id + '">';
      html += '<div class="group-pct-row">';
      html += '<input type="number" value="' + g.pct + '" placeholder="百分比" onchange="Groups.setPct(\'' + g.id + '\', parseFloat(this.value)||0); Groups.render(App.getBoxes()); App.renderPriceList(); if(App.isPreview()) App.redraw();" style="font-size:13px;padding:6px 9px;">';
      html += '<div class="pct-badge" style="font-size:12px;padding:6px 8px;min-width:46px">' + pctStr + '</div>';
      html += '</div>';
      html += '<button class="btn btn-ghost btn-sm" onclick="App.deleteGroup(\'' + g.id + '\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>刪除群組</button>';
      html += '</div></div>';
    }
    el.innerHTML = html;
  }

  function renderChips(currentGroup) {
    var el = document.getElementById('fpGrpSel');
    if (!groups.length) {
      el.innerHTML = '<div style="font-size:12px;color:var(--gmd)">先到「批次」頁建立群組</div>';
      return;
    }
    var html = '<button class="grp-chip' + (currentGroup === null ? ' active' : '') + '" onclick="FloatPanel.selectGroup(null, event)">全域</button>';
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var isActive = currentGroup === g.id;
      var style = isActive ? 'border-color:' + g.color + ';color:' + g.color + ';background:' + hexAlpha(g.color, 0.08) + ';' : '';
      html += '<button class="grp-chip' + (isActive ? ' active' : '') + '" style="' + style + '" onclick="FloatPanel.selectGroup(\'' + g.id + '\', event)">' + g.name + '</button>';
    }
    el.innerHTML = html;
  }

  load();

  return {
    getAll: getAll,
    getById: getById,
    add: add,
    remove: remove,
    setPct: setPct,
    toggleOpen: toggleOpen,
    render: render,
    renderChips: renderChips,
    hexAlpha: hexAlpha,
    save: save
  };
})();
