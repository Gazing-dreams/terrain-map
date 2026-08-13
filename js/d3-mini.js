/* ============================================================
   原生替代库（替换原版内嵌的 d3 v4.13.0 全量 220KB + js-priority-queue）
   仅提供本演示页用到的 d3 API 子集，行为与 d3 v4 一致。
   体积：约 4KB；d3.voronoi 由下方 d3-voronoi@1.1.4 单库提供（9KB）。
   ============================================================ */
var d3 = window.d3 = window.d3 || {};
/* ---- 统计工具（等价 d3 v4 的 min/max/mean/quantile/scan/ascending/descending）---- */
function dmin(a) { var m = Infinity; for (var i = 0; i < a.length; i++) if (a[i] < m) m = a[i]; return m; }
function dmax(a) { var m = -Infinity; for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
function dmean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
function dascending(a, b) { return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN; }
function ddescending(a, b) { return b < a ? -1 : b > a ? 1 : b >= a ? 0 : NaN; }
function dquantileSorted(sorted, q) {
  var n = sorted.length;
  if (q <= 0 || n < 2) return sorted[0];
  if (q >= 1) return sorted[n - 1];
  var i = (n - 1) * q, i0 = Math.floor(i);
  return sorted[i0] + (sorted[i0 + 1] - sorted[i0]) * (i - i0);
}
function dscan(values, compare) {
  var n = values.length;
  if (!n) return undefined;
  compare = compare || dascending;
  var i = 0, j = 0, xi, xj = values[j];
  while (++i < n) {
    if (compare(xi = values[i], xj) < 0) { xj = xi; j = i; }
  }
  if (compare(xj, xj) !== 0) return undefined;
  return j;
}
d3.min = dmin; d3.max = dmax; d3.mean = dmean;
d3.ascending = dascending; d3.descending = ddescending;
d3.quantile = dquantileSorted; d3.scan = dscan;

/* ---- SVG path 构造器（等价 d3.path；数字按 JS 默认字符串拼接，与原版一致）---- */
function svgPath() {
  var cmds = [];
  return {
    moveTo: function (x, y) { cmds.push('M' + x + ',' + y); },
    lineTo: function (x, y) { cmds.push('L' + x + ',' + y); },
    toString: function () { return cmds.join(''); }
  };
}
d3.path = svgPath;

/* ---- 极简选择集（等价 d3 v4 select/selectAll 的本页用法子集）---- */
function select(sel) {
  if (typeof sel === 'string') return selection([document.querySelector(sel)]);
  return selection(sel && sel.length !== undefined ? Array.prototype.slice.call(sel) : [sel]);
}
function selectAll(sel) {
  return selection(Array.prototype.slice.call(document.querySelectorAll(sel)), document);
}
function selection(nodes, parent) {
  nodes = nodes || [];
  var sel = {
    _parent: parent || null,
    attr: function (name, value) {
      if (value === undefined) return nodes[0] ? nodes[0].getAttribute(name) : null;
      for (var i = 0; i < nodes.length; i++) {
        var v = typeof value === 'function' ? value.call(nodes[i], nodes[i].__datum, i) : value;
        if (v == null) nodes[i].removeAttribute(name); else nodes[i].setAttribute(name, v);
      }
      return sel;
    },
    style: function (name, value) {
      for (var i = 0; i < nodes.length; i++) {
        var v = typeof value === 'function' ? value.call(nodes[i], nodes[i].__datum, i) : value;
        nodes[i].style[name] = v;
      }
      return sel;
    },
    classed: function (name, add) {
      for (var i = 0; i < nodes.length; i++) {
        var cur = (nodes[i].getAttribute('class') || '').split(/\s+/).filter(function (s) { return s; });
        var names = name.split(/\s+/).filter(function (s) { return s; });
        for (var j = 0; j < names.length; j++) {
          var idx = cur.indexOf(names[j]);
          if (add && idx === -1) cur.push(names[j]);
          if (!add && idx !== -1) cur.splice(idx, 1);
        }
        if (cur.length) nodes[i].setAttribute('class', cur.join(' ')); else nodes[i].removeAttribute('class');
      }
      return sel;
    },
    text: function (value) {
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].textContent = typeof value === 'function' ? value.call(nodes[i], nodes[i].__datum, i) : value;
      }
      return sel;
    },
    data: function (data) {
      var parent = sel._parent || (nodes.length && nodes[0].parentNode) || null;
      var enterNodes = [], exitNodes = [];
      for (var i = 0; i < data.length; i++) {
        if (i < nodes.length) nodes[i].__datum = data[i];
        else enterNodes.push({ __parent: parent, __datum: data[i] });
      }
      for (var j = data.length; j < nodes.length; j++) exitNodes.push(nodes[j]);
      sel.__enter = selection(enterNodes);
      sel.__exit = selection(exitNodes);
      return sel;
    },
    enter: function () { return sel.__enter; },
    exit: function () { return sel.__exit; },
    append: function (tag) {
      var ns = 'http://www.w3.org/2000/svg';
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        var el = document.createElementNS(ns, tag);
        if (nodes[i].__parent) nodes[i].__parent.appendChild(el);
        if (nodes[i].__datum !== undefined) el.__datum = nodes[i].__datum;
        out.push(el);
      }
      return selection(out);
    },
    remove: function () {
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
      }
      return sel;
    },
    raise: function () {
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].parentNode) nodes[i].parentNode.appendChild(nodes[i]);
      }
      return sel;
    },
    selectAll: function (selector) {
      var out = [];
      var host = nodes.length ? nodes[0] : null;
      for (var i = 0; i < nodes.length; i++) {
        var found = nodes[i].querySelectorAll(selector == null ? '*' : selector);
        for (var j = 0; j < found.length; j++) out.push(found[j]);
      }
      return selection(out, host);
    }
  };
  return sel;
}
d3.select = select; d3.selectAll = selectAll;

/* ---- 二叉堆优先队列（复刻 js-priority-queue 的 BinaryHeapStrategy，行为一致）---- */
function PriorityQueue(cfg) {
  cfg = cfg || {};
  var cmp = cfg.comparator || function (a, b) { return (a || 0) - (b || 0); };
  var data = [];
  function swap(a, i, j) { var t = a[i]; a[i] = a[j]; a[j] = t; }
  function bubbleUp(pos) {
    while (pos > 0) {
      var parent = (pos - 1) >> 1;
      if (cmp(data[parent], data[pos]) < 0) break;
      swap(data, parent, pos);
      pos = parent;
    }
  }
  function sinkDown(pos) {
    while (true) {
      var left = 2 * pos + 1, right = 2 * pos + 2, minIndex = pos;
      if (left < data.length && cmp(data[left], data[minIndex]) < 0) minIndex = left;
      if (right < data.length && cmp(data[right], data[minIndex]) < 0) minIndex = right;
      if (minIndex !== pos) { swap(data, minIndex, pos); pos = minIndex; }
      else break;
    }
  }
  return {
    queue: function (value) { data.push(value); bubbleUp(data.length - 1); },
    dequeue: function () {
      var ret = data[0];
      var last = data.pop();
      if (data.length > 0) { data[0] = last; sinkDown(0); }
      return ret;
    },
    get length() { return data.length; }
  };
}

