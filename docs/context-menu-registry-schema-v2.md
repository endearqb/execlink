# Context Menu Registry Schema v2

当前实现以 `tasks/context-menu-registry-schema-v2.md` 为规范来源，运行时已落地以下约束：

- owner: `endearqb.execlink`
- schema version: `2`
- parent key: `ExecLink.main`
- child key: `{order:03}_{item_id}`
- parent cascade marker: `SubCommands=""`
- shell roots:
  - `HKCU\Software\Classes\Directory\Background\shell`
  - `HKCU\Software\Classes\Directory\shell`
  - `HKCU\Software\Classes\DesktopBackground\shell`
  - `HKCU\Software\Classes\Drive\shell`
- refresh path:
  - `SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, NULL, NULL)`
  - manual Explorer fallback only when needed

实现代码入口：

- `src-tauri/src/context_menu_model.rs`
- `src-tauri/src/context_menu_builder.rs`
- `src-tauri/src/context_menu_registry.rs`
- `src-tauri/src/context_menu_service.rs`
- `src-tauri/src/shell_notify.rs`

如需查看完整规范说明，请以 `tasks/context-menu-registry-schema-v2.md` 为准。
