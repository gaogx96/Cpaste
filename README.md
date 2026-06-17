<div align="center">
  <h1>Cpaste</h1>
  <p><b>A lightweight, local-first clipboard manager built with Tauri 2 + Rust.</b></p>

  | VERSION | LICENSE | PLATFORM |
  | :---: | :---: | :---: |
  | [![Version](https://img.shields.io/github/v/release/gaogx96/cpaste?label=VERSION&style=for-the-badge&color=2196F3)](https://github.com/gaogx96/cpaste/releases) | [![License](https://img.shields.io/badge/LICENSE-GPL--3.0-FF9800?style=for-the-badge)](https://www.gnu.org/licenses/gpl-3.0) | [![Platform](https://img.shields.io/badge/PLATFORM-WIN-f44336?style=for-the-badge)](https://github.com/gaogx96/cpaste/releases) |

  [简体中文](./README.zh-CN.md)
</div>

---

## Features

- **Native Performance**: Built with Tauri 2 and Rust for minimal memory footprint.
- **Smart Capture**: Automatically collects text, code, rich text (HTML), images, and file paths.
- **Global Search**: Find anything by content, source app, or date.
- **Tag System**: Organize history with custom multi-color tags.
- **Emoji Panel**: Built-in emoji management for quick access.
- **Sequential Paste**: Paste items in the order they were copied.
- **Theme Support**: Retro 3D and clean light/dark themes.
- **Persistent Storage**: Local SQLite database.

## Installation

### Windows

Download the latest installer from [Releases](https://github.com/gaogx96/cpaste/releases).

### Requirements

- Windows 10/11 (x64)

## Build from Source

```bash
# Prerequisites: Rust, Node.js
git clone https://github.com/gaogx96/cpaste.git
cd cpaste
npm install
npm run tauri:build
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Vite |
| Backend | Rust + Tauri 2 |
| Database | SQLite via rusqlite |
| Clipboard | arboard + clipboard-rs |
| Window | Win32 API / WebView2 |

## License

GPL-3.0
