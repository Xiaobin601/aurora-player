# Aurora Player (极光流媒体播放器)

> 基于原版「风暴剧场」逆向工程架构全套复刻的现代化原生桌面流媒体播放器。

---

## 🛠 技术栈对齐

本项目与原应用采用完全一致的技术架构选型：

| 层次 | 技术选型 | 功能与职责 |
| :--- | :--- | :--- |
| **桌面运行时** | **Tauri 2.x (Rust)** | 原生窗口调度、轻量级封装、极致性能与超低内存开销 (~40MB RAM) |
| **本地中转代理** | **Tokio + Axum 0.7 + Reqwest** | 后台监听 `127.0.0.1:<动态端口>`，负责伪装请求头、绕过防盗链及清洗切片头 |
| **前端交互** | **React 19 + TypeScript + Vite** | 现代化深色主题流媒体交互界面、多码率与选集调度面板 |
| **解码与播放** | **Hls.js + HTML5 Video** | 自适应码率切换、低延迟切片加载、硬件加速与异常自动重试 |

---

## 💡 核心机制复刻

### 1. 本地微型代理中转 (`src-tauri/src/proxy.rs`)
原版软件能流畅播放各大防盗链切片的核心就在于本地代理：
1. **自动注入请求头**：自动向上游请求补齐 macOS Chrome User-Agent 与伪装 Referer。
2. **M3U8 播放列表动态重写**：自动将 M3U8 内相对路径和绝对路径的 TS 分片拦截并替换为本地中转地址 `/stream?url=...`。
3. **切片图片伪装头剥离 (Image-prefixed HLS)**：针对带有 PNG/GIF/JPEG 伪装头的混淆视频切片，动态检测 MPEG-TS 同步字节（`0x47`），毫秒级截断伪装前缀，还原标准视频流给播放器解码。

### 2. 双模式无缝切换
* **本地代理清洗模式 (LocalProxy)**：走本地 Rust 代理，用于任何防盗链、跨域限制或混淆流媒体。
* **原生直连模式 (Direct)**：直接请求上游，用于标准公开 CDN 源。

---

## 🚀 启动与开发

### 运行环境要求
* **Node.js**: >= 18.0.0
* **Rust / Cargo**: >= 1.75.0 (系统自带即可)

### 快速启动开发模式
```bash
cd /Users/xiaobin/ai-study/aurora-player

# 启动桌面端原生开发调试 (自动拉起 Vite 前端与 Rust 桌面窗口)
npm run tauri:dev
```

### 仅在浏览器中预览前端
```bash
npm run dev
# 浏览器打开 http://localhost:5173
```

### 构建发行版安装包 (.app / .dmg)
```bash
npm run tauri:build
```
打包生成的可执行文件将位于 `src-tauri/target/release/bundle/macos/` 下。

---

## 📂 目录结构

```
aurora-player/
├── src-tauri/                 # Rust 原生后端
│   ├── src/
│   │   ├── lib.rs            # Tauri 插件、状态管理与 IPC 命令
│   │   ├── main.rs           # 应用程序入口
│   │   └── proxy.rs          # 本地流代理、M3U8 重写与切片清洗核心引擎
│   ├── Cargo.toml            # Rust 依赖声明 (Tauri 2, Axum, Tokio, Reqwest)
│   └── tauri.conf.json       # 窗口与应用配置文件
├── src/                       # React 前端
│   ├── App.tsx               # 播放器核心界面、Hls.js 引擎集成与线路面板
│   ├── App.css               # 极简深色流媒体主题样式
│   └── main.tsx              # React 入口
├── package.json
└── vite.config.ts
```
