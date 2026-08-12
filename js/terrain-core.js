"use strict";

function runif(lo, hi) {
    return lo + Math.random() * (hi - lo);
}

var rnorm = (function () {
    var z2 = null;
    function rnorm() {
        if (z2 != null) {
            var tmp = z2;
            z2 = null;
            return tmp;
        }
        var x1 = 0;
        var x2 = 0;
        var w = 2.0;
        while (w >= 1) {
            x1 = runif(-1, 1);
            x2 = runif(-1, 1);
            w = x1 * x1 + x2 * x2;
        }
        w = Math.sqrt(-2 * Math.log(w) / w);
        z2 = x2 * w;
        return x1 * w;
    }
    return rnorm;
})();

function randomVector(scale) {
    return [scale * rnorm(), scale * rnorm()];
}

var defaultExtent = {
    width: 1,
    height: 1
};

function generatePoints(n, extent) {
    extent = extent || defaultExtent;
    var pts = [];
    for (var i = 0; i < n; i++) {
        pts.push([(Math.random() - 0.5) * extent.width, (Math.random() - 0.5) * extent.height]);
    }
    return pts;
}

function centroid(pts) {
    var x = 0;
    var y = 0;
    for (var i = 0; i < pts.length; i++) {
        x += pts[i][0];
        y += pts[i][1];
    }
    return [x/pts.length, y/pts.length];
}

function improvePoints(pts, n, extent) {
    n = n || 1;
    extent = extent || defaultExtent;
    for (var i = 0; i < n; i++) {
        pts = voronoi(pts, extent)
            .polygons(pts)
            .map(centroid);
    }
    return pts;
}

function generateGoodPoints(n, extent) {
    extent = extent || defaultExtent;
    var pts = generatePoints(n, extent);
    pts = pts.sort(function (a, b) {
        return a[0] - b[0];
    });
    return improvePoints(pts, 1, extent);
}

function voronoi(pts, extent) {
    extent = extent || defaultExtent;
    var w = extent.width/2;
    var h = extent.height/2;
    return d3.voronoi().extent([[-w, -h], [w, h]])(pts);
}

function makeMesh(pts, extent) {
    extent = extent || defaultExtent;
    var vor = voronoi(pts, extent);
    var vxs = [];
    var vxids = {};
    var adj = [];
    var edges = [];
    var tris = [];
    for (var i = 0; i < vor.edges.length; i++) {
        var e = vor.edges[i];
        if (e == undefined) continue;
        var e0 = vxids[e[0]];
        var e1 = vxids[e[1]];
        if (e0 == undefined) {
            e0 = vxs.length;
            vxids[e[0]] = e0;
            vxs.push(e[0]);
        }
        if (e1 == undefined) {
            e1 = vxs.length;
            vxids[e[1]] = e1;
            vxs.push(e[1]);
        }
        adj[e0] = adj[e0] || [];
        adj[e0].push(e1);
        adj[e1] = adj[e1] || [];
        adj[e1].push(e0);
        edges.push([e0, e1, e.left, e.right]);
        tris[e0] = tris[e0] || [];
        if (!tris[e0].includes(e.left)) tris[e0].push(e.left);
        if (e.right && !tris[e0].includes(e.right)) tris[e0].push(e.right);
        tris[e1] = tris[e1] || [];
        if (!tris[e1].includes(e.left)) tris[e1].push(e.left);
        if (e.right && !tris[e1].includes(e.right)) tris[e1].push(e.right);
    }

    /* 预计算邻接边距离缓存（与 adj 同构），供 distance() 查表 —— 减少大量重复 sqrt */
    var dist = [];
    for (var di = 0; di < adj.length; di++) {
        var ai = adj[di], diArr = new Array(ai.length);
        for (var dk = 0; dk < ai.length; dk++) {
            var p1 = vxs[di], p2 = vxs[ai[dk]];
            diArr[dk] = Math.sqrt((p1[0]-p2[0])*(p1[0]-p2[0]) + (p1[1]-p2[1])*(p1[1]-p2[1]));
        }
        dist[di] = diArr;
    }

    var mesh = {
        pts: pts,
        vor: vor,
        vxs: vxs,
        adj: adj,
        dist: dist,       // 邻接距离缓存
        tris: tris,
        edges: edges,
        extent: extent
    }
    mesh.map = function (f) {
        var mapped = vxs.map(f);
        mapped.mesh = mesh;
        return mapped;
    }
    return mesh;
}

function generateGoodMesh(n, extent) {
    extent = extent || defaultExtent;
    var pts = generateGoodPoints(n, extent);
    return makeMesh(pts, extent);
}
function isedge(mesh, i) {
    return (mesh.adj[i].length < 3);
}

function isnearedge(mesh, i) {
    var x = mesh.vxs[i][0];
    var y = mesh.vxs[i][1];
    var w = mesh.extent.width;
    var h = mesh.extent.height;
    return x < -0.45 * w || x > 0.45 * w || y < -0.45 * h || y > 0.45 * h;
}

function neighbours(mesh, i) {
    return mesh.adj[i].slice();   // 浅拷贝邻接表（与原实现逐项复制等价）
}

function distance(mesh, i, j) {
    var ai = mesh.adj[i];
    var di = mesh.dist && mesh.dist[i];
    if (di) {
        for (var k = 0; k < ai.length; k++) if (ai[k] === j) return di[k];  // 邻居：查预计算缓存
    }
    var p = mesh.vxs[i];
    var q = mesh.vxs[j];
    return Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]));
}

function quantile(h, q) {
    var sortedh = [];
    for (var i = 0; i < h.length; i++) {
        sortedh[i] = h[i];
    }
    sortedh.sort(d3.ascending);
    return d3.quantile(sortedh, q);
}

function zero(mesh) {
    var z = [];
    for (var i = 0; i < mesh.vxs.length; i++) {
        z[i] = 0;
    }
    z.mesh = mesh;
    return z;
}

function slope(mesh, direction) {
    return mesh.map(function (x) {
        return x[0] * direction[0] + x[1] * direction[1];
    });
}

function cone(mesh, slope) {
    return mesh.map(function (x) {
        return Math.pow(x[0] * x[0] + x[1] * x[1], 0.5) * slope;
    });
}

function map(h, f) {
    var newh = h.map(f);
    newh.mesh = h.mesh;
    return newh;
}

function normalize(h) {
    var lo = d3.min(h);
    var hi = d3.max(h);
    return map(h, function (x) {return (x - lo) / (hi - lo)});
}

function peaky(h) {
    return map(normalize(h), Math.sqrt);
}

function add() {
    var n = arguments[0].length;
    var newvals = zero(arguments[0].mesh);
    for (var i = 0; i < n; i++) {
        for (var j = 0; j < arguments.length; j++) {
            newvals[i] += arguments[j][i];
        }
    }
    return newvals;
}

function mountains(mesh, n, r) {
    r = r || 0.05 * mesh.extent.width;   // 山峰影响半径随世界规模等比放大（1x 时 = 0.05，显示不变）
    var amp = mesh.extent.width;         // 山峰幅度随世界规模等比放大：与 slope/cone（随坐标×k）同比例，
                                         // 归一化后山地起伏/坡度与 1x 完全一致（海湾质感、影线密度不变）
    var mounts = [];
    for (var i = 0; i < n; i++) {
        mounts.push([mesh.extent.width * (Math.random() - 0.5), mesh.extent.height * (Math.random() - 0.5)]);
    }
    var newvals = zero(mesh);
    for (var i = 0; i < mesh.vxs.length; i++) {
        var p = mesh.vxs[i];
        for (var j = 0; j < n; j++) {
            var m = mounts[j];
            newvals[i] += amp * Math.pow(Math.exp(-((p[0] - m[0]) * (p[0] - m[0]) + (p[1] - m[1]) * (p[1] - m[1])) / (2 * r * r)), 2);
        }
    }
    return newvals;
}

function relax(h) {
    var newh = zero(h.mesh);
    for (var i = 0; i < h.length; i++) {
        var nbs = neighbours(h.mesh, i);
        if (nbs.length < 3) {
            newh[i] = 0;
            continue;
        }
        newh[i] = d3.mean(nbs.map(function (j) {return h[j]}));
    }
    return newh;
}

function downhill(h) {
    if (h.downhill) return h.downhill;
    function downfrom(i) {
        if (isedge(h.mesh, i)) return -2;
        var best = -1;
        var besth = h[i];
        var nbs = neighbours(h.mesh, i);
        for (var j = 0; j < nbs.length; j++) {
            if (h[nbs[j]] < besth) {
                besth = h[nbs[j]];
                best = nbs[j];
            }
        }
        return best;
    }
    var downs = [];
    for (var i = 0; i < h.length; i++) {
        downs[i] = downfrom(i);
    }
    h.downhill = downs;
    return downs;
}

function fillSinks(h, epsilon) {
    epsilon = epsilon || 1e-5;
    var infinity = 999999;
    var newh = zero(h.mesh);
    for (var i = 0; i < h.length; i++) {
        if (isnearedge(h.mesh, i)) {
            newh[i] = h[i];
        } else {
            newh[i] = infinity;
        }
    }
    while (true) {
        var changed = false;
        for (var i = 0; i < h.length; i++) {
            if (newh[i] == h[i]) continue;
            var nbs = neighbours(h.mesh, i);
            for (var j = 0; j < nbs.length; j++) {
                if (h[i] >= newh[nbs[j]] + epsilon) {
                    newh[i] = h[i];
                    changed = true;
                    break;
                }
                var oh = newh[nbs[j]] + epsilon;
                if ((newh[i] > oh) && (oh > h[i])) {
                    newh[i] = oh;
                    changed = true;
                }
            }
        }
        if (!changed) return newh;
    }
}

function getFlux(h) {
    var dh = downhill(h);
    var idxs = [];
    var flux = zero(h.mesh); 
    for (var i = 0; i < h.length; i++) {
        idxs[i] = i;
        flux[i] = 1/h.length;
    }
    idxs.sort(function (a, b) {
        return h[b] - h[a];
    });
    for (var i = 0; i < h.length; i++) {
        var j = idxs[i];
        if (dh[j] >= 0) {
            flux[dh[j]] += flux[j];
        }
    }
    return flux;
}

function getSlope(h) {
    var slope = zero(h.mesh);
    for (var i = 0; i < h.length; i++) {
        var s = trislope(h, i);
        slope[i] = Math.sqrt(s[0] * s[0] + s[1] * s[1]);
    }
    return slope;
}

function erosionRate(h) {
    var flux = getFlux(h);
    var slope = getSlope(h);
    var newh = zero(h.mesh);
    for (var i = 0; i < h.length; i++) {
        var river = Math.sqrt(flux[i]) * slope[i];
        var creep = slope[i] * slope[i];
        var total = 1000 * river + creep;
        total = total > 200 ? 200 : total;
        newh[i] = total;
    }
    return newh;
}

function erode(h, amount) {
    var er = erosionRate(h);
    var newh = zero(h.mesh);
    var maxr = d3.max(er);
    for (var i = 0; i < h.length; i++) {
        newh[i] = h[i] - amount * (er[i] / maxr);
    }
    return newh;
}

function doErosion(h, amount, n) {
    n = n || 1;
    h = fillSinks(h);
    for (var i = 0; i < n; i++) {
        h = erode(h, amount);
        h = fillSinks(h);
    }
    return h;
}

function setSeaLevel(h, q) {
    var newh = zero(h.mesh);
    var delta = quantile(h, q);
    for (var i = 0; i < h.length; i++) {
        newh[i] = h[i] - delta;
    }
    return newh;
}

function cleanCoast(h, iters) {
    for (var iter = 0; iter < iters; iter++) {
        var changed = 0;
        var newh = zero(h.mesh);
        for (var i = 0; i < h.length; i++) {
            newh[i] = h[i];
            var nbs = neighbours(h.mesh, i);
            if (h[i] <= 0 || nbs.length != 3) continue;
            var count = 0;
            var best = -999999;
            for (var j = 0; j < nbs.length; j++) {
                if (h[nbs[j]] > 0) {
                    count++;
                } else if (h[nbs[j]] > best) {
                    best = h[nbs[j]];    
                }
            }
            if (count > 1) continue;
            newh[i] = best / 2;
            changed++;
        }
        h = newh;
        newh = zero(h.mesh);
        for (var i = 0; i < h.length; i++) {
            newh[i] = h[i];
            var nbs = neighbours(h.mesh, i);
            if (h[i] > 0 || nbs.length != 3) continue;
            var count = 0;
            var best = 999999;
            for (var j = 0; j < nbs.length; j++) {
                if (h[nbs[j]] <= 0) {
                    count++;
                } else if (h[nbs[j]] < best) {
                    best = h[nbs[j]];
                }
            }
            if (count > 1) continue;
            newh[i] = best / 2;
            changed++;
        }
        h = newh;
    }
    return h;
}

function trislope(h, i) {
    var nbs = neighbours(h.mesh, i);
    if (nbs.length != 3) return [0,0];
    var p0 = h.mesh.vxs[nbs[0]];
    var p1 = h.mesh.vxs[nbs[1]];
    var p2 = h.mesh.vxs[nbs[2]];

    var x1 = p1[0] - p0[0];
    var x2 = p2[0] - p0[0];
    var y1 = p1[1] - p0[1];
    var y2 = p2[1] - p0[1];

    var det = x1 * y2 - x2 * y1;
    var h1 = h[nbs[1]] - h[nbs[0]];
    var h2 = h[nbs[2]] - h[nbs[0]];

    return [(y2 * h1 - y1 * h2) / det,
            (-x2 * h1 + x1 * h2) / det];
}

function cityScore(h, cities, flux) {
    var score = map(flux || getFlux(h), Math.sqrt);
    for (var i = 0; i < h.length; i++) {
        if (h[i] <= 0 || isnearedge(h.mesh, i)) {
            score[i] = -999999;
            continue;
        }
        score[i] += 0.01 / (1e-9 + Math.abs(h.mesh.vxs[i][0]) - h.mesh.extent.width/2)
        score[i] += 0.01 / (1e-9 + Math.abs(h.mesh.vxs[i][1]) - h.mesh.extent.height/2)
        for (var j = 0; j < cities.length; j++) {
            score[i] -= 0.02 / (distance(h.mesh, cities[j], i) + 1e-9);
        }
    }
    return score;
}
function placeCity(render, flux) {
    render.cities = render.cities || [];
    var score = cityScore(render.h, render.cities, flux);
    var newcity = d3.scan(score, d3.descending);
    render.cities.push(newcity);
}

function placeCities(render) {
    var params = render.params;
    var h = render.h;
    var n = params.ncities;
    var flux = getFlux(h);   // h 在放置城市期间不变 → flux 只需计算一次（结果一致）
    for (var i = 0; i < n; i++) {
        placeCity(render, flux);
    }
}

function contour(h, level) {
    level = level || 0;
    var edges = [];
    for (var i = 0; i < h.mesh.edges.length; i++) {
        var e = h.mesh.edges[i];
        if (e[3] == undefined) continue;
        if (isnearedge(h.mesh, e[0]) || isnearedge(h.mesh, e[1])) continue;
        if ((h[e[0]] > level && h[e[1]] <= level) ||
            (h[e[1]] > level && h[e[0]] <= level)) {
            edges.push([e[2], e[3]]);
        }
    }
    return mergeSegments(edges);
}

function getRivers(h, limit) {
    var dh = downhill(h);
    var flux = getFlux(h);
    var links = [];
    var above = 0;
    for (var i = 0; i < h.length; i++) {
        if (h[i] > 0) above++;
    }
    limit *= above / h.length;
    for (var i = 0; i < dh.length; i++) {
        if (isnearedge(h.mesh, i)) continue;
        if (flux[i] > limit && h[i] > 0 && dh[i] >= 0) {
            var up = h.mesh.vxs[i];
            var down = h.mesh.vxs[dh[i]];
            if (h[dh[i]] > 0) {
                links.push([up, down]);
            } else {
                links.push([up, [(up[0] + down[0])/2, (up[1] + down[1])/2]]);
            }
        }
    }
    return mergeSegments(links).map(relaxPath);
}

/* ============ 城市间道路：领地辐射 + 首都 MST（Prim-Dijkstra 混合）============
   阶段 A：每个城镇（非首都）沿网格最短路径连接到【自己领地的首都】（卫星城辐射，2.1）
   阶段 B：首都之间跑 Prim-Dijkstra 混合 MST —— 相邻优先、短路径优先（2.1/2.3）
   权重：上坡 x1.2 轻罚、过海 x15 重罚（弱化惩罚 → 路线更短更直，2.3）
   兜底：首都强制全部入树（2.2 绝对全连通）；边去重防 mergeSegments 错乱
   依赖现有：mesh/neighbours/distance/mergeSegments/relaxPath/PriorityQueue
   =============================================================== */
/* 公共寻路：沿网格从 src 到 target 的最短路径（含过海/上坡/避边权重）。
   cityVerts 可空：传城市顶点集合时对边缘带（非城市）重罚，避免道路贴近地图边框。
   返回索引对数组（靠 src 的在前）或 null。手动新增城市连路与 getRoads 共用此函数，逻辑一致。 */
/* 单源 Dijkstra（过海重罚：陆地优先、孤岛可渡海），src → target 的路径边（索引对，靠 src 的在前）。
   attract（可选）：已有道路边集 {land:{key:true}, sea:{key:true}} —— 命中该集的网格边权重 ×0.3，
   引导路径优先沿已有路网走（新道路先并入旧路走廊、接近目标才离开，避免首都处锐角分叉与穿插交叉）。
   getRoads 全量生成时不传（null）→ 行为与原版一致；addCityToRender 增量连路时传入 render.__roadSeen */
function roadTrace(mesh, h, src, target, cityVerts, attract) {
    var dist = [], prev = [];
    var pq = new PriorityQueue({comparator: function (a, b) {return a.d - b.d;}});
    dist[src] = 0;
    pq.queue({v: src, d: 0});
    while (pq.length) {
        var item = pq.dequeue();
        var u = item.v;
        if (dist[u] !== item.d) continue;
        if (u === target) break;
        var nbs = mesh.adj[u];          // 邻接表（只读）
        var ds = mesh.dist[u];          // 距离缓存
        for (var j = 0; j < nbs.length; j++) {
            var v = nbs[j];
            var w = ds[j];
            if (h[v] <= 0) w *= 15;                 // 过海重罚：优先陆地，孤岛渡海（虚线显示）
            else if (h[v] > h[u]) w *= 1.2;         // 上坡轻罚（路线更短更直）
            if (cityVerts && isnearedge(mesh, v) && !cityVerts[v]) w *= 8;   // 边缘带（非城市顶点）重罚：避免贴近地图边框
            if (attract) {                          // 路网吸引：已有道路边低权重 → 沿旧路走
                var k2 = (u < v ? u + '|' + v : v + '|' + u);
                if (attract.land[k2] || attract.sea[k2]) w *= 0.3;
            }
            var nd = dist[u] + w;
            if (dist[v] === undefined || nd < dist[v]) { dist[v] = nd; prev[v] = u; pq.queue({v: v, d: nd}); }
        }
    }
    var segs = [], x = target;
    while (x !== undefined && x !== src) {
        var p = prev[x];
        if (p === undefined) return null;
        segs.push([p, x]);                          // 索引对
        x = p;
    }
    return x === src ? segs : null;
}
/* 公共：两城市（网格顶点索引）的欧氏距离 —— getRoads / addCityToRender 共用 */
function cityEuclid(mesh, a, b) {
    var dx = mesh.vxs[a][0] - mesh.vxs[b][0], dy = mesh.vxs[a][1] - mesh.vxs[b][1];
    return Math.sqrt(dx * dx + dy * dy);
}
/* 公共：道路边收集器 —— 陆/海分组 + 去重，done() 产出 mergeSegments+relaxPath 路径
   getRoads（全量）与 addCityToRender（增量）共用同一套收边/去重/合并逻辑。
   去重边集挂在 render.__roadSeen 上共享：getRoads 全量重算时重置（render 每次生成也是新的），
   addCityToRender 增量沿用 —— 新道路与旧道路（含之前新增城市的路）走相同网格边时自动去重，
   避免重叠/交叉/首都处锐角分叉 */
function makeRoadCollector(render) {
    if (!render.__roadSeen) render.__roadSeen = { land: {}, sea: {} };
    var seenLand = render.__roadSeen.land, seenSea = render.__roadSeen.sea;
    var land = [], sea = [];
    return {
        add: function (a, b) {                      // 接收网格顶点索引对
            var h = render.h;
            var key = (a < b ? a + '|' + b : b + '|' + a);
            if (h[a] <= 0 || h[b] <= 0) {           // 任一端在海里 → 海上路段
                if (seenSea[key]) return; seenSea[key] = true;
                sea.push([h.mesh.vxs[a], h.mesh.vxs[b]]);
            } else {
                if (seenLand[key]) return; seenLand[key] = true;
                land.push([h.mesh.vxs[a], h.mesh.vxs[b]]);
            }
        },
        done: function () {
            return { land: mergeSegments(land).map(relaxPath), sea: mergeSegments(sea).map(relaxPath) };
        }
    };
}
/* 手动新增城市：把网格顶点 vx 作为城镇加入地图 —— 归入所在领地（terr[vx] 原有归属）。
   道路生成参考原始 getRoads 两阶段逻辑（增量版，原道路不动）：
   阶段 A：接入路网中欧氏距离最近的已有城市（MST 主干连接，参考 getRoads 阶段 A）
   阶段 B：补充 领地首都 直达（参考 getRoads 阶段 B；与阶段 A 目标相同则跳过，避免重复）
   边收集/去重/合并复用公共 makeRoadCollector（与 getRoads 同一套逻辑）。
   返回 {cap, landPaths, seaPaths}：cap=领地首都索引，路径为 mergeSegments+relaxPath 后的可绘制路径数组 */
function addCityToRender(render, vx) {
    var h = render.h, mesh = h.mesh;
    render.cities.push(vx);
    var cityVerts = {};
    for (var i = 0; i < render.cities.length; i++) cityVerts[render.cities[i]] = true;
    var cap = render.terr[vx];
    if (cap === undefined) cap = vx;                // 兜底（理论上 terr 全图覆盖）
    var col = makeRoadCollector(render);
    var attract = render.__roadSeen;                // 路网吸引：已有道路边低权重，新路沿旧路走廊汇入（避免锐角/交叉）
    /* 阶段 A：接入路网中欧氏距离最近的已有城市（主干连接）*/
    var nPrev = render.cities.length - 1;           // 不含新城市
    var nearJ = -1;
    if (nPrev >= 1) {
        var bestD = Infinity;
        for (var i = 0; i < nPrev; i++) {
            var d = cityEuclid(mesh, render.cities[i], vx);
            if (d < bestD) { bestD = d; nearJ = i; }
        }
        if (nearJ >= 0) {
            var segsA = roadTrace(mesh, h, render.cities[nearJ], vx, cityVerts, attract);
            if (segsA) for (var k = segsA.length - 1; k >= 0; k--) col.add(segsA[k][0], segsA[k][1]);
        }
    }
    /* 阶段 B：补充 领地首都 直达（首都不是阶段 A 目标时）*/
    if (cap !== vx && cap !== (nearJ >= 0 ? render.cities[nearJ] : -1)) {
        var segsB = roadTrace(mesh, h, cap, vx, cityVerts, attract);
        if (segsB) for (var k = segsB.length - 1; k >= 0; k--) col.add(segsB[k][0], segsB[k][1]);
    }
    var out = col.done();
    for (var li = 0; li < out.land.length; li++) render.landRoads.push(out.land[li]);
    for (var si = 0; si < out.sea.length; si++) render.seaRoads.push(out.sea[si]);
    return {cap: cap, landPaths: out.land, seaPaths: out.sea};
}
function getRoads(render) {
    var h = render.h, mesh = h.mesh;
    var cities = render.cities, terr = render.terr;
    var nterrs = Math.min(render.params.nterrs, cities.length);
    var n = cities.length;
    if (n < 2) { render.__roadSeen = { land: {}, sea: {} }; return {land: [], sea: []}; }
    render.__roadSeen = { land: {}, sea: {} };      // 全量重算 → 重置共享去重边集（删城重连/重新生成场景）
    var col = makeRoadCollector(render);            // 公共：陆/海分组 + 去重 + mergeSegments/relaxPath
    var cityVerts = {};                     // 城市所在网格顶点：边缘带重罚时豁免端点（城市本身）
    for (var ci = 0; ci < cities.length; ci++) cityVerts[cities[ci]] = true;
    /* 单源 Dijkstra（过海重罚：陆地优先、孤岛可渡海），复用公共 roadTrace（与手动新增城市逻辑一致）*/
    function trace(src, target) {
        return roadTrace(mesh, h, src, target, cityVerts);
    }
    /* 阶段 A：短路径优先 MST（瓶颈限制）——每次接入欧氏距离最近的未接入城市（相邻优先），
       超长连接（> LIMIT）延迟到最后才允许：满足全连通的前提下禁止超长路线
       LIMIT 动态自适应：城市对欧氏距离 60 分位 × 1.3（随种子城市分布变化）*/
    var pairDists = [];
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) pairDists.push(cityEuclid(mesh, cities[i], cities[j]));
    pairDists.sort(function (a, b) { return a - b; });
    var LIMIT = Math.min(pairDists[Math.floor(pairDists.length * 0.6)] * 1.3, 0.38 * mesh.extent.width);   // 超长阈值：动态自适应 + 随世界规模（分辨率档位）等比放大
    var inTreeCity = {}; inTreeCity[0] = true;      // cities 数组下标是否已接入
    var connected = 1;
    var tried = {};                                 // 本次尝试过但超长的城市（延迟）
    function pathLen(segs) {
        var L = 0;
        for (var i = 0; i < segs.length; i++) L += cityEuclid(mesh, segs[i][0], segs[i][1]);
        return L;
    }
    var guard = 0;
    while (connected < n && guard++ < n * 8) {
        var best = -1, bestD = Infinity;            // 欧氏距离最近的未接入城市
        for (var i = 0; i < n; i++) {
            if (inTreeCity[i] || tried[i]) continue;
            var dMin = Infinity;
            for (var j = 0; j < n; j++) {
                if (!inTreeCity[j]) continue;
                var dd = cityEuclid(mesh, cities[i], cities[j]);
                if (dd < dMin) dMin = dd;
            }
            if (dMin < bestD) { bestD = dMin; best = i; }
        }
        if (best < 0) { tried = {}; continue; }     // 全部被延迟 → 解除限制（兜底长连接）
        var nearJ = -1, nearD = Infinity;           // 距 best 最近的已接入城市
        for (var j = 0; j < n; j++) {
            if (!inTreeCity[j]) continue;
            var dd = cityEuclid(mesh, cities[best], cities[j]);
            if (dd < nearD) { nearD = dd; nearJ = j; }
        }
        var segs = trace(cities[nearJ], cities[best]);
        if (segs && pathLen(segs) <= LIMIT) {       // 短路径 → 接入
            for (var k = segs.length - 1; k >= 0; k--) col.add(segs[k][0], segs[k][1]);
            inTreeCity[best] = true;
            connected++;
        } else { tried[best] = true; }              // 超长或 trace 失败 → 延迟到最后
    }
    /* 兜底：仍无法接入 → 沿地形 trace 连最近已入树城市（超长允许但绝不直线；trace 真失败才直线，极罕见）*/
    for (var i = 0; i < n; i++) {
        if (inTreeCity[i]) continue;
        var best2 = -1, bestd2 = Infinity;
        for (var j = 0; j < n; j++) {
            if (!inTreeCity[j]) continue;
            var dd = cityEuclid(mesh, cities[i], cities[j]);
            if (dd < bestd2) { bestd2 = dd; best2 = j; }   // best2 存城市索引
        }
        if (best2 >= 0) {
            var segs = trace(cities[best2], cities[i]);    // 沿地形（可绕海绕山，非直线）
            if (segs) { for (var k = segs.length - 1; k >= 0; k--) col.add(segs[k][0], segs[k][1]); }
            else { col.add(cities[i], cities[best2]); }    // 真正不可达才直线（几乎不发生）
            inTreeCity[i] = true;
        }
    }
    /* 阶段 B：补充 城镇→领地首都 直达（连接倾向次高；与 MST 重复的边自动去重）*/
    for (var i = nterrs; i < n; i++) {
        var town = cities[i], cap = terr[town];
        if (cap === undefined || cap === town) continue;
        var segs = trace(cap, town);
        if (segs) { for (var k = segs.length - 1; k >= 0; k--) col.add(segs[k][0], segs[k][1]); }
    }
    return col.done();
}
function getTerritories(render) {
    var h = render.h;
    var cities = render.cities;
    var n = render.params.nterrs;
    if (n > render.cities.length) n = render.cities.length;
    var flux = getFlux(h);
    var terr = [];
    var queue = new PriorityQueue({comparator: function (a, b) {return a.score - b.score}});
    function weight(u, v) {
        var horiz = distance(h.mesh, u, v);
        var vert = h[v] - h[u];
        if (vert > 0) vert /= 10;
        var diff = 1 + 0.25 * Math.pow(vert/horiz, 2);
        diff += 100 * Math.sqrt(flux[u]);
        if (h[u] <= 0) diff = 100;
        if ((h[u] > 0) != (h[v] > 0)) return 1000;
        return horiz * diff;
    }
    for (var i = 0; i < n; i++) {
        terr[cities[i]] = cities[i];
        var nbs = neighbours(h.mesh, cities[i]);
        for (var j = 0; j < nbs.length; j++) {
            queue.queue({
                score: weight(cities[i], nbs[j]),
                city: cities[i],
                vx: nbs[j]
            });
        }
    }
    while (queue.length) {
        var u = queue.dequeue();
        if (terr[u.vx] != undefined) continue;
        terr[u.vx] = u.city;
        var nbs = neighbours(h.mesh, u.vx);
        for (var i = 0; i < nbs.length; i++) {
            var v = nbs[i];
            if (terr[v] != undefined) continue;
            var newdist = weight(u.vx, v);
            queue.queue({
                score: u.score + newdist,
                city: u.city,
                vx: v
            });
        }
    }
    terr.mesh = h.mesh;
    return terr;
}

function getBorders(render) {
    var terr = render.terr;
    var h = render.h;
    var edges = [];
    for (var i = 0; i < terr.mesh.edges.length; i++) {
        var e = terr.mesh.edges[i];
        if (e[3] == undefined) continue;
        if (isnearedge(terr.mesh, e[0]) || isnearedge(terr.mesh, e[1])) continue;
        if (h[e[0]] < 0 || h[e[1]] < 0) continue;
        if (terr[e[0]] != terr[e[1]]) {
            edges.push([e[2], e[3]]);
        }
    }
    return mergeSegments(edges).map(relaxPath);
}

function mergeSegments(segs) {
    var adj = {};
    for (var i = 0; i < segs.length; i++) {
        var seg = segs[i];
        var a0 = adj[seg[0]] || [];
        var a1 = adj[seg[1]] || [];
        a0.push(seg[1]);
        a1.push(seg[0]);
        adj[seg[0]] = a0;
        adj[seg[1]] = a1;
    }
    var done = [];
    var paths = [];
    var path = null;
    while (true) {
        if (path == null) {
            for (var i = 0; i < segs.length; i++) {
                if (done[i]) continue;
                done[i] = true;
                path = [segs[i][0], segs[i][1]];
                break;
            }
            if (path == null) break;
        }
        var changed = false;
        for (var i = 0; i < segs.length; i++) {
            if (done[i]) continue;
            if (adj[path[0]].length == 2 && segs[i][0] == path[0]) {
                path.unshift(segs[i][1]);
            } else if (adj[path[0]].length == 2 && segs[i][1] == path[0]) {
                path.unshift(segs[i][0]);
            } else if (adj[path[path.length - 1]].length == 2 && segs[i][0] == path[path.length - 1]) {
                path.push(segs[i][1]);
            } else if (adj[path[path.length - 1]].length == 2 && segs[i][1] == path[path.length - 1]) {
                path.push(segs[i][0]);
            } else {
                continue;
            }
            done[i] = true;
            changed = true;
            break;
        }
        if (!changed) {
            paths.push(path);
            path = null;
        }
    }
    return paths;
}

function relaxPath(path) {
    var newpath = [path[0]];
    for (var i = 1; i < path.length - 1; i++) {
        var newpt = [0.25 * path[i-1][0] + 0.5 * path[i][0] + 0.25 * path[i+1][0],
                     0.25 * path[i-1][1] + 0.5 * path[i][1] + 0.25 * path[i+1][1]];
        newpath.push(newpt);
    }
    newpath.push(path[path.length - 1]);
    return newpath;
}
function makeD3Path(path) {
    var p = d3.path();
    p.moveTo(1000*path[0][0], 1000*path[0][1]);
    for (var i = 1; i < path.length; i++) {
        p.lineTo(1000*path[i][0], 1000*path[i][1]);
    }
    return p.toString();
}

function drawPaths(svg, cls, paths) {
    var paths = svg.selectAll('path.' + cls).data(paths)
    paths.enter()
            .append('path')
            .classed(cls, true)
    paths.exit()
            .remove();
    svg.selectAll('path.' + cls)
        .attr('d', makeD3Path);
}

function visualizeSlopes(svg, render) {
    var h = render.h;
    var strokes = [];
    var k = h.mesh.extent.width;                 // 世界规模倍率：影线长度/线宽随世界等比放大，显示效果与 1x 一致
    var r = 0.25 / Math.sqrt(h.length) * k;
    for (var i = 0; i < h.length; i++) {
        if (h[i] <= 0 || isnearedge(h.mesh, i)) continue;
        var nbs = neighbours(h.mesh, i);
        nbs.push(i);
        var s = 0;
        var s2 = 0;
        for (var j = 0; j < nbs.length; j++) {
            var slopes = trislope(h, nbs[j]);
            s += slopes[0] / 10;
            s2 += slopes[1];
        }
        s /= nbs.length;
        s2 /= nbs.length;
        s *= k;      // 世界放大 k 倍 → 世界单位梯度缩小 1/k → 补偿恢复（影线密度/坡度阈值/形态与 1x 完全一致）
        s2 *= k;
        if (Math.abs(s) < runif(0.1, 0.4)) continue;
        var l = r * runif(1, 2) * (1 - 0.2 * Math.pow(Math.atan(s), 2)) * Math.exp(s2/100);
        var x = h.mesh.vxs[i][0];
        var y = h.mesh.vxs[i][1];
        if (Math.abs(l*s) > 2 * r) {
            var n = Math.floor(Math.abs(l*s/r));
            l /= n;
            if (n > 4) n = 4;
            for (var j = 0; j < n; j++) {
                var u = rnorm() * r;
                var v = rnorm() * r;
                strokes.push([[x+u-l, y+v+l*s], [x+u+l, y+v-l*s]]);
            }
        } else {
            strokes.push([[x-l, y+l*s], [x+l, y-l*s]]);
        }
    }
    var lines = svg.selectAll('line.slope').data(strokes)
    lines.enter()
            .append('line')
            .classed('slope', true);
    lines.exit()
            .remove();
    svg.selectAll('line.slope')
        .attr('x1', function (d) {return 1000*d[0][0]})
        .attr('y1', function (d) {return 1000*d[0][1]})
        .attr('x2', function (d) {return 1000*d[1][0]})
        .attr('y2', function (d) {return 1000*d[1][1]})
        .attr('stroke-width', k * 1.25);   // 线宽随世界规模等比放大并略加粗（显示 ≈1.2px，1x 时 = 1.25）
}

function visualizeCities(svg, render) {
    var cities = render.cities;
    var h = render.h;
    var n = render.params.nterrs;

    var circs = svg.selectAll('circle.city').data(cities);
    circs.enter()
            .append('circle')
            .classed('city', true);
    circs.exit()
            .remove();
    svg.selectAll('circle.city')
        .attr('cx', function (d) {return 1000*h.mesh.vxs[d][0]})
        .attr('cy', function (d) {return 1000*h.mesh.vxs[d][1]})
        .attr('r', function (d, i) {return i >= n ? 4 : 10})
        .style('fill', 'white')
        .style('stroke-width', 5)
        .style('stroke-linecap', 'round')
        .style('stroke', 'black')
        .raise();
}

function generateCoast(params) {
    /* 复用分步生成的两个阶段（genCoastMesh + genCoastField），消除重复实现：
       两者合计与原 generateCoast 的完整流程（网格 + 高度场）逐行一致 → 生成结果不变 */
    return genCoastField(genCoastMesh(params));
}

function terrCenter(h, terr, city, landOnly) {
    var x = 0;
    var y = 0;
    var n = 0;
    for (var i = 0; i < terr.length; i++) {
        if (terr[i] != city) continue;
        if (landOnly && h[i] <= 0) continue;
        x += terr.mesh.vxs[i][0];
        y += terr.mesh.vxs[i][1];
        n++;
    }
    return [x/n, y/n];
}

/* ============ 通用词库系统：地形分类 + 词库注册表 ============
   地形标签（通用，与词库无关）：
     城市 {coast 临海, wet 近河/湖}  领地 {flat 平坦, dry 干燥河流少, wet 河流多}
   词库对象按地形标签提供名字部件池 → 新增词库只需在 LEXICONS 加条目，
   即可复用同一套地形分类与生成逻辑（不再是 DND 词库的专用代码）。
   =============================================================== */
var zhUsed = [];
function zhPick(s) { return s[Math.floor(Math.random() * s.length)]; }
function zhPickWord(s) { var a = s.split(' '); return a[Math.floor(Math.random() * a.length)]; }
function zhOk(name) {
  if (name.length < 2 || name.length > 4) return false;
  for (var i = 0; i < zhUsed.length; i++) {
    var u = zhUsed[i];
    if (u.indexOf(name) !== -1 || name.indexOf(u) !== -1) return false;
  }
  zhUsed.push(name);
  return true;
}
/* 单个城市的地形分类（coast 临海 / wet 近河）：classifyTerrains 批量分类与
   手动新增城市命名（cityTerrainAt）共用同一套判断逻辑 */
function cityTerrClass(h, rivers, vx) {
    var coast = false;
    var nbs = neighbours(h.mesh, vx);
    for (var j = 0; j < nbs.length; j++) if (h[nbs[j]] <= 0) { coast = true; break; }
    var p = h.mesh.vxs[vx], wet = coast;               // 临海即水域；否则看近河
    if (!wet) {
        for (var i = 0; i < rivers.length; i++) {
            var rp = rivers[i];
            for (var k = 0; k < rp.length; k++) {
                var dx = rp[k][0] - p[0], dy = rp[k][1] - p[1];
                if (dx * dx + dy * dy < 0.0016) { wet = true; break; }   // 0.04 世界 ≈ 40px
            }
            if (wet) break;
        }
    }
    return {coast: coast, wet: wet};
}
/* 地形分类（通用）：为所有城市/领地计算地形标签 */
function classifyTerrains(render) {
  var h = render.h, terrArr = render.terr;
  var cities = render.cities;
  var nterrs = Math.min(render.params.nterrs, cities.length);
  var riverPts = [];
  for (var i = 0; i < render.rivers.length; i++) {
    var rp = render.rivers[i];
    for (var j = 0; j < rp.length; j++) riverPts.push(rp[j]);
  }
  var cityTerr = [];
  for (var i = 0; i < cities.length; i++) {
    cityTerr.push(cityTerrClass(h, render.rivers, cities[i]));   // 复用公共分类（与手动新增城市一致）
  }
  var regionTerr = [];
  for (var i = 0; i < nterrs; i++) {
    var cap = cities[i];
    var ssum = 0, cnt = 0;
    for (var j = 0; j < h.length; j++) if (terrArr[j] === cap) { ssum += h[j]; cnt++; }
    var mean = cnt ? ssum / cnt : 0;
    var vsum = 0;
    for (var j = 0; j < h.length; j++) if (terrArr[j] === cap) { var d = h[j] - mean; vsum += d * d; }
    var varr = cnt ? vsum / cnt : 0;
    var lc = terrCenter(h, terrArr, cap, true);
    var wetCnt = 0;
    for (var k = 0; k < riverPts.length; k++) {
      var dx = riverPts[k][0] - lc[0], dy = riverPts[k][1] - lc[1];
      if (dx * dx + dy * dy < 0.0036) wetCnt++;
    }
    regionTerr.push({flat: varr < 0.006, dry: wetCnt <= 2, wet: wetCnt > 2});
  }
  return {cities: cityTerr, regions: regionTerr};
}
/* 单个城市的地形分类（coast/wet），供手动新增城市命名使用（与 classifyTerrains 复用同一公共判断）*/
function cityTerrainAt(render, vx) {
    return cityTerrClass(render.h, render.rivers, vx);
}
/* 通用中文名生成器：lex=词库对象（提供部件池），terr=地形标签 */
function makeNameZh(key, lex, terr) {
  terr = terr || {};
  var sfx1 = (key === 'region') ? (terr.flat ? lex.regionSfx1.flat : lex.regionSfx1.hill) : '';
  var sfx2 = '';
  if (key === 'region') {
    if (terr.dry) sfx2 = lex.regionSfx2.dry;
    else if (terr.flat) sfx2 = lex.regionSfx2.flat;
    else sfx2 = lex.regionSfx2.hill;
  }
  var citySfx = (key === 'city') ? (terr.coast ? lex.citySfx.coast : (terr.wet ? lex.citySfx.wet : lex.citySfx.inland)) : '';
  for (var t = 0; t < 800; t++) {
    var m1 = zhPick(lex.m1), m2 = zhPick(lex.m2);
    var name;
    if (key === 'region') {
      var r = Math.random();
      if (r < 0.25) name = m1 + m2 + '之' + zhPick(sfx1);
      else if (r < 0.55) name = m1 + m2 + zhPick(sfx1);
      else name = m1 + m2 + zhPickWord(sfx2);
    } else {
      var r = Math.random();
      if (r < 0.08) name = m1 + zhPick(citySfx);
      else if (r < 0.28) name = m1 + m2 + '之' + zhPick(citySfx);
      else if (r < 0.96) name = m1 + m2 + zhPick(citySfx);
      else name = m1 + m2;
    }
    if (zhOk(name)) return name;
  }
  /* 兜底：组合空间极端紧张时返回序号唯一名（必须入表，否则多个兜底名会完全相同导致重名）*/
  var fb = '无名地' + (zhUsed.length + 1);
  zhUsed.push(fb);
  return fb;
}
/* 词库注册表：运行时由外部词库脚本填充（lexicons/lex-<id>.js 定义 window.LEX_DEFS[id]）。
   HTML 仅内置原版（英文音素）词库；新增词库 = 在 lexicons 文件夹加 .js 文件，
   并把 id 加入 HTML 内置的 EXTERNAL_LEXES 清单。词库缺失/加载失败时回退原版。 */
var LEXICONS = {};
function getLex() { return LEXICONS[currentLex] || null; }
var lastLang = null;    // 最近一次生成的英文命名上下文（makeName 去重池），供手动新增城市命名复用
function drawLabels(svg, render) {
    var params = render.params;
    var h = render.h;
    var terr = render.terr;
    var cities = render.cities;
    var nterrs = render.params.nterrs;
    var avoids = [render.rivers, render.coasts, render.borders];
    lastLang = makeRandomLanguage();
    var lang = lastLang;
    zhUsed = []; // 每次生成重置中文名去重表
    // 先生成全部英文名、再生成全部中文名：英文名随机流与原版完全一致，中文名独立且同种子可复现
    var cityTextsEn = [], cityTextsZh = [], regionTextsEn = [], regionTextsZh = [];
    for (var i = 0; i < cities.length; i++) cityTextsEn.push(makeName(lang, 'city'));
    for (var i = 0; i < nterrs; i++) regionTextsEn.push(makeName(lang, 'region'));
    /* 通用地形分类 + 词库（currentLex 可切换）：城市 coast/wet、领地 flat/dry/wet */
    var terrains = classifyTerrains(render);
    var lex = getLex();
    if (lex) { // 外部词库已加载 → 生成中文名；原版（orig/词库缺失）时中文名占位空
      for (var i = 0; i < cities.length; i++) cityTextsZh.push(makeNameZh('city', lex, terrains.cities[i]));
      for (var i = 0; i < nterrs; i++) regionTextsZh.push(makeNameZh('region', lex, terrains.regions[i]));
    } else {
      for (var i = 0; i < cities.length; i++) cityTextsZh.push('');
      for (var i = 0; i < nterrs; i++) regionTextsZh.push('');
    }
    var citylabels = [];
    function penalty(label) {
        var pen = 0;
        if (label.x0 < -0.45 * h.mesh.extent.width) pen += 100;
        if (label.x1 > 0.45 * h.mesh.extent.width) pen += 100;
        if (label.y0 < -0.45 * h.mesh.extent.height) pen += 100;
        if (label.y1 > 0.45 * h.mesh.extent.height) pen += 100;
        for (var i = 0; i < citylabels.length; i++) {
            var olabel = citylabels[i];
            if (label.x0 < olabel.x1 && label.x1 > olabel.x0 &&
                label.y0 < olabel.y1 && label.y1 > olabel.y0) {
                pen += 100;
            }
        }

        for (var i = 0; i < cities.length; i++) {
            var c = h.mesh.vxs[cities[i]];
            if (label.x0 < c[0] && label.x1 > c[0] && label.y0 < c[1] && label.y1 > c[1]) {
                pen += 100;
            }
        }
        for (var i = 0; i < avoids.length; i++) {
            var avoid = avoids[i];
            for (var j = 0; j < avoid.length; j++) {
                var avpath = avoid[j];
                for (var k = 0; k < avpath.length; k++) {
                    var pt = avpath[k];
                    if (pt[0] > label.x0 && pt[0] < label.x1 && pt[1] > label.y0 && pt[1] < label.y1) {
                        pen++;
                    }
                }
            }
        }
        return pen;
    }
    for (var i = 0; i < cities.length; i++) {
        var x = h.mesh.vxs[cities[i]][0];
        var y = h.mesh.vxs[cities[i]][1];
        var textEn = cityTextsEn[i];
        var textZh = cityTextsZh[i];
        var size = i < nterrs ? params.fontsizes.city : params.fontsizes.town;
        var sx = 0.65 * size/1000 * Math.max(textEn.length, 1.7 * textZh.length);
        var sy = size/1000;
        var posslabels = [
        {
            x: x + 0.8 * sy,
            y: y + 0.3 * sy,
            align: 'start',
            x0: x + 0.7 * sy,
            y0: y - 0.6 * sy,
            x1: x + 0.7 * sy + sx,
            y1: y + 0.6 * sy
        },
        {
            x: x - 0.8 * sy,
            y: y + 0.3 * sy,
            align: 'end',
            x0: x - 0.9 * sy - sx,
            y0: y - 0.7 * sy,
            x1: x - 0.9 * sy,
            y1: y + 0.7 * sy
        },
        {
            x: x,
            y: y - 0.8 * sy,
            align: 'middle',
            x0: x - sx/2,
            y0: y - 1.9*sy,
            x1: x + sx/2,
            y1: y - 0.7 * sy
        },
        {
            x: x,
            y: y + 1.2 * sy,
            align: 'middle',
            x0: x - sx/2,
            y0: y + 0.1*sy,
            x1: x + sx/2,
            y1: y + 1.3*sy
        }
        ];
        var label = posslabels[d3.scan(posslabels, function (a, b) {return penalty(a) - penalty(b)})];
        label.text = textEn;
        label.textZh = textZh;
        label.size = size;
        citylabels.push(label);
    }
    var texts = svg.selectAll('text.city').data(citylabels);
    texts.enter()
        .append('text')
        .classed('city', true);
    texts.exit()
        .remove();
    svg.selectAll('text.city')
        .attr('x', function (d) {return 1000*d.x})
        .attr('y', function (d) {return 1000*d.y})
        .style('font-size', function (d) {return d.size})
        .style('text-anchor', function (d) {return d.align})
        .classed('dnd', currentLex !== 'orig')
        .text(function (d) {return currentLex !== 'orig' ? d.textZh : d.text})
        .raise();

    var reglabels = [];
    for (var i = 0; i < nterrs; i++) {
        var city = cities[i];
        var textEn = regionTextsEn[i];
        var textZh = regionTextsZh[i];
        var sy = params.fontsizes.region / 1000;
        var sx = 0.6 * Math.max(textEn.length, 1.7 * textZh.length) * sy;
        var lc = terrCenter(h, terr, city, true);
        var oc = terrCenter(h, terr, city, false);
        var best = 0;
        var bestscore = -999999;
        for (var j = 0; j < h.length; j++) {
            var score = 0;
            var v = h.mesh.vxs[j];
            score -= 3000 * Math.sqrt((v[0] - lc[0]) * (v[0] - lc[0]) + (v[1] - lc[1]) * (v[1] - lc[1]));
            score -= 1000 * Math.sqrt((v[0] - oc[0]) * (v[0] - oc[0]) + (v[1] - oc[1]) * (v[1] - oc[1]));
            if (terr[j] != city) score -= 3000;
            for (var k = 0; k < cities.length; k++) {
                var u = h.mesh.vxs[cities[k]];
                if (Math.abs(v[0] - u[0]) < sx && 
                    Math.abs(v[1] - sy/2 - u[1]) < sy) {
                    score -= k < nterrs ? 4000 : 500;
                }
                if (v[0] - sx/2 < citylabels[k].x1 &&
                    v[0] + sx/2 > citylabels[k].x0 &&
                    v[1] - sy < citylabels[k].y1 &&
                    v[1] > citylabels[k].y0) {
                    score -= 5000;
                }
            }
            for (var k = 0; k < reglabels.length; k++) {
                var label = reglabels[k];
                if (v[0] - sx/2 < label.x + label.width/2 &&
                    v[0] + sx/2 > label.x - label.width/2 &&
                    v[1] - sy < label.y &&
                    v[1] > label.y - label.size) {
                    score -= 20000;
                }
            }
            if (h[j] <= 0) score -= 500;
            if (v[0] + sx/2 > 0.5 * h.mesh.extent.width) score -= 50000;
            if (v[0] - sx/2 < -0.5 * h.mesh.extent.width) score -= 50000;
            if (v[1] > 0.5 * h.mesh.extent.height) score -= 50000;
            if (v[1] - sy < -0.5 * h.mesh.extent.height) score -= 50000;
            if (score > bestscore) {
                bestscore = score;
                best = j;
            }
        }
        reglabels.push({
            text: textEn,
            textZh: textZh, 
            x: h.mesh.vxs[best][0], 
            y: h.mesh.vxs[best][1], 
            size:sy, 
            width:sx
        });
    }
    texts = svg.selectAll('text.region').data(reglabels);
    texts.enter()
        .append('text')
        .classed('region', true);
    texts.exit()
        .remove();
    svg.selectAll('text.region')
        .attr('x', function (d) {return 1000*d.x})
        .attr('y', function (d) {return 1000*d.y})
        .style('font-size', function (d) {return 1000*d.size})
        .style('text-anchor', 'middle')
        .classed('dnd', currentLex !== 'orig')
        .text(function (d) {return currentLex !== 'orig' ? d.textZh : d.text})
        .raise();

}
/* ---- 分步生成（UI 体验优化）：把地图生成切成多个阶段，阶段间让出主线程并更新进度提示，
       避免生成期间页面完全冻结；各阶段计算内容与顺序与原同步生成完全一致 → 结果不变 ---- */
function genCoastMesh(params) {   // 分步 generateCoast 第 1 段：Voronoi 网格
    return generateGoodMesh(params.npts, params.extent);
}
function genCoastField(mesh) {    // 第 2 段：高度场（Math.random 消费顺序与原 generateCoast 一致）
    var h = add(slope(mesh, randomVector(4)), cone(mesh, runif(-1, -1)), mountains(mesh, 50));
    for (var i = 0; i < 10; i++) h = relax(h);
    h = peaky(h);
    h = doErosion(h, runif(0, 0.1), 5);
    h = setSeaLevel(h, runif(0.2, 0.6));
    h = fillSinks(h);
    return cleanCoast(h, 3);
}
function doMapStepped(svg, params, step, done) {
    var status = document.getElementById('status');
    if (step === 0) {   // 初始化：视图框 + 清空
        render = { params: params };
        var width = svg.attr('width');
        svg.attr('height', width * params.extent.height / params.extent.width);
        svg.attr('viewBox', -1000 * params.extent.width/2 + ' ' + -1000 * params.extent.height/2 + ' ' +
                 1000 * params.extent.width + ' ' + 1000 * params.extent.height);
        svg.selectAll().remove();
        status.textContent = '生成中… ① 构建地形网格';
        setTimeout(function () { doMapStepped(svg, params, 1, done); }, 16);
        return;
    }
    if (step === 1) {   // 网格 + 高度场（最耗时段）
        render.mesh = genCoastMesh(params);
        render.h = genCoastField(render.mesh);
        status.textContent = '生成中… ② 放置城市';
        setTimeout(function () { doMapStepped(svg, params, 2, done); }, 16);
        return;
    }
    if (step === 2) {   // 城市
        placeCities(render);
        status.textContent = '生成中… ③ 计算河流与领地';
        setTimeout(function () { doMapStepped(svg, params, 3, done); }, 16);
        return;
    }
    if (step === 3) {   // 河流 / 海岸 / 领地 / 边界
        render.rivers = getRivers(render.h, 0.01);
        render.coasts = contour(render.h, 0);
        render.terr = getTerritories(render);
        render.borders = getBorders(render);
        status.textContent = '生成中… ④ 计算道路';
        setTimeout(function () { doMapStepped(svg, params, 4, done); }, 16);
        return;
    }
    if (step === 4) {   // 道路
        render.roads = getRoads(render);
        render.landRoads = render.roads.land;
        render.seaRoads = render.roads.sea;
        status.textContent = '生成中… ⑤ 绘制地图';
        setTimeout(function () { doMapStepped(svg, params, 5, done); }, 16);
        return;
    }
    /* step 5：绘制（与原 drawMap 一致）*/
    drawPaths(svg, 'river', render.rivers);
    drawPaths(svg, 'coast', render.coasts);
    drawPaths(svg, 'border', render.borders);
    drawPaths(svg, 'road', render.landRoads);
    drawPaths(svg, 'roadsea', render.seaRoads);
    visualizeSlopes(svg, render);
    visualizeCities(svg, render);
    drawLabels(svg, render);
    if (done) done();
}

var defaultParams = {
    extent: defaultExtent,
    generator: generateCoast,
    npts: 16384,
    ncities: 15,
    nterrs: 5,
    fontsizes: {
        region: 40,
        city: 25,
        town: 20
    }
}

