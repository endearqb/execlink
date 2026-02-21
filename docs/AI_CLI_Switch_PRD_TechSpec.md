# ExecLink（Tauri）需求与落地方案（PRD + Tech Spec）
> 目标：在 **Windows 11** 文件资源管理器右键菜单中，一键打开对应 AI CLI（Claude/Codex/Gemini/Kimi/Kimi Web），并自动进入所选目录的 PowerShell 工作目录；打包成类似 *ccswitch* 的轻量 Windows 小工具应用。  
> 约束：**捆绑安装 Nilesoft Shell（portable）**；默认终端：**PowerShell**（优先 `pwsh`，回退 `powershell`）。

---

## 0. 当前实现状态（2026-02-19）

- 已实现：
  - 5 个 CLI 菜单项：`Claude/Codex/Gemini/Kimi/Kimi Web`
  - 菜单名自定义、仅显示 AI 菜单（隐藏 Nilesoft 默认菜单）
  - 安装/修复、提权重试注册、立即生效、托盘快捷操作
  - 安装指引双入口（复制命令 / 打开说明）
  - 诊断页面（含 app version、build channel、resource zip 解析路径）
  - 恢复与清理（尝试反注册 + 清理 `%LOCALAPPDATA%/execlink/`）
- 待持续打磨：
  - 发布流程稳定化（干净环境烟测与回滚演练）
  - 安装指引映射从静态配置升级为远程可配置（后续版本）

---

## 1. 背景与问题陈述

### 1.1 现状痛点
- 用户在 Windows 11 使用 Claude Code CLI、Codex CLI、Gemini CLI、Kimi CLI（含 Kimi Web）时，需要：
  1) 右键“在终端打开”（PowerShell）  
  2) 手动输入 `claude` / `codex` / `gemini` / `kimi` 才能进入对应 CLI。
- 希望右键菜单中**直接提供入口**：点击即打开 PowerShell 并执行对应 CLI 命令。

### 1.2 Windows 11 右键菜单约束
- 传统注册表 `HKCR\*\shell` 的菜单项在 Win11 常被折叠到 **Show more options**。
- 自研原生 Shell Extension（COM / IExplorerCommand）开发维护成本高、签名与兼容复杂。
- **Nilesoft Shell** 提供通过配置文件注入/管理右键菜单的方案，工程成本低、可维护。

> 决策：采用 **Nilesoft Shell** 作为右键菜单“引擎”，Tauri 应用作为安装/配置/开关与生效控制层。

---

## 2. 产品目标与非目标

### 2.1 产品目标（Goals）
1) 在右键菜单中提供 **AI CLIs** 子菜单：Claude、Codex、Gemini、Kimi、Kimi Web 五项。
2) 点击菜单项：打开 PowerShell 窗口并执行对应命令；工作目录等于右键的目录（或目录背景所在路径）。
3) 提供桌面小工具（类似 ccswitch）：
   - UI 中能开关右键菜单注入
   - 能单独开关每个 CLI 项
   - 能检测 CLI 是否可用（PATH 检测）
   - 一键“应用配置”与“一键生效”（重启/刷新）
4) 捆绑 Nilesoft Shell：用户安装本工具即可使用，无需手动安装其他组件。

### 2.2 非目标（Non-goals）
- 不做复杂的 CLI 参数管理、登录管理、自动更新 CLI。
- 不实现原生 COM Shell Extension（阶段 1 不考虑）。
- 不实现多语言（阶段 1 默认中文 UI 可选，或简体中文为主）。

---

## 3. 用户故事（User Stories）

1) **作为用户**，我在某个项目目录上右键，选择 `AI CLIs > Claude Code`，希望自动打开 PowerShell，并且工作目录已经是该项目目录，且自动执行 `claude`。
2) **作为用户**，我希望在应用 UI 中关闭 `Kimi` 菜单项，它就不会出现在右键菜单中。
3) **作为用户**，我希望应用能提示哪些 CLI 不在 PATH（例如 `gemini` 未安装）。
4) **作为用户**，我希望点“应用配置”后立即生效，必要时应用可以自动重启 Explorer。

---

## 4. 功能范围（Functional Scope）

### 4.1 右键菜单能力
- 菜单分组：`AI CLIs`
- 作用域（默认）：
  - 文件夹右键（Directory）
  - 文件夹背景右键（Directory Background）
- 每个菜单项行为：
  - 打开 PowerShell（优先 `pwsh.exe`，否则 `powershell.exe`）
  - `-NoExit` 默认开启（可在 UI 开关）
  - `-Command <cli>`，其中 `<cli>` 为 `claude` / `codex` / `gemini` / `kimi` / `kimi web`
  - 工作目录：使用 Nilesoft Shell 的 `dir=@sel.path`

> 说明：使用 Nilesoft 变量 `@sel.path`（目录）与 `type='dir|back.directory'`（目录/背景）。

### 4.2 应用 UI（桌面小工具）
- 当前窗口参数（实现）：`980 x 645`，支持缩放
- 当前 Tab 结构（实现）：`CLI` / `菜单` / `安装/生效` / `诊断`
- 主开关：启用/禁用右键菜单注入（实际表现：写入“禁用配置”或移除 import）
- 终端选项：默认 PowerShell（不提供 WT 作为默认；可预留高级选项）
- `-NoExit` 开关
- CLI 菜单项开关：Claude / Codex / Gemini / Kimi / Kimi Web
- CLI 可用性检测：
  - 通过 `where.exe <cmd>` 判断是否在 PATH
  - UI 用 ✅/❌ 提示
- 生效按钮：
  - “应用配置”：写入 `.nss`
  - “立即生效”：优先调用 `shell.exe -restart`；失败则重启 Explorer

### 4.3 安装、注册与生效（关键）
- 应用安装后（首次启动或安装流程）：
  1) 解压捆绑的 Nilesoft Shell portable 包到：  
     `%LOCALAPPDATA%\execlink\nilesoft-shell\`
  2) 注册 Nilesoft Shell：`shell.exe -register -restart`
     - 先尝试非管理员执行
     - 若失败，提示并触发 UAC 提权重试（`runas`）
  3) 写入配置：
     - `config/shell.nss`（主配置）
     - `config/imports/ai-clis.nss`（本工具生成）
  4) 生效：`shell.exe -restart` 或 `restart explorer`

---

## 5. 配置生成规范（Nilesoft Shell）

### 5.1 生成文件
- `config/imports/ai-clis.nss`：由应用生成、覆盖写入
- `config/shell.nss`：由应用维护（至少保证包含 import）

### 5.2 `ai-clis.nss` 模板（默认 PowerShell）
> 注意：此为目标模板，应用按 UI 勾选项生成 items；当前实现已额外支持 `Kimi Web`。

```nss
shell
{
  dynamic
  {
    menu(title='AI CLIs' type='dir|back.directory')
    {
      item(title='Claude Code' cmd='pwsh.exe' dir=@sel.path args='-NoExit -Command claude')
      item(title='Codex'      cmd='pwsh.exe' dir=@sel.path args='-NoExit -Command codex')
      item(title='Gemini'     cmd='pwsh.exe' dir=@sel.path args='-NoExit -Command gemini')
      item(title='Kimi'       cmd='pwsh.exe' dir=@sel.path args='-NoExit -Command kimi')
      item(title='Kimi Web'   cmd='pwsh.exe' dir=@sel.path args='-NoExit -Command kimi web')
    }
  }
}
```

### 5.3 PowerShell 选择逻辑
- 若 `where pwsh` 成功 → 使用 `pwsh.exe`
- 否则 → 使用 `powershell.exe`

### 5.4 主配置 import 规则
- `config/shell.nss` 需包含：
  - `import 'imports/ai-clis.nss'`
- 如果不存在：创建最小骨架并写入 import
- 如果存在但缺失 import：追加写入（幂等）

---

## 6. 技术架构（Tauri v2 + Rust + React）

### 6.1 技术栈
- 桌面框架：Tauri v2（Rust 后端 + Web UI）
- 前端：React + Vite + TypeScript
- 后端：Rust
- 打包：Tauri bundle（MSI/EXE），可补充 portable zip

### 6.2 模块划分（Rust）
- `detect.rs`：CLI PATH 检测（where.exe）
- `nilesoft_install.rs`：解压 portable、定位 `shell.exe`、注册/重启
- `nilesoft.rs`：生成 `.nss`，写入 imports，维护 `shell.nss` import
- `explorer.rs`：`shell.exe -restart` 与 `restart explorer` 兜底
- `state.rs`：AppConfig（开关状态、NoExit、项开关等）
- `commands.rs`：Tauri commands 暴露给前端（invoke）

### 6.3 模块职责边界
- 前端：展示状态、收集配置、触发命令
- 后端：实际 IO 操作、进程执行、提权、写配置、刷新 Explorer

---

## 7. 安装与卸载设计

### 7.1 安装时
- 将本应用安装到标准位置（Tauri bundle）
- 首次运行：执行 `ensure_installed()`
  - 解压 Nilesoft Shell portable 到本应用管理目录
  - 注册并重启（必要时提权）
  - 写入配置并生效

### 7.2 卸载时
- 卸载本应用时可选：清理 `%LOCALAPPDATA%\execlink\` 下的 nilesoft 目录与配置
- 可选：反注册 Nilesoft Shell（若其提供 unregister 参数，则使用；否则提示用户手动恢复）
- 当前实现：Runtime 页提供“尝试反注册 Nilesoft”与“清理应用数据”（二次确认）

> 注：Nilesoft 的反注册机制需在实施时确认其 CLI 参数支持（若不支持，卸载仅移除配置并不破坏系统）。

---

## 8. 权限与安全

### 8.1 权限策略
- 默认不提权：先尝试普通用户级注册/重启
- 失败时才触发 UAC 提权（runas）

### 8.2 Shell 执行风险控制
- 本产品只执行固定受控命令：
  - `shell.exe -register/-restart`
  - `taskkill explorer.exe`（兜底）
  - `where.exe` 检测
- 不允许用户在 UI 中编辑任意命令（阶段 1 仅开关与选择）

### 8.3 配置写入幂等
- 每次应用配置都会覆盖写入 `ai-clis.nss`
- `shell.nss` import 采用“存在性检测 + 追加”策略，避免重复写入

---

## 9. 目录与文件约定

### 9.1 应用自管目录（建议）
- `%LOCALAPPDATA%\execlink\`
  - `nilesoft-shell\`（解压后的 portable）
    - `shell.exe`（或某子目录内）
    - `config\`
      - `shell.nss`
      - `imports\ai-clis.nss`
    - `.installed`（marker）

### 9.2 marker 与版本
- `.installed`：标记已解压
- 可升级为：`.installed.json` 保存 nilesoft 版本号、安装时间、最后一次写入时间

---

## 10. 关键流程（Sequence）

### 10.1 首次启动
1) `ensure_installed()`  
2) 若未安装：解压 Nilesoft portable → 定位 `shell.exe`
3) 执行 `shell.exe -register -restart`（失败→UAC 提权）
4) 写 `ai-clis.nss` + `shell.nss` import
5) `shell.exe -restart`（失败→重启 Explorer）

### 10.2 用户修改配置并应用
1) UI 提交 `AppConfig`
2) 后端生成并覆盖 `ai-clis.nss`
3) 更新 `shell.nss` import（幂等）
4) 生效：`shell.exe -restart`（兜底重启 Explorer）

---

## 11. 里程碑与交付物

### Milestone 1（MVP 可用）
- Tauri app 能跑
- 能检测 5 个 CLI 是否在 PATH
- 能生成 `ai-clis.nss`
- 能把配置写入固定目录（先不做复杂探测）
- 能重启 Explorer 生效

### Milestone 2（产品级安装体验）
- 捆绑 Nilesoft portable zip + 解压
- 自动注册 Nilesoft（失败提权）
- 自动维护 `shell.nss` import
- 优先生效 `shell.exe -restart`

### Milestone 3（打磨）
- 托盘快捷开关
- 设置持久化（本地 config.json）
- 卸载清理与恢复提示
- 异常日志与诊断页面

---

## 12. 验收标准（Acceptance Criteria）

1) 在任意目录上右键（目录或背景）能看到自定义菜单名（默认 `AI CLIs`）分组。
2) 点击 `Claude Code`：弹出 PowerShell，当前目录为目标目录，且已执行 `claude`。
3) 在 UI 关闭 `Gemini` 后，右键菜单中不再出现 `Gemini`。
4) UI 能正确显示 `where` 检测结果（✅/❌）。
5) 点击“应用配置”后菜单生效；如未生效，点击“一键生效”可生效。
6) 完整安装流程中无需用户手动安装 Nilesoft Shell（除非 UAC 提示授权）。
7) 缺失 CLI 行可直接点击“复制命令/打开说明”查看安装指引。
8) Runtime 页可执行“尝试反注册 Nilesoft”与“清理应用数据”（带二次确认）。

---

## 13. 风险与对策

| 风险 | 描述 | 对策 |
|---|---|---|
| Nilesoft portable 包结构变化 | `shell.exe` 位置不固定 | 实现递归查找 `shell.exe`（一次性扫描） |
| 注册需要管理员 | 企业环境策略 | 失败后提示并 UAC 提权重试；仍失败则给出手动说明 |
| Explorer 重启影响用户工作 | 重启会闪屏 | 优先 `shell.exe -restart`；仅在失败时重启 Explorer，并做二次确认提示（可选） |
| CLI 不在 PATH | 用户未安装或命令名不同 | UI 提示 + 提供“打开安装指引/复制命令”入口（已实现静态映射） |

---

## 14. 实施备注（Implementation Notes）
- 建议 **尽量避免**全局系统目录写入与管理员依赖：以每用户 LocalAppData 管理 Nilesoft portable。
- Tauri v2 capabilities 若采用 plugin-shell 执行命令，需要配置白名单 scope；阶段 1 可用 `std::process::Command`。
- 日志建议输出到：`%LOCALAPPDATA%\execlink\logs\`，便于用户报错。

---

## 15. 附录：AppConfig 结构（示例）

```json
{
  "enable_context_menu": true,
  "use_windows_terminal": false,
  "no_exit": true,
  "toggles": {
    "claude": true,
    "codex": true,
    "gemini": true,
    "kimi": true,
    "kimi_web": true
  }
}
```

---

## 16. 附录：命令约定

- PowerShell 启动参数：
  - `-NoExit`（默认启用）
  - `-Command <cli>`（如 `claude`）
- CLI 检测：`where <cli>`
- 生效：
  - `shell.exe -restart`（优先）
  - `taskkill /f /im explorer.exe` + `explorer.exe`（兜底）

---

（完）
