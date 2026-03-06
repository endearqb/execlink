# ExecLink「去 Nilesoft」Rust 改造方案

## 1. 文档目标

本文档给出一套面向 **ExecLink** 的“去 Nilesoft 化”改造方案：

- 保留你现有产品的核心体验：在文件夹 / 空白背景 / 桌面背景 / 盘符上右键，快速启动 AI CLI。
- 去掉 Nilesoft 的安装、注册、修复、反注册、导入脚本维护等整条链路。
- 将当前“Rust 生成 PowerShell，再由 PowerShell 写注册表”的实现，替换为“Rust 直接操作注册表 + Rust 直接通知 Explorer 刷新”。
- 明确与 **Windows 11 新版顶层右键菜单** 的边界：本方案优先实现 **经典右键菜单 / Show more options 兼容菜单**，不在第一阶段进入 Win11 顶层现代菜单。

---

## 2. 当前项目现状（基于仓库结构的判断）

从当前仓库看，ExecLink 仍然是 **Nilesoft + HKCU 注册表修复** 的双轨形态：

1. README 仍把 **Nilesoft 安装与注册** 作为核心能力与使用步骤的一部分。
2. `main.rs` 中仍暴露了完整的 Nilesoft 相关 Tauri commands，例如：
   - `ensure_nilesoft_installed`
   - `one_click_install_repair`
   - `request_elevation_and_register`
   - `attempt_unregister_nilesoft`
3. 同时，`main.rs` 也已经暴露了 HKCU 路线相关命令：
   - `repair_context_menu_hkcu`
   - `remove_context_menu_hkcu`
   - `list_context_menu_groups_hkcu`
   - `refresh_explorer`
4. `commands.rs` 已经具备“经典菜单”的核心逻辑：向以下几个位置写入菜单组：
   - `HKCU\Software\Classes\Directory\Background\shell`
   - `HKCU\Software\Classes\Directory\shell`
   - `HKCU\Software\Classes\DesktopBackground\shell`
   - `HKCU\Software\Classes\Drive\shell`
5. 当前 HKCU 菜单实现方式不是直接调 Win32 注册表 API，而是 **Rust 拼接 PowerShell 脚本**，再执行 PowerShell。
6. `explorer.rs` 当前的“生效”逻辑仍明显以 Nilesoft 为中心：优先 `shell.exe -restart`，失败时再 `taskkill explorer.exe` + `explorer.exe` 重启兜底。

**结论**：
你已经拥有“去 Nilesoft”的最关键基础——**菜单模型、UI 配置、命令构造、HKCU 目标根路径** 都已经存在。真正要替换的，不是前端，也不是 CLI 检测层，而是下面这三层：

- Nilesoft 安装/修复层
- PowerShell 注册表脚本层
- 以 `shell.exe -restart` 为核心的刷新层

---

## 3. 第一原则：先做经典菜单，不直接冲 Win11 顶层现代菜单

### 3.1 为什么第一阶段不直接做 Win11 顶层菜单

微软对 Windows 11 顶层新右键菜单的要求非常明确：

- 顶层现代菜单扩展应基于 `IExplorerCommand`
- 应用在运行时需要 **package identity**
- 未满足这些要求的传统扩展，会出现在旧菜单 / “Show more options” 中

这意味着：

- **“把 PowerShell 改成 Rust” ≠ 自动进入 Win11 顶层菜单**
- 如果目标是 Win11 顶层菜单，需要额外走：
  - COM Shell Extension
  - `IExplorerCommand`
  - MSIX / Sparse Package / external location package identity

对于 ExecLink 当前的产品阶段，这条路线明显更重，且会显著抬高：

- 开发复杂度
- 安装复杂度
- 调试复杂度
- 签名 / 打包 / 升级复杂度

### 3.2 第一阶段建议的产品边界

**建议边界如下：**

- 支持 **经典右键菜单**（包括 Win11 中“显示更多选项”那层）
- 支持文件夹、文件夹背景、桌面背景、盘符四种对象
- 支持级联菜单
- 支持排序、启用/禁用、重命名、图标、目标终端、命令模板
- 不承诺进入 Win11 顶层现代菜单

### 3.3 对用户文案的建议

你可以在产品内明确写成：

> 当前版本采用兼容性最高的 Windows 经典右键菜单方案。Windows 11 上请在“显示更多选项”中查看 ExecLink 菜单。

这样能显著减少后续“为什么没有进第一层菜单”的支持成本。

---

## 4. 目标架构

建议把目前与右键菜单相关的能力重构为以下 6 个模块。

### 4.1 `context_menu_model.rs`

职责：

- 定义菜单配置数据结构
- 将前端配置映射为后端稳定模型
- 做字段校验、默认值补齐、排序归一化

建议结构：

- `ContextMenuConfig`
- `MenuScope`
- `MenuGroup`
- `MenuItem`
- `LaunchTarget`
- `TerminalProfile`

这是整个重构的“单一事实源（single source of truth）”。

---

### 4.2 `context_menu_registry.rs`

职责：

- 用 Rust 直接创建 / 更新 / 删除注册表项
- 负责把 `ContextMenuConfig` 写入 HKCU 菜单树
- 负责枚举已有 ExecLink 菜单
- 负责清理旧版残留菜单

实现建议：

**优先建议：**
- 使用 `windows` / `windows-sys` 直接调用 Win32 注册表 API：
  - `RegCreateKeyExW`
  - `RegOpenKeyExW`
  - `RegSetValueExW`
  - `RegDeleteTreeW` / `RegDeleteKeyExW`

**更务实的替代：**
- 用 `winreg` crate 做安全封装
- 仍然属于 Rust 直接写注册表，不再依赖 PowerShell

如果你强调“真正原生”，建议直接上 `windows` crate；如果你希望更快落地，`winreg` 也完全够用。

---

### 4.3 `context_menu_builder.rs`

职责：

- 将逻辑菜单模型转换成具体注册表布局
- 负责：
  - 菜单组 key 名生成
  - 子项顺序 key 生成
  - 命令字符串生成
  - 图标值生成
  - `MUIVerb` / `SubCommands` / `command` 路径组织

这层不要直接访问注册表，只负责“生成待写入结构”。

建议输出一个中间结构，例如：

```rust
pub struct RegistryWritePlan {
    pub creates: Vec<RegistryKeySpec>,
    pub deletes: Vec<String>,
}

pub struct RegistryKeySpec {
    pub path: String,
    pub values: Vec<RegistryValueSpec>,
}

pub struct RegistryValueSpec {
    pub name: Option<String>,
    pub kind: RegistryValueKind,
    pub data: String,
}
```

这样你后面可以：

- 单元测试 builder
- 比较新旧 plan
- 做 dry-run / diagnostics

---

### 4.4 `command_launcher.rs`

职责：

- 统一生成每个菜单项最终执行的命令字符串
- 负责不同终端模式的模板拼接
- 处理 `%V`、`%1`、工作目录转义、PowerShell 转义

建议支持两类启动模式：

#### 模式 A：直接命令模式
适合简单 CLI：

- `claude`
- `codex`
- `gemini`
- `kimi`

#### 模式 B：终端模板模式
例如：

- `wt -d "%V" pwsh -NoExit -Command claude`
- `pwsh -NoExit -Command "Set-Location -LiteralPath '%V'; codex"`
- `cmd /k cd /d "%V" && gemini`

建议把“命令模板”与“CLI 标识”解耦，而不是把 `claude/codex/...` 写死在注册表生成逻辑里。

---

### 4.5 `shell_notify.rs`

职责：

- 在写入或删除注册表后通知 Shell 关联发生变化
- 必要时提供 Explorer 重启兜底

建议刷新顺序：

1. 先调用 `SHChangeNotify(SHCNE_ASSOCCHANGED, ...)`
2. 如果当前会话里菜单仍未更新，再提供手动按钮：`restart_explorer_fallback()`
3. 不再依赖 `shell.exe -restart`

这个模块是“去 Nilesoft”后最重要的配套模块之一。

---

### 4.6 `context_menu_service.rs`

职责：

- 对 Tauri commands 提供统一服务接口
- 串起：校验 → build plan → 写注册表 → 通知刷新 → 返回诊断信息

这是上层唯一入口，避免 UI 直接碰注册表实现细节。

---

## 5. 注册表路径设计

## 5.1 目标根路径

建议继续沿用你当前 HKCU 的目标范围，因为这条路径：

- 不要求管理员权限（大多数场景）
- 适合当前用户级应用
- 卸载与恢复更简单
- 对 MSI / 非 MSIX 分发更友好

建议支持以下 4 个根：

```text
HKCU\Software\Classes\Directory\Background\shell
HKCU\Software\Classes\Directory\shell
HKCU\Software\Classes\DesktopBackground\shell
HKCU\Software\Classes\Drive\shell
```

与当前项目保持一致即可。

---

## 5.2 根路径与对象语义

| 根路径 | 对象 | 说明 |
|---|---|---|
| `Directory\shell` | 文件夹本身 | 右键点某个文件夹 |
| `Directory\Background\shell` | 文件夹空白区 | 在资源管理器当前目录背景右键 |
| `DesktopBackground\shell` | 桌面空白区 | 在桌面背景右键 |
| `Drive\shell` | 盘符 | 右键 C: / D: 等 |

建议做成可配置开关，而不是写死 4 个都开。

---

## 5.3 菜单组路径设计

建议使用**稳定 key + 可变标题**，不要直接用标题当 key。

### 不推荐

```text
HKCU\Software\Classes\Directory\Background\shell\ExecLink AI Tools
```

问题：
- 标题一改，整个 key 路径变了
- 清理旧菜单容易残留
- 多语言标题更麻烦

### 推荐

```text
HKCU\Software\Classes\Directory\Background\shell\ExecLink.Group.Main
```

值：

- `MUIVerb` = `ExecLink`
- `Icon` = `C:\Path\to\execlink.exe,0`
- `SubCommands` = ``

这样：

- key 是内部稳定 ID
- 标题用 `MUIVerb` 控制
- 改标题不影响定位与清理

---

## 5.4 子菜单路径设计

建议：

```text
...\shell\ExecLink.Group.Main\shell\001.claude
...\shell\ExecLink.Group.Main\shell\002.codex
...\shell\ExecLink.Group.Main\shell\003.kimi
```

每个子项：

- `MUIVerb` = 显示名称
- `Icon` = 可选
- 默认值 `command\(Default)` = 实际执行命令

说明：

- 用 `001`、`002`、`003` 固化排序
- 逻辑 ID 放在后缀中，便于诊断
- 不建议继续用 `.item` 这种无语义后缀

---

## 5.5 ExecLink 私有标记值

建议每个菜单组和菜单项都加一个私有标记，便于枚举和清理。

例如：

- `ExeclinkOwner` = `ExecLink`
- `ExeclinkSchemaVersion` = `2`
- `ExeclinkItemId` = `claude`
- `ExeclinkScopeMask` = `DirectoryBackground|Directory|DesktopBackground|Drive`

好处：

- 不必再靠命令字符串中是否含 `claude|codex|kimi` 来猜测是不是本应用创建
- 后续升级 schema 时更容易迁移
- 枚举、修复、清理逻辑更稳

---

## 6. 数据结构设计

下面给出建议的数据结构。你可以直接把它作为后端核心模型。

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextMenuConfig {
    pub schema_version: u32,
    pub groups: Vec<MenuGroup>,
    pub terminals: Vec<TerminalProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuGroup {
    pub id: String,                // 稳定 ID，例如 main
    pub title: String,             // MUIVerb
    pub icon: Option<String>,      // ex: "C:\\...\\execlink.exe,0"
    pub scopes: Vec<MenuScope>,
    pub enabled: bool,
    pub items: Vec<MenuItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MenuScope {
    Directory,
    DirectoryBackground,
    DesktopBackground,
    Drive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuItem {
    pub id: String,                // 稳定 ID，例如 claude
    pub title: String,             // 显示名
    pub order: u32,
    pub enabled: bool,
    pub icon: Option<String>,
    pub launch: LaunchTarget,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchTarget {
    pub terminal_profile_id: String,
    pub working_dir_arg: WorkingDirArg,
    pub command: String,           // ex: "claude"
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WorkingDirArg {
    PercentV,
    Percent1,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalProfile {
    pub id: String,                // ex: wt-pwsh
    pub title: String,
    pub template: String,          // ex: wt -d "{workdir}" pwsh -NoExit -Command "{command}"
    pub requires_workdir: bool,
}
```

---

## 7. 注册表写入规则

## 7.1 菜单组写入规则

以 `Directory\Background\shell` 为例：

```text
HKCU\Software\Classes\Directory\Background\shell\ExecLink.Group.Main
    (Default)                  = ""
    MUIVerb                    = "ExecLink"
    Icon                       = "C:\Path\execlink.exe,0"
    SubCommands                = ""
    ExeclinkOwner              = "ExecLink"
    ExeclinkSchemaVersion      = "2"
```

说明：

- `SubCommands=""` 用于级联菜单
- 具体子项放在 `shell` 子键下

---

## 7.2 子项写入规则

```text
HKCU\Software\Classes\Directory\Background\shell\ExecLink.Group.Main\shell\001.claude
    MUIVerb                    = "Claude Code"
    Icon                       = "C:\Path\execlink.exe,0"
    ExeclinkOwner              = "ExecLink"
    ExeclinkItemId             = "claude"

HKCU\Software\Classes\Directory\Background\shell\ExecLink.Group.Main\shell\001.claude\command
    (Default)                  = "wt -d \"%V\" pwsh -NoExit -Command claude"
```

---

## 7.3 删除规则

删除菜单组时，不要仅删除标题匹配项，而是：

1. 遍历 4 个目标根
2. 找出 `ExeclinkOwner=ExecLink` 的 key
3. 按组 ID 精确删除整棵树

这样能避免误删用户其他菜单。

---

## 7.4 枚举规则

当前项目是通过：

- 读取 `shell\*\command` 的默认值
- 检查命令里是否包含 `claude|codex|...`
- 再结合 `%V` / `ExecLink` 字符串去猜测归属

这个策略可以作为旧版本兼容回退，但新版本建议改为：

### V2 枚举优先级

1. 先找 `ExeclinkOwner=ExecLink`
2. 再按 `ExeclinkSchemaVersion` 解析
3. 如果没有标记，再尝试旧版启发式识别
4. 对识别出的旧版菜单提供“一键迁移 / 清理旧结构”

---

## 8. 命令构造策略

## 8.1 统一占位符

建议只保留一套内部占位符：

- `{workdir}`
- `{command}`
- `{args}`

例如：

```text
wt -d "{workdir}" pwsh -NoExit -Command {command} {args}
```

在最终落盘前才把 `{workdir}` 替换成：

- `%V`
- `%1`
- 空字符串

---

## 8.2 推荐内置终端模板

### Windows Terminal + PowerShell

```text
wt -d "{workdir}" pwsh -NoExit -Command {command} {args}
```

### PowerShell 直接模式

```text
pwsh -NoExit -Command "Set-Location -LiteralPath '{workdir}'; {command} {args}"
```

### CMD 模式

```text
cmd /k cd /d "{workdir}" && {command} {args}
```

建议把模板作为配置资源管理，不要散落在 `commands.rs` 中。

---

## 8.3 CLI 项与终端项分离

建议 UI 层改成：

- 菜单项选择某个 CLI（Claude / Codex / Gemini / Kimi / 自定义）
- 终端模板单独选择（WT / pwsh / cmd / 自定义）

这样产品会更稳定，也更利于后续扩展“自定义脚本项”。

---

## 9. Tauri command 清单（建议版）

下面给出“去 Nilesoft 后”的建议命令清单。

## 9.1 菜单配置与查询

```rust
#[tauri::command]
fn get_context_menu_config() -> Result<ContextMenuConfig, String>;

#[tauri::command]
fn save_context_menu_config(config: ContextMenuConfig) -> Result<(), String>;

#[tauri::command]
fn preview_context_menu_plan(config: ContextMenuConfig) -> Result<RegistryWritePlan, String>;
```

用途：
- 获取当前配置
- 保存配置
- 预览将要写入的注册表 plan（便于调试）

---

## 9.2 注册表应用与清理

```rust
#[tauri::command]
fn apply_context_menu_registry(config: ContextMenuConfig) -> Result<ApplyMenuResult, String>;

#[tauri::command]
fn remove_context_menu_group(group_id: String) -> Result<(), String>;

#[tauri::command]
fn remove_all_execlink_context_menus() -> Result<RemoveSummary, String>;
```

用途：
- 应用配置到注册表
- 删除指定菜单组
- 清除全部 ExecLink 菜单残留

---

## 9.3 枚举与诊断

```rust
#[tauri::command]
fn list_execlink_context_menus() -> Result<Vec<InstalledMenuGroup>, String>;

#[tauri::command]
fn diagnose_context_menu_state() -> Result<ContextMenuDiagnostics, String>;

#[tauri::command]
fn detect_legacy_menu_artifacts() -> Result<Vec<LegacyArtifact>, String>;
```

用途：
- 枚举当前已安装菜单
- 做诊断
- 识别旧版 PowerShell 写入结构 / Nilesoft 残留

---

## 9.4 刷新与生效

```rust
#[tauri::command]
fn notify_shell_changed() -> Result<(), String>;

#[tauri::command]
fn restart_explorer_fallback() -> Result<(), String>;
```

用途：
- 优先用 Shell 通知
- 必要时给用户一个“重启 Explorer”按钮

---

## 9.5 迁移命令

```rust
#[tauri::command]
fn migrate_legacy_hkcu_menu_to_v2() -> Result<MigrationSummary, String>;

#[tauri::command]
fn cleanup_nilesoft_artifacts() -> Result<CleanupSummary, String>;
```

用途：
- 迁移旧 HKCU 菜单
- 清理 Nilesoft 安装残留、配置残留、注册残留

---

## 9.6 建议删除的旧命令

完成迁移后，建议移除这些 Nilesoft 专用命令：

- `ensure_nilesoft_installed`
- `one_click_install_repair`
- `request_elevation_and_register`
- `attempt_unregister_nilesoft`
- `one_click_unregister_cleanup`
- `activate_now`（如果它主要服务于 `shell.exe -restart`）

保留并重命名这些更合理：

- `repair_context_menu_hkcu` → `apply_context_menu_registry`
- `remove_context_menu_hkcu` → `remove_all_execlink_context_menus`
- `list_context_menu_groups_hkcu` → `list_execlink_context_menus`
- `refresh_explorer` → `notify_shell_changed`

---

## 10. 迁移步骤

## 阶段 0：锁定目标边界

目标写清楚：

- 去除 Nilesoft 依赖
- 采用 HKCU 经典菜单路线
- 不承诺进入 Windows 11 顶层新菜单

产出：
- README 改版草案
- 产品文案改版草案

---

## 阶段 1：抽离菜单模型

操作：

1. 从现有 `AppConfig` 中抽离“菜单领域模型”
2. 建立 `context_menu_model.rs`
3. 将 CLI 显示项、顺序、标题、作用域收拢到统一结构

完成标准：

- builder 不再直接依赖前端零散字段
- 单元测试能验证排序、启用/禁用、scope 过滤

---

## 阶段 2：实现 Rust 直写注册表

操作：

1. 新增 `context_menu_registry.rs`
2. 用 Rust API 替代当前 PowerShell 脚本拼接
3. 支持：
   - create/update/delete/list
   - group/item 双层结构
   - 写私有 marker

完成标准：

- 完整覆盖现有 HKCU 写入能力
- 不再依赖 `powershell.exe` / `pwsh.exe` 执行注册表脚本

---

## 阶段 3：替换刷新链路

操作：

1. 新增 `shell_notify.rs`
2. 首选 `SHChangeNotify(SHCNE_ASSOCCHANGED, ...)`
3. 将“重启 Explorer”从自动强依赖改成兜底按钮

完成标准：

- 应用配置后大多数场景可直接生效
- 仅极少数场景需要手动重启 Explorer

---

## 阶段 4：兼容旧结构

操作：

1. 读取旧 HKCU 菜单
2. 用启发式识别旧 ExecLink 菜单
3. 迁移到新 key 命名与 marker 体系
4. 提供“清理旧残留”按钮

完成标准：

- 老用户升级后不必手工删注册表
- 至少支持一次平滑升级

---

## 阶段 5：去掉 Nilesoft 运行链路

操作：

1. 删除 `nilesoft.rs` 依赖入口
2. 删除 `nilesoft_install.rs` 对 UI 主流程的暴露
3. 下线安装/修复 Nilesoft 页面逻辑
4. 仅保留一次性清理能力（如你仍需帮助老用户卸载残留）

完成标准：

- 新安装包中不再包含 Nilesoft 资源
- UI 不再出现 Nilesoft 文案

---

## 阶段 6：README / 安装包 / 卸载体验更新

操作：

1. README 改成“无需额外安装 Nilesoft”
2. MSI 卸载时可选清理 ExecLink 菜单
3. 在 About / Diagnostics 中增加“菜单安装状态”页

完成标准：

- 用户能清楚理解新方案
- 售后支持更轻

---

## 11. 风险与对策

## 11.1 风险：用户误以为一定出现在 Win11 顶层菜单

对策：
- 文案前置说明“经典菜单方案”
- 设置页提供“为什么在 Show more options 中”的帮助说明

---

## 11.2 风险：菜单刷新不及时

对策：
- 优先 `SHChangeNotify`
- 再提供手动 `Restart Explorer`
- Diagnostics 中展示最后一次刷新结果

---

## 11.3 风险：旧版残留冲突

对策：
- 使用 `ExeclinkOwner` marker
- 启动时做一次轻量扫描
- 提供“迁移旧菜单 / 清理旧菜单”按钮

---

## 11.4 风险：命令字符串转义复杂

对策：
- 命令拼接集中到 `command_launcher.rs`
- builder 不再关心 shell 转义细节
- 增加针对 `%V`、空格路径、单引号路径的测试用例

---

## 12. 推荐实现顺序（最小可用版本）

如果你想最快落地，我建议按这个最小顺序推进：

### MVP-1
- 抽离 `ContextMenuConfig`
- 用 Rust 直写 HKCU 菜单
- 仅支持一个菜单组 `ExecLink`
- 支持 `DirectoryBackground` + `Directory`
- 支持 Claude / Codex / Gemini / Kimi

### MVP-2
- 支持 `DesktopBackground` / `Drive`
- 支持排序 / 重命名 / 启停
- 支持图标
- 支持枚举与清理

### MVP-3
- 支持旧版迁移
- 删除 Nilesoft 安装流程
- 更新 README / UI 文案

### Future
- 评估 Win11 顶层菜单：`IExplorerCommand + package identity`

---

## 13. 对你项目的最终建议

**建议结论非常明确：**

### 现在就该做的

- 去掉 Nilesoft 作为主路径
- 保留并升级 HKCU 经典菜单方案
- 把 PowerShell 注册表脚本替换为 Rust 原生注册表写入
- 把刷新逻辑替换为 `SHChangeNotify + Explorer 重启兜底`

### 现在不该做的

- 不要在本阶段直接上 `IExplorerCommand`
- 不要为了顶层 Win11 菜单，把整个项目变成 COM Shell Extension 工程
- 不要让“菜单是否出现在第一层”成为当前版本的交付门槛

### 原因

因为对 ExecLink 来说，最重要的产品价值不是“成为一个 Windows Shell 扩展平台”，而是：

> 用最少依赖、最少权限、最少故障点，让用户从右键菜单快速进入 AI CLI。

而 **Rust 直写 HKCU 注册表 + Shell 通知刷新**，正是当前最匹配这个目标的方案。

---

## 14. 微软官方文档链接（建议你保留在项目 docs/ 中）

以下链接建议直接放进仓库文档，作为后续开发与产品边界说明的依据。

### Windows 右键菜单 / Shell 菜单

1. Creating Shortcut Menu Handlers  
   https://learn.microsoft.com/en-us/windows/win32/shell/context-menu-handlers

2. Create Cascading Menus with the SubCommands Registry Entry  
   https://learn.microsoft.com/en-us/windows/win32/shell/how-to--create-cascading-menus-with-the-subcommands-registry-entry

3. Create Cascading Menus with the ExtendedSubCommandsKey Registry Entry  
   https://learn.microsoft.com/en-us/windows/win32/shell/how-to-create-cascading-menus-with-the-extendedsubcommandskey-registry-entry

4. Registering Shell Extension Handlers  
   https://learn.microsoft.com/en-us/windows/win32/shell/reg-shell-exts

5. Application Registration  
   https://learn.microsoft.com/en-us/windows/win32/shell/app-registration

### Windows 11 顶层现代菜单 / IExplorerCommand

6. Extending the Context Menu and Share Dialog in Windows 11  
   https://blogs.windows.com/windowsdeveloper/2021/07/19/extending-the-context-menu-and-share-dialog-in-windows-11/

7. IExplorerCommand interface  
   https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-iexplorercommand

8. Windows Application Development - Best Practices  
   https://learn.microsoft.com/en-us/windows/apps/get-started/best-practices

### Package identity / Sparse Package / Packaging

9. Packaging overview  
   https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/packaging/

10. Package and deploy Windows apps overview  
    https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/

11. Grant package identity by packaging with external location (overview)  
    https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/grant-identity-to-nonpackaged-apps-overview

12. Grant package identity by packaging with external location manually  
    https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/grant-identity-to-nonpackaged-apps

13. Package identity overview  
    https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/package-identity-overview

### 注册表与刷新

14. RegCreateKeyEx function  
    https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-regcreatekeyexa

15. RegOpenKeyEx function  
    https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-regopenkeyexa

16. RegSetValueEx function  
    https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-regsetvalueexa

17. Opening, Creating, and Closing Keys  
    https://learn.microsoft.com/en-us/windows/win32/sysinfo/opening-creating-and-closing-keys

18. Registry Key Security and Access Rights  
    https://learn.microsoft.com/en-us/windows/win32/sysinfo/registry-key-security-and-access-rights

19. SHChangeNotify function  
    https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shchangenotify

---

## 15. 建议追加到仓库的文档文件名

建议将本文落到：

```text
docs/refactor-remove-nilesoft-rust-context-menu-plan.md
```

如果你希望再细化，我建议下一步再拆两份子文档：

1. `docs/context-menu-registry-schema-v2.md`
2. `docs/context-menu-migration-checklist.md`

