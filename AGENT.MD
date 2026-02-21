# AGENTS.MD

本文档定义本项目内 AI 编码代理（Agent）的工作边界、实现约束与交付标准。除非用户明确覆盖，本文件作为默认执行规范。

## 1. 项目定位

- 项目名：`ExecLink`
- 目标：在 Windows 11 资源管理器右键菜单提供 `AI CLIs` 子菜单，一键打开对应 CLI（`claude` / `codex` / `gemini` / `kimi`），并将工作目录定位到当前右键目录。
- 技术路线：`Tauri v2 + Rust + React + TypeScript`，通过 `Nilesoft Shell (portable)` 注入右键菜单。
- 默认终端：优先 `wt.exe`（Windows Terminal），并在不可用时回退到 PowerShell 终端。

## 2. 信息来源

1. 本文件 `AGENTS.MD`（Agent 执行规范）
2. `llm.txt.txt`（`@base-ui/react` 组件资料索引）

## 3. 前端实现规范（Base UI）

基于 `llm.txt.txt`：

- 优先使用 `@base-ui/react` 组件与能力（可组合、样式无关）
- 保持可访问性（键盘导航、语义化与可读提示）
- 若参考示例含 Tailwind v4 写法，而项目为 Tailwind v3，必须转换为 v3 兼容写法


## 12. 文档维护要求

- 新增功能若改变上述边界，必须同步更新 `AGENTS.MD`。
- 规则变更应保持“可执行、可验证、可回滚”三原则。

## 13. 更新每日工作日志（updatenote）

- 位置：项目根目录 `updatenote/`。
- 文件名：以日期命名的 Markdown 文件，例如：`2023-08-01.md`。
- 要求：每次完成开发任务后，更新当日日志；同一天内可持续追加，不重复创建多个同日期文件。
- 建议内容模板：

```md
日期：2023-08-01

内容：
  - 新增功能：
    - 新增了一个新的功能：xxxxxx
  - 改进：
    - 改进了一个旧的功能：xxxxxx
  - 修复：
    - 修复了一个旧的功能：xxxxxx
```
