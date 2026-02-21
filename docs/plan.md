  # ExecLink 下一阶段执行计划（对齐 PRD + 里程碑）

  ## 摘要
  当前状态判断：`Milestone 1/2` 已基本完成，`Milestone 3` 已完成大半（托盘、诊断、配置持久化、UI打磨），现在进入“发布前
  收尾”阶段。
  目标是把“可用 MVP”提升为“可交付版本”：补齐缺口、固化验收、完善发布与回滚手册。

  ## 1. 本周优先级（P0）

  ### 1.1 PRD 差距收口（功能面）
  1. 增加“安装指引/缺失 CLI 指引”入口（对应 PRD 风险对策）
  - 在 CLI 检测区对 ❌ 项提供“复制安装命令/打开说明”动作。
  - 先做本地静态映射（Claude/Codex/Gemini/Kimi/Kimi Web），后续可远程配置。
  - 小优化：当某 CLI 未检测到时，该行保持灰化且禁用编辑/开关，但保留“安装指引”入口可点击（减少用户找入口成本）。

  2. 完成“卸载与恢复”最小闭环（对应 PRD 7.2）
  - 后端新增“尝试反注册 Nilesoft”命令（若参数不支持则返回明确提示，不阻断）。
  - 后端新增“清理本应用目录”命令（仅清 `%LOCALAPPDATA%/execlink/`）。
  - 前端 Runtime 页新增“恢复/清理”区，带二次确认。

  3. 更新文档与现状对齐
  - 同步 `README.md` 与 `docs/AI_CLI_Switch_PRD_TechSpec.md` 的当前实现差异：
    - 已支持 `Kimi Web`
    - 已支持菜单名自定义
    - 已支持仅显示 AI 菜单
    - 当前窗口尺寸与 UI Tab 结构

  ### 1.2 稳定性硬化（工程面）
  4. 配置迁移测试补齐（v1/v2/v3 -> v4）
  - 覆盖 `menu_title`、`show_nilesoft_default_menus`、`kimi_web` 的默认迁移逻辑。
  - 防止历史配置导致空菜单名或字段缺失。

  5. 生效链路回归测试
  - 验证 `shell.exe -restart` 返回 `code=1` 且空 stderr 时不触发 explorer fallback。
  - 验证“应用配置后立即生效”不清空 runtime 时间戳。

  ## 2. 次优先级（P1）

  ### 2.1 发布准备
  6. 打包与安装烟测
  - 跑 `npm run tauri build`，验证 `resources/nilesoft.zip`、icons、配置写入路径、首次安装流程。
  - 在“干净用户环境”完成一次首启流程回归。

  7. 验收清单落地（按 PRD 12 条）
  - 形成可执行 checklist（目录右键、背景右键、开关隐藏、PATH 检测、生效策略、提权分支）。

  ### 2.2 诊断增强（支持面）
  8. 诊断信息补充版本与构建标识
  - 输出 app version、config version、tauri build mode、resource zip 解析路径。
  - 便于用户反馈时快速定位环境差异。

  ## 3. 实现影响（接口/类型）

  ### 新增后端命令（计划）
  1. `attempt_unregister_nilesoft() -> ActionResult`
  2. `cleanup_app_data(confirm_token) -> ActionResult`
  3. 可选：`get_cli_install_hints() -> Record<string, string>`

  ### 前端类型扩展（计划）
  1. `ActionResult.code` 新增：
  - `unregister_not_supported`
  - `cleanup_confirm_required`
  - `cleanup_done`
  2. 诊断结构可选新增：
  - `app_version`
  - `build_channel`

  ## 4. 测试与验收场景

  ### 自动化（必须）
  1. Rust 单测：
  - 配置迁移 v1/v2/v3 -> v4
  - `nilesoft` 渲染（默认菜单开关、菜单名、Kimi Web）
  - `activate` 分支（restart code=1 兼容）

  2. 前端类型检查：
  - `npx tsc --noEmit`

  ### 手工验收（发布门禁）
  1. 目录右键与目录背景右键均出现自定义菜单名。
  2. 关闭某 CLI 后菜单项即时消失。
  3. `Kimi Web` 点击后进入目标目录并执行 `kimi web`。
  4. 关闭“Nilesoft 默认菜单”后仅保留 AI 菜单。
  5. 点击“立即生效”不再造成卡死或 explorer 强制重启。
  6. 卸载/恢复操作路径可执行且有明确提示。

  ## 5. 交付物
  1. 代码改动（后端命令 + 前端入口 + 诊断增强）
  2. 文档更新：
  - `README.md`
  - `docs/AI_CLI_Switch_PRD_TechSpec.md`（标注已实现/待实现）
  - 新增 `docs/release_checklist.md`
  3. 当日 `updatenote` 完整记录

  ## 6. 假设与默认决策
  1. 默认继续以“每用户 LocalAppData 管理 Nilesoft”为唯一安装策略。
  2. 若 Nilesoft 无稳定 `-unregister` 参数，采用“提示 + 清理本地数据”作为 v1 恢复方案。
  3. 本轮不引入远程配置与自动更新机制，仅做本地静态可控实现。
  4. 发布目标先为“单机可用稳定版”，企业策略适配留到下一轮。
