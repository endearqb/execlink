use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub type AppResult<T> = Result<T, String>;
pub const CONFIG_VERSION: u32 = 8;
const APP_DIR_NAME: &str = "execlink";
const LEGACY_APP_DIR_NAME: &str = "AI-CLI-Switch";
const KNOWN_CLI_KEYS: [&str; 7] = [
    "claude",
    "codex",
    "gemini",
    "kimi",
    "kimi_web",
    "qwencode",
    "opencode",
];

pub fn default_cli_order() -> Vec<String> {
    KNOWN_CLI_KEYS
        .iter()
        .map(|key| key.to_string())
        .collect::<Vec<_>>()
}

pub fn is_known_cli_key(key: &str) -> bool {
    KNOWN_CLI_KEYS.contains(&key)
}

fn now_epoch_seconds() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TerminalMode {
    Auto,
    Pwsh,
    Powershell,
    Wt,
}

impl TerminalMode {
    pub fn as_str(self) -> &'static str {
        match self {
            TerminalMode::Auto => "auto",
            TerminalMode::Pwsh => "pwsh",
            TerminalMode::Powershell => "powershell",
            TerminalMode::Wt => "wt",
        }
    }
}

impl Default for TerminalMode {
    fn default() -> Self {
        Self::Wt
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TerminalThemeMode {
    Auto,
    Dark,
    Light,
}

impl TerminalThemeMode {
    pub fn as_str(self) -> &'static str {
        match self {
            TerminalThemeMode::Auto => "auto",
            TerminalThemeMode::Dark => "dark",
            TerminalThemeMode::Light => "light",
        }
    }
}

impl Default for TerminalThemeMode {
    fn default() -> Self {
        Self::Auto
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PsPromptStyle {
    Basic,
    None,
}

impl PsPromptStyle {
    pub fn as_str(self) -> &'static str {
        match self {
            PsPromptStyle::Basic => "basic",
            PsPromptStyle::None => "none",
        }
    }
}

impl Default for PsPromptStyle {
    fn default() -> Self {
        Self::Basic
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    pub version: u32,
    pub enable_context_menu: bool,
    pub menu_title: String,
    pub cli_order: Vec<String>,
    pub display_names: CliDisplayNames,
    pub show_nilesoft_default_menus: bool,
    pub terminal_mode: TerminalMode,
    pub terminal_theme_id: String,
    pub terminal_theme_mode: TerminalThemeMode,
    pub ps_prompt_style: PsPromptStyle,
    pub advanced_menu_mode: bool,
    pub menu_theme_enabled: bool,
    // Backward-compatibility field kept for legacy config migration.
    pub use_windows_terminal: bool,
    pub no_exit: bool,
    pub toggles: CliToggles,
    pub runtime: RuntimeState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct CliToggles {
    pub claude: bool,
    pub codex: bool,
    pub gemini: bool,
    pub kimi: bool,
    pub kimi_web: bool,
    pub qwencode: bool,
    pub opencode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct CliDisplayNames {
    pub claude: String,
    pub codex: String,
    pub gemini: String,
    pub kimi: String,
    pub kimi_web: String,
    pub qwencode: String,
    pub opencode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct RuntimeState {
    pub last_apply_at: Option<String>,
    pub last_activate_at: Option<String>,
    pub last_error: Option<String>,
}

impl Default for RuntimeState {
    fn default() -> Self {
        Self {
            last_apply_at: None,
            last_activate_at: None,
            last_error: None,
        }
    }
}

impl Default for CliToggles {
    fn default() -> Self {
        Self {
            claude: true,
            codex: true,
            gemini: true,
            kimi: true,
            kimi_web: true,
            qwencode: true,
            opencode: true,
        }
    }
}

impl Default for CliDisplayNames {
    fn default() -> Self {
        Self {
            claude: "Claude Code".to_string(),
            codex: "Codex".to_string(),
            gemini: "Gemini".to_string(),
            kimi: "Kimi".to_string(),
            kimi_web: "Kimi Web".to_string(),
            qwencode: "Qwen Code".to_string(),
            opencode: "OpenCode".to_string(),
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            enable_context_menu: true,
            menu_title: "AI CLIs".to_string(),
            cli_order: default_cli_order(),
            display_names: CliDisplayNames::default(),
            show_nilesoft_default_menus: false,
            terminal_mode: TerminalMode::Wt,
            terminal_theme_id: "vscode-dark-plus".to_string(),
            terminal_theme_mode: TerminalThemeMode::Auto,
            ps_prompt_style: PsPromptStyle::Basic,
            advanced_menu_mode: false,
            menu_theme_enabled: false,
            use_windows_terminal: true,
            no_exit: true,
            toggles: CliToggles::default(),
            runtime: RuntimeState::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CliStatusMap {
    pub claude: bool,
    pub codex: bool,
    pub gemini: bool,
    pub kimi: bool,
    pub kimi_web: bool,
    pub qwencode: bool,
    pub opencode: bool,
    pub pwsh: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallStatus {
    pub installed: bool,
    pub registered: bool,
    pub needs_elevation: bool,
    pub message: String,
    pub shell_exe: Option<String>,
    pub config_root: Option<String>,
}

impl InstallStatus {
    pub fn not_installed(message: impl Into<String>) -> Self {
        Self {
            installed: false,
            registered: false,
            needs_elevation: false,
            message: message.into(),
            shell_exe: None,
            config_root: None,
        }
    }

    pub fn installed_unregistered(
        message: impl Into<String>,
        shell_exe: Option<String>,
        config_root: Option<String>,
        needs_elevation: bool,
    ) -> Self {
        Self {
            installed: true,
            registered: false,
            needs_elevation,
            message: message.into(),
            shell_exe,
            config_root,
        }
    }

    pub fn ready(
        message: impl Into<String>,
        shell_exe: Option<String>,
        config_root: Option<String>,
    ) -> Self {
        Self {
            installed: true,
            registered: true,
            needs_elevation: false,
            message: message.into(),
            shell_exe,
            config_root,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ActionResult {
    pub ok: bool,
    pub code: String,
    pub message: String,
    pub detail: Option<String>,
}

impl ActionResult {
    pub fn ok(message: impl Into<String>) -> Self {
        Self {
            ok: true,
            code: "ok".to_string(),
            message: message.into(),
            detail: None,
        }
    }

    pub fn ok_with_code(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            ok: true,
            code: code.into(),
            message: message.into(),
            detail: None,
        }
    }

    pub fn err(
        code: impl Into<String>,
        message: impl Into<String>,
        detail: impl Into<String>,
    ) -> Self {
        Self {
            ok: false,
            code: code.into(),
            message: message.into(),
            detail: Some(detail.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct InitialState {
    pub config: AppConfig,
    pub cli_status: CliStatusMap,
    pub install_status: InstallStatus,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiagnosticsInfo {
    pub generated_at: String,
    pub app_version: String,
    pub build_channel: String,
    pub app_root: Option<String>,
    pub install_root: Option<String>,
    pub shell_exe: Option<String>,
    pub effective_config_root: Option<String>,
    pub resource_zip_path: Option<String>,
    pub install_status: InstallStatus,
    pub config_version: u32,
    pub runtime: RuntimeState,
    pub terminal_mode_requested: String,
    pub terminal_mode_effective: String,
    pub terminal_fallback_reason: Option<String>,
    pub terminal_menu_mode: String,
    pub terminal_menu_theme_applied: bool,
    pub terminal_install_theme_applied: bool,
    pub terminal_theme_id: String,
    pub terminal_theme_mode: String,
    pub terminal_prompt_style: String,
    pub terminal_wt_available: bool,
    pub terminal_pwsh_available: bool,
    pub terminal_powershell_available: bool,
    pub log_path: Option<String>,
    pub log_tail: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CliInstallHint {
    pub key: String,
    pub display_name: String,
    pub install_command: String,
    pub upgrade_command: Option<String>,
    pub uninstall_command: String,
    pub auth_command: Option<String>,
    pub verify_command: Option<String>,
    pub requires_oauth: bool,
    pub docs_url: String,
    pub official_domain: String,
    pub publisher: String,
    pub risk_remote_script: bool,
    pub requires_node: bool,
    pub wsl_recommended: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallPrereqStatus {
    pub node: bool,
    pub npm: bool,
    pub pwsh: bool,
    pub winget: bool,
    pub wsl: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InstallLaunchRequest {
    pub key: String,
    pub confirmed_remote_script: bool,
}

fn local_app_data_dir() -> AppResult<PathBuf> {
    let local =
        env::var("LOCALAPPDATA").map_err(|_| "无法读取 LOCALAPPDATA 环境变量".to_string())?;
    Ok(PathBuf::from(local))
}

pub fn legacy_app_root_dir() -> AppResult<PathBuf> {
    Ok(local_app_data_dir()?.join(LEGACY_APP_DIR_NAME))
}

fn current_app_root_dir() -> AppResult<PathBuf> {
    Ok(local_app_data_dir()?.join(APP_DIR_NAME))
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> AppResult<()> {
    fs::create_dir_all(dest).map_err(|e| format!("创建目录失败: {e}"))?;
    let entries = fs::read_dir(src).map_err(|e| format!("读取目录失败: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {e}"))?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|e| format!("读取文件类型失败: {e}"))?;
        if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else {
            fs::copy(&src_path, &dest_path).map_err(|e| format!("复制文件失败: {e}"))?;
        }
    }
    Ok(())
}

fn try_migrate_legacy_root(legacy_root: &Path, current_root: &Path) -> AppResult<()> {
    match fs::rename(legacy_root, current_root) {
        Ok(_) => Ok(()),
        Err(rename_error) => {
            copy_dir_recursive(legacy_root, current_root).map_err(|copy_error| {
                format!("旧目录迁移失败(rename={rename_error}; copy={copy_error})")
            })?;
            fs::remove_dir_all(legacy_root).map_err(|e| format!("删除旧目录失败: {e}"))?;
            Ok(())
        }
    }
}

pub fn app_root_dir() -> AppResult<PathBuf> {
    let current_root = current_app_root_dir()?;
    if current_root.exists() {
        return Ok(current_root);
    }

    let legacy_root = legacy_app_root_dir()?;
    if !legacy_root.exists() {
        return Ok(current_root);
    }

    if try_migrate_legacy_root(&legacy_root, &current_root).is_ok() {
        return Ok(current_root);
    }

    Ok(legacy_root)
}

pub fn nilesoft_root_dir() -> AppResult<PathBuf> {
    Ok(app_root_dir()?.join("nilesoft-shell"))
}

pub fn logs_dir() -> AppResult<PathBuf> {
    Ok(app_root_dir()?.join("logs"))
}

pub fn app_config_path() -> AppResult<PathBuf> {
    Ok(app_root_dir()?.join("config.json"))
}

fn normalize_text_field(value: &mut String, fallback: &str) {
    if value.trim().is_empty() {
        *value = fallback.to_string();
    }
}

fn normalize_display_names(display_names: &mut CliDisplayNames) {
    normalize_text_field(&mut display_names.claude, "Claude Code");
    normalize_text_field(&mut display_names.codex, "Codex");
    normalize_text_field(&mut display_names.gemini, "Gemini");
    normalize_text_field(&mut display_names.kimi, "Kimi");
    normalize_text_field(&mut display_names.kimi_web, "Kimi Web");
    normalize_text_field(&mut display_names.qwencode, "Qwen Code");
    normalize_text_field(&mut display_names.opencode, "OpenCode");
}

fn normalize_cli_order(cli_order: &mut Vec<String>) {
    let mut seen = HashSet::new();
    let mut normalized = Vec::with_capacity(KNOWN_CLI_KEYS.len());

    for key in cli_order.iter() {
        if !is_known_cli_key(key.as_str()) {
            continue;
        }
        if seen.insert(key.clone()) {
            normalized.push(key.clone());
        }
    }

    for key in KNOWN_CLI_KEYS {
        let key = key.to_string();
        if seen.insert(key.clone()) {
            normalized.push(key);
        }
    }

    *cli_order = normalized;
}

fn normalize_config(mut config: AppConfig) -> AppConfig {
    if config.version < 3 {
        config.toggles.kimi_web = true;
    }
    if config.version < 6 {
        config.toggles.qwencode = true;
        config.toggles.opencode = true;
    }
    if config.version < 7 {
        config.terminal_mode = if config.use_windows_terminal {
            TerminalMode::Wt
        } else {
            TerminalMode::Auto
        };
        config.terminal_theme_id = "vscode-dark-plus".to_string();
        config.terminal_theme_mode = TerminalThemeMode::Auto;
        config.ps_prompt_style = PsPromptStyle::Basic;
    }
    if config.version < 8 {
        config.advanced_menu_mode = false;
        config.menu_theme_enabled = false;
    }
    normalize_text_field(&mut config.menu_title, "AI CLIs");
    normalize_text_field(&mut config.terminal_theme_id, "vscode-dark-plus");
    normalize_cli_order(&mut config.cli_order);
    normalize_display_names(&mut config.display_names);
    if config.version < 4 {
        config.show_nilesoft_default_menus = false;
    }
    config.show_nilesoft_default_menus = false;
    config.no_exit = true;
    config.advanced_menu_mode = false;
    config.menu_theme_enabled = false;
    config.use_windows_terminal = matches!(config.terminal_mode, TerminalMode::Wt);
    if config.version == 0 || config.version < CONFIG_VERSION {
        config.version = CONFIG_VERSION;
    }
    config
}

pub fn load_app_config() -> AppConfig {
    let path = match app_config_path() {
        Ok(value) => value,
        Err(_) => return AppConfig::default(),
    };

    if !path.exists() {
        return AppConfig::default();
    }

    let text = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(_) => return AppConfig::default(),
    };

    let parsed = serde_json::from_str::<AppConfig>(&text).unwrap_or_default();
    normalize_config(parsed)
}

pub fn save_app_config(config: &AppConfig) -> AppResult<()> {
    let root = app_root_dir()?;
    fs::create_dir_all(&root).map_err(|e| format!("创建应用目录失败: {e}"))?;

    let path = app_config_path()?;
    let normalized = normalize_config(config.clone());
    let text =
        serde_json::to_string_pretty(&normalized).map_err(|e| format!("序列化配置失败: {e}"))?;
    fs::write(path, text).map_err(|e| format!("写入配置失败: {e}"))?;
    Ok(())
}

fn mutate_runtime_state<F>(mutator: F) -> AppResult<()>
where
    F: FnOnce(&mut RuntimeState),
{
    let mut config = load_app_config();
    mutator(&mut config.runtime);
    save_app_config(&config)
}

pub fn mark_apply_success() -> AppResult<()> {
    mutate_runtime_state(|runtime| {
        runtime.last_apply_at = Some(now_epoch_seconds());
        runtime.last_error = None;
    })
}

pub fn mark_activate_success() -> AppResult<()> {
    mutate_runtime_state(|runtime| {
        runtime.last_activate_at = Some(now_epoch_seconds());
        runtime.last_error = None;
    })
}

pub fn mark_runtime_error(error: impl Into<String>) -> AppResult<()> {
    let detail = error.into();
    mutate_runtime_state(|runtime| {
        runtime.last_error = Some(detail);
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_migrate_v1_config_to_latest_defaults() {
        let mut cfg = AppConfig::default();
        cfg.version = 1;
        cfg.use_windows_terminal = false;
        cfg.menu_title = "   ".to_string();
        cfg.display_names.kimi_web = "".to_string();
        cfg.display_names.qwencode = "".to_string();
        cfg.display_names.opencode = "".to_string();
        cfg.show_nilesoft_default_menus = true;
        cfg.toggles.kimi_web = false;
        cfg.toggles.qwencode = false;
        cfg.toggles.opencode = false;
        cfg.cli_order = vec!["codex".to_string(), "gemini".to_string(), "codex".to_string()];

        let normalized = normalize_config(cfg);
        assert_eq!(normalized.version, CONFIG_VERSION);
        assert_eq!(normalized.menu_title, "AI CLIs");
        assert_eq!(normalized.display_names.kimi_web, "Kimi Web");
        assert_eq!(normalized.display_names.qwencode, "Qwen Code");
        assert_eq!(normalized.display_names.opencode, "OpenCode");
        assert_eq!(normalized.terminal_mode, TerminalMode::Auto);
        assert_eq!(normalized.terminal_theme_id, "vscode-dark-plus");
        assert_eq!(normalized.terminal_theme_mode, TerminalThemeMode::Auto);
        assert_eq!(normalized.ps_prompt_style, PsPromptStyle::Basic);
        assert!(!normalized.advanced_menu_mode);
        assert!(!normalized.menu_theme_enabled);
        assert!(!normalized.show_nilesoft_default_menus);
        assert!(normalized.toggles.kimi_web);
        assert!(normalized.toggles.qwencode);
        assert!(normalized.toggles.opencode);
        assert_eq!(normalized.terminal_mode, TerminalMode::Auto);
        assert_eq!(normalized.terminal_theme_id, "vscode-dark-plus");
        assert_eq!(normalized.terminal_theme_mode, TerminalThemeMode::Auto);
        assert_eq!(normalized.ps_prompt_style, PsPromptStyle::Basic);
        assert!(!normalized.advanced_menu_mode);
        assert!(!normalized.menu_theme_enabled);
        assert_eq!(
            normalized.cli_order,
            vec![
                "codex".to_string(),
                "gemini".to_string(),
                "claude".to_string(),
                "kimi".to_string(),
                "kimi_web".to_string(),
                "qwencode".to_string(),
                "opencode".to_string()
            ]
        );
    }

    #[test]
    fn should_keep_kimi_web_toggle_for_v3_and_above() {
        let mut cfg = AppConfig::default();
        cfg.version = 3;
        cfg.toggles.kimi_web = false;
        cfg.toggles.qwencode = false;
        cfg.toggles.opencode = false;
        cfg.cli_order = vec![
            "opencode".to_string(),
            "qwencode".to_string(),
            "gemini".to_string(),
            "gemini".to_string(),
        ];
        cfg.show_nilesoft_default_menus = true;

        let normalized = normalize_config(cfg);
        assert_eq!(normalized.version, CONFIG_VERSION);
        assert!(!normalized.toggles.kimi_web);
        assert!(normalized.toggles.qwencode);
        assert!(normalized.toggles.opencode);
        assert_eq!(
            normalized.cli_order,
            vec![
                "opencode".to_string(),
                "qwencode".to_string(),
                "gemini".to_string(),
                "claude".to_string(),
                "codex".to_string(),
                "kimi".to_string(),
                "kimi_web".to_string()
            ]
        );
        assert!(!normalized.show_nilesoft_default_menus);
    }

    #[test]
    fn should_fill_missing_fields_from_legacy_json() {
        let legacy = r#"{
            "version": 2,
            "menu_title": "",
            "display_names": {
                "claude": "",
                "codex": "",
                "gemini": "",
                "kimi": ""
            },
            "toggles": {
                "claude": true,
                "codex": true,
                "gemini": false,
                "kimi": true
            }
        }"#;

        let parsed = serde_json::from_str::<AppConfig>(legacy).unwrap();
        let normalized = normalize_config(parsed);

        assert_eq!(normalized.version, CONFIG_VERSION);
        assert_eq!(normalized.menu_title, "AI CLIs");
        assert_eq!(normalized.display_names.claude, "Claude Code");
        assert_eq!(normalized.display_names.kimi_web, "Kimi Web");
        assert_eq!(normalized.display_names.qwencode, "Qwen Code");
        assert_eq!(normalized.display_names.opencode, "OpenCode");
        assert_eq!(normalized.terminal_mode, TerminalMode::Wt);
        assert_eq!(normalized.terminal_theme_id, "vscode-dark-plus");
        assert_eq!(normalized.terminal_theme_mode, TerminalThemeMode::Auto);
        assert_eq!(normalized.ps_prompt_style, PsPromptStyle::Basic);
        assert!(!normalized.advanced_menu_mode);
        assert!(!normalized.menu_theme_enabled);
        assert!(normalized.toggles.kimi_web);
        assert!(normalized.toggles.qwencode);
        assert!(normalized.toggles.opencode);
        assert_eq!(normalized.cli_order, default_cli_order());
        assert!(!normalized.show_nilesoft_default_menus);
    }
}
