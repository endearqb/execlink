use serde::{Deserialize, Serialize};

use crate::{
    command_launcher::{self, RunnerKind},
    context_menu_icons,
    state::{AppConfig, AppResult, CliStatusMap},
};

pub const EXECLINK_OWNER: &str = "endearqb.execlink";
pub const EXECLINK_SCHEMA_VERSION: u32 = 2;
pub const EXECLINK_MANAGED_BY: &str = "rust-registry-v2";
pub const DEFAULT_GROUP_ID: &str = "main";
pub const DEFAULT_WORKING_DIR_ARG: &str = "%V";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Ord, PartialOrd)]
#[serde(rename_all = "snake_case")]
pub enum ShellTarget {
    DirectoryBackground,
    Directory,
    DesktopBackground,
    Drive,
}

impl ShellTarget {
    pub fn target_id(self) -> &'static str {
        match self {
            ShellTarget::DirectoryBackground => "directory_background",
            ShellTarget::Directory => "directory",
            ShellTarget::DesktopBackground => "desktop_background",
            ShellTarget::Drive => "drive",
        }
    }

    pub fn registry_shell_root(self) -> &'static str {
        match self {
            ShellTarget::DirectoryBackground => "Software\\Classes\\Directory\\Background\\shell",
            ShellTarget::Directory => "Software\\Classes\\Directory\\shell",
            ShellTarget::DesktopBackground => "Software\\Classes\\DesktopBackground\\shell",
            ShellTarget::Drive => "Software\\Classes\\Drive\\shell",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ContextMenuPlan {
    pub schema_version: u32,
    pub owner: String,
    pub groups: Vec<MenuGroupPlan>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MenuGroupPlan {
    pub group_id: String,
    pub title: String,
    pub icon: Option<String>,
    pub targets: Vec<ShellTarget>,
    pub items: Vec<MenuItemPlan>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MenuItemPlan {
    pub item_id: String,
    pub cli_id: String,
    pub title: String,
    pub order: u16,
    pub enabled: bool,
    pub icon: Option<String>,
    pub runner: RunnerKind,
    pub cli_command: String,
    pub final_command: String,
}

#[derive(Debug, Clone, Copy)]
struct CliSpec {
    key: &'static str,
    command: &'static str,
}

#[derive(Debug, Clone, Copy)]
struct FixedLaunchModeSpec {
    key: &'static str,
    parent_key: &'static str,
    command: &'static str,
}

const CLI_SPECS: [CliSpec; 7] = [
    CliSpec {
        key: "claude",
        command: "claude",
    },
    CliSpec {
        key: "codex",
        command: "codex",
    },
    CliSpec {
        key: "gemini",
        command: "gemini",
    },
    CliSpec {
        key: "kimi",
        command: "kimi",
    },
    CliSpec {
        key: "kimi_web",
        command: "kimi web",
    },
    CliSpec {
        key: "qwencode",
        command: "qwen",
    },
    CliSpec {
        key: "opencode",
        command: "opencode",
    },
];

const FIXED_LAUNCH_MODE_SPECS: [FixedLaunchModeSpec; 3] = [
    FixedLaunchModeSpec {
        key: "claude_skip_permissions",
        parent_key: "claude",
        command: "claude --dangerously-skip-permissions",
    },
    FixedLaunchModeSpec {
        key: "gemini_yolo",
        parent_key: "gemini",
        command: "gemini --yolo",
    },
    FixedLaunchModeSpec {
        key: "codex_yolo",
        parent_key: "codex",
        command: "codex --yolo",
    },
];

fn cli_spec(key: &str) -> Option<CliSpec> {
    CLI_SPECS.iter().copied().find(|spec| spec.key == key)
}

fn fixed_launch_mode_specs_for_parent(key: &str) -> Vec<FixedLaunchModeSpec> {
    FIXED_LAUNCH_MODE_SPECS
        .iter()
        .copied()
        .filter(|spec| spec.parent_key == key)
        .collect()
}

fn cli_enabled(config: &AppConfig, key: &str) -> bool {
    match key {
        "claude" => config.toggles.claude,
        "codex" => config.toggles.codex,
        "gemini" => config.toggles.gemini,
        "kimi" => config.toggles.kimi,
        "kimi_web" => config.toggles.kimi_web,
        "qwencode" => config.toggles.qwencode,
        "opencode" => config.toggles.opencode,
        _ => false,
    }
}

fn cli_detected(statuses: &CliStatusMap, key: &str) -> bool {
    match key {
        "claude" => statuses.claude,
        "codex" => statuses.codex,
        "gemini" => statuses.gemini,
        "kimi" => statuses.kimi,
        "kimi_web" => statuses.kimi_web,
        "qwencode" => statuses.qwencode,
        "opencode" => statuses.opencode,
        _ => false,
    }
}

fn cli_title(config: &AppConfig, key: &str) -> Option<String> {
    match key {
        "claude" => Some(config.display_names.claude.clone()),
        "codex" => Some(config.display_names.codex.clone()),
        "gemini" => Some(config.display_names.gemini.clone()),
        "kimi" => Some(config.display_names.kimi.clone()),
        "kimi_web" => Some(config.display_names.kimi_web.clone()),
        "qwencode" => Some(config.display_names.qwencode.clone()),
        "opencode" => Some(config.display_names.opencode.clone()),
        _ => None,
    }
}

fn fixed_launch_mode_enabled(config: &AppConfig, key: &str) -> bool {
    match key {
        "claude_skip_permissions" => config.fixed_launch_modes.claude_skip_permissions.enabled,
        "gemini_yolo" => config.fixed_launch_modes.gemini_yolo.enabled,
        "codex_yolo" => config.fixed_launch_modes.codex_yolo.enabled,
        _ => false,
    }
}

fn fixed_launch_mode_title(config: &AppConfig, key: &str) -> Option<String> {
    match key {
        "claude_skip_permissions" => Some(
            config
                .fixed_launch_modes
                .claude_skip_permissions
                .display_name
                .clone(),
        ),
        "gemini_yolo" => Some(config.fixed_launch_modes.gemini_yolo.display_name.clone()),
        "codex_yolo" => Some(config.fixed_launch_modes.codex_yolo.display_name.clone()),
        _ => None,
    }
}

fn default_targets() -> Vec<ShellTarget> {
    vec![
        ShellTarget::DirectoryBackground,
        ShellTarget::Directory,
        ShellTarget::DesktopBackground,
        ShellTarget::Drive,
    ]
}

fn build_context_menu_plan_inner(config: &AppConfig) -> AppResult<ContextMenuPlan> {
    if !config.enable_context_menu {
        return Ok(ContextMenuPlan {
            schema_version: EXECLINK_SCHEMA_VERSION,
            owner: EXECLINK_OWNER.to_string(),
            groups: Vec::new(),
        });
    }

    let mut items = Vec::new();
    for (index, key) in config.cli_order.iter().enumerate() {
        let Some(spec) = cli_spec(key.as_str()) else {
            continue;
        };
        if !cli_enabled(config, key.as_str()) {
            continue;
        }
        let Some(title) = cli_title(config, key.as_str()) else {
            continue;
        };
        let order_base = ((index + 1) * 10) as u16;
        let icon = Some(context_menu_icons::item_icon_value(spec.key)?);
        let (runner, final_command) = command_launcher::build_final_command(
            config.terminal_mode,
            spec.command,
            DEFAULT_WORKING_DIR_ARG,
        )?;
        items.push(MenuItemPlan {
            item_id: spec.key.to_string(),
            cli_id: spec.key.to_string(),
            title,
            order: order_base,
            enabled: true,
            icon: icon.clone(),
            runner,
            cli_command: spec.command.to_string(),
            final_command,
        });

        for (offset, fixed_mode) in fixed_launch_mode_specs_for_parent(spec.key)
            .into_iter()
            .filter(|fixed_mode| fixed_launch_mode_enabled(config, fixed_mode.key))
            .enumerate()
        {
            let Some(title) = fixed_launch_mode_title(config, fixed_mode.key) else {
                continue;
            };
            let (runner, final_command) = command_launcher::build_final_command(
                config.terminal_mode,
                fixed_mode.command,
                DEFAULT_WORKING_DIR_ARG,
            )?;
            items.push(MenuItemPlan {
                item_id: fixed_mode.key.to_string(),
                cli_id: spec.key.to_string(),
                title,
                order: order_base + offset as u16 + 1,
                enabled: true,
                icon: icon.clone(),
                runner,
                cli_command: fixed_mode.command.to_string(),
                final_command,
            });
        }
    }

    if items.is_empty() {
        return Ok(ContextMenuPlan {
            schema_version: EXECLINK_SCHEMA_VERSION,
            owner: EXECLINK_OWNER.to_string(),
            groups: Vec::new(),
        });
    }

    Ok(ContextMenuPlan {
        schema_version: EXECLINK_SCHEMA_VERSION,
        owner: EXECLINK_OWNER.to_string(),
        groups: vec![MenuGroupPlan {
            group_id: DEFAULT_GROUP_ID.to_string(),
            title: config.menu_title.trim().to_string(),
            icon: context_menu_icons::group_icon_value(),
            targets: default_targets(),
            items,
        }],
    })
}

pub fn filter_config_by_detected_clis(config: &AppConfig, statuses: &CliStatusMap) -> AppConfig {
    let mut filtered = config.clone();
    filtered.toggles.claude &= cli_detected(statuses, "claude");
    filtered.toggles.codex &= cli_detected(statuses, "codex");
    filtered.toggles.gemini &= cli_detected(statuses, "gemini");
    filtered.toggles.kimi &= cli_detected(statuses, "kimi");
    filtered.toggles.kimi_web &= cli_detected(statuses, "kimi_web");
    filtered.toggles.qwencode &= cli_detected(statuses, "qwencode");
    filtered.toggles.opencode &= cli_detected(statuses, "opencode");
    filtered
}

pub fn build_context_menu_plan(config: &AppConfig) -> AppResult<ContextMenuPlan> {
    build_context_menu_plan_inner(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppConfig;

    fn empty_detected_statuses() -> CliStatusMap {
        CliStatusMap {
            claude: false,
            codex: false,
            gemini: false,
            kimi: false,
            kimi_web: false,
            qwencode: false,
            opencode: false,
            pwsh: true,
        }
    }

    fn detected_statuses_for(keys: &[&str]) -> CliStatusMap {
        let mut statuses = empty_detected_statuses();
        for key in keys {
            match *key {
                "claude" => statuses.claude = true,
                "codex" => statuses.codex = true,
                "gemini" => statuses.gemini = true,
                "kimi" => statuses.kimi = true,
                "kimi_web" => statuses.kimi_web = true,
                "qwencode" => statuses.qwencode = true,
                "opencode" => statuses.opencode = true,
                _ => {}
            }
        }
        statuses
    }

    #[test]
    fn should_build_single_group_from_app_config() {
        let config = AppConfig::default();
        let plan = build_context_menu_plan(&config).expect("plan");
        assert_eq!(plan.groups.len(), 1);
        assert_eq!(plan.groups[0].group_id, "main");
        assert_eq!(plan.groups[0].items[0].item_id, "claude");
    }

    #[test]
    fn should_skip_disabled_clis() {
        let mut config = AppConfig::default();
        config.toggles.claude = false;
        let plan = build_context_menu_plan(&config).expect("plan");
        assert!(!plan.groups[0]
            .items
            .iter()
            .any(|item| item.item_id == "claude"));
        assert!(!plan.groups[0]
            .items
            .iter()
            .any(|item| item.item_id == "claude_skip_permissions"));
    }

    #[test]
    fn should_return_empty_plan_when_context_menu_disabled() {
        let mut config = AppConfig::default();
        config.enable_context_menu = false;
        let plan = build_context_menu_plan(&config).expect("plan");
        assert!(plan.groups.is_empty());
    }

    #[test]
    fn should_assign_brand_icon_paths_to_child_items() {
        let config = AppConfig::default();
        let plan = build_context_menu_plan(&config).expect("plan");
        let claude = plan.groups[0]
            .items
            .iter()
            .find(|item| item.item_id == "claude")
            .expect("claude item");
        assert!(claude
            .icon
            .as_deref()
            .unwrap_or_default()
            .replace('/', "\\")
            .ends_with("context-menu-icons\\claude.ico"));
    }

    #[test]
    fn should_share_kimi_brand_icon_path_with_kimi_web() {
        let config = AppConfig::default();
        let plan = build_context_menu_plan(&config).expect("plan");
        let kimi = plan.groups[0]
            .items
            .iter()
            .find(|item| item.item_id == "kimi")
            .and_then(|item| item.icon.clone())
            .expect("kimi icon");
        let kimi_web = plan.groups[0]
            .items
            .iter()
            .find(|item| item.item_id == "kimi_web")
            .and_then(|item| item.icon.clone())
            .expect("kimi_web icon");
        assert_eq!(kimi, kimi_web);
    }

    #[test]
    fn should_append_fixed_launch_modes_after_parent_item() {
        let config = AppConfig::default();
        let plan = build_context_menu_plan(&config).expect("plan");
        let item_ids = plan.groups[0]
            .items
            .iter()
            .map(|item| item.item_id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(
            item_ids[..6],
            [
                "claude",
                "claude_skip_permissions",
                "codex",
                "codex_yolo",
                "gemini",
                "gemini_yolo"
            ]
        );
    }

    #[test]
    fn should_build_fixed_launch_mode_commands_with_expected_args() {
        let config = AppConfig::default();
        let plan = build_context_menu_plan(&config).expect("plan");
        let claude = plan.groups[0]
            .items
            .iter()
            .find(|item| item.item_id == "claude_skip_permissions")
            .expect("claude fixed launch mode");
        let gemini = plan.groups[0]
            .items
            .iter()
            .find(|item| item.item_id == "gemini_yolo")
            .expect("gemini fixed launch mode");
        let codex = plan.groups[0]
            .items
            .iter()
            .find(|item| item.item_id == "codex_yolo")
            .expect("codex fixed launch mode");

        assert_eq!(claude.cli_command, "claude --dangerously-skip-permissions");
        assert!(claude
            .final_command
            .contains("claude --dangerously-skip-permissions"));
        assert_eq!(gemini.cli_command, "gemini --yolo");
        assert!(gemini.final_command.contains("gemini --yolo"));
        assert_eq!(codex.cli_command, "codex --yolo");
        assert!(codex.final_command.contains("codex --yolo"));
    }

    #[test]
    fn should_inherit_parent_icon_for_fixed_launch_modes() {
        let config = AppConfig::default();
        let plan = build_context_menu_plan(&config).expect("plan");
        let parent_icon = plan.groups[0]
            .items
            .iter()
            .find(|item| item.item_id == "claude")
            .and_then(|item| item.icon.clone())
            .expect("claude icon");
        let child_icon = plan.groups[0]
            .items
            .iter()
            .find(|item| item.item_id == "claude_skip_permissions")
            .and_then(|item| item.icon.clone())
            .expect("claude child icon");

        assert_eq!(parent_icon, child_icon);
    }

    #[test]
    fn should_skip_undetected_clis_when_building_plan_for_detected_statuses() {
        let config = AppConfig::default();
        let statuses = detected_statuses_for(&["claude", "codex"]);
        let filtered = filter_config_by_detected_clis(&config, &statuses);
        let plan = build_context_menu_plan(&filtered).expect("plan");

        let item_ids = plan.groups[0]
            .items
            .iter()
            .map(|item| item.item_id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(
            item_ids,
            vec!["claude", "claude_skip_permissions", "codex", "codex_yolo"]
        );
    }

    #[test]
    fn should_keep_menu_title_and_custom_cli_name_when_filtering_by_detected_status() {
        let mut config = AppConfig::default();
        config.menu_title = "我的 AI CLIs".to_string();
        config.display_names.codex = "OpenAI Codex".to_string();
        config.fixed_launch_modes.codex_yolo.display_name = "Codex (YOLO Fast)".to_string();
        let statuses = detected_statuses_for(&["codex"]);

        let filtered = filter_config_by_detected_clis(&config, &statuses);
        let plan = build_context_menu_plan(&filtered).expect("plan");

        assert_eq!(plan.groups[0].title, "我的 AI CLIs");
        assert_eq!(plan.groups[0].items.len(), 2);
        assert_eq!(plan.groups[0].items[0].item_id, "codex");
        assert_eq!(plan.groups[0].items[0].title, "OpenAI Codex");
        assert_eq!(plan.groups[0].items[1].item_id, "codex_yolo");
        assert_eq!(plan.groups[0].items[1].title, "Codex (YOLO Fast)");
    }

    #[test]
    fn should_return_empty_plan_when_no_detected_cli_is_enabled() {
        let config = AppConfig::default();
        let statuses = empty_detected_statuses();
        let filtered = filter_config_by_detected_clis(&config, &statuses);
        let plan = build_context_menu_plan(&filtered).expect("plan");
        assert!(plan.groups.is_empty());
    }
}
