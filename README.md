# ExecLink

ExecLink 是一个 Windows 11 右键菜单增强工具，用于快速启动常见 AI CLI（Tauri v2 + React + TypeScript + Rust）。

## 核心能力

- 检测 CLI 可用性：`claude` / `codex` / `gemini` / `kimi` / `kimi_web` / `qwencode` / `opencode`
- 右键菜单配置：菜单标题、显示项、拖拽排序、启用/禁用
- 未检测到 CLI 时提供安装辅助：复制命令、打开文档、一键安装
- Nilesoft 安装与注册：支持提权重试、立即生效、故障恢复与数据清理
- 默认终端运行器：`Windows Terminal (wt)`
- 关于页支持一键复制基础信息

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

项目当前未单独声明 License，如需开源发布请补充 `LICENSE` 文件。
