/* 页面控制：种子化随机 + 生成 */
function hashStr(s) {
  var h = 1779033703 ^ s.length;
  for (var i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
var svg = d3.select('#map');
var EXTERNAL_LEXES = [];  // 运行时从 lexicons/index.js 读取词库清单（加词库无需改 HTML）
/* 词库切换：orig = 原版随机音素名（内置），其余 = 外部词库（lexicons 文件夹，运行时加载）*/ 
var currentLex = 'orig';
function setLex(v) {
  currentLex = LEXICONS[v] ? v : 'orig';
  var zh = currentLex !== 'orig';
  d3.selectAll('text.city').classed('dnd', zh).text(function (d) {return zh ? d.textZh : d.text;});
  d3.selectAll('text.region').classed('dnd', zh).text(function (d) {return zh ? d.textZh : d.text;});
}
/* 词库下拉动态生成（按运行时已加载的词库）*/
function buildLexSelect() {
  var sel = document.getElementById('lexsel');
  if (!sel) return;
  sel.innerHTML = '';
  var items = [['orig', '原版']];
  for (var id in LEXICONS) items.push([id, LEXICONS[id].label || id]);
  for (var i = 0; i < items.length; i++) {
    var o = document.createElement('option');
    o.value = items[i][0]; o.textContent = items[i][1];
    if (items[i][0] === currentLex) o.selected = true;
    sel.appendChild(o);
  }
}
/* 词库异步加载：动态 <script src> 加载 lexicons/lex-<id>.js（file:// 下 script 不受 CORS 限制）
   清单来自 lexicons/index.js（window.LEX_MANIFEST）；缺失/失败 → 自动回退原版，绝不报错 */
function __loadLexes(list) {
  EXTERNAL_LEXES = list || [];
  var pending = EXTERNAL_LEXES.length;
  function done() {
    if (--pending > 0) return;
    if (!LEXICONS[currentLex]) currentLex = 'orig';
    buildLexSelect();
    gen();
  }
  if (!EXTERNAL_LEXES.length) { buildLexSelect(); gen(); return; }
  for (var i = 0; i < EXTERNAL_LEXES.length; i++) {
    (function (id) {
      var s = document.createElement('script');
      s.src = 'lexicons/lex-' + id + '.js';
      s.onload = s.onerror = function () {
        if (window.LEX_DEFS && window.LEX_DEFS[id]) LEXICONS[id] = window.LEX_DEFS[id];
        done();
      };
      document.head.appendChild(s);
    })(EXTERNAL_LEXES[i]);
  }
}
(function () {
  var m = location.search.match(/[?&]lex=([a-z]+)/);
  if (m) currentLex = m[1];
})();
/* 先加载词库清单 index.js，再按清单加载各词库 */
var __ms = document.createElement('script');
__ms.src = 'lexicons/index.js';
__ms.onload = function () { __loadLexes(window.LEX_MANIFEST || []); };
__ms.onerror = function () { __loadLexes([]); };
document.head.appendChild(__ms);
/* 随机种子：只填入随机数字种子，不立即生成（生成交给「生成地图」按钮） */
function randomSeed() {
  var seed = Math.floor(Math.random() * 1e9) >>> 0;
  document.getElementById('seed').value = seed;
  document.getElementById('status').textContent = '随机种子已填入：' + seed + '（点「生成地图」生成）';
}
/* ---- 地图缩放（viewBox 动态控制：滚轮缩放 + 拖拽平移 + 双击复位 + 按钮组）---- */
var vb = { x: -500, y: -500, w: 1000, h: 1000 };
var VB_MIN_W = 1000 / 8; // 最大放大 8 倍
var mapEl = document.getElementById('map');
function applyVB() { mapEl.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h); }
function clampVB() {
  if (vb.w < VB_MIN_W) { var k = VB_MIN_W / vb.w; vb.w = VB_MIN_W; vb.h *= k; }
  if (vb.w > 1000) { var k = 1000 / vb.w; vb.w = 1000; vb.h *= k; }
  var maxX = -500 + 1000 - vb.w, maxY = -500 + 1000 - vb.h;
  if (vb.x < -500) vb.x = -500; if (vb.x > maxX) vb.x = maxX;
  if (vb.y < -500) vb.y = -500; if (vb.y > maxY) vb.y = maxY;
}
function zoomAt(cx, cy, factor) {
  vb.w *= factor; vb.h *= factor;
  vb.x = cx - (cx - vb.x) * factor; vb.y = cy - (cy - vb.y) * factor;
  clampVB(); applyVB();
}
function zoomBy(f) { zoomAt(vb.x + vb.w / 2, vb.y + vb.h / 2, f); }
function resetView() { vb = { x: -500, y: -500, w: 1000, h: 1000 }; applyVB(); }
mapEl.addEventListener('wheel', function (e) {
  e.preventDefault();
  var r = mapEl.getBoundingClientRect();
  var cx = vb.x + (e.clientX - r.left) / r.width * vb.w;
  var cy = vb.y + (e.clientY - r.top) / r.height * vb.h;
  zoomAt(cx, cy, e.deltaY > 0 ? 1.2 : 1 / 1.2);
}, { passive: false });
var drag = null;
mapEl.addEventListener('mousedown', function (e) {
  if (e.button !== 0) return;
  drag = { sx: e.clientX, sy: e.clientY, bx: vb.x, by: vb.y };
  mapEl.classList.add('dragging');
  e.preventDefault();
});
window.addEventListener('mousemove', function (e) {
  if (!drag) return;
  var r = mapEl.getBoundingClientRect();
  vb.x = drag.bx - (e.clientX - drag.sx) / r.width * vb.w;
  vb.y = drag.by - (e.clientY - drag.sy) / r.height * vb.h;
  clampVB(); applyVB();
});
window.addEventListener('mouseup', function () {
  if (drag) { drag = null; mapEl.classList.remove('dragging'); }
});
mapEl.addEventListener('dblclick', resetView);
/* ---- 地图自适应视口：svg 保持正方形，尺寸 = min(容器宽, 视口剩余高) ---- */
function fitSvg() {
  var box = document.querySelector('.mapbox');
  var top = box.getBoundingClientRect().top; // mapbox 顶部到视口顶（含头部与 body padding）
  var availW = window.innerWidth - 48; // body padding 24*2，地图可用的视口宽度
  var availH = window.innerHeight - top - 44; // 44 = mapbox padding 20 + body 底部 padding 24
  var s = Math.min(960, availW, availH);
  if (s < 200) s = 200;
  mapEl.style.width = s + 'px';
  mapEl.style.height = s + 'px';
}
window.addEventListener('resize', function () {
  if (document.querySelector('.mapbox').classList.contains('fullscreen')) applyFsSize();
  else fitSvg();
});
fitSvg();
/* ---- 网页内全屏：mapbox 放大占满整个网页（再点还原），非浏览器全屏 ---- */
function applyFsSize() {
  // 全屏时 svg 放大到视口允许的最大正方形（与 CSS max-width/max-height 一致）
  var s = Math.min(window.innerWidth * 0.96, window.innerHeight * 0.94);
  mapEl.style.width = s + 'px';
  mapEl.style.height = s + 'px';
}
function toggleFullscreen() {
  var mb = document.querySelector('.mapbox');
  var isFs = mb.classList.toggle('fullscreen');
  var b = document.querySelector('.map-tools button[data-fs]');
  if (b) b.textContent = isFs ? '还原' : '全屏';
  if (isFs) { resetView(); applyFsSize(); }
  else fitSvg();
}
/* ---- 图层显隐开关：道路 / 城市 / 领地（标记与文字一起隐藏）----
   切换式按钮：点击一次隐藏、再点恢复；隐藏时按钮高亮。
   layerState[k]=true 表示该层当前被隐藏；生成新地图后自动重新应用。 */
var layerState = { road: false, city: false, terr: false };
var layerSelectors = {
  road: 'path.road, path.roadsea',   // 陆地道路（实线）+ 海上道路（虚线）
  city: 'circle.city, text.city',    // 城市圆点 + 城市名称
  terr: 'path.border, text.region'   // 领地边界 + 领地名称
};
function applyLayers() {
  for (var k in layerState) {
    d3.selectAll(layerSelectors[k]).classed('layer-hidden', layerState[k]);
    var btn = document.querySelector('.map-tools button[data-layer="' + k + '"]');
    if (btn) btn.classList.toggle('active', layerState[k]);
  }
}
function toggleLayer(k) {
  if (!(k in layerState)) return;
  layerState[k] = !layerState[k];
  applyLayers();
}
/* ---- 工具条折叠 / 展开：按钮组向右侧收起，只留右侧的小按钮 ---- */
function toggleTools() {
  var mt = document.querySelector('.map-tools');
  if (!mt) return;
  var collapsed = mt.classList.toggle('collapsed');
  var b = mt.querySelector('.fold-btn');
  if (b) {
    b.textContent = collapsed ? '«' : '»';
    b.title = collapsed ? '展开工具按钮' : '折叠工具按钮';
  }
}
/* ---- 导出当前地图为 PNG 图片 ----
   特性：
   1) 受图层隐藏开关影响：克隆 SVG 时保留 layer-hidden class，注入页面样式后 display:none 规则同步生效；
   2) 不受缩放 / 全屏影响：始终用生成时的完整 viewBox 导出（缩放按钮会改写 svg 的 viewBox，这里显式覆盖），
      分辨率 = 完整地图 x2（1000 → 2000px，可调 scale）。 */
function exportPNG() {
  var map = document.getElementById('map');
  if (!map || map.childNodes.length === 0) {
    document.getElementById('status').textContent = '请先点「生成地图」，再导出图片';
    return;
  }
  var status = document.getElementById('status');
  status.textContent = '正在导出图片…';
  var ex = defaultParams.extent;                              // extent 恒为 1x1，此处按生成逻辑通用计算
  var fullVB = (-1000 * ex.width / 2) + ' ' + (-1000 * ex.height / 2) + ' ' +
               (1000 * ex.width) + ' ' + (1000 * ex.height);  // -500 -500 1000 1000
  var scale = 2;                                              // 导出分辨率倍率
  var cw = Math.round(1000 * ex.width * scale);
  var ch = Math.round(1000 * ex.height * scale);
  /* 克隆 SVG（保留 id 与图层 class，隐藏状态随样式注入生效），注入页面全部样式 */
  var clone = map.cloneNode(true);
  clone.setAttribute('viewBox', fullVB);
  var hlEls = clone.querySelectorAll('.hl');   // 导出时不带联动高亮（临时命名保留）
  for (var hi = 0; hi < hlEls.length; hi++) hlEls[hi].classList.remove('hl');
  var styles = [];
  var sels = document.querySelectorAll('style');
  for (var i = 0; i < sels.length; i++) styles.push(sels[i].textContent);
  styles.push('svg#map{width:' + cw + 'px!important;height:' + ch + 'px!important;' +
              'max-width:none!important;max-height:none!important;display:block;}');
  var st = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  st.textContent = styles.join('\n');
  clone.insertBefore(st, clone.firstChild);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  var xml = new XMLSerializer().serializeToString(clone);
  var img = new Image();
  img.onload = function () {
    var canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f5ecd7';                                // 羊皮纸底色（与页面一致）
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    canvas.toBlob(function (blob) {
      var seedTxt = document.getElementById('seed').value.trim();
      var fname = '程序化大陆-种子' + (seedTxt || '随机') + '.png';
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      status.textContent = '图片已导出：' + fname + '（' + cw + '×' + ch + 'px）';
    }, 'image/png');
  };
  img.onerror = function () {
    status.textContent = '导出失败：SVG 渲染出错';
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
}
/* ---- 侧边栏：导出 + 名称管理（领地-城市两级）----
   临时修改：重新生成地图后全部恢复默认；导出 PNG 时名称生效（高亮不导出）---- */
var render = null;          // 全局 render（doMap 中赋值），侧边栏读取领地/城市/道路数据
var hlState = null;         // 当前高亮：{type:'city'|'region', idx}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/* ---- 三级关联：领地 → 城市 → 道路 ---- */
function regionMembers(r) {
  var cities = render.cities, terr = render.terr, nterrs = Math.min(render.params.nterrs, cities.length);
  var members = [r];
  for (var i = nterrs; i < cities.length; i++) {
    if (terr[cities[i]] === cities[r]) members.push(i);
  }
  return members;
}
function cityNameOf(i) {
  var els = document.querySelectorAll('#map text.city');
  return els[i] ? els[i].textContent : ('城市' + (i + 1));
}
function regionNameOf(i) {
  var els = document.querySelectorAll('#map text.region');
  return els[i] ? els[i].textContent : ('领地' + (i + 1));
}
function renderSideTree() {
  var tree = document.getElementById('spTree');
  if (!tree) return;
  if (!render || !render.cities) { tree.innerHTML = '<div class="sp-empty">先生成地图</div>'; return; }
  var nterrs = Math.min(render.params.nterrs, render.cities.length);
  var html = '';
  for (var r = 0; r < nterrs; r++) {
    var members = regionMembers(r);
    var regEditing = (editing && editing.kind === 'region' && editing.idx === r);
    html += '<div class="sp-node sp-region' + (hlState && hlState.type === 'region' && hlState.idx === r ? ' hl-node' : '') + '">' +
            '<span class="sp-caret" onclick="toggleRegion(this)">▾</span>' +
            (regEditing
              ? '<input id="sp-edit-region-' + r + '" value="' + esc(regionNameOf(r)) + '" onkeydown="editKey(event,\'region\',' + r + ')" onblur="editBlur(\'region\',' + r + ')">' +
                '<button class="sp-edit ok" onclick="event.stopPropagation();editSave(\'region\',' + r + ')" title="保存">✓</button>' +
                '<button class="sp-edit no" onclick="event.stopPropagation();editCancel()" title="取消">✕</button>'
              : esc(regionNameOf(r)) +
                '<button class="sp-edit" onclick="event.stopPropagation();startEdit(\'region\',' + r + ')" title="改名">改</button>' +
                '<span class="sp-count">' + members.length + ' 城</span>') +
            '</div>';
    html += '<div class="sp-children" data-region="' + r + '">';
    for (var m = 0; m < members.length; m++) {
      var ci = members[m];
      var cityEditing = (editing && editing.kind === 'city' && editing.idx === ci);
      html += '<div class="sp-node sp-city' + (hlState && hlState.type === 'city' && hlState.idx === ci ? ' hl-node' : '') + '" onclick="highlightCity(' + ci + ')">' +
              (cityEditing
                ? '<input id="sp-edit-city-' + ci + '" value="' + esc(cityNameOf(ci)) + '" onkeydown="editKey(event,\'city\',' + ci + ')" onblur="editBlur(\'city\',' + ci + ')">' +
                  '<button class="sp-edit ok" onclick="event.stopPropagation();editSave(\'city\',' + ci + ')" title="保存">✓</button>' +
                  '<button class="sp-edit no" onclick="event.stopPropagation();editCancel()" title="取消">✕</button>'
                : esc(cityNameOf(ci)) +
                  '<button class="sp-edit" onclick="event.stopPropagation();startEdit(\'city\',' + ci + ')" title="改名">改</button>') +
              '</div>';
    }
    html += '</div>';
  }
  html += '<div class="sp-tip">点击树中城市 / 领地可在地图上高亮；点「改」直接在树中改名（回车保存）；重新生成后全部恢复默认。</div>';
  tree.innerHTML = html;
}
function toggleRegion(caret) {
  var ch = caret.parentNode.nextElementSibling;
  if (!ch) return;
  if (ch.style.display === 'none') {   // 当前收起 → 展开
    ch.style.display = '';
    caret.textContent = '▾';
  } else {                             // 当前展开 → 收起
    ch.style.display = 'none';
    caret.textContent = '▸';
  }
}
function renderSidePanel() {
  renderSideTree();
}
/* ---- 行内改名：点「改」原地变输入框，回车 / ✓ 保存，Esc / ✕ 取消，失焦也保存 ---- */
var editing = null;   // 当前编辑项 {kind:'region'|'city', idx}
function startEdit(kind, idx) {
  editing = {kind: kind, idx: idx};
  renderSideTree();
  var inp = document.getElementById('sp-edit-' + kind + '-' + idx);
  if (inp) { inp.focus(); inp.select(); }
}
function editSave(kind, idx) {
  var inp = document.getElementById('sp-edit-' + kind + '-' + idx);
  var v = inp ? inp.value.trim() : '';
  editing = null;
  if (v) {
    var els = document.querySelectorAll('#map ' + (kind === 'region' ? 'text.region' : 'text.city'));
    var el = els[idx];
    if (el) {
      var d = el.__datum;
      if (d) { d.text = v; d.textZh = v; }   // 中英文名同步更新，切换词库后保留用户修改
      el.textContent = v;
    }
  }
  renderSideTree();
}
function editCancel() {
  editing = null;
  renderSideTree();
}
function editKey(e, kind, idx) {
  if (e.key === 'Enter') { e.preventDefault(); editSave(kind, idx); }
  else if (e.key === 'Escape') { e.preventDefault(); editCancel(); }
}
function editBlur(kind, idx) {
  setTimeout(function () {   // 延迟让 ✓ / ✕ 的 click 先处理，避免重复保存
    if (editing && editing.kind === kind && editing.idx === idx) editSave(kind, idx);
  }, 120);
}
function toggleSide() {
  var p = document.getElementById('sidePanel');
  var closed = p.classList.toggle('closed');
  var b = p.querySelector('.sp-fold');
  if (b) { b.textContent = closed ? '»' : '«'; b.title = closed ? '展开侧栏' : '收起侧栏'; }
}
/* ---- 地图点击联动高亮：城市 → 相连道路；领地 → 领地内城市 ---- */
function clearHighlightNoRender() {
  var els = document.querySelectorAll('#map .hl');
  for (var i = 0; i < els.length; i++) els[i].classList.remove('hl');
  hlState = null;
}
function clearHighlight() {
  clearHighlightNoRender();
  renderSideTree();
}
function highlightCity(ci) {
  clearHighlightNoRender();
  hlState = {type: 'city', idx: ci};
  var circs = document.querySelectorAll('#map circle.city');
  if (circs[ci]) circs[ci].classList.add('hl');
  renderSideTree();
}
function highlightRegion(r) {
  clearHighlightNoRender();
  hlState = {type: 'region', idx: r};
  var members = regionMembers(r);
  var circs = document.querySelectorAll('#map circle.city');
  for (var i = 0; i < members.length; i++) if (circs[members[i]]) circs[members[i]].classList.add('hl');
  renderSideTree();
}
/* 地图点击：点击城市 / 领地联动高亮，点空白清除 */
mapEl.addEventListener('click', function (e) {
  if (drag) return;
  var t = e.target;
  if (t && t.tagName === 'circle' && t.classList.contains('city')) {
    var circs = document.querySelectorAll('#map circle.city');
    for (var i = 0; i < circs.length; i++) if (circs[i] === t) { highlightCity(i); break; }
  } else if (t && t.tagName === 'text' && t.classList.contains('region')) {
    var regs = document.querySelectorAll('#map text.region');
    for (var j = 0; j < regs.length; j++) if (regs[j] === t) { highlightRegion(j); break; }
  } else {
    clearHighlight();
  }
});
/* ---- 地图数据导出 / 导入：保存影响随机地图的参数（种子 / 细胞数 / 城市数 / 领地数）
   与领地城市名称，导入时自动恢复当时的地图与名称 ---- */
var lastGenParams = null;   // 最近一次生成生效的参数（导出数据用）
var pendingNames = null;    // 导入待应用的名称 {regions:[], cities:[]}

function statusbar(msg) {
  var st = document.getElementById('status');
  if (st) st.textContent = msg;
}
function exportData() {
  if (!lastGenParams || !render || !render.cities) { statusbar('先生成地图，再导出数据'); return; }
  var regs = [], cts = [];
  var regEls = document.querySelectorAll('#map text.region');
  for (var i = 0; i < regEls.length; i++) regs.push(regEls[i].textContent);
  var cityEls = document.querySelectorAll('#map text.city');
  for (var j = 0; j < cityEls.length; j++) cts.push(cityEls[j].textContent);
  var data = {
    app: 'terrain-demo',
    ver: 1,
    params: {
      seed: lastGenParams.seed,
      seedTxt: lastGenParams.seedTxt,
      npts: lastGenParams.npts,
      ncities: lastGenParams.ncities,
      nterrs: lastGenParams.nterrs,
      extent: { width: defaultExtent.width, height: defaultExtent.height }
    },
    names: { regions: regs, cities: cts }
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '地图数据-种子' + lastGenParams.seedTxt + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  statusbar('已导出数据：种子 ' + lastGenParams.seedTxt + ' · ' + regs.length + ' 领地 / ' + cts.length + ' 城市');
}
function onImportFile(e) {
  var f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  var rd = new FileReader();
  rd.onload = function () {
    try {
      var data = JSON.parse(rd.result);
      if (!data || data.app !== 'terrain-demo' || !data.params) throw new Error('不是本程序的地图数据文件');
      if (generating) { statusbar('正在生成中，请稍后再导入'); return; }
      var p = data.params;
      document.getElementById('seed').value = (p.seed != null ? p.seed : p.seedTxt) || '';
      if (p.npts) document.getElementById('npts').value = p.npts;
      if (p.ncities) document.getElementById('ncities').value = p.ncities;
      if (p.nterrs) document.getElementById('nterrs').value = p.nterrs;
      pendingNames = data.names || null;
      statusbar('正在导入：种子 ' + (p.seedTxt != null ? p.seedTxt : p.seed) + ' …');
      gen();
    } catch (err) {
      statusbar('导入失败：' + err.message);
    }
  };
  rd.onerror = function () { statusbar('导入失败：文件读取错误'); };
  rd.readAsText(f);
}
/* 把保存的名称按索引应用到新生成的领地 / 城市标签（与行内改名的 editSave 逻辑一致）*/
function applyImportedNames(names) {
  editing = null;
  var regEls = document.querySelectorAll('#map text.region');
  for (var i = 0; i < regEls.length && names.regions && i < names.regions.length; i++) {
    var v = names.regions[i];
    if (!v) continue;
    var d = regEls[i].__datum;
    if (d) { d.text = v; d.textZh = v; }
    regEls[i].textContent = v;
  }
  var cityEls = document.querySelectorAll('#map text.city');
  for (var j = 0; j < cityEls.length && names.cities && j < names.cities.length; j++) {
    var v2 = names.cities[j];
    if (!v2) continue;
    var d2 = cityEls[j].__datum;
    if (d2) { d2.text = v2; d2.textZh = v2; }
    cityEls[j].textContent = v2;
  }
}

var generating = false;   // 生成中标志：防止生成期间重复点击
function gen() {
  if (generating) return;   // 生成中忽略重复点击
  var seedTxt = document.getElementById('seed').value.trim();
  var seed;
  if (/^\d+$/.test(seedTxt)) {
    seed = parseInt(seedTxt, 10) >>> 0;              // 数字种子：直接使用，不哈希 —— 输入框值 = 地图种子 = 状态栏显示，生成按钮不改动输入框
  } else if (seedTxt) {
    seed = hashStr(seedTxt);                         // 文字种子：哈希后使用（原版行为，仍可复现）
  } else {
    seed = (Math.floor(Math.random() * 1e9) >>> 0);  // 空种子：随机生成并填入输入框
    document.getElementById('seed').value = seed;
  }
  Math.random = mulberry32(seed);
  var params = Object.assign({}, defaultParams);
  params.npts = parseInt(document.getElementById('npts').value, 10);
  params.ncities = parseInt(document.getElementById('ncities').value, 10) || 15;
  params.nterrs = Math.min(parseInt(document.getElementById('nterrs').value, 10) || 5, params.ncities);
  lastGenParams = {   // 记录本次生成生效的参数（导出数据用；种子以最终数字为准，可复现）
    seed: seed,
    seedTxt: document.getElementById('seed').value.trim() || String(seed),
    npts: params.npts,
    ncities: params.ncities,
    nterrs: params.nterrs
  };
  var status = document.getElementById('status');
  var gb = document.getElementById('genbtn');
  generating = true;
  if (gb) { gb.disabled = true; gb.textContent = '生成中…'; }
  status.textContent = '生成中…（' + params.npts.toLocaleString() + ' 细胞 · 种子 ' + seed + '）';
  setTimeout(function () {
    var t0 = Date.now();
    try {
      doMapStepped(svg, params, 0, function () {
        applyLayers();      // 重新生成后应用当前的隐藏设置（svg 已被清空重建）
        clearHighlight();   // 重新生成 → 名称修改恢复默认
        var imported = false;
        if (pendingNames) { applyImportedNames(pendingNames); pendingNames = null; imported = true; }
        renderSidePanel();
        generating = false;
        if (gb) { gb.disabled = false; gb.textContent = '生成地图'; }
        status.textContent = (imported ? '已导入 · ' : '') + '完成 · 用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's · 种子 ' + seed + '（同种子可复现）';
      });
    } catch (e) {
      generating = false;
      if (gb) { gb.disabled = false; gb.textContent = '生成地图'; }
      status.textContent = '生成出错: ' + e.message;
      console.error(e);
    }
  }, 30);
}
renderSidePanel();   // 页面初始化：侧栏显示「先生成地图」提示
