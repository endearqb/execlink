# AI CLI Dock（ConPTY + xterm.js + Tauri）完整需求文档与开发计划
> 版本：v1.0（用于工程实施）  
> 平台：Windows 11（优先），Windows 10（尽量兼容）  
> 目标形态：在资源管理器（Explorer）右侧“停靠”一个内嵌终端面板（xterm.js 渲染），右键在文件夹/背景点击后，终端面板自动切换到该目录并执行对应 AI CLI（Claude/Codex/Gemini/Kimi）。  
> 关键前提：不再启动外部 conhost/Windows Terminal 窗口；终端由应用自行渲染与管理。

---

## 目录
1. 背景与目标  
2. 产品范围（Goals / Non-goals）  
3. 用户故事与使用流程  
4. 交互与信息架构（UI/UX）  
5. 技术方案概览（ConPTY + xterm.js + Tauri）  
6. 系统架构与模块划分  
7. 终端会话模型（Session Model）  
8. ConPTY 细节设计（Windows Pseudo Console）  
9. 前后端通信协议（IPC / WebView 通道）  
10. 右键菜单触发与路径传递机制  
11. Explorer 停靠（Sidecar Dock）行为规范  
12. 主题/字体/快捷键与可用性（xterm.js）  
13. 安全、权限与隔离策略  
14. 配置与持久化  
15. 错误处理、诊断与日志  
16. 测试计划（功能 / 兼容 / 回归 / 性能）  
17. 发布与升级策略（MSI / 自更新可选）  
18. 里程碑与开发计划（WBS）  
19. 风险清单与对策  
20. 附录：数据结构、伪代码与配置示例  

---

## 1. 背景与目标

### 1.1 背景
当前通过右键菜单启动 AI CLI 的方案通常会打开一个外部终端窗口（PowerShell/Windows Terminal）。痛点：
- 外部窗口会一直存在、遮挡、影响工作流；
- 外观（黑底白字、字体）难以统一管理；
- 希望“终端就嵌在文件夹界面旁边”，实现“左侧看文件，右侧跑 CLI，文件变化即时可见”。

### 1.2 核心目标（North Star）
把 AI CLI 的交互固定到一个**嵌入式终端面板**中，并与 Explorer 当前目录形成紧耦合工作流：
- 右键某目录 → 终端面板切换到该目录并执行 `claude`/`codex`/`gemini`/`kimi`；
- AI CLI 创建/修改文件 → 用户在 Explorer 里立即可见并检查。

---

## 2. 产品范围

### 2.1 Goals（必须实现）
1. **内嵌终端**：使用 xterm.js 渲染，ConPTY 驱动真实 `pwsh`/`powershell` 进程。
2. **右键触发**：目录/目录背景菜单项，点击后把目标路径传给应用。
3. **自动切目录并运行命令**：在终端中执行 `cd <path>`，然后执行 CLI 命令。
4. **停靠体验**：应用面板窗口贴靠到 Explorer 右侧（sidecar），Explorer 移动/缩放时自动跟随。
5. **会话管理**：至少支持“单会话（global）”模式；可扩展多会话。
6. **主题与字体**：在应用内配置终端主题、字体、字号、光标样式。
7. **可用性**：复制/粘贴、滚动、搜索（至少复制粘贴和滚动必须）。
8. **诊断与日志**：ConPTY 启动失败、权限问题、路径传递失败时给出可读错误提示并记录日志。
9. **打包发布**：MSI 打包，支持开机自启（可选开关）。

### 2.2 Non-goals（v1 不做）
- 不做 Explorer 预览窗格（Preview Handler）内嵌；只做 sidecar 停靠窗。
- 不做复杂的多 tab、多 pane（分屏）。
- 不做远程会话/SSH（除非 CLI 自己提供）。
- 不做对外部终端主题（conhost/Windows Terminal settings.json）修改。

---

## 3. 用户故事与使用流程

### 3.1 用户故事（User Stories）
- US1：作为用户，我在某文件夹上右键选择 `AI CLIs > Claude Code`，希望右侧面板立刻显示终端，并在该目录执行 `claude`。
- US2：作为用户，我在文件夹背景右键执行 `AI CLIs > Codex`，终端面板切到此目录并运行 `codex`。
- US3：作为用户，我希望终端面板跟随 Explorer 窗口移动与大小变化，始终停靠在右侧。
- US4：作为用户，我希望在应用设置中选择浅色主题、Cascadia Mono 字体，并保持生效。
- US5：作为用户，我希望当某 CLI 未安装时，点击菜单能提示“命令不可用”而不是静默失败。

### 3.2 典型流程（Happy Path）
1) 用户打开 Explorer 到某目录；  
2) 右键目录背景 → `AI CLIs > Claude Code`；  
3) 系统通过协议启动（或唤醒）应用，并传入 `{path, action="claude"}`；  
4) 应用检测/创建 ConPTY 会话；  
5) 终端执行：`cd "<path>"` → `claude`；  
6) 用户在终端交互；AI CLI 创建文件；Explorer 左侧立刻看到新文件。

---

## 4. 交互与信息架构（UI/UX）

### 4.1 窗口形态
- 主窗口：设置与状态（可隐藏）
- 停靠面板窗口（Dock Window）：右侧终端面板（主要交互点）
- 托盘图标（可选）：快速显示/隐藏停靠面板、切换开关

### 4.2 Dock Window（必选）
布局建议：
- 顶部：小型标题栏（AI CLI Dock）、当前路径、会话状态（RUNNING/IDLE/ERROR）
- 中部：xterm.js 终端区域
- 底部（可选）：快捷按钮（Claude/Codex/Gemini/Kimi）、清屏、复制路径

### 4.3 设置页（Main Window）
- CLI 入口开关：Claude/Codex/Gemini/Kimi（是否在右键菜单出现）
- Shell 选择：优先 `pwsh`，回退 `powershell`（默认开启）
- 终端外观：主题（暗/亮/自定义）、字体、字号、行高、光标
- 行为：
  - 右键点击时：是否自动显示 Dock Window
  - 是否跟随 Explorer
  - 是否开机自启
- 诊断：
  - CLI 检测（where.exe）
  - ConPTY 自检（能否创建会话）
  - 日志导出

---

## 5. 技术方案概览（ConPTY + xterm.js + Tauri）

### 5.1 核心思路
- **ConPTY**：在 Rust 后端创建 Windows Pseudo Console，启动 `pwsh.exe` 或 `powershell.exe`，通过管道收发字节流（含 ANSI/VT 序列）。
- **xterm.js**：在前端 WebView 中渲染终端，处理 VT 序列，提供主题/字体/交互能力。
- **Tauri**：提供桌面壳、窗口管理、IPC（invoke/emit）、打包。

### 5.2 为什么不是嵌入外部终端窗口
- 外部终端窗口（conhost/Windows Terminal）难以“嵌在 UI 区域”；强行 SetParent hack 维护成本极高。
- ConPTY + xterm.js 是 Windows Terminal 自身采用的路线之一（原理层面一致），可控性高。

---

## 6. 系统架构与模块划分

### 6.1 高层架构
```
右键菜单 -> 协议/命令行唤醒 -> Tauri 应用
    -> (Rust) Router：解析 action/path
    -> Session Manager：获取/创建 ConPTY session
    -> ConPTY Host：读写管道，产出 VT 字节流
    -> IPC：把输出推送给前端
    -> (WebView) xterm.js 渲染并把用户输入回传
```

### 6.2 Rust 模块建议
- `session/manager.rs`
  - create_session(), get_session(), close_session()
  - session state：IDLE/RUNNING/ERROR
- `conpty/host.rs`
  - create_pseudo_console()
  - spawn_shell_process()
  - read_loop() / write_input()
  - resize(cols, rows)
- `router/command.rs`
  - parse deep link / argv
  - normalize path
  - build action script
- `dock/window.rs`
  - create/show/hide dock window
  - follow explorer window (winapi)
- `cli/detect.rs`
  - where.exe 检测命令可用性
- `config/store.rs`
  - 读写 JSON config（LocalAppData）
- `logging/mod.rs`
  - tracing/log 输出到文件

### 6.3 前端模块建议
- `terminal/TerminalView.tsx`
  - xterm 初始化、主题应用、输入输出桥接
- `terminal/transport.ts`
  - 与 Rust IPC 的协议（chunked output、input、resize）
- `settings/Settings.tsx`
  - 主题/字体/开关
- `dock/DockHeader.tsx`
  - 当前路径、按钮、状态

---

## 7. 终端会话模型（Session Model）

### 7.1 v1 会话策略（建议）
- **单全局会话**（Global Session）：
  - 优点：简单、资源低、状态连贯
  - 缺点：不同目录切换需要 `cd`，但可接受
- 触发规则：右键启动 action 时，总是复用该会话；若会话不存在/崩溃则重建。

### 7.2 v2 扩展（可选）
- 按目录 hash 建会话（Per-Workspace Session）
- 多 Tab（需要前端 tab bar + 后端多 session）

---

## 8. ConPTY 细节设计（Windows Pseudo Console）

### 8.1 关键职责
1) 创建 ConPTY（pseudo console）并绑定输入/输出管道；
2) 创建并启动 shell 子进程（pwsh/powershell），把其 stdin/stdout 连接到 ConPTY；
3) 读输出字节流（包含 VT 序列），推送给 xterm；
4) 写用户输入字节流到 ConPTY；
5) 当窗口尺寸改变时，调用 resize 更新 ConPTY 的 cols/rows；
6) 处理进程退出、异常与重建。

### 8.2 字节流与编码
- 输出通常是 UTF-8（PowerShell 7 更友好）；Windows PowerShell 可能需要设置 codepage 或使用 `chcp 65001`。
- v1 建议：启动后自动执行一次：
  - `chcp 65001`（仅对 legacy powershell）
  - `$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()`（可选）
- 需要避免破坏 CLI 的自身编码逻辑：此处做成可配置。

### 8.3 resize 机制
- xterm 在容器尺寸变化时计算 cols/rows
- 通过 IPC 通知 Rust：`resize(session_id, cols, rows)`
- Rust 调用 ConPTY resize

### 8.4 进程生命周期
- session 创建：spawn shell
- session 销毁：terminate process + close pipes + close pseudo console
- 异常：read loop 退出 → session 标记 ERROR → 前端提示“点击重连”

---

## 9. 前后端通信协议（IPC / Transport）

### 9.1 输出通道（Rust -> xterm）
- Rust emit event：`terminal_output`
- payload：
```json
{
  "sessionId": "global",
  "seq": 12345,
  "data": "<base64 or utf8 string>",
  "encoding": "utf8"
}
```
建议：为稳妥可使用 base64，避免二进制和 WebView 编码问题。

### 9.2 输入通道（xterm -> Rust）
- invoke：`terminal_input`
```json
{ "sessionId": "global", "data": "<utf8 string>" }
```
键盘输入可直接传文本；若需要更精确（如 Ctrl+C），可传控制字符（`\x03`）。

### 9.3 resize 通道
- invoke：`terminal_resize`
```json
{ "sessionId": "global", "cols": 120, "rows": 32 }
```

### 9.4 action 执行通道（右键触发）
- invoke：`run_action`
```json
{ "path": "C:\\work\\proj", "action": "claude" }
```
后端负责：show dock → ensure session → send script（cd + command）。

---

## 10. 右键菜单触发与路径传递机制

### 10.1 推荐机制：自定义 URL 协议（Deep Link）
- 注册协议：`aiclidock://run?action=claude&path=<urlencoded>`
- 右键菜单执行：调用该 URL（或调用 app.exe 带参数）

优点：
- 不依赖 Nilesoft Shell 的复杂变量转义太多
- 能唤醒已运行实例并传参（单例）

实现要点：
- 安装时注册协议（MSI Custom Action 或应用首次启动注册）
- Tauri 在启动参数中解析 deep link（Windows 下通过 argv 或相关 API）

### 10.2 备用机制：命令行参数
- 菜单项执行：`AI_CLI_Dock.exe --action claude --path "%V"`
- 应用需做单例（避免多实例）并将参数转发给主实例

### 10.3 目录与目录背景变量
- 目录右键：路径为目录本身
- 背景右键：路径为当前目录（Explorer 当前所在）
- Nilesoft Shell 中可区分 type：`dir|back.directory`
- 无论用协议还是参数，都需确保路径带引号并正确编码。

---

## 11. Explorer 停靠（Sidecar Dock）行为规范

### 11.1 目标体验
- 用户激活某个 Explorer 窗口时，Dock 自动贴到其右侧；
- Explorer 移动/缩放时，Dock 实时跟随；
- Dock 可以“锁定跟随”或“自由浮动”。

### 11.2 技术策略（WinAPI）
- 监听前台窗口变化：GetForegroundWindow
- 判断是否为 Explorer：窗口类名/进程名 `explorer.exe`
- 获取 Explorer 窗口矩形：GetWindowRect
- 计算 Dock 位置：
  - DockWidth 固定（如 480）
  - DockX = ExplorerRight - DockWidth（贴右侧）或 ExplorerRight（贴外侧）
  - DockY = ExplorerTop
  - DockHeight = ExplorerHeight
- 设置 Dock 窗口：SetWindowPos（no-activate 可选）

### 11.3 边界条件
- 多显示器：需取 Explorer 当前所在 monitor，并限制 Dock 不越界
- Explorer 最大化：Dock 也最大化高度
- Explorer 关闭：Dock 可隐藏或保持最后位置
- 任务栏遮挡：Dock height 需考虑工作区（SystemParametersInfo 或 monitor work area）

---

## 12. 主题/字体/快捷键与可用性（xterm.js）

### 12.1 主题能力
- 内置主题：Dark / Light / Solarized Dark / Solarized Light / Dracula（可选）
- 用户自定义：前景色、背景色、光标色、选择区色、ANSI 16 色

### 12.2 字体与渲染
- 推荐字体：Cascadia Mono / Consolas
- 字号：12~18
- 行高：1.0~1.4

### 12.3 必备交互
- 复制：Ctrl+Shift+C（或右键复制）
- 粘贴：Ctrl+Shift+V
- 鼠标滚动回看（scrollback 10000 行）
- Ctrl+C 中断：发送 `\x03`

### 12.4 可选增强
- 搜索（xterm-addon-search）
- Fit（xterm-addon-fit）自动适配容器计算 cols/rows

---

## 13. 安全、权限与隔离策略

### 13.1 执行范围控制
- v1 不允许用户自定义任意系统命令；仅允许 action ∈ {claude,codex,gemini,kimi}。
- 每个 action 映射到固定命令名（可在配置里允许改别名，但需白名单）。

### 13.2 路径安全
- 永远对路径做引号包裹：`cd "<path>"`
- 需要处理路径中引号：将 `"` 转义为 `\"` 或使用 PowerShell 的单引号策略（更推荐后端生成安全脚本）。

### 13.3 管理员权限
- 默认不提权
- 如需注册协议/写入系统位置：安装器阶段执行（MSI）或提示 UAC

### 13.4 隐私
- 不收集终端内容（除非用户主动导出日志）
- 日志默认只记录错误与事件，不记录完整命令输出（可配置）

---

## 14. 配置与持久化

### 14.1 配置文件位置
- `%LOCALAPPDATA%\AI-CLI-Dock\config.json`

### 14.2 配置结构（示例）
```json
{
  "dock": {
    "enabled": true,
    "followExplorer": true,
    "width": 520,
    "autoShowOnAction": true
  },
  "terminal": {
    "preferPwsh": true,
    "noExit": true,
    "theme": "dark",
    "fontFamily": "Cascadia Mono",
    "fontSize": 13,
    "lineHeight": 1.2,
    "scrollback": 10000
  },
  "actions": {
    "claude": { "enabled": true, "command": "claude" },
    "codex":  { "enabled": true, "command": "codex"  },
    "gemini": { "enabled": true, "command": "gemini" },
    "kimi":   { "enabled": true, "command": "kimi"   }
  }
}
```

---

## 15. 错误处理、诊断与日志

### 15.1 常见错误
- ConPTY 创建失败（系统版本不支持/权限/依赖缺失）
- shell 进程启动失败（pwsh 不存在）
- CLI 命令不在 PATH
- 路径解析失败（编码/转义错误）
- 输出乱码（编码问题）

### 15.2 诊断页
- 系统版本检测（Win10/11 build）
- `where pwsh`、`where claude` 等结果展示
- ConPTY 自检按钮：创建会话并回显 “OK”
- 导出日志按钮

### 15.3 日志策略
- 文件：`%LOCALAPPDATA%\AI-CLI-Dock\logs\app.log`
- 仅记录：启动/会话创建/右键 action/错误堆栈
- 可选：debug 模式记录更多

---

## 16. 测试计划

### 16.1 功能测试
- 右键目录与背景：四个 action 均可触发
- 路径包含空格/中文/特殊字符
- CLI 不存在：提示错误
- 会话崩溃：自动重建
- 复制粘贴、滚动、Ctrl+C

### 16.2 兼容性
- Windows 11 不同版本（23H2/24H2 等）
- Windows 10（若支持）
- 多显示器（左右/上下排列）
- Explorer 最大化、分屏（Snap）

### 16.3 性能
- 输出大文本（10000 行）不卡顿
- 连续输入响应
- CPU 占用与内存增长（scrollback）

### 16.4 回归
- 每次改 ConPTY/协议/窗口跟随后全量回归

---

## 17. 发布与升级策略

### 17.1 安装包
- MSI（WiX/Tauri bundler）
- 注册 URL 协议（推荐在 MSI Custom Action）
- 可选开机自启（写入 HKCU\Software\Microsoft\Windows\CurrentVersion\Run）

### 17.2 升级
- MSI 升级覆盖 config 保留
- 可选：自更新（v2 以后）

---

## 18. 里程碑与开发计划（WBS）

> 以 4 周为例（可压缩/拉长）。每个任务都有明确产出。

### Milestone 0：技术预研（1–2 天）
- [ ] 确认 ConPTY Rust 实现方式（库/自写 FFI）
- [ ] 选定 xterm.js 版本与 addons（fit/search）
- 产出：PoC（可创建 ConPTY、显示输出、可输入）

### Milestone 1：终端核心（第 1 周）
- [ ] Rust：ConPTY Host（create/spawn/read/write/resize）
- [ ] 前端：xterm 基础渲染 + fit addon
- [ ] IPC：output emit / input invoke / resize invoke
- 产出：应用内可用终端（能跑 pwsh，能输入、能显示、能 resize）

### Milestone 2：Action 路由与自动执行（第 2 周）
- [ ] Router：`run_action(path, action)`
- [ ] 脚本生成：安全 `cd` + command 执行（含转义）
- [ ] CLI 检测：where.exe + UI 提示
- 产出：从 UI 点击按钮可一键在指定目录执行 claude/codex/gemini/kimi

### Milestone 3：右键菜单与深链唤醒（第 3 周）
- [ ] 注册 URL 协议 + 单例转发
- [ ] Nilesoft/注册表菜单项：调用协议（目录/背景）
- [ ] 应用接收参数并触发 `run_action`
- 产出：右键触发全链路跑通

### Milestone 4：Explorer 停靠（第 4 周）
- [ ] Dock Window（无边框/可吸附）
- [ ] Explorer 跟随：前台检测 + rect 获取 + SetWindowPos
- [ ] 多显示器与工作区边界处理
- 产出：Dock 贴靠体验可用，随 Explorer 移动缩放

### Milestone 5：打磨与发布（+ 1 周，可选）
- [ ] 设置持久化、主题与字体面板
- [ ] 托盘与快捷开关
- [ ] 日志与诊断页
- [ ] MSI 打包、签名（若需要）
- 产出：可分发版本

---

## 19. 风险清单与对策

| 风险 | 描述 | 对策 |
|---|---|---|
| ConPTY 兼容性 | 老系统或策略导致创建失败 | 提供 fallback（外部终端模式）或给出清晰错误 |
| 编码乱码 | Windows PowerShell 输出编码复杂 | 默认优先 pwsh；提供编码初始化脚本可配置 |
| 停靠不稳 | Explorer 窗口识别与定位边界多 | 先实现“跟随前台 Explorer”；提供“锁定当前 Explorer”模式 |
| 高输出卡顿 | 大量输出导致 WebView 卡 | 使用节流/批量推送输出、xterm scrollback 限制 |
| 协议唤醒多实例 | 多实例抢占会话 | 实现单例 + IPC 转发，非主实例立即退出 |
| 安全性 | 路径/命令注入 | action 白名单；严格路径转义；不允许任意命令编辑（v1） |

---

## 20. 附录

### 20.1 action 脚本生成（建议）
- PowerShell：
  - `Set-Location -LiteralPath "<path>"`（更安全）
  - 然后执行 `claude` 等
- 可生成一行脚本：
  - `Set-Location -LiteralPath 'C:\path with space'; claude`

> 注：`-LiteralPath` 可以减少通配符/转义问题。

### 20.2 输入控制字符
- Ctrl+C：`\x03`
- Backspace：`\x7f`（或 `\b` 视情况）
- Enter：`\r`

### 20.3 输出推送节流（建议）
- Rust 读循环把输出缓存到 ring buffer
- 每 16ms 或每 4KB flush 一次 emit，减少前端压力

---

（完）
