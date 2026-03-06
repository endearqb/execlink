# ExecLink Release Checklist

日期：2026-02-19

## 1. 自动化门禁

- [x] `npx tsc --noEmit` 通过
- [x] `cargo test` 通过
- [x] `npm run tauri build` 成功

## 2. 打包与资源校验

- [x] 安装包生成成功（至少 1 个可安装目标）
- [ ] 打包产物不再包含 `resources/nilesoft.zip`
- [x] 应用图标与窗口标题正确
- [ ] 首次启动能直接进入 v2 右键菜单配置流程

## 3. 手工验收（PRD 12 条）

- [ ] 目录右键能看到 AI 菜单分组
- [ ] 目录背景右键能看到 AI 菜单分组
- [ ] 菜单名自定义后即时生效
- [ ] 关闭某个 CLI 后对应菜单项消失
- [ ] `Kimi Web` 菜单项触发 `kimi web`
- [ ] Windows 11 “显示更多选项”中可看到 ExecLink 菜单
- [ ] CLI 检测结果（✅/❌）与 PATH 实际状态一致
- [ ] 未检测到 CLI 时可点击“复制命令/打开说明”
- [ ] 点击“应用配置”成功写入 HKCU v2 注册表结构
- [ ] 点击“通知 Explorer 刷新”后菜单立即更新；必要时可走 Explorer 兜底刷新
- [ ] Legacy 菜单可迁移且不会生成重复分组
- [ ] 高级维护中的“清理旧残留”可执行且提示明确

## 4. 回滚与恢复

- [ ] 可通过“应用配置”重新建立 v2 菜单状态
- [ ] 清理动作必须二次确认，且仅作用于 `%LOCALAPPDATA%/execlink/` 与 ExecLink 自有菜单项
- [ ] 诊断文本可复制并包含版本、构建通道、菜单状态与日志路径

## 5. 发布记录

- [ ] 更新 `README.md`
- [ ] 更新 `docs/AI_CLI_Switch_PRD_TechSpec.md`
- [ ] 更新当日 `updatenote`
