# ExecLink Release Checklist

日期：2026-02-19

## 1. 自动化门禁

- [x] `npx tsc --noEmit` 通过
- [x] `cargo test` 通过
- [x] `npm run tauri build` 成功

## 2. 打包与资源校验

- [x] 安装包生成成功（至少 1 个可安装目标）
- [ ] 打包产物包含 `resources/nilesoft.zip`
- [x] 应用图标与窗口标题正确
- [ ] 首次启动能自动进入初始化流程

## 3. 手工验收（PRD 12 条）

- [ ] 目录右键能看到 AI 菜单分组
- [ ] 目录背景右键能看到 AI 菜单分组
- [ ] 菜单名自定义后即时生效
- [ ] 关闭某个 CLI 后对应菜单项消失
- [ ] `Kimi Web` 菜单项触发 `kimi web`
- [ ] 关闭“显示 Nilesoft 默认菜单”后仅保留 AI 菜单
- [ ] CLI 检测结果（✅/❌）与 PATH 实际状态一致
- [ ] 未检测到 CLI 时可点击“复制命令/打开说明”
- [ ] 点击“应用配置”成功写入 `imports/ai-clis.nss`
- [ ] 点击“立即生效”优先走 `shell.exe -restart`，无异常误重启
- [ ] 普通权限注册失败时可通过“提权重试注册”恢复
- [ ] Runtime 页“尝试反注册/清理应用数据”可执行且提示明确

## 4. 回滚与恢复

- [ ] 可通过“安装/修复 Nilesoft”重新建立可控状态
- [ ] 反注册不支持时返回 `unregister_not_supported`，不阻断清理
- [ ] 清理动作必须二次确认，且仅作用于 `%LOCALAPPDATA%/execlink/`
- [ ] 诊断文本可复制并包含版本、构建通道、资源路径

## 5. 发布记录

- [ ] 更新 `README.md`
- [ ] 更新 `docs/AI_CLI_Switch_PRD_TechSpec.md`
- [ ] 更新当日 `updatenote`
