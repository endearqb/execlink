# ExecLink

ExecLink 是一个 Windows 11 右键菜单增强工具，用于快速启动常见 AI CLI（Tauri v2 + React + TypeScript + Rust）。

## 界面预览

![ExecLink UI Preview](src/assets/home.png)

## 核心能力

- 检测 CLI 可用性：`claude` / `codex` / `gemini` / `kimi` / `kimi_web` / `qwencode` / `opencode`
- 右键菜单配置：菜单标题、显示项、拖拽排序、启用/禁用
- 未检测到 CLI 时提供安装辅助：复制命令、打开文档、一键安装
- Nilesoft 安装与注册：支持提权重试、立即生效、故障恢复与数据清理
- 默认终端运行器：`Windows Terminal (wt)`
- 关于页支持一键复制基础信息

## 使用向导（快速上手）

- 点击窗口右上角 `?` 打开“使用说明向导”。
- 首次使用先点 `一键安装修复`，完成 Nilesoft 安装与注册。
- 点击 `刷新 CLI 检测`，确认当前 CLI 检测状态。
- 对未检测到的 CLI 先完成安装；如需授权，点击对应 CLI 的登录按钮。
- 调整 CLI 显示开关、顺序、分组名称后，点击 `应用配置` 并在资源管理器右键验证生效。

## 技术栈

- Frontend: React + TypeScript + Vite
- Desktop: Tauri v2
- Backend: Rust

## 目录说明

- 前端源码：`src/`
- Tauri/Rust 源码：`src-tauri/`
- 文档：`docs/`
- 运行时数据（本机）：`%LOCALAPPDATA%/execlink/`
  - 兼容自动迁移旧目录：`%LOCALAPPDATA%/AI-CLI-Switch/`

## 安装依赖（Windows）

ExecLink 当前安装链路依赖以下环境：

- `winget`（App Installer，前置检测项）
- Git for Windows
- Node.js（含 npm）
- Kimi Code CLI（通过 `uv` 安装）
- Python `3.13`（Kimi 安装流程中会安装/校验）

说明：

- 安装流程会先检测 `winget`；若缺失，推荐先安装 Microsoft Store 的 App Installer。
- 因为 CLI 使用时可通过 Python 脚本执行任务，建议先安装 Kimi Code（会带齐 uv + Python 3.13 路径）。
- 如果你只需要 Python 环境，不需要 Kimi Code，可在安装完成后卸载 `kimi-cli`。
- 除 Kimi 与 Claude Code 外，其他 CLI 在本项目默认采用 npm 全局安装。

## 推荐安装顺序

1. 安装/确认 `winget`
2. 安装 Git for Windows
3. 安装 Node.js（含 npm）
4. 安装 Kimi Code（uv + Python 3.13）
5. 安装其他 CLI（npm）

## 依赖安装命令

### 0) winget（App Installer）

检测：

```powershell
winget --version
```

若未安装，推荐 Microsoft Store：

- https://apps.microsoft.com/detail/9NBLGGH4NNS1

官方脚本安装方式（管理员 PowerShell）：

```powershell
$wingetBootstrapUrl = "https://aka.ms/getwinget"
$wingetBundlePath = Join-Path $env:TEMP "Microsoft.DesktopAppInstaller.msixbundle"
Invoke-WebRequest -Uri $wingetBootstrapUrl -OutFile $wingetBundlePath
Add-AppxPackage -Path $wingetBundlePath
```

### 1) Git for Windows

```powershell
winget install --id Git.Git -e --source winget
```

### 2) Node.js（含 npm）

```powershell
winget install OpenJS.NodeJS
```

### 3) Kimi（uv + Python 3.13）

```powershell
uv python install 3.13
uv tool install kimi-cli --python 3.13
```

仅保留 Python 环境时，可卸载 Kimi：

```powershell
uv tool uninstall kimi-cli
```

## CLI 安装命令总览

### Claude Code（官方命令）

```powershell
irm https://claude.ai/install.ps1 | iex
```

### Kimi / Kimi Web（uv）

```powershell
uv python install 3.13
uv tool install kimi-cli --python 3.13
```

### Codex

```powershell
npm install -g @openai/codex
```

### Gemini CLI

```powershell
npm install -g @google/gemini-cli
```

### Qwen Code

```powershell
npm install -g @qwen-code/qwen-code@latest
```

### OpenCode

```powershell
npm install -g opencode-ai
```

## Kimi / Git 完整流程文档

完整流程与镜像安装命令见：

- `install_kimi.md`

## 本地开发

前置依赖：

- Node.js 22+
- Rust（含 `cargo`）

安装依赖并启动：

```bash
npm install
npm run tauri dev
```

构建：

```bash
npm run build
npm run tauri build
```

## 恢复与清理

- 应用内 `安装/生效` 页可执行：
  - 尝试反注册 Nilesoft
  - 清理应用数据（`%LOCALAPPDATA%/execlink/`，需二次确认）

## 许可证

MIT License，详见 `LICENSE`。
