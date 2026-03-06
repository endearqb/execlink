use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub type AppResult<T> = Result<T, String>;
pub const CONFIG_VERSION: u32 = 10;
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum UvInstallSourceMode {
    Auto,
    Official,
    Tuna,
    Aliyun,
}

impl Default for UvInstallSourceMode {
    fn default() -> Self {
        Self::Auto
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct InstallTimeoutConfig {
    pub terminal_script_timeout_ms: u32,
    pub install_recheck_timeout_ms: u32,
    pub quick_setup_detect_timeout_ms: u32,
    pub mirror_probe_timeout_ms: u32,
    pub python_runtime_check_timeout_ms: u32,
    pub winget_install_recheck_timeout_ms: u32,
}

impl Default for InstallTimeoutConfig {
    fn default() -> Self {
        Self {
            terminal_script_timeout_ms: 10 * 60 * 1000,
            install_recheck_timeout_ms: 10 * 60 * 1000,
            quick_setup_detect_timeout_ms: 5 * 60 * 1000,
            mirror_probe_timeout_ms: 20 * 1000,
            python_runtime_check_timeout_ms: 15 * 1000,
            winget_install_recheck_timeout_ms: 3 * 60 * 1000,
        }
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
    pub terminal_mode: TerminalMode,
    pub terminal_theme_id: String,
    pub terminal_theme_mode: TerminalThemeMode,
    pub ps_prompt_style: PsPromptStyle,
    pub uv_install_source_mode: UvInstallSourceMode,
    pub install_timeouts: InstallTimeoutConfig,
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
            terminal_mode: TerminalMode::Wt,
            terminal_theme_id: "vscode-dark-plus".to_string(),
            terminal_theme_mode: TerminalThemeMode::Auto,
            ps_prompt_style: PsPromptStyle::Basic,
            uv_install_source_mode: UvInstallSourceMode::Auto,
            install_timeouts: InstallTimeoutConfig::default(),
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
    pub context_menu_status: ContextMenuStatus,
    pub win11_classic_menu_status: Win11ClassicMenuStatus,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiagnosticsInfo {
    pub generated_at: String,
    pub app_version: String,
    pub build_channel: String,
    pub app_root: Option<String>,
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
    pub context_menu_status: ContextMenuStatus,
    pub win11_classic_menu_status: Win11ClassicMenuStatus,
    pub installed_menu_groups: Vec<InstalledMenuGroup>,
    pub legacy_artifacts: Vec<LegacyArtifact>,
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
pub struct CliUserPathStatus {
    pub key: String,
    pub command_dir: Option<String>,
    pub needs_user_path_fix: bool,
    pub add_user_path_command: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallPrereqStatus {
    pub git: bool,
    pub node: bool,
    pub npm: bool,
    pub uv: bool,
    pub pwsh: bool,
    pub winget: bool,
    pub wsl: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PowerShellPs1PolicyStatus {
    pub blocked: bool,
    pub effective_policy: String,
    pub fix_command: String,
    pub detail: Option<String>,
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

fn clamp_timeout(value: u32, min: u32, max: u32) -> u32 {
    value.clamp(min, max)
}

fn normalize_install_timeouts(timeouts: &mut InstallTimeoutConfig) {
    // Keep timeout values within a safe, UI-friendly range.
    timeouts.terminal_script_timeout_ms =
        clamp_timeout(timeouts.terminal_script_timeout_ms, 30_000, 30 * 60 * 1000);
    timeouts.install_recheck_timeout_ms =
        clamp_timeout(timeouts.install_recheck_timeout_ms, 60_000, 30 * 60 * 1000);
    timeouts.quick_setup_detect_timeout_ms =
        clamp_timeout(timeouts.quick_setup_detect_timeout_ms, 60_000, 30 * 60 * 1000);
    timeouts.mirror_probe_timeout_ms =
        clamp_timeout(timeouts.mirror_probe_timeout_ms, 5_000, 120_000);
    timeouts.python_runtime_check_timeout_ms =
        clamp_timeout(timeouts.python_runtime_check_timeout_ms, 5_000, 180_000);
    timeouts.winget_install_recheck_timeout_ms =
        clamp_timeout(timeouts.winget_install_recheck_timeout_ms, 60_000, 15 * 60 * 1000);
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
    normalize_text_field(&mut config.menu_title, "AI CLIs");
    normalize_text_field(&mut config.terminal_theme_id, "vscode-dark-plus");
    normalize_cli_order(&mut config.cli_order);
    normalize_display_names(&mut config.display_names);
    normalize_install_timeouts(&mut config.install_timeouts);
    config.no_exit = true;
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
        assert!(normalized.toggles.kimi_web);
        assert!(normalized.toggles.qwencode);
        assert!(normalized.toggles.opencode);
        assert_eq!(normalized.terminal_mode, TerminalMode::Auto);
        assert_eq!(normalized.terminal_theme_id, "vscode-dark-plus");
        assert_eq!(normalized.terminal_theme_mode, TerminalThemeMode::Auto);
        assert_eq!(normalized.ps_prompt_style, PsPromptStyle::Basic);
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
        assert!(normalized.toggles.kimi_web);
        assert!(normalized.toggles.qwencode);
        assert!(normalized.toggles.opencode);
        assert_eq!(normalized.cli_order, default_cli_order());
    }

    #[test]
    fn should_migrate_v8_config_and_fill_new_uv_timeout_fields() {
        let legacy_v8 = r#"{
            "version": 8,
            "menu_title": "AI CLIs",
            "terminal_mode": "wt",
            "display_names": {
                "claude": "Claude Code",
                "codex": "Codex",
                "gemini": "Gemini",
                "kimi": "Kimi",
                "kimi_web": "Kimi Web",
                "qwencode": "Qwen Code",
                "opencode": "OpenCode"
            },
            "toggles": {
                "claude": true,
                "codex": true,
                "gemini": true,
                "kimi": true,
                "kimi_web": true,
                "qwencode": true,
                "opencode": true
            }
        }"#;

        let parsed = serde_json::from_str::<AppConfig>(legacy_v8).unwrap();
        let normalized = normalize_config(parsed);
        assert_eq!(normalized.version, CONFIG_VERSION);
        assert_eq!(normalized.uv_install_source_mode, UvInstallSourceMode::Auto);
        assert_eq!(normalized.install_timeouts.terminal_script_timeout_ms, 10 * 60 * 1000);
        assert_eq!(normalized.install_timeouts.install_recheck_timeout_ms, 10 * 60 * 1000);
        assert_eq!(normalized.install_timeouts.quick_setup_detect_timeout_ms, 5 * 60 * 1000);
        assert_eq!(normalized.install_timeouts.mirror_probe_timeout_ms, 20 * 1000);
        assert_eq!(normalized.install_timeouts.python_runtime_check_timeout_ms, 15 * 1000);
        assert_eq!(
            normalized.install_timeouts.winget_install_recheck_timeout_ms,
            3 * 60 * 1000
        );
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextMenuStatus {
    pub applied: bool,
    pub enabled_roots: Vec<String>,
    pub has_legacy_artifacts: bool,
    pub requires_manual_refresh: bool,
    pub current_group_id: Option<String>,
    pub current_group_title: Option<String>,
    pub message: String,
}

impl ContextMenuStatus {
    pub fn empty(message: impl Into<String>) -> Self {
        Self {
            applied: false,
            enabled_roots: Vec::new(),
            has_legacy_artifacts: false,
            requires_manual_refresh: false,
            current_group_id: None,
            current_group_title: None,
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Win11ClassicMenuStatus {
    pub enabled: bool,
    pub registry_path: String,
    pub restart_recommended: bool,
    pub message: String,
}

impl Win11ClassicMenuStatus {
    pub fn empty(message: impl Into<String>) -> Self {
        Self {
            enabled: false,
            registry_path:
                r"HKCU\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32"
                    .to_string(),
            restart_recommended: true,
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledMenuGroup {
    pub group_id: String,
    pub title: String,
    pub roots: Vec<String>,
    pub item_ids: Vec<String>,
    pub schema_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyArtifact {
    pub path: String,
    pub title: String,
    pub root: String,
    pub reason: String,
}
