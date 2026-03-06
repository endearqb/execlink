use winreg::{
    enums::{HKEY_CURRENT_USER, KEY_READ},
    RegKey,
};

use crate::{
    logging, shell_notify,
    state::{AppResult, Win11ClassicMenuStatus},
};

const CLASSIC_MENU_PARENT_PATH: &str =
    r"Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}";
const CLASSIC_MENU_INPROC_PATH: &str =
    r"Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32";

fn hkcu() -> RegKey {
    RegKey::predef(HKEY_CURRENT_USER)
}

fn full_hkcu_path() -> String {
    format!(r"HKCU\{CLASSIC_MENU_INPROC_PATH}")
}

fn build_status(enabled: bool) -> Win11ClassicMenuStatus {
    Win11ClassicMenuStatus {
        enabled,
        registry_path: full_hkcu_path(),
        restart_recommended: true,
        message: if enabled {
            "已启用当前用户级 Win11 经典右键菜单覆盖；这会影响整个资源管理器右键菜单，而不只是 ExecLink。若未立即生效，请执行 Explorer 兜底刷新或重新登录。".to_string()
        } else {
            "当前未启用 Win11 经典右键菜单覆盖；系统将继续使用 Win11 原生顶层右键菜单。若刚关闭该开关，也可能需要 Explorer 兜底刷新或重新登录。".to_string()
        },
    }
}

pub fn inspect_status() -> AppResult<Win11ClassicMenuStatus> {
    let enabled = hkcu()
        .open_subkey_with_flags(CLASSIC_MENU_INPROC_PATH, KEY_READ)
        .is_ok();
    Ok(build_status(enabled))
}

pub fn enable() -> AppResult<Win11ClassicMenuStatus> {
    logging::log_line("[win11-classic-menu] enabling classic context menu override");
    let (key, _) = hkcu()
        .create_subkey(CLASSIC_MENU_INPROC_PATH)
        .map_err(|error| format!("创建 Win11 经典菜单注册表项失败 {}: {error}", full_hkcu_path()))?;
    key.set_value("", &"")
        .map_err(|error| format!("写入 Win11 经典菜单默认值失败 {}: {error}", full_hkcu_path()))?;
    shell_notify::notify_shell_changed()?;
    inspect_status()
}

pub fn disable() -> AppResult<Win11ClassicMenuStatus> {
    logging::log_line("[win11-classic-menu] disabling classic context menu override");
    let parent = CLASSIC_MENU_PARENT_PATH;
    if hkcu().open_subkey_with_flags(parent, KEY_READ).is_ok() {
        hkcu().delete_subkey_all(parent).map_err(|error| {
            format!(
                "删除 Win11 经典菜单注册表项失败 HKCU\\{}: {error}",
                parent
            )
        })?;
    }
    shell_notify::notify_shell_changed()?;
    inspect_status()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_use_expected_registry_paths() {
        assert_eq!(
            full_hkcu_path(),
            r"HKCU\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32"
        );
    }

    #[test]
    fn should_build_enabled_status_message() {
        let status = build_status(true);
        assert!(status.enabled);
        assert!(status.restart_recommended);
        assert!(status.message.contains("经典右键菜单覆盖"));
        assert!(status.registry_path.ends_with("InprocServer32"));
    }

    #[test]
    fn should_build_disabled_status_message() {
        let status = build_status(false);
        assert!(!status.enabled);
        assert!(status.message.contains("原生顶层右键菜单"));
    }
}
