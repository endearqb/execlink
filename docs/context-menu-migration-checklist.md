# Context Menu Migration Checklist

ExecLink 从 legacy HKCU 菜单迁移到 v2 时，执行顺序固定为：

1. 扫描四个 shell roots 下的 legacy 菜单候选。
2. 生成并写入 v2 registry plan。
3. 校验 parent / child / command 结构完整。
4. 调用 `SHChangeNotify` 通知 Explorer。
5. 仅在 v2 校验成功后，删除 legacy 路径。

验收检查：

- 标题变更不会创建新的 parent key。
- 菜单顺序会生成稳定的 `010/020/...` child key。
- legacy 菜单删除只作用于匹配 heuristic 的 ExecLink 路径。
- 新旧菜单不会重复显示。
- Windows 11 在“显示更多选项”中可见 ExecLink 菜单。
