use std::{
    fs,
    path::PathBuf,
};

use crate::state::{self, AppResult};

const ICONS_DIR_NAME: &str = "context-menu-icons";
const CLAUDE_ICON: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/resources/context-menu-icons/claude.ico"
));
const CODEX_ICON: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/resources/context-menu-icons/codex.ico"
));
const GEMINI_ICON: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/resources/context-menu-icons/gemini.ico"
));
const KIMI_ICON: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/resources/context-menu-icons/kimi.ico"
));
const QWEN_CODE_ICON: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/resources/context-menu-icons/qwen-code.ico"
));
const OPENCODE_ICON: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/resources/context-menu-icons/opencode.ico"
));

#[derive(Clone, Copy)]
struct IconAsset {
    filename: &'static str,
    bytes: &'static [u8],
}

fn icon_asset_for_cli(cli_id: &str) -> AppResult<IconAsset> {
    match cli_id {
        "claude" => Ok(IconAsset {
            filename: "claude.ico",
            bytes: CLAUDE_ICON,
        }),
        "codex" => Ok(IconAsset {
            filename: "codex.ico",
            bytes: CODEX_ICON,
        }),
        "gemini" => Ok(IconAsset {
            filename: "gemini.ico",
            bytes: GEMINI_ICON,
        }),
        "kimi" | "kimi_web" => Ok(IconAsset {
            filename: "kimi.ico",
            bytes: KIMI_ICON,
        }),
        "qwencode" => Ok(IconAsset {
            filename: "qwen-code.ico",
            bytes: QWEN_CODE_ICON,
        }),
        "opencode" => Ok(IconAsset {
            filename: "opencode.ico",
            bytes: OPENCODE_ICON,
        }),
        _ => Err(format!("未配置 CLI 图标资源: {cli_id}")),
    }
}

fn bundled_icon_assets() -> [IconAsset; 6] {
    [
        icon_asset_for_cli("claude").expect("claude icon"),
        icon_asset_for_cli("codex").expect("codex icon"),
        icon_asset_for_cli("gemini").expect("gemini icon"),
        icon_asset_for_cli("kimi").expect("kimi icon"),
        icon_asset_for_cli("qwencode").expect("qwencode icon"),
        icon_asset_for_cli("opencode").expect("opencode icon"),
    ]
}

fn icons_root_dir() -> AppResult<PathBuf> {
    Ok(state::app_root_dir()?.join(ICONS_DIR_NAME))
}

pub fn item_icon_target_path(cli_id: &str) -> AppResult<PathBuf> {
    let asset = icon_asset_for_cli(cli_id)?;
    Ok(icons_root_dir()?.join(asset.filename))
}

pub fn item_icon_value(cli_id: &str) -> AppResult<String> {
    Ok(item_icon_target_path(cli_id)?.display().to_string())
}

pub fn group_icon_value() -> Option<String> {
    std::env::current_exe()
        .ok()
        .map(|path| format!("{},0", path.display()))
}

pub fn ensure_context_menu_icon_files() -> AppResult<()> {
    let root = icons_root_dir()?;
    fs::create_dir_all(&root)
        .map_err(|error| format!("创建右键菜单图标目录失败 {}: {error}", root.display()))?;

    for asset in bundled_icon_assets() {
        let target = root.join(asset.filename);
        let should_write = match fs::read(&target) {
            Ok(existing) => existing != asset.bytes,
            Err(_) => true,
        };
        if should_write {
            fs::write(&target, asset.bytes)
                .map_err(|error| format!("写入右键菜单图标失败 {}: {error}", target.display()))?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        path::Path,
        sync::{Mutex, OnceLock},
        time::{SystemTime, UNIX_EPOCH},
    };

    fn test_mutex() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn unique_localappdata_dir() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        std::env::temp_dir().join(format!("execlink-icon-test-{suffix}"))
    }

    fn with_temp_localappdata<T>(test: impl FnOnce(PathBuf) -> T) -> T {
        let _guard = test_mutex().lock().expect("lock");
        let original = std::env::var_os("LOCALAPPDATA");
        let temp = unique_localappdata_dir();
        std::env::set_var("LOCALAPPDATA", &temp);
        let result = test(temp.clone());
        if let Some(value) = original {
            std::env::set_var("LOCALAPPDATA", value);
        } else {
            std::env::remove_var("LOCALAPPDATA");
        }
        let _ = fs::remove_dir_all(temp);
        result
    }

    fn ends_with_path(path: &Path, suffix: &str) -> bool {
        path.to_string_lossy().replace('/', "\\").ends_with(suffix)
    }

    #[test]
    fn should_map_cli_ids_to_stable_icon_filenames() {
        with_temp_localappdata(|_| {
            assert!(ends_with_path(
                &item_icon_target_path("claude").expect("claude"),
                "context-menu-icons\\claude.ico"
            ));
            assert!(ends_with_path(
                &item_icon_target_path("codex").expect("codex"),
                "context-menu-icons\\codex.ico"
            ));
            assert!(ends_with_path(
                &item_icon_target_path("gemini").expect("gemini"),
                "context-menu-icons\\gemini.ico"
            ));
            assert!(ends_with_path(
                &item_icon_target_path("qwencode").expect("qwen"),
                "context-menu-icons\\qwen-code.ico"
            ));
            assert!(ends_with_path(
                &item_icon_target_path("opencode").expect("opencode"),
                "context-menu-icons\\opencode.ico"
            ));
        });
    }

    #[test]
    fn should_share_kimi_icon_between_kimi_and_web() {
        with_temp_localappdata(|_| {
            let kimi = item_icon_target_path("kimi").expect("kimi");
            let kimi_web = item_icon_target_path("kimi_web").expect("kimi_web");
            assert_eq!(kimi, kimi_web);
            assert!(ends_with_path(&kimi, "context-menu-icons\\kimi.ico"));
        });
    }

    #[test]
    fn should_bundle_only_valid_ico_containers() {
        for asset in bundled_icon_assets() {
            assert!(
                asset.bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]),
                "asset {} is not a valid ico container",
                asset.filename
            );
        }
    }

    #[test]
    fn should_write_bundled_icons_idempotently() {
        with_temp_localappdata(|temp| {
            ensure_context_menu_icon_files().expect("write icons");
            let root = temp.join("execlink").join(ICONS_DIR_NAME);
            let claude = root.join("claude.ico");
            let first = fs::read(&claude).expect("claude exists");
            ensure_context_menu_icon_files().expect("write icons again");
            let second = fs::read(&claude).expect("claude exists again");
            assert_eq!(first, second);
            assert!(bundled_icon_assets()
                .iter()
                .all(|asset| root.join(asset.filename).exists()));
        });
    }
}
