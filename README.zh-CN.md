<div align="center">
  <h1>Cpaste</h1>
  <p><b>轻量级、纯本地的剪贴板管理器，基于 Tauri 2 + Rust。</b></p>

  | 版本 | 许可证 | 平台 |
  | :---: | :---: | :---: |
  | [![Version](https://img.shields.io/github/v/release/gaogx96/cpaste?label=VERSION&style=for-the-badge&color=2196F3)](https://github.com/gaogx96/cpaste/releases) | [![License](https://img.shields.io/badge/LICENSE-GPL--3.0-FF9800?style=for-the-badge)](https://www.gnu.org/licenses/gpl-3.0) | [![Platform](https://img.shields.io/badge/PLATFORM-WIN-f44336?style=for-the-badge)](https://github.com/gaogx96/cpaste/releases) |

  [English](./README.md)
</div>

---

## 功能

- **原生性能**：基于 Tauri 2 和 Rust，内存占用极小
- **智能捕获**：自动收集文本、代码、富文本（HTML）、图片和文件路径
- **全局搜索**：按内容、来源应用或日期搜索
- **标签系统**：用自定义彩色标签管理历史记录
- **表情面板**：内置表情管理，快速插入
- **循环粘贴**：按复制顺序依次粘贴
- **主题支持**：3D 复古和简约浅色/深色主题
- **持久化存储**：本地 SQLite 数据库

## 安装

### Windows

从 [Releases](https://github.com/gaogx96/cpaste/releases) 下载最新安装包。

### 系统要求

- Windows 10/11（x64）

## 从源码构建

```bash
# 前置要求：Rust、Node.js
git clone https://github.com/gaogx96/cpaste.git
cd cpaste
npm install
npm run tauri:build
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React + TypeScript + Vite |
| 后端 | Rust + Tauri 2 |
| 数据库 | SQLite via rusqlite |
| 剪贴板 | arboard + clipboard-rs |
| 窗口 | Win32 API / WebView2 |

## 许可证

GPL-3.0
