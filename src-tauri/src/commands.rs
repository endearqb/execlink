use std::{
    collections::BTreeMap,
    fs,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;

use crate::{
    detect, explorer, logging, nilesoft, nilesoft_install, terminal,
    state::{
        self, ActionResult, AppConfig, CliInstallHint, CliStatusMap, DiagnosticsInfo, InitialState,
        InstallLaunchRequest, InstallPrereqStatus, InstallStatus,
    },
};

const CLEANUP_CONFIRM_TOKEN: &str = "CONFIRM_CLEANUP_EXECLINK";
const ALLOWED_DOCS_DOMAINS: [&str; 7] = [
    "code.claude.com",
    "developers.openai.com",
    "google-gemini.github.io",
    "moonshotai.github.io",
    "qwenlm.github.io",
    "opencode.ai",
    "nodejs.org",
];
const NODEJS_DOWNLOAD_URL: &str = "https://nodejs.org/zh-cn/download";

#[derive(Debug, Clone, Copy)]
struct CliInstallProfile {
    key: &'static str,
    display_name: &'static str,
    install_command: &'static str,
    docs_url: &'static str,
    official_domain: &'static str,
    publisher: &'static str,
    risk_remote_script: bool,
    requires_node: bool,
    wsl_recommended: bool,
}

const CLI_INSTALL_PROFILES: [CliInstallProfile; 7] = [
    CliInstallProfile {
        key: "claude",
        display_name: "Claude Code",
        install_command: "irm https://claude.ai/install.ps1 | iex",
        docs_url: "https://code.claude.com/docs/en/quickstart",
        official_domain: "claude.ai",
        publisher: "Anthropic",
        risk_remote_script: true,
        requires_node: false,
        wsl_recommended: false,
    },
    CliInstallProfile {
        key: "codex",
        display_name: "Codex",
        install_command: "npm install -g @openai/codex",
        docs_url: "https://developers.openai.com/codex/cli",
        official_domain: "developers.openai.com",
        publisher: "OpenAI",
        risk_remote_script: false,
        requires_node: true,
        wsl_recommended: true,
    },
    CliInstallProfile {
        key: "gemini",
        display_name: "Gemini CLI",
        install_command: "npm install -g @google/gemini-cli",
        docs_url: "https://google-gemini.github.io/gemini-cli/",
        official_domain: "google-gemini.github.io",
        publisher: "Google",
        risk_remote_script: false,
        requires_node: true,
        wsl_recommended: false,
    },
    CliInstallProfile {
        key: "kimi",
        display_name: "Kimi",
        install_command: "Invoke-RestMethod https://code.kimi.com/install.ps1 | Invoke-Expression",
        docs_url: "https://moonshotai.github.io/kimi-cli/en/guides/getting-started.html",
        official_domain: "code.kimi.com",
        publisher: "Moonshot AI",
        risk_remote_script: true,
        requires_node: false,
        wsl_recommended: false,
    },
    CliInstallProfile {
        key: "kimi_web",
        display_name: "Kimi Web",
        install_command: "Invoke-RestMethod https://code.kimi.com/install.ps1 | Invoke-Expression",
        docs_url: "https://moonshotai.github.io/kimi-cli/en/guides/getting-started.html",
        official_domain: "code.kimi.com",
        publisher: "Moonshot AI",
        risk_remote_script: true,
        requires_node: false,
        wsl_recommended: false,
    },
    CliInstallProfile {
        key: "qwencode",
        display_name: "Qwen Code",
        install_command: "npm install -g @qwen-code/qwen-code@latest",
        docs_url: "https://qwenlm.github.io/qwen-code-docs/getting-started/quickstart.html",
        official_domain: "qwenlm.github.io",
        publisher: "Qwen Team",
        risk_remote_script: false,
        requires_node: true,
        wsl_recommended: false,
    },
    CliInstallProfile {
        key: "opencode",
        display_name: "OpenCode",
        install_command: "npm install -g opencode-ai",
        docs_url: "https://opencode.ai/docs/cli/",
        official_domain: "opencode.ai",
        publisher: "SST",
        risk_remote_script: false,
        requires_node: true,
        wsl_recommended: true,
    },
];

fn now_epoch_seconds() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn ensure_install_ready(action: &str) -> Result<(PathBuf, PathBuf, InstallStatus), ActionResult> {
    let install = nilesoft_install::inspect_installation();
    if !install.installed {
        return Err(ActionResult::err(
            "install_required",
            format!("{action}失败"),
            "未检测到 Nilesoft，请先执行“安装/修复 Nilesoft”",
        ));
    }
    if !install.registered {
        return Err(ActionResult::err(
            "register_required",
            format!("{action}失败"),
            "Nilesoft 尚未完成注册，请先执行提权重试",
        ));
    }

    let install_root = nilesoft_install::resolve_install_root().map_err(|error| {
        ActionResult::err(
            "install_root_resolve_failed",
            format!("{action}失败"),
            error,
        )
    })?;
    let shell_exe = nilesoft_install::find_shell_exe(&install_root).ok_or_else(|| {
        ActionResult::err(
            "shell_missing",
            format!("{action}失败"),
            "未找到 shell.exe，请先执行安装/修复",
        )
    })?;
    Ok((install_root, shell_exe, install))
}

fn prepare_config_for_save(mut incoming: AppConfig, persisted_runtime: state::RuntimeState) -> AppConfig {
    incoming.version = state::CONFIG_VERSION;
    // runtime 字段由后端维护，避免被前端旧状态覆盖。
    incoming.runtime = persisted_runtime;
    incoming
}

fn is_allowed_docs_url(url: &str) -> bool {
    ALLOWED_DOCS_DOMAINS.iter().any(|domain| {
        let exact = format!("https://{domain}");
        let prefix = format!("https://{domain}/");
        url == exact || url.starts_with(&prefix)
    })
}

fn cli_install_hint(profile: &CliInstallProfile) -> CliInstallHint {
    CliInstallHint {
        key: profile.key.to_string(),
        display_name: profile.display_name.to_string(),
        install_command: profile.install_command.to_string(),
        docs_url: profile.docs_url.to_string(),
        official_domain: profile.official_domain.to_string(),
        publisher: profile.publisher.to_string(),
        risk_remote_script: profile.risk_remote_script,
        requires_node: profile.requires_node,
        wsl_recommended: profile.wsl_recommended,
    }
}

fn find_cli_install_profile(key: &str) -> Option<&'static CliInstallProfile> {
    CLI_INSTALL_PROFILES
        .iter()
        .find(|profile| profile.key == key)
}

fn build_install_script(install_command: &str) -> String {
    format!(
        "$ErrorActionPreference='Continue'; {install_command}; Write-Host ''; Write-Host '安装命令已执行，请在该终端确认结果。'"
    )
}

fn launch_visible_install_terminal(launch: &terminal::SpawnLaunchCommand) -> Result<(), String> {
    let mut args = vec![
        "/C".to_string(),
        "start".to_string(),
        "".to_string(),
        launch.executable.clone(),
    ];
    args.extend(launch.args.clone());

    Command::new("cmd")
        .args(&args)
        .spawn()
        .map_err(|error| format!("拉起安装终端失败: {error}"))?;
    Ok(())
}

fn open_url_in_system_browser(url: &str) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", url])
        .spawn()
        .map_err(|error| format!("拉起系统浏览器失败: {error}"))?;
    Ok(())
}

fn filter_config_toggles_by_detection(config: &AppConfig, detected: &CliStatusMap) -> AppConfig {
    let mut filtered = config.clone();
    filtered.toggles.claude = filtered.toggles.claude && detected.claude;
    filtered.toggles.codex = filtered.toggles.codex && detected.codex;
    filtered.toggles.gemini = filtered.toggles.gemini && detected.gemini;
    filtered.toggles.kimi = filtered.toggles.kimi && detected.kimi;
    filtered.toggles.kimi_web = filtered.toggles.kimi_web && detected.kimi_web;
    filtered.toggles.qwencode = filtered.toggles.qwencode && detected.qwencode;
    filtered.toggles.opencode = filtered.toggles.opencode && detected.opencode;
    filtered
}

#[tauri::command]
pub fn get_initial_state() -> InitialState {
    let config = state::load_app_config();
    let cli_status = detect::detect_all_clis();
    let install_status = nilesoft_install::inspect_installation();

    InitialState {
        config,
        cli_status,
        install_status,
    }
}

#[tauri::command]
pub fn detect_clis() -> CliStatusMap {
    detect::detect_all_clis()
}

#[tauri::command]
pub fn get_install_prereq_status() -> InstallPrereqStatus {
    InstallPrereqStatus {
        node: detect::command_exists("node"),
        npm: detect::command_exists("npm"),
        pwsh: detect::command_exists("pwsh"),
        winget: detect::command_exists("winget"),
        wsl: detect::command_exists("wsl"),
    }
}

#[tauri::command]
pub fn launch_cli_install(request: InstallLaunchRequest) -> ActionResult {
    let Some(profile) = find_cli_install_profile(&request.key) else {
        return ActionResult::err(
            "install_profile_missing",
            "启动安装失败",
            format!("不支持的 CLI key: {}", request.key),
        );
    };

    if profile.risk_remote_script && !request.confirmed_remote_script {
        return ActionResult::err(
            "remote_script_confirmation_required",
            "启动安装失败",
            "远程脚本安装需要二次确认。",
        );
    }

    if !is_allowed_docs_url(profile.docs_url) {
        return ActionResult::err(
            "docs_domain_not_allowed",
            "启动安装失败",
            format!(
                "CLI {} 的文档域名不在白名单中: {}",
                profile.key, profile.docs_url
            ),
        );
    }

    let script = build_install_script(profile.install_command);
    let config = state::load_app_config();
    let launch_plan = terminal::build_launch_plan(&config);
    let launch = launch_plan.build_install_command(&script);
    let resolution = launch.resolution.clone();

    match launch_visible_install_terminal(&launch) {
        Ok(_) => {
            logging::log_line(&format!(
                "[install-assist] started key={} requested_terminal={} effective_terminal={} fallback={:?} theme={} install_theme_applied={} command={} risk_remote_script={}",
                profile.key,
                resolution.requested_mode,
                resolution.effective_mode,
                resolution.fallback_reason,
                launch_plan.theme_id(),
                launch_plan.install_theme_applied(),
                profile.install_command,
                profile.risk_remote_script
            ));
            let mut detail = profile.install_command.to_string();
            if let Some(reason) = resolution.fallback_reason {
                detail.push_str(&format!(
                    "\nterminal fallback: requested={} effective={} reason={reason}",
                    resolution.requested_mode, resolution.effective_mode
                ));
            }
            ActionResult {
                ok: true,
                code: "install_launch_started".to_string(),
                message: format!(
                    "已启动 {} 安装终端，请在终端中完成交互并返回本应用查看复检结果。",
                    profile.display_name
                ),
                detail: Some(detail),
            }
        }
        Err(error) => ActionResult::err("install_launch_failed", "启动安装失败", error),
    }
}

#[tauri::command]
pub fn open_install_docs(key: String) -> ActionResult {
    let Some(profile) = find_cli_install_profile(&key) else {
        return ActionResult::err(
            "install_profile_missing",
            "打开说明失败",
            format!("不支持的 CLI key: {key}"),
        );
    };

    if !is_allowed_docs_url(profile.docs_url) {
        return ActionResult::err(
            "docs_domain_not_allowed",
            "打开说明失败",
            format!("文档域名不在白名单中: {}", profile.docs_url),
        );
    }

    match open_url_in_system_browser(profile.docs_url) {
        Ok(_) => ActionResult {
            ok: true,
            code: "open_docs_started".to_string(),
            message: format!("已通过系统浏览器打开 {} 官方说明", profile.display_name),
            detail: Some(profile.docs_url.to_string()),
        },
        Err(error) => ActionResult::err("open_docs_failed", "打开说明失败", error),
    }
}

#[tauri::command]
pub fn open_nodejs_download_page() -> ActionResult {
    if !is_allowed_docs_url(NODEJS_DOWNLOAD_URL) {
        return ActionResult::err(
            "docs_domain_not_allowed",
            "打开页面失败",
            format!("文档域名不在白名单中: {NODEJS_DOWNLOAD_URL}"),
        );
    }

    match open_url_in_system_browser(NODEJS_DOWNLOAD_URL) {
        Ok(_) => ActionResult {
            ok: true,
            code: "open_docs_started".to_string(),
            message: "已通过系统浏览器打开 Node.js 下载页面".to_string(),
            detail: Some(NODEJS_DOWNLOAD_URL.to_string()),
        },
        Err(error) => ActionResult::err("open_docs_failed", "打开页面失败", error),
    }
}

#[tauri::command]
pub fn ensure_nilesoft_installed(app: AppHandle) -> Result<InstallStatus, String> {
    nilesoft_install::ensure_installed(&app)
}

#[tauri::command]
pub fn request_elevation_and_register() -> ActionResult {
    let Some(shell_exe) = nilesoft_install::locate_shell_exe() else {
        return ActionResult::err(
            "shell_missing",
            "提权注册失败",
            "未找到 shell.exe，请先执行安装",
        );
    };

    match nilesoft_install::register_elevated(&shell_exe) {
        Ok(_) => {
            nilesoft_install::mark_register_success(&shell_exe);
            ActionResult::ok("提权注册成功")
        }
        Err(error) => {
            nilesoft_install::mark_register_failure(&shell_exe, error.clone());
            let _ = state::mark_runtime_error(format!("register_elevated: {error}"));
            ActionResult::err("register_elevated_failed", "提权注册失败", error)
        }
    }
}

#[tauri::command]
pub fn attempt_unregister_nilesoft() -> ActionResult {
    let install = nilesoft_install::inspect_installation();
    if !install.installed {
        return ActionResult::err(
            "install_required",
            "恢复失败",
            "未检测到 Nilesoft，请先执行“安装/修复 Nilesoft”确认当前状态。",
        );
    }

    let Some(shell_exe) = nilesoft_install::locate_shell_exe() else {
        return ActionResult::err(
            "shell_missing",
            "恢复失败",
            "未找到 shell.exe，无法执行反注册。",
        );
    };

    match nilesoft_install::attempt_unregister(&shell_exe) {
        Ok(nilesoft_install::UnregisterResult::Done) => {
            ActionResult::ok_with_code("unregister_done", "已尝试执行反注册。")
        }
        Ok(nilesoft_install::UnregisterResult::NotSupported(detail)) => ActionResult::err(
            "unregister_not_supported",
            "当前 Nilesoft 版本可能不支持反注册参数",
            detail,
        ),
        Err(error) => ActionResult::err("unregister_failed", "反注册执行失败", error),
    }
}

#[tauri::command]
pub fn cleanup_app_data(confirm_token: Option<String>) -> ActionResult {
    if confirm_token.as_deref() != Some(CLEANUP_CONFIRM_TOKEN) {
        return ActionResult::err(
            "cleanup_confirm_required",
            "清理应用数据需要二次确认",
            "请在确认后重试。",
        );
    }

    let current_root = match state::app_root_dir() {
        Ok(value) => value,
        Err(error) => return ActionResult::err("cleanup_root_resolve_failed", "清理失败", error),
    };
    let legacy_root = match state::legacy_app_root_dir() {
        Ok(value) => value,
        Err(error) => return ActionResult::err("cleanup_root_resolve_failed", "清理失败", error),
    };

    let mut targets = vec![current_root];
    if legacy_root != targets[0] {
        targets.push(legacy_root);
    }

    let existing_targets = targets
        .iter()
        .filter(|path| path.exists())
        .cloned()
        .collect::<Vec<_>>();
    if existing_targets.is_empty() {
        return ActionResult::ok_with_code("cleanup_done", "应用数据目录不存在，无需清理。");
    }

    for target in &existing_targets {
        if let Err(error) = fs::remove_dir_all(target) {
            return ActionResult::err(
                "cleanup_failed",
                "清理应用数据失败",
                format!("目标目录: {}; 错误: {error}", target.display()),
            );
        }
    }

    let removed = existing_targets
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join("；");
    ActionResult::ok_with_code("cleanup_done", format!("已清理应用数据目录：{removed}"))
}

#[tauri::command]
pub fn apply_config(config: AppConfig) -> ActionResult {
    let config = prepare_config_for_save(config, state::load_app_config().runtime);

    if let Err(error) = state::save_app_config(&config) {
        return ActionResult::err("save_config_failed", "保存配置失败", error);
    }
    let config = state::load_app_config();

    let (install_root, shell_exe, _) = match ensure_install_ready("应用配置") {
        Ok(value) => value,
        Err(error) => {
            let _ = state::mark_runtime_error(format!("apply_precheck_failed: {}", error.message));
            return error;
        }
    };

    let resolved = match nilesoft::resolve_effective_config_root(&shell_exe, &install_root) {
        Ok(value) => value,
        Err(error) => {
            return ActionResult::err("config_root_resolve_failed", "应用配置失败", error)
        }
    };

    let detected = detect::detect_all_clis();
    let render_config = filter_config_toggles_by_detection(&config, &detected);
    match nilesoft::apply_config(&resolved.root, &render_config) {
        Ok(terminal_resolution) => {
            let _ = state::mark_apply_success();
            let mut message = format!(
                "配置已写入 {}/imports/ai-clis.nss（layout={}，terminal={}）",
                resolved.root.display(),
                resolved.layout,
                terminal_resolution.effective_mode
            );
            if terminal_resolution.fallback_reason.is_some() {
                message.push_str("，已自动回退到可用终端");
            }
            ActionResult::ok(message)
        }
        Err(error) => {
            let _ = state::mark_runtime_error(format!("apply_config_failed: {error}"));
            ActionResult::err("apply_failed", "写入配置失败", error)
        }
    }
}

#[tauri::command]
pub fn activate_now() -> ActionResult {
    let (_, shell_exe, _) = match ensure_install_ready("立即生效") {
        Ok(value) => value,
        Err(error) => {
            let _ = state::mark_runtime_error(format!("activate_precheck_failed: {}", error.message));
            return error;
        }
    };

    match explorer::activate_now(&shell_exe) {
        Ok(message) => {
            let _ = state::mark_activate_success();
            ActionResult::ok(message)
        }
        Err(error) => {
            let _ = state::mark_runtime_error(format!("activate_failed: {error}"));
            ActionResult::err("activate_failed", "立即生效失败", error)
        }
    }
}

#[tauri::command]
pub fn get_diagnostics(app: AppHandle) -> DiagnosticsInfo {
    let config = state::load_app_config();
    let terminal_plan = terminal::build_launch_plan(&config);
    let terminal_resolution = terminal_plan.resolution();
    let terminal_capabilities = terminal_plan.capabilities().clone();
    let install_status = nilesoft_install::inspect_installation();
    let app_root = state::app_root_dir().ok().map(|p| p.display().to_string());
    let install_root = nilesoft_install::resolve_install_root()
        .ok()
        .map(|p| p.display().to_string());
    let shell_exe = nilesoft_install::locate_shell_exe().map(|p| p.display().to_string());

    let effective_config_root = match (
        nilesoft_install::resolve_install_root().ok(),
        nilesoft_install::locate_shell_exe(),
    ) {
        (Some(root), Some(shell)) => nilesoft::resolve_effective_config_root(&shell, &root)
            .ok()
            .map(|r| r.root.display().to_string()),
        _ => None,
    };

    let log_path = logging::log_file_path().map(|p| p.display().to_string());
    let log_tail = logging::read_tail_lines(80);
    let resource_zip_path = nilesoft_install::resolve_resource_zip(&app)
        .ok()
        .map(|p| p.display().to_string());

    DiagnosticsInfo {
        generated_at: now_epoch_seconds(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        build_channel: if cfg!(debug_assertions) {
            "debug".to_string()
        } else {
            "release".to_string()
        },
        app_root,
        install_root,
        shell_exe,
        effective_config_root,
        resource_zip_path,
        install_status,
        config_version: config.version,
        runtime: config.runtime,
        terminal_mode_requested: terminal_resolution.requested_mode,
        terminal_mode_effective: terminal_resolution.effective_mode,
        terminal_fallback_reason: terminal_resolution.fallback_reason,
        terminal_menu_mode: terminal_plan.menu_mode().to_string(),
        terminal_menu_theme_applied: terminal_plan.menu_theme_applied(),
        terminal_install_theme_applied: terminal_plan.install_theme_applied(),
        terminal_theme_id: terminal_plan.theme_id().to_string(),
        terminal_theme_mode: config.terminal_theme_mode.as_str().to_string(),
        terminal_prompt_style: config.ps_prompt_style.as_str().to_string(),
        terminal_wt_available: terminal_capabilities.wt,
        terminal_pwsh_available: terminal_capabilities.pwsh,
        terminal_powershell_available: terminal_capabilities.powershell,
        log_path,
        log_tail,
    }
}

#[tauri::command]
pub fn get_cli_install_hints() -> BTreeMap<String, CliInstallHint> {
    let mut hints = BTreeMap::new();
    for profile in CLI_INSTALL_PROFILES {
        if !is_allowed_docs_url(profile.docs_url) {
            logging::log_line(&format!(
                "[install-assist] skip profile key={} because docs domain is not allowed: {}",
                profile.key, profile.docs_url
            ));
            continue;
        }
        hints.insert(profile.key.to_string(), cli_install_hint(&profile));
    }
    hints
}

pub fn apply_saved_config() -> ActionResult {
    let config = state::load_app_config();
    apply_config(config)
}

pub fn toggle_context_menu_and_apply() -> ActionResult {
    let mut config = state::load_app_config();
    config.enable_context_menu = !config.enable_context_menu;
    apply_config(config)
}

pub fn activate_now_from_tray() -> ActionResult {
    let applied = apply_saved_config();
    if !applied.ok {
        return applied;
    }
    activate_now()
}

#[tauri::command]
pub fn run_startup_check() -> ActionResult {
    let install = nilesoft_install::inspect_installation();
    logging::log_line(&format!(
        "[startup] startup check: installed={} registered={}",
        install.installed, install.registered
    ));
    ActionResult::ok("启动检查完成")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AppConfig, RuntimeState};

    #[test]
    fn should_preserve_runtime_state_when_preparing_config() {
        let mut incoming = AppConfig::default();
        incoming.version = 1;
        incoming.runtime = RuntimeState::default();

        let persisted = RuntimeState {
            last_apply_at: Some("100".to_string()),
            last_activate_at: Some("200".to_string()),
            last_error: Some("x".to_string()),
        };

        let prepared = prepare_config_for_save(incoming, persisted.clone());
        assert_eq!(prepared.version, state::CONFIG_VERSION);
        assert_eq!(prepared.runtime.last_apply_at, persisted.last_apply_at);
        assert_eq!(prepared.runtime.last_activate_at, persisted.last_activate_at);
        assert_eq!(prepared.runtime.last_error, persisted.last_error);
    }

    #[test]
    fn should_require_confirm_token_for_cleanup() {
        let result = cleanup_app_data(None);
        assert!(!result.ok);
        assert_eq!(result.code, "cleanup_confirm_required");
    }

    #[test]
    fn should_require_remote_script_confirmation_for_kimi() {
        let result = launch_cli_install(InstallLaunchRequest {
            key: "kimi".to_string(),
            confirmed_remote_script: false,
        });
        assert!(!result.ok);
        assert_eq!(result.code, "remote_script_confirmation_required");
    }

    #[test]
    fn should_include_qwencode_and_opencode_hints() {
        let hints = get_cli_install_hints();
        assert!(hints.contains_key("qwencode"));
        assert!(hints.contains_key("opencode"));
    }

    #[test]
    fn should_filter_undetected_toggles_before_render() {
        let mut config = AppConfig::default();
        config.toggles.claude = true;
        config.toggles.codex = true;
        config.toggles.gemini = true;
        config.toggles.kimi = true;
        config.toggles.kimi_web = true;
        config.toggles.qwencode = true;
        config.toggles.opencode = true;

        let detected = CliStatusMap {
            claude: true,
            codex: false,
            gemini: true,
            kimi: false,
            kimi_web: false,
            qwencode: true,
            opencode: false,
            pwsh: true,
        };

        let filtered = filter_config_toggles_by_detection(&config, &detected);
        assert!(filtered.toggles.claude);
        assert!(!filtered.toggles.codex);
        assert!(filtered.toggles.gemini);
        assert!(!filtered.toggles.kimi);
        assert!(!filtered.toggles.kimi_web);
        assert!(filtered.toggles.qwencode);
        assert!(!filtered.toggles.opencode);
    }
}
