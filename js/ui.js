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
  d3.selectAll('text.city').classed('fantasy', zh).text(function (d) {return zh ? d.textZh : d.text;});
  d3.selectAll('text.region').classed('fantasy', zh).text(function (d) {return zh ? d.textZh : d.text;});
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
  statusbar('随机种子已填入：' + seed + '（点「生成地图」生成）');
}
/* ---- 地图缩放（viewBox 动态控制：滚轮缩放 + 拖拽平移 + 双击复位 + 按钮组）----
   worldK = 当前世界规模倍率（档位 1/2/4），世界边长 = 1000*worldK
   全貌 / 复位 / 缩放边界始终基于当前世界范围（世界变大后仍可看到完整地图） */
var worldK = 1;   // 世界规模档位倍率（由 #resol 决定，gen 时同步）
function worldW() { return 1000 * worldK; }
var vb = { x: -500, y: -500, w: 1000, h: 1000 };
var VB_MIN_W = 1000 / 8; // 最大放大 8 倍
var mapEl = document.getElementById('map');
function applyVB() { mapEl.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h); }
function clampVB() {
  var W = worldW(), half = -500 * worldK;
  if (vb.w < VB_MIN_W * worldK) { var k = (VB_MIN_W * worldK) / vb.w; vb.w = VB_MIN_W * worldK; vb.h *= k; }
  if (vb.w > W) { var k = W / vb.w; vb.w = W; vb.h *= k; }
  var maxX = half + W - vb.w, maxY = half + W - vb.h;
  if (vb.x < half) vb.x = half; if (vb.x > maxX) vb.x = maxX;
  if (vb.y < half) vb.y = half; if (vb.y > maxY) vb.y = maxY;
}
function zoomAt(cx, cy, factor) {
  vb.w *= factor; vb.h *= factor;
  vb.x = cx - (cx - vb.x) * factor; vb.y = cy - (cy - vb.y) * factor;
  clampVB(); applyVB();
}
function zoomBy(f) { zoomAt(vb.x + vb.w / 2, vb.y + vb.h / 2, f); }
function resetView() { vb = { x: -500 * worldK, y: -500 * worldK, w: 1000 * worldK, h: 1000 * worldK }; applyVB(); }
mapEl.addEventListener('wheel', function (e) {
  e.preventDefault();
  var c = worldCoordsOf(e);   // 复用公共换算（与新增城市坐标浮层同一套公式）
  zoomAt(c[0], c[1], e.deltaY > 0 ? 1.2 : 1 / 1.2);
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
/* ---- 世界规模档位（extent）：1x / 2x / 4x ----
   档位提高 → 世界面积等比放大（×倍率²）→ 同一显示区域可容纳更多领地/城市
   地图组件（显示尺寸）固定不变；缩放 / 全貌 / 复位始终基于当前世界范围 */
function resScale() {
  var el = document.getElementById('resol');
  var v = el ? parseInt(el.value, 10) : 1;
  return (v >= 1 && v <= 4) ? v : 1;
}
/* 城市/领地上限随档位提高：世界边长 k 倍 → 城市上限 40k、领地上限 15k */
function updateCapacityLimits() {
  var k = resScale();
  var nc = document.getElementById('ncities');
  var nt = document.getElementById('nterrs');
  if (nc) nc.max = 40 * k;
  if (nt) nt.max = 15 * k;
}
/* ---- 地图组件尺寸固定：svg 保持正方形，尺寸 = min(960, 容器宽, 视口剩余高)，不随屏幕分辨率扩大 ---- */
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
updateCapacityLimits();
/* 世界规模档位切换：只更新容量上限并提示，不自动生成（由用户点「生成地图」应用新规模） */
(function () {
  var sel = document.getElementById('resol');
  if (!sel) return;
  sel.addEventListener('change', function () {
    var k = resScale();
    updateCapacityLimits();
    statusbar('世界规模：' + k + 'x —— 世界面积 ' + (k * k) + ' 倍，可容纳更多领地（点「生成地图」应用新规模）');
  });
})();
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
/* 公共下载：Blob → 临时 <a> → 点击下载（exportPNG / exportData 共用）*/
function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
/* ---- 导出当前地图为 PNG 图片 ----
   特性：
   1) 受图层隐藏开关影响：克隆 SVG 时保留 layer-hidden class，注入页面样式后 display:none 规则同步生效；
   2) 不受缩放 / 全屏影响：始终用生成时的完整 viewBox 导出（缩放按钮会改写 svg 的 viewBox，这里显式覆盖），
      分辨率 = 完整地图 x2（1000 → 2000px，可调 scale）。 */
function exportPNG() {
  var map = document.getElementById('map');
  if (!map || map.childNodes.length === 0) {
    statusbar('请先点「生成地图」，再导出图片');
    return;
  }
  statusbar('正在导出图片…');
  var ex = (render && render.params && render.params.extent) || defaultParams.extent;  // 当前世界规模档位
  var fullVB = (-1000 * ex.width / 2) + ' ' + (-1000 * ex.height / 2) + ' ' +
               (1000 * ex.width) + ' ' + (1000 * ex.height);
  var scale = 2;                                              // 导出分辨率倍率
  var cw = Math.round(1000 * ex.width * scale);
  var ch = Math.round(1000 * ex.height * scale);
  /* 克隆 SVG（保留 id 与图层 class，隐藏状态随样式注入生效），注入页面全部样式 */
  var clone = map.cloneNode(true);
  clone.setAttribute('viewBox', fullVB);
  var hlEls = clone.querySelectorAll('.hl');   // 导出时不带联动高亮（用户修改的名称保留）
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
      downloadBlob(blob, fname);
      statusbar('图片已导出：' + fname + '（' + cw + '×' + ch + 'px）');
    }, 'image/png');
  };
  img.onerror = function () {
    statusbar('导出失败：SVG 渲染出错');
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
                  '<button class="sp-edit" onclick="event.stopPropagation();startEdit(\'city\',' + ci + ')" title="改名">改</button>' +
                  '<button class="sp-edit del" onclick="event.stopPropagation();deleteCity(' + ci + ')" title="' + (ci >= nterrs ? '删除城市' : '领地首都不可删除') + '">删</button>') +
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
/* 地图点击：点击城市 / 领地联动高亮，点空白清除（新增模式下点击为放置城市） */
mapEl.addEventListener('click', function (e) {
  if (drag) return;
  if (addCityMode) { placeCityAt(e); return; }
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
/* ---- 手动新增城市 ----
   侧栏按钮切换新增模式；鼠标在地图上移动时右下角浮层实时显示世界坐标（离开隐藏）；
   点击地图放置新城市：校验陆地/未占用 → 自动命名（当前词库 + 去重）→ 归入所在领地
   （terr[vx] 原有归属）→ 参考原始 getRoads 两阶段增量连路（MST 最近城市主干 +
   领地首都直达，含路网吸引，原道路不动）；
   记入 extraCities 供导出 txt 与导入恢复；不触碰 viewBox，缩放/平移状态下照常可用。 */
var addCityMode = false;
var extraCities = [];        // 手动新增城市记录（导出/导入）：[{x, y, name}] 世界坐标 + 当前显示名
var pendingExtra = null;     // 导入待应用的新增城市（gen 开头转为 extraCities）
var deletedCities = [];      // 已删除的初始城市（导出/导入）：[{idx, name, terr}] 原始索引 + 名字 + 领地
var pendingDeleted = null;   // 导入待应用的已删除城市（gen 开头转为 deletedCities）
var coordsEl = document.getElementById('mapCoords');
function worldCoordsOf(e) {
  var r = mapEl.getBoundingClientRect();
  return [vb.x + (e.clientX - r.left) / r.width * vb.w,
          vb.y + (e.clientY - r.top) / r.height * vb.h];
}
function nearestVx(wx, wy) {
  var vxs = render.h.mesh.vxs;
  var best = 0, bd = Infinity;
  for (var i = 0; i < vxs.length; i++) {
    var dx = vxs[i][0] - wx, dy = vxs[i][1] - wy;
    var d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
mapEl.addEventListener('mousemove', function (e) {
  if (!addCityMode || !render) return;
  var c = worldCoordsOf(e);   // viewBox 坐标 → 除以 1000 显示世界坐标
  coordsEl.textContent = '世界坐标：' + (c[0] / 1000).toFixed(2) + ', ' + (c[1] / 1000).toFixed(2);
  coordsEl.classList.add('show');
});
mapEl.addEventListener('mouseleave', function () { coordsEl.classList.remove('show'); });
function toggleAddCity() {
  addCityMode = !addCityMode;
  var b = document.getElementById('addCityBtn');
  if (b) b.classList.toggle('active', addCityMode);
  if (!addCityMode) coordsEl.classList.remove('show');
  statusbar(addCityMode ? '新增模式：移动鼠标到地图查看坐标，点击地图放置城市（Esc 或再点按钮退出）' : '已退出新增模式');
}
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && addCityMode) toggleAddCity();
});
/* 新城市命名：当前词库 + 去重（orig → makeName/lastLang；中文 → makeNameZh/zhUsed）*/
function nameNewCity(render, vx) {
  var zh = currentLex !== 'orig';
  var textEn = lastLang ? makeName(lastLang, 'city') : ('City' + (render.cities.length + 1));
  var textZh = '';
  if (zh) {
    var lex = getLex();
    if (lex) textZh = makeNameZh('city', lex, cityTerrainAt(render, vx));
    else { textZh = textEn; zh = false; }
  }
  return { text: textEn, textZh: textZh || textEn, zh: zh };
}
/* 放置一个城市（手动新增或导入恢复共用）：加数据 + 复用现有绘制（与初始城市同一套样式）*/
function placeExtraCity(render, vx, displayName) {
  var res = addCityToRender(render, vx);
  /* 绘制顺序与初始地图一致（terrain-core drawAll：道路在下、城市圆点在上、名称最上）：
     先画道路，再画圆点（visualizeCities 内部 raise），最后画名称 */
  drawPaths(d3.select('#map'), 'road', render.landRoads);
  drawPaths(d3.select('#map'), 'roadsea', render.seaRoads);
  visualizeCities(d3.select('#map'), render);
  d3.select('#map').selectAll('text.city').raise();   // 名称保持在圆点之上（与 drawLabels 层级一致）
  /* 名称：复用 text.city 的 CSS 样式（描边/字号与初始城市一致），位置沿用 drawLabels 的上方偏移 */
  var p = render.h.mesh.vxs[vx];
  var zh = currentLex !== 'orig';
  var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('class', 'city' + (zh ? ' fantasy' : ''));
  t.setAttribute('x', 1000 * p[0]);
  t.setAttribute('y', 1000 * (p[1] - 0.016 * worldK));
  t.setAttribute('text-anchor', 'middle');
  t.textContent = displayName;
  t.__datum = { text: displayName, textZh: displayName };
  mapEl.appendChild(t);
  renderSidePanel();
  return res;
}
function placeCityAt(e) {
  if (!render || !render.cities) { statusbar('请先生成地图，再新增城市'); return; }
  var c = worldCoordsOf(e);          // viewBox 坐标（vb 数值，-500k~500k）
  var wx = c[0] / 1000, wy = c[1] / 1000;   // 世界坐标（-0.5k~0.5k，与 mesh.vxs / vor.find 同单位）
  var h = render.h;
  /* 定位点击位置的陆地单元：
     - vor.find(x,y) 返回最近单元中心 site（世界坐标），其索引体系与 vxs/h 不同，不能直接用；
     - 点击点距最近陆地中心超过 2×单元半径 → 视为海上（避免点击海域却放偏到隔海陆地）；
     - 命中后用 nearestVx 把单元中心映射回最近边界顶点（vxs/h 索引体系）。 */
  var vx;
  if (h.mesh.vor && typeof h.mesh.vor.find === 'function') {
    var found = h.mesh.vor.find(wx, wy);
    if (found) {
      var unitR = h.mesh.extent.width / Math.sqrt(h.mesh.pts.length);   // 平均单元半径（世界单位）
      var ddx = wx - found[0], ddy = wy - found[1];
      if (Math.sqrt(ddx * ddx + ddy * ddy) <= unitR * 2) {
        vx = nearestVx(found[0], found[1]);
      } else {
        vx = -1;
      }
    } else {
      vx = -1;
    }
  } else {
    vx = nearestVx(wx, wy);
  }
  if (vx < 0 || h[vx] <= 0) { statusbar('不能放在海上，请选择陆地位置'); return; }
  /* 位置校验：只拒绝海上；陆地任意位置均可放置（道路贴边由 roadTrace 的避边权重处理）*/
  if (render.cities.indexOf(vx) >= 0) { statusbar('该位置已有城市'); return; }
  var nm = nameNewCity(render, vx);
  var display = nm.zh ? nm.textZh : nm.text;
  placeExtraCity(render, vx, display);
  /* 记录城市【实际所在顶点】的世界坐标（非点击点）——导出括号坐标与地图位置一致，导入精确还原同一顶点 */
  var pv = h.mesh.vxs[vx];
  extraCities.push({ x: +pv[0].toFixed(4), y: +pv[1].toFixed(4), name: display });
  statusbar('已新增城市：' + display + '（已归入领地并连接道路；Esc / 再点按钮退出新增模式）');
}
/* 删除城市：首都不可删；其余（初始城镇 / 新增城市）可删。
   删除后：移除圆点与标签、全量重算道路（路网重连）、刷新侧栏；
   新增城市从 extraCities 移除；初始城市记入 deletedCities（供导出/导入恢复一致）。 */
function deleteCity(idx, silent, noRecord) {
  if (!render || !render.cities) { statusbar('先生成地图再操作'); return; }
  var nterrs = Math.min(render.params.nterrs, render.cities.length);
  if (idx < 0 || idx >= render.cities.length) return;
  if (idx < nterrs) { statusbar('领地首都不可删除（可先删除其城镇）'); return; }
  var name = cityNameOf(idx);
  var vx = render.cities[idx];
  if (!noRecord) {   // 导入恢复时（noRecord）不重复记录
    var nExtra = extraCities.length;
    var isExtra = idx >= render.cities.length - nExtra;
    if (isExtra) {
      extraCities.splice(idx - (render.cities.length - nExtra), 1);
    } else {
      /* 记录 {原始索引, 名字, 所属领地}——导入时按索引删除（同种子索引确定），导出时归位到领地段落 */
      var terrOf = render.terr[vx];                       // 首都顶点索引
      var terrIdx = render.cities.indexOf(terrOf);        // 领地（首都的城市索引 0..nterrs-1）
      if (terrIdx < 0) terrIdx = 0;
      deletedCities.push({ idx: idx, name: name, terr: terrIdx });
    }
  }
  /* 移除 DOM 元素与数据 */
  var circs = document.querySelectorAll('#map circle.city');
  var texts = document.querySelectorAll('#map text.city');
  if (circs[idx]) circs[idx].remove();
  if (texts[idx]) texts[idx].remove();
  render.cities.splice(idx, 1);
  /* 全量重算道路（删除后路网重连，包含剩余城市）*/
  var roads = getRoads(render);
  render.landRoads = roads.land;
  render.seaRoads = roads.sea;
  drawPaths(d3.select('#map'), 'road', render.landRoads);
  drawPaths(d3.select('#map'), 'roadsea', render.seaRoads);
  renderSidePanel();
  if (!silent) statusbar('已删除城市：' + name + '（道路已重新连接）');
  return vx;
}
/* ---- 地图数据导出 / 导入：保存影响随机地图的参数（种子 / 细胞数 / 城市数 / 领地数）
   与领地城市名称，导入时自动恢复当时的地图与名称 ---- */
var lastGenParams = null;   // 最近一次生成生效的参数（导出数据用）
var pendingNames = null;    // 导入待应用的名称 {byIndex, byRegionIndex}（按索引恢复）

function statusbar(msg) {
  var st = document.getElementById('status');
  if (st) st.textContent = msg;
}
/* ---- 导出：易读纯文本（字段名为英文：Seed / World Scale / Cells / Territories / Cities + 领地城市归属），可直接编辑后导入 ----
   城市名按【原始索引】[序号] 输出（生成时的索引；删除的城市位置补齐、带 (deleted) 标记，
   新增城市索引 = 基础城市数 + 放置序号）——导入按同一索引恢复，与当前数组下标无关 */
function exportData() {
  if (!lastGenParams || !render || !render.cities) { statusbar('先生成地图，再导出数据'); return; }
  var cityEls = document.querySelectorAll('#map text.city');
  var cityNames = [];
  for (var j = 0; j < cityEls.length; j++) cityNames.push(cityEls[j].textContent);
  var regEls = document.querySelectorAll('#map text.region');
  var regNames = [];
  for (var i = 0; i < regEls.length; i++) regNames.push(regEls[i].textContent);
  var nterrs = Math.min(render.params.nterrs, render.cities.length);
  var baseN = lastGenParams.ncities;              // 基础城市数：索引 >= baseN 的是手动新增
  var lines = [];
  lines.push('# Procedural Continent - Map Data | 程序化大陆·地图数据');
  lines.push('# Plain text — edit & re-import | 纯文本，可直接修改后重新导入');
  lines.push('# Seed: 种子（同种子可复现）| map seed, same seed → same map');
  lines.push('# World Scale: 世界规模倍率（1x/2x/4x）| world size multiplier');
  lines.push('# Cells: 细胞数（地形细节）| terrain detail level');
  lines.push('# Territories: 领地数 | territory count');
  lines.push('# Cities: 城市数 | city count');
  lines.push('# New Cities: 手动新增城市数 | manually added city count');
  lines.push('Seed: ' + lastGenParams.seedTxt);
  lines.push('World Scale: ' + (lastGenParams.extent ? lastGenParams.extent.width : 1) + 'x');
  lines.push('Cells: ' + lastGenParams.npts);
  lines.push('Territories: ' + lastGenParams.nterrs);
  lines.push('Cities: ' + lastGenParams.ncities);
  lines.push('New Cities: ' + extraCities.length);
  lines.push('');
  lines.push('# Territory-City Membership | 领地与城市归属');
  lines.push('# [序号] 城市名 — 普通城市 | normal city');
  lines.push('# [序号] 城市名(x, y) — 新增城市，改括号内坐标可移动 | new city, edit coords to move');
  lines.push('# [序号] 城市名 (deleted) — 已删除城市，去掉标记即恢复 | deleted, remove marker to restore');
  /* 原始索引重建：初始城市按已删除记录补齐原始索引——删除后当前索引会前移，导入必须按原始索引恢复 */
  var delSet = {};
  for (var dd = 0; dd < deletedCities.length; dd++) delSet[deletedCities[dd].idx] = true;
  var curInit = render.cities.length - extraCities.length;   // 当前初始城市数量
  var origIdx = [];
  var oi = 0;
  for (var ci = 0; ci < curInit; ci++) {
    while (delSet[oi]) oi++;
    origIdx.push(oi);
    oi++;
  }
  for (var r = 0; r < nterrs; r++) {
    lines.push('[' + (regNames[r] || ('Territory ' + (r + 1))) + ']');
    lines.push('  [' + r + '] ' + cityNames[r]);   // 首都原始索引 = r（首都不可删，索引不变）
    var mems = [];
    /* 现有初始城市（跳过首都行，首都已单独输出）*/
    for (var mi = 0; mi < curInit; mi++) {
      if (mi === r) continue;
      if (render.terr[render.cities[mi]] === render.cities[r]) mems.push({ idx: origIdx[mi], kind: 'city', ci: mi });
    }
    /* 该领地被删城市（删除标记） */
    for (var dd2 = 0; dd2 < deletedCities.length; dd2++) {
      if (deletedCities[dd2].terr === r) mems.push({ idx: deletedCities[dd2].idx, kind: 'del', name: deletedCities[dd2].name });
    }
    /* 新增城市（坐标括号） */
    for (var ej = 0; ej < extraCities.length; ej++) {
      var eci = curInit + ej;   // 新增城市当前索引（紧随初始城市之后）
      if (render.terr[render.cities[eci]] === render.cities[r]) mems.push({ idx: baseN + ej, kind: 'extra', ej: ej, ci: eci });
    }
    mems.sort(function (a, b) { return a.idx - b.idx; });
    for (var mi2 = 0; mi2 < mems.length; mi2++) {
      var it = mems[mi2];
      if (it.kind === 'del') {
        lines.push('  [' + it.idx + '] ' + it.name + ' (deleted)');
      } else if (it.kind === 'extra') {
        lines.push('  [' + it.idx + '] ' + cityNames[it.ci] + ' (' + extraCities[it.ej].x + ', ' + extraCities[it.ej].y + ')');
      } else {
        lines.push('  [' + it.idx + '] ' + cityNames[it.ci]);
      }
    }
  }
  var text = lines.join('\n');
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, '地图数据-种子' + lastGenParams.seedTxt + '.txt');
  statusbar('已导出数据：种子 ' + lastGenParams.seedTxt + ' · ' + regNames.length + ' 领地 / ' + cityNames.length + ' 城市（含新增 ' + extraCities.length + '）');
}
/* 解析导入文件（txt 纯文本，最新版格式：英文字段名 + 中英双语注释），返回统一结构
   { params, names, extraCities, deletedCities }
   - params: { seedTxt, npts, ncities, nterrs, extent }
   - names: { byIndex, byRegionIndex }（按索引恢复名称）
   - extraCities: [{x, y, name}]（带坐标括号的城市）
   - deletedCities: [{idx, name}]（带 (deleted) 标记的城市，按索引删除）
   归属列表行格式：城市名后带括号 (x, y) → 新增；括号内 deleted → 删除标记；无括号 → 普通城市。
   仅支持最新版格式（Seed / World Scale / Cells / Territories / Cities），不再兼容旧中文字段名 */
function parseMapData(text) {
  var s = String(text).replace(/^\uFEFF/, '').trim();
  if (!s) return null;
  var params = { seedTxt: '', npts: 0, ncities: 0, nterrs: 0, extent: null };
  var byIndex = {}, byRegionIndex = {};
  var extraCities = [], deletedCities = [];
  var lines = s.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) === '#') continue;
    var m;
    if ((m = line.match(/^Seed\s*[:：]\s*(.+)$/i))) { params.seedTxt = m[1].trim(); }
    else if ((m = line.match(/^World\s*Scale\s*[:：]\s*(\d+)/i))) { var kv = Math.min(Math.round(+m[1]), 4) || 1; params.extent = { width: kv, height: kv }; }
    else if ((m = line.match(/^Cells?\s*[:：]\s*(\d+)/i))) { params.npts = +m[1]; }
    else if ((m = line.match(/^Territories?\s*[:：]\s*(\d+)/i))) { params.nterrs = +m[1]; }
    else if ((m = line.match(/^Cities?\s*[:：]\s*(\d+)/i))) { params.ncities = +m[1]; }
    else if ((m = line.match(/^\[(.+)\]$/))) { byRegionIndex[Object.keys(byRegionIndex).length] = m[1].trim(); }
    else if ((m = line.match(/^\[(\d+)\]\s*(.+)$/))) {
      var idx = +m[1];
      var nm = m[2].trim();
      /* 坐标括号 → 新增城市 */
      var cm = nm.match(/^(.*?)\s*[（(]\s*(-?\d+(?:\.\d+)?)\s*[，,]\s*(-?\d+(?:\.\d+)?)\s*[）)]\s*$/);
      if (cm) {
        nm = cm[1].trim();
        if (nm) byIndex[idx] = nm;
        extraCities.push({ x: +cm[2], y: +cm[3], name: nm });
      } else {
        /* 删除标记括号 → 按索引删除（不写入 byIndex：该城市导入后将被删除）*/
        var dm = nm.match(/^(.*?)\s*[（(]\s*deleted\s*[）)]\s*$/i);
        if (dm) {
          nm = dm[1].trim();
          deletedCities.push({ idx: idx, name: nm || ('City ' + idx) });
        } else {
          nm = nm.trim();
          if (nm) byIndex[idx] = nm;
        }
      }
    }
  }
  if (!params.seedTxt && !params.npts) throw new Error('缺少必要字段（需 Seed / Cells，仅支持最新版导出格式）');
  return { params: params, names: { byIndex: byIndex, byRegionIndex: byRegionIndex }, extraCities: extraCities, deletedCities: deletedCities };
}
function onImportFile(e) {
  var f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  var rd = new FileReader();
  rd.onload = function () {
    try {
      var data = parseMapData(rd.result);
      if (!data) throw new Error('文件为空');
      if (generating) { statusbar('正在生成中，请稍后再导入'); return; }
      var p = data.params;
      document.getElementById('seed').value = p.seedTxt || '';
      if (p.npts) document.getElementById('npts').value = p.npts;
      if (p.ncities) document.getElementById('ncities').value = p.ncities;
      if (p.nterrs) document.getElementById('nterrs').value = p.nterrs;
      /* 恢复世界规模档位（超限值回落 4x）*/
      if (p.extent && p.extent.width) {
        var k = Math.min(Math.round(p.extent.width), 4);
        var sel = document.getElementById('resol');
        if (sel && [1, 2, 4].indexOf(k) >= 0) sel.value = String(k);
        worldK = (k >= 1 && k <= 4) ? k : 1;
      }
      updateCapacityLimits();
      /* 手动编辑 txt 可能让城市/领地数超当前档位上限 → 裁剪，避免超密生成 */
      (function () {
        var ncEl = document.getElementById('ncities'), ntEl = document.getElementById('nterrs');
        if (ncEl && ncEl.max && parseInt(ncEl.value, 10) > parseInt(ncEl.max, 10)) ncEl.value = ncEl.max;
        if (ntEl && ntEl.max && parseInt(ntEl.value, 10) > parseInt(ntEl.max, 10)) ntEl.value = ntEl.max;
      })();
      pendingNames = data.names || null;
      pendingExtra = data.extraCities && data.extraCities.length ? data.extraCities : null;
      pendingDeleted = data.deletedCities && data.deletedCities.length ? data.deletedCities : null;
      statusbar('正在导入：种子 ' + (p.seedTxt || '') + ' …');
      gen();
    } catch (err) {
      statusbar('导入失败：文件不是有效的导出数据（可先导出一份对照格式）。' + err.message);
    }
  };
  rd.onerror = function () { statusbar('导入失败：文件读取错误'); };
  rd.readAsText(f);
}
/* 把保存的名称按索引应用到新生成的领地 / 城市标签（与行内改名的 editSave 逻辑一致）*/
function applyImportedNames(names) {
  editing = null;
  var regEls = document.querySelectorAll('#map text.region');
  var cityEls = document.querySelectorAll('#map text.city');
  for (var ri = 0; ri < regEls.length; ri++) {
    var rv = names && names.byRegionIndex && names.byRegionIndex[ri];
    if (!rv) continue;
    var dr = regEls[ri].__datum;
    if (dr) { dr.text = rv; dr.textZh = rv; }
    regEls[ri].textContent = rv;
  }
  for (var ci = 0; ci < cityEls.length; ci++) {
    var cv = names && names.byIndex && names.byIndex[ci];
    if (!cv) continue;
    var dc = cityEls[ci].__datum;
    if (dc) { dc.text = cv; dc.textZh = cv; }
    cityEls[ci].textContent = cv;
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
  extraCities = pendingExtra || [];   // 重新生成 → 手动新增城市重置；导入时替换为导入数据
  pendingExtra = null;
  deletedCities = pendingDeleted || [];   // 已删除的初始城市同理（导入恢复时应用）
  pendingDeleted = null;
  var params = Object.assign({}, defaultParams);
  params.npts = parseInt(document.getElementById('npts').value, 10);
  params.ncities = parseInt(document.getElementById('ncities').value, 10) || 15;
  params.nterrs = Math.min(parseInt(document.getElementById('nterrs').value, 10) || 5, params.ncities);
  /* 世界规模档位 → extent：世界等比放大（面积 = 倍率²），组件尺寸不变，同屏容纳更多领地 */
  var k = resScale();
  worldK = k;
  params.extent = { width: k, height: k };
  vb = { x: -500 * k, y: -500 * k, w: 1000 * k, h: 1000 * k };  // 缩放状态同步到新世界全貌
  updateCapacityLimits();
  lastGenParams = {   // 记录本次生成生效的参数（导出数据用；种子以最终数字为准，可复现）
    seed: seed,
    seedTxt: document.getElementById('seed').value.trim() || String(seed),
    npts: params.npts,
    ncities: params.ncities,
    nterrs: params.nterrs,
    extent: { width: k, height: k }
  };
  var gb = document.getElementById('genbtn');
  generating = true;
  if (gb) { gb.disabled = true; gb.textContent = '生成中…'; }
  statusbar('生成中…（' + params.npts.toLocaleString() + ' 细胞 · 种子 ' + seed + '）');
  setTimeout(function () {
    var t0 = Date.now();
    try {
      doMapStepped(svg, params, 0, function () {
        applyLayers();      // 重新生成后应用当前的隐藏设置（svg 已被清空重建）
        clearHighlight();   // 重新生成 → 名称修改恢复默认
        var imported = false;
        if (pendingNames) { applyImportedNames(pendingNames); pendingNames = null; imported = true; }
        /* 恢复手动新增城市（导入数据）：按坐标找最近顶点放置，跳过无效位置 */
        if (extraCities && extraCities.length) {
          for (var ei = 0; ei < extraCities.length; ei++) {
            var ec = extraCities[ei];
            var vx2 = nearestVx(ec.x, ec.y);
            if (render.h[vx2] <= 0) continue;
            if (render.cities.indexOf(vx2) >= 0) continue;   // 已占用（与 placeCityAt 校验一致）
            placeExtraCity(render, vx2, ec.name);
            imported = true;
          }
        }
        /* 恢复已删除城市（导入数据）：按原始索引从大到小删除（同种子 → 索引确定；倒序避免 splice 前移错位）*/
        if (deletedCities && deletedCities.length) {
          var dels = deletedCities.slice().sort(function (a, b) { return b.idx - a.idx; });
          var nterrs0 = Math.min(render.params.nterrs, render.cities.length);
          for (var di = 0; di < dels.length; di++) {
            var dci = dels[di].idx;
            if (dci >= nterrs0 && dci < render.cities.length) { deleteCity(dci, true, true); imported = true; }
          }
        }
        renderSidePanel();
        generating = false;
        if (gb) { gb.disabled = false; gb.textContent = '生成地图'; }
        statusbar((imported ? '已导入 · ' : '') + '完成 · 用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's · 种子 ' + seed + '（同种子可复现）');
      });
    } catch (e) {
      generating = false;
      if (gb) { gb.disabled = false; gb.textContent = '生成地图'; }
      statusbar('生成出错: ' + e.message);
      console.error(e);
    }
  }, 30);
}
renderSidePanel();   // 页面初始化：侧栏显示「先生成地图」提示
