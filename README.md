# 程序化大陆 · Procedural Terrain

一个基于 **[mewo2/terrain](https://github.com/mewo2/terrain)** 改造的程序化幻想地图生成器。

> 原项目：mewo2/terrain — Fantasy map generator（MIT License · 2016 · Martin O'Leary）
> 本仓库为衍生项目：在原版 Voronoi 地形生成算法基础上，扩展了 **道路系统（领地辐射 + 首都 MST）**、**领地划分**、**中英文双语词库命名系统**（原版 / DND 风格 / 仙侠风）与完整的地图工具 UI（缩放、全屏、图层显隐、名称管理、数据导入导出）。

## ✨ 功能特性

- **程序化地形**：Voronoi 网格 + 侵蚀模拟 + 水系（河流/海岸线），同一种子可复现
- **城市与领地**：自动选址城市、划分领地、生成首都道路网
- **多词库命名**：内置「原版 / 奇幻风格 / 仙侠风」三套命名系统，可扩展
- **地图工具**：缩放平移、网页内全屏、图层显隐（道路/城市/领地）、世界规模档位（1x-8x，面积等比放大、组件不变、同屏容纳更多领地）、导出 PNG、导入导出地图数据
- **名称管理**：侧栏三级关联树（领地 → 城市 → 道路），支持行内改名

## 🚀 在线体验

通过 GitHub Pages 部署：[https://Gazing-dreams.github.io/terrain-map/](https://Gazing-dreams.github.io/terrain-map/)

## 📁 项目结构

```
├── index.html              # 唯一入口
├── css/style.css           # 样式
├── js/
│   ├── d3-mini.js          # 原生 d3 替代库
│   ├── d3-voronoi.js       # d3-voronoi 算法
│   ├── namer.js            # 名称生成器
│   ├── terrain-core.js     # 地形生成核心
│   └── ui.js               # UI 交互
├── lexicons/               # 词库（原版/奇幻/仙侠）
└── 旧版/                   # 历史版本存档（V1/V2/V4/V5）
```

## 🛠 本地运行

直接用浏览器打开 `index.html` 即可（`file://` 协议下词库动态加载不受 CORS 限制），无需构建。
若用HTML单文件版，在旧版文件夹里选择最新版。

## 📜 许可证

MIT License，详情见 [LICENSE](LICENSE)。本衍生项目保留原项目版权声明：

- 原项目 Copyright (c) 2016 Martin O'Leary（[mewo2/terrain](https://github.com/mewo2/terrain)）
- 本衍生项目 Copyright (c) 2026 Gazing-dreams
