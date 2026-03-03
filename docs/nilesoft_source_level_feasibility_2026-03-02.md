# Nilesoft 源码级实现可行性评审（2026-03-02）

## 1. 评审目标
- 结合 ExecLink 的“自定义右键菜单”诉求，评估是否应将 Nilesoft 能力转为应用内源码级实现。
- 输出可执行结论：继续外部依赖、源码 fork 集成、或自研最小替代。

## 2. 当前项目现状（ExecLink）
- 当前采用“捆绑 nilesoft.zip + 解压 + shell.exe 注册/反注册 + 写 nss 配置”的外部依赖模式。
- 关键实现文件：
  - `src-tauri/src/nilesoft_install.rs`
  - `src-tauri/src/nilesoft.rs`
  - `src-tauri/src/commands.rs`
- 当前资源包内版本（`src-tauri/resources/nilesoft.zip` -> `readme.txt`）显示 `Version 1.9.18`。

## 3. 上游仓库事实快照（moudey/Shell）
- 仓库：<https://github.com/moudey/Shell>
- 仓库 API：<https://api.github.com/repos/moudey/Shell>
- 许可证：MIT（可 fork/修改/再发布，需保留版权声明）
- 语言与构建形态：C++ + Visual Studio solution（`src/Shell.sln`）
- 模块结构：`src/dll`（核心 shell 扩展）、`src/exe`（命令入口）、`src/shared`（公共系统封装）
- 第三方依赖：Detours、plutosvg（见 `.gitmodules`）
- 命令行文档明确包含：`-register/-unregister/-restart`（见 `docs/installation.html`）

## 4. 源码级实现可行性判断

### 4.1 技术可行性
可行，但不是“低成本可行”。
- 从源码看，Nilesoft 不只是简单注册表写入，还包括：
  - COM Shell 扩展注册与多类型挂接（Directory/Background/Drive/Desktop 等）
  - Windows 11 相关行为处理（包括 treat/type 解析与 Explorer 行为适配）
  - 自定义解析器与表达式系统（`Parser/*`, `Expression/*`）
  - Explorer/Taskbar 相关 Hook 与 UI 兼容代码
- 若做源码级落地，实质上是接手一个持续演进的 C++ Shell 扩展项目维护责任。

### 4.2 与 ExecLink 需求匹配度
- ExecLink 当前需求主要是“稳定注入少量 AI CLI 菜单项 + 配置同步 + 修复/恢复”。
- 对 Nilesoft 大量高级能力（复杂样式、表达式体系、全量菜单改造）依赖较低。
- 现阶段业务收益不足以覆盖源码级接管成本。

## 5. 路线对比

### 方案 A：继续外部依赖（推荐）
优点：
- 与现有架构一致，改造最小。
- 维护成本最低，回归风险可控。
- 可专注 ExecLink 自身产品能力（安装流、修复流、配置体验）。

缺点：
- 对上游二进制行为与版本变更有被动依赖。
- 深层定制能力受限于 Nilesoft 语法与行为边界。

### 方案 B：源码 fork 集成
优点：
- 控制力更高，可定制更深。

缺点：
- 需要长期维护 C++/COM/Explorer 兼容链路。
- 需要额外构建链（VS toolchain、多架构产物、依赖同步）和发布治理。
- 回归与安全责任显著上升。

### 方案 C：自研最小替代
优点：
- 长期完全自主，按产品需求裁剪。

缺点：
- 前期研发与系统兼容风险最高。
- Windows Shell 扩展细节复杂，短期难达到当前稳定性。

## 6. 结论
- 结论：当前阶段采用 **方案 A（继续外部依赖）**。
- 决策理由：在我们当前需求下，源码级接管带来的维护复杂度和回归风险远高于收益。
- 配套动作：加强版本治理与回归机制，而不是立即切换技术路线。

## 7. 建议的治理动作（执行层）
1. 在应用诊断中显示“捆绑 Nilesoft 版本 + 注册状态 + 实际生效路径”。
2. 固化升级流程：升级包前先 `-unregister`，升级后再 `-register`，并二次校验注册根路径。
3. 建立最小回归清单：目录右键、背景右键、安装/提权、反注册+清理、配置双写路径。
4. 每次升级 Nilesoft 版本时，记录上游变更摘要并附验证结果。

## 8. 关键参考
- 仓库主页：<https://github.com/moudey/Shell>
- 仓库元数据：<https://api.github.com/repos/moudey/Shell>
- 安装与命令：<https://raw.githubusercontent.com/moudey/Shell/main/docs/installation.html>
- 命令入口：<https://raw.githubusercontent.com/moudey/Shell/main/src/exe/src/Main.cpp>
- 注册逻辑：<https://raw.githubusercontent.com/moudey/Shell/main/src/shared/RegistryConfig.h>
- 语法属性（type/dir）：<https://raw.githubusercontent.com/moudey/Shell/main/docs/configuration/properties.html>
