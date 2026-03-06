use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;

use crate::{
    context_menu_builder, context_menu_icons, context_menu_service, detect, embedded_terminal,
    logging, process_util, shell_notify, terminal, win11_classic_menu,
    state::{
        self, ActionResult, AppConfig, CliInstallHint, CliStatusMap, CliUserPathStatus,
        DiagnosticsInfo, InitialState, InstallLaunchRequest, InstallPrereqStatus,
        PowerShellPs1PolicyStatus,
    },
};

const CLEANUP_CONFIRM_TOKEN: &str = "CONFIRM_CLEANUP_EXECLINK";
const ALLOWED_DOCS_DOMAINS: [&str; 8] = [
    "code.claude.com",
    "developers.openai.com",
    "google-gemini.github.io",
    "moonshotai.github.io",
    "qwenlm.github.io",
    "opencode.ai",
    "nodejs.org",
    "apps.microsoft.com",
];
const NODEJS_DOWNLOAD_URL: &str = "https://nodejs.org/zh-cn/download";
const WINGET_BOOTSTRAP_URL: &str = "https://aka.ms/getwinget";
const WINGET_STORE_URL: &str = "https://apps.microsoft.com/detail/9NBLGGH4NNS1";
const WINGET_TUNA_LATEST_RELEASE_URL: &str =
    "https://mirrors.tuna.tsinghua.edu.cn/github-release/microsoft/winget-cli/LatestRelease/";
const GIT_WINGET_INSTALL_COMMAND: &str = "winget install --id Git.Git -e --source winget";
const NODEJS_WINGET_INSTALL_COMMAND: &str = "winget install OpenJS.NodeJS";
const GIT_TUNA_LATEST_RELEASE_URL: &str =
    "https://mirrors.tuna.tsinghua.edu.cn/github-release/git-for-windows/git/LatestRelease/";
const KIMI_TARGET_PYTHON_VERSION: &str = "3.13";
const PS1_POLICY_FIX_COMMAND: &str =
    "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GitInstallSource {
    Official,
    Tuna,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WingetInstallSource {
    Official,
    Tuna,
}

#[derive(Debug, Clone, Copy)]
struct CliInstallProfile {
    key: &'static str,
    display_name: &'static str,
    install_command: &'static str,
    upgrade_command: Option<&'static str>,
    uninstall_command: &'static str,
    auth_command: Option<&'static str>,
    verify_command: Option<&'static str>,
    requires_oauth: bool,
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
        install_command: "npm install -g @anthropic-ai/claude-code",
        upgrade_command: Some("npm install -g @anthropic-ai/claude-code@latest"),
        uninstall_command: "npm uninstall -g @anthropic-ai/claude-code",
        auth_command: Some("claude"),
        verify_command: Some("claude --version"),
        requires_oauth: false,
        docs_url: "https://code.claude.com/docs/en/quickstart",
        official_domain: "claude.ai",
        publisher: "Anthropic",
        risk_remote_script: false,
        requires_node: true,
        wsl_recommended: false,
    },
    CliInstallProfile {
        key: "codex",
        display_name: "Codex",
        install_command: "npm install -g @openai/codex",
        upgrade_command: Some("npm i -g @openai/codex@latest"),
        uninstall_command: "npm uninstall -g @openai/codex",
        auth_command: Some("codex login"),
        verify_command: Some("codex --version"),
        requires_oauth: false,
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
        upgrade_command: Some("npm install -g @google/gemini-cli@latest"),
        uninstall_command: "npm uninstall -g @google/gemini-cli",
        auth_command: Some("gemini"),
        verify_command: Some("gemini --version"),
        requires_oauth: false,
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
        upgrade_command: Some("uv tool upgrade kimi-cli --no-cache"),
        uninstall_command: "uv tool uninstall kimi-cli",
        auth_command: Some("kimi login"),
        verify_command: Some("kimi -v"),
        requires_oauth: true,
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
        upgrade_command: Some("uv tool upgrade kimi-cli --no-cache"),
        uninstall_command: "uv tool uninstall kimi-cli",
        auth_command: Some("kimi login"),
        verify_command: Some("kimi -v"),
        requires_oauth: true,
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
        upgrade_command: Some("npm install -g @qwen-code/qwen-code@latest"),
        uninstall_command: "npm uninstall -g @qwen-code/qwen-code",
        auth_command: Some("qwen"),
        verify_command: Some("qwen --version"),
        requires_oauth: false,
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
        upgrade_command: Some("opencode upgrade"),
        uninstall_command: "npm uninstall -g opencode-ai --no-progress",
        auth_command: Some("opencode auth login"),
        verify_command: Some("opencode --version"),
        requires_oauth: false,
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

fn prepare_config_for_save(mut incoming: AppConfig, persisted_runtime: state::RuntimeState) -> AppConfig {
    incoming.version = state::CONFIG_VERSION;
    incoming.no_exit = true;
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
        upgrade_command: profile.upgrade_command.map(|value| value.to_string()),
        uninstall_command: profile.uninstall_command.to_string(),
        auth_command: profile.auth_command.map(|value| value.to_string()),
        verify_command: profile.verify_command.map(|value| value.to_string()),
        requires_oauth: profile.requires_oauth,
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

fn parse_git_install_source(value: Option<String>) -> GitInstallSource {
    match value.as_deref() {
        Some("tuna") => GitInstallSource::Tuna,
        _ => GitInstallSource::Official,
    }
}

fn parse_winget_install_source(value: Option<String>) -> WingetInstallSource {
    match value.as_deref() {
        Some("tuna") => WingetInstallSource::Tuna,
        _ => WingetInstallSource::Official,
    }
}

fn git_install_source_label(source: GitInstallSource) -> &'static str {
    match source {
        GitInstallSource::Official => "官方源",
        GitInstallSource::Tuna => "清华源",
    }
}

fn winget_install_source_label(source: WingetInstallSource) -> &'static str {
    match source {
        WingetInstallSource::Official => "官方源",
        WingetInstallSource::Tuna => "清华源",
    }
}

fn build_git_tuna_install_command() -> String {
    [
        "$ErrorActionPreference='Stop'",
        &format!("$latestReleaseUrl = '{GIT_TUNA_LATEST_RELEASE_URL}'"),
        "$baseUri = [System.Uri]$latestReleaseUrl",
        "$latestReleasePage = Invoke-WebRequest -Uri $latestReleaseUrl",
        "$latestLinks = @($latestReleasePage.Links | Where-Object { $_.href })",
        "$installerHref = $latestLinks | ForEach-Object { $_.href } | Where-Object { $_ -match '(?i)Git-[^/]*-64-bit\\.exe$' } | Select-Object -First 1",
        "$versionDirHref = $latestLinks | ForEach-Object { $_.href } | Where-Object { $_ -match '(?i)Git%20for%20Windows%20v[^/]+/?$' } | Select-Object -First 1",
        "if ((-not $installerHref) -and $versionDirHref) {",
        "  $versionDirUrl = [System.Uri]::new($baseUri, $versionDirHref).AbsoluteUri",
        "  $versionPage = Invoke-WebRequest -Uri $versionDirUrl",
        "  $versionLinks = @($versionPage.Links | Where-Object { $_.href })",
        "  $installerHref = $versionLinks | ForEach-Object { $_.href } | Where-Object { $_ -match '(?i)Git-[^/]*-64-bit\\.exe$' } | Select-Object -First 1",
        "  if ($installerHref) { $baseUri = [System.Uri]$versionDirUrl }",
        "}",
        "if (-not $installerHref) { throw '清华源页面未找到 Git for Windows 64-bit 安装包链接。' }",
        "$tunaUrl = [System.Uri]::new($baseUri, $installerHref).AbsoluteUri",
        "$installerPath = Join-Path $env:TEMP 'Git-Installer.exe'",
        "Invoke-WebRequest -Uri $tunaUrl -OutFile $installerPath",
        "Start-Process -FilePath $installerPath -Wait",
        "Write-Host 'Git 安装程序执行完成。'",
    ]
    .join("; ")
}

fn build_prereq_install_command(
    needs_git: bool,
    needs_node: bool,
    git_source: GitInstallSource,
) -> Option<String> {
    let mut steps: Vec<String> = Vec::new();
    if needs_git {
        let git_command = match git_source {
            GitInstallSource::Official => GIT_WINGET_INSTALL_COMMAND.to_string(),
            GitInstallSource::Tuna => build_git_tuna_install_command(),
        };
        steps.push(git_command);
    }
    if needs_node {
        steps.push(NODEJS_WINGET_INSTALL_COMMAND.to_string());
    }
    if steps.is_empty() {
        return None;
    }

    let total = steps.len();
    let mut script_parts: Vec<String> = vec!["$ErrorActionPreference='Continue'".to_string()];
    for (idx, step) in steps.iter().enumerate() {
        script_parts.push(step.clone());
        script_parts.push("Write-Host ''".to_string());
        script_parts.push(format!(
            "Write-Host '[{}/{}] 前置安装步骤执行完成。'",
            idx + 1,
            total
        ));
    }
    script_parts.push("Write-Host ''".to_string());
    script_parts.push("Write-Host '前置环境安装命令已执行，请在该终端确认结果。'".to_string());
    Some(script_parts.join("; "))
}

fn build_winget_tuna_bootstrap_command() -> String {
    [
        "$ErrorActionPreference='Stop'",
        &format!("$wingetTunaLatestReleaseUrl = '{WINGET_TUNA_LATEST_RELEASE_URL}'"),
        "$baseUri = [System.Uri]$wingetTunaLatestReleaseUrl",
        "$tunaPage = Invoke-WebRequest -Uri $wingetTunaLatestReleaseUrl -TimeoutSec 45 -ErrorAction Stop",
        "$tunaLinks = @($tunaPage.Links | Where-Object { $_.href })",
        "$bundleHref = $tunaLinks | ForEach-Object { $_.href } | Where-Object { $_ -match '(?i)Microsoft\\.DesktopAppInstaller_.*_8wekyb3d8bbwe\\.msixbundle$' } | Select-Object -First 1",
        "if (-not $bundleHref) { throw 'tuna latest release page does not contain winget bundle link' }",
        "$tunaBundleUrl = [System.Uri]::new($baseUri, $bundleHref).AbsoluteUri",
        "$wingetBundlePath = Join-Path $env:TEMP 'Microsoft.DesktopAppInstaller.msixbundle'",
        "Invoke-WebRequest -Uri $tunaBundleUrl -OutFile $wingetBundlePath -TimeoutSec 180 -MaximumRedirection 8 -ErrorAction Stop",
        "if (-not (Test-Path $wingetBundlePath)) { throw 'winget package missing after tuna download' }",
    ]
    .join("; ")
}

fn build_winget_bootstrap_command(source: WingetInstallSource) -> String {
    let download_script = match source {
        WingetInstallSource::Official => [
            &format!("$wingetBootstrapUrl = '{WINGET_BOOTSTRAP_URL}'"),
            "$wingetBundlePath = Join-Path $env:TEMP 'Microsoft.DesktopAppInstaller.msixbundle'",
            "Invoke-WebRequest -Uri $wingetBootstrapUrl -OutFile $wingetBundlePath -TimeoutSec 180 -MaximumRedirection 8 -ErrorAction Stop",
            "if (-not (Test-Path $wingetBundlePath)) { throw 'winget package missing after official download' }",
        ]
        .join("; "),
        WingetInstallSource::Tuna => build_winget_tuna_bootstrap_command(),
    };

    [
        "$ErrorActionPreference='Stop'",
        "$wingetCmd = Get-Command winget -ErrorAction SilentlyContinue",
        "if ($wingetCmd) { Write-Host 'winget already installed'; exit 0 }",
        &download_script,
        "Add-AppxPackage -Path $wingetBundlePath -ErrorAction Stop",
        "$wingetCmd = Get-Command winget -ErrorAction SilentlyContinue",
        "if (-not $wingetCmd) { throw 'winget not found after installation' }",
        "Write-Host 'winget installation finished'",
    ]
    .join("; ")
}

fn build_install_script(install_command: &str) -> String {
    format!(
        "$ErrorActionPreference='Continue'; {install_command}; Write-Host ''; Write-Host '安装命令已执行，请在该终端确认结果。'"
    )
}

fn refresh_context_menu_icons_best_effort() {
    if let Err(error) = context_menu_icons::ensure_context_menu_icon_files() {
        logging::log_line(&format!(
            "[context-menu-icons] best-effort refresh failed: {error}"
        ));
    }
}

fn build_uninstall_script(uninstall_command: &str) -> String {
    format!(
        "$ErrorActionPreference='Continue'; {uninstall_command}; Write-Host ''; Write-Host '卸载命令已执行，请在该终端确认结果。'"
    )
}

fn launch_visible_install_terminal(launch: &terminal::SpawnLaunchCommand) -> Result<(), String> {
    Command::new(&launch.executable)
        .args(&launch.args)
        .spawn()
        .map_err(|error| format!("拉起安装终端失败: {error}"))?;
    Ok(())
}

fn open_url_in_system_browser(url: &str) -> Result<(), String> {
    process_util::command_hidden("cmd")
        .args(["/C", "start", "", url])
        .spawn()
        .map_err(|error| format!("拉起系统浏览器失败: {error}"))?;
    Ok(())
}

fn launch_elevated_powershell_install(command: &str) -> Result<String, String> {
    let escaped_command = command.replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference='Stop'; $cmd='{escaped_command}'; $args=@('-NoExit','-ExecutionPolicy','Bypass','-Command',$cmd); $p=Start-Process -FilePath 'powershell.exe' -ArgumentList $args -Verb RunAs -PassThru -ErrorAction Stop; if ($null -eq $p) {{ throw '管理员终端启动失败' }}; Write-Output \"pid=$($p.Id)\""
    );
    run_powershell_script(&script)
}

fn escape_ps_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

fn user_profile_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(PathBuf::from)
}

fn app_data_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(PathBuf::from)
}

fn uv_executable_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(user_profile) = user_profile_dir() {
        candidates.push(user_profile.join(".local").join("bin").join("uv.exe"));
        candidates.push(user_profile.join(".cargo").join("bin").join("uv.exe"));
    }

    candidates
}

fn resolve_uv_executable_path() -> Option<PathBuf> {
    uv_executable_candidates()
        .into_iter()
        .find(|path| path.exists())
}

fn verify_uv_python_installation(version: &str) -> Result<String, String> {
    let refreshed_path = process_util::refreshed_path_env();
    let mut command = if let Some(uv_path) = resolve_uv_executable_path() {
        process_util::command_hidden(uv_path)
    } else {
        process_util::command_hidden("uv")
    };
    command.args(["python", "find", version]);
    if let Some(path_value) = refreshed_path.as_deref() {
        command.env("PATH", path_value);
    }

    let output = command
        .output()
        .map_err(|error| format!("执行 uv python find {version} 失败: {error}"))?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            Ok(format!("uv python find {version} 返回成功"))
        } else {
            Ok(stdout)
        }
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !stderr.is_empty() {
            Err(stderr)
        } else if !stdout.is_empty() {
            Err(stdout)
        } else {
            Err(format!(
                "uv python find {version} 失败，exit_code={:?}",
                output.status.code()
            ))
        }
    }
}

fn kimi_executable_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(app_data) = app_data_dir() {
        candidates.push(
            app_data
                .join("uv")
                .join("tools")
                .join("kimi-cli")
                .join("Scripts")
                .join("kimi.exe"),
        );
    }

    if let Some(user_profile) = user_profile_dir() {
        candidates.push(user_profile.join(".local").join("bin").join("kimi.exe"));
    }

    candidates
}

fn resolve_kimi_executable_path() -> Option<PathBuf> {
    kimi_executable_candidates()
        .into_iter()
        .find(|path| path.exists())
}

fn cli_lookup_names_for_key(key: &str) -> Vec<&'static str> {
    match key {
        "claude" => vec!["claude"],
        "codex" => vec!["codex"],
        "gemini" => vec!["gemini"],
        "kimi" | "kimi_web" => vec!["kimi"],
        "qwencode" => vec!["qwen", "qwencode"],
        "opencode" => vec!["opencode"],
        _ => Vec::new(),
    }
}

fn where_command_paths(command_name: &str, path_env: Option<&str>) -> Vec<PathBuf> {
    let mut command = process_util::command_hidden("where.exe");
    command.arg(command_name);
    if let Some(path_value) = path_env {
        command.env("PATH", path_value);
    }

    let output = match command.output() {
        Ok(output) => output,
        Err(_) => return Vec::new(),
    };
    if !output.status.success() {
        return Vec::new();
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(PathBuf::from)
        .collect()
}

fn resolve_cli_command_dir(key: &str) -> Option<PathBuf> {
    let refreshed_path = process_util::refreshed_path_env();
    let path_ref = refreshed_path.as_deref();
    for command_name in cli_lookup_names_for_key(key) {
        for command_path in where_command_paths(command_name, path_ref) {
            if let Some(parent) = command_path.parent() {
                return Some(parent.to_path_buf());
            }
        }
    }

    if matches!(key, "kimi" | "kimi_web") {
        return resolve_kimi_executable_path().and_then(|path| path.parent().map(|p| p.to_path_buf()));
    }
    None
}

fn read_user_path_env() -> Option<String> {
    let script = "$value=[Environment]::GetEnvironmentVariable('Path','User'); if ($value) { [Environment]::ExpandEnvironmentVariables($value) }";
    run_powershell_script(script)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn normalize_windows_path_for_compare(path: &str) -> String {
    let mut normalized = path
        .trim()
        .trim_matches('"')
        .replace('/', "\\")
        .to_ascii_lowercase();
    while normalized.len() > 3 && normalized.ends_with('\\') {
        normalized.pop();
    }
    normalized
}

fn user_path_contains_dir(user_path: Option<&str>, command_dir: &Path) -> bool {
    let Some(user_path_value) = user_path else {
        return false;
    };
    let target = normalize_windows_path_for_compare(command_dir.to_string_lossy().as_ref());
    user_path_value.split(';').any(|segment| {
        normalize_windows_path_for_compare(segment) == target
    })
}

fn build_add_user_path_command(command_dir: &Path) -> String {
    let escaped_dir = escape_ps_single_quoted(command_dir.to_string_lossy().as_ref());
    [
        format!("$targetDir = '{escaped_dir}'"),
        "$currentUserPath = [Environment]::GetEnvironmentVariable('Path','User')".to_string(),
        "$segments = @()".to_string(),
        "if (-not [string]::IsNullOrWhiteSpace($currentUserPath)) { $segments = @($currentUserPath -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }".to_string(),
        "$exists = $segments | Where-Object { $_ -ieq $targetDir } | Select-Object -First 1".to_string(),
        "if ($exists) { Write-Output 'unchanged'; return }".to_string(),
        "$nextUserPath = if ([string]::IsNullOrWhiteSpace($currentUserPath)) { $targetDir } else { \"$currentUserPath;$targetDir\" }".to_string(),
        "[Environment]::SetEnvironmentVariable('Path', $nextUserPath, 'User')".to_string(),
        "Write-Output $nextUserPath".to_string(),
    ]
    .join("; ")
}

fn build_cli_user_path_status(key: &str, user_path: Option<&str>) -> CliUserPathStatus {
    let Some(command_dir) = resolve_cli_command_dir(key) else {
        return CliUserPathStatus {
            key: key.to_string(),
            command_dir: None,
            needs_user_path_fix: false,
            add_user_path_command: None,
            message: "CLI command path is unavailable. Install or detect the CLI first.".to_string(),
        };
    };

    let in_user_path = user_path_contains_dir(user_path, &command_dir);
    let command_text = command_dir.to_string_lossy().to_string();
    CliUserPathStatus {
        key: key.to_string(),
        command_dir: Some(command_text.clone()),
        needs_user_path_fix: !in_user_path,
        add_user_path_command: if in_user_path {
            None
        } else {
            Some(build_add_user_path_command(&command_dir))
        },
        message: if in_user_path {
            format!("User PATH already contains {command_text}.")
        } else {
            format!("User PATH is missing {command_text}.")
        },
    }
}

fn detect_powershell_effective_policy() -> Result<String, String> {
    run_powershell_script("Get-ExecutionPolicy")
        .map(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                "Unknown".to_string()
            } else {
                trimmed
            }
        })
}

fn is_ps1_policy_blocked(policy: &str) -> bool {
    policy.eq_ignore_ascii_case("Restricted")
}

fn run_powershell_script(script: &str) -> Result<String, String> {
    fn decode_utf16(bytes: &[u8], little_endian: bool) -> Option<String> {
        if bytes.len() < 2 {
            return None;
        }
        let mut units = Vec::with_capacity(bytes.len() / 2);
        let mut index = 0;
        while index + 1 < bytes.len() {
            let pair = [bytes[index], bytes[index + 1]];
            let value = if little_endian {
                u16::from_le_bytes(pair)
            } else {
                u16::from_be_bytes(pair)
            };
            units.push(value);
            index += 2;
        }
        Some(String::from_utf16_lossy(&units))
    }

    fn decode_powershell_bytes(bytes: &[u8]) -> String {
        if bytes.is_empty() {
            return String::new();
        }
        if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
            return String::from_utf8_lossy(&bytes[3..]).to_string();
        }
        if bytes.starts_with(&[0xFF, 0xFE]) {
            if let Some(text) = decode_utf16(&bytes[2..], true) {
                return text;
            }
        }
        if bytes.starts_with(&[0xFE, 0xFF]) {
            if let Some(text) = decode_utf16(&bytes[2..], false) {
                return text;
            }
        }
        if let Ok(text) = String::from_utf8(bytes.to_vec()) {
            return text;
        }

        let even_zero = bytes.iter().step_by(2).filter(|value| **value == 0).count();
        let odd_zero = bytes
            .iter()
            .skip(1)
            .step_by(2)
            .filter(|value| **value == 0)
            .count();
        let pair_count = bytes.len() / 2;
        if pair_count > 0 && (odd_zero > pair_count / 3 || even_zero > pair_count / 3) {
            let little_endian = odd_zero >= even_zero;
            if let Some(text) = decode_utf16(bytes, little_endian) {
                return text;
            }
        }

        String::from_utf8_lossy(bytes).to_string()
    }

    let wrapped = format!(
        "$utf8 = [System.Text.UTF8Encoding]::new($false); [Console]::OutputEncoding = $utf8; $OutputEncoding = $utf8; {script}"
    );
    let output = process_util::command_hidden("powershell.exe")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &wrapped,
        ])
        .output()
        .map_err(|error| format!("执行 PowerShell 脚本失败: {error}"))?;

    let stdout = decode_powershell_bytes(&output.stdout).trim().to_string();
    let stderr = decode_powershell_bytes(&output.stderr).trim().to_string();
    if output.status.success() {
        return Ok(stdout);
    }

    let detail = match (stdout.is_empty(), stderr.is_empty()) {
        (false, false) => format!("stdout={stdout}; stderr={stderr}"),
        (false, true) => format!("stdout={stdout}"),
        (true, false) => format!("stderr={stderr}"),
        (true, true) => format!("exit_code={:?}", output.status.code()),
    };
    Err(detail)
}

#[tauri::command]
pub fn get_initial_state() -> InitialState {
    refresh_context_menu_icons_best_effort();
    let config = state::load_app_config();
    let cli_status = detect::detect_all_clis();
    let context_menu_status = context_menu_service::inspect_context_menu_status()
        .unwrap_or_else(|error| state::ContextMenuStatus::empty(error));
    let win11_classic_menu_status = win11_classic_menu::inspect_status()
        .unwrap_or_else(|error| state::Win11ClassicMenuStatus::empty(error));

    InitialState {
        config,
        cli_status,
        context_menu_status,
        win11_classic_menu_status,
    }
}

#[tauri::command]
pub fn detect_clis() -> CliStatusMap {
    detect::detect_all_clis()
}

#[tauri::command]
pub fn get_install_prereq_status() -> InstallPrereqStatus {
    let refreshed_path = process_util::refreshed_path_env();
    let path_ref = refreshed_path.as_deref();
    InstallPrereqStatus {
        git: detect::command_exists_with_path("git", path_ref),
        node: detect::command_exists_with_path("node", path_ref),
        npm: detect::command_exists_with_path("npm", path_ref),
        uv: detect::command_exists_with_path("uv", path_ref) || resolve_uv_executable_path().is_some(),
        pwsh: detect::command_exists_with_path("pwsh", path_ref),
        winget: detect::command_exists_with_path("winget", path_ref),
        wsl: detect::command_exists_with_path("wsl", path_ref),
    }
}

#[tauri::command]
pub fn get_cli_user_path_statuses() -> BTreeMap<String, CliUserPathStatus> {
    let user_path = read_user_path_env();
    let mut statuses = BTreeMap::new();
    for profile in CLI_INSTALL_PROFILES {
        let key = profile.key.to_string();
        statuses.insert(key.clone(), build_cli_user_path_status(&key, user_path.as_deref()));
    }
    statuses
}

#[tauri::command]
pub fn add_cli_command_dir_to_user_path(key: String) -> ActionResult {
    let Some(profile) = find_cli_install_profile(&key) else {
        return ActionResult::err(
            "install_profile_missing",
            "Join user PATH failed",
            format!("Unsupported CLI key: {key}"),
        );
    };

    let Some(command_dir) = resolve_cli_command_dir(&key) else {
        return ActionResult::err(
            "cli_command_dir_missing",
            "Join user PATH failed",
            format!(
                "{} command path is unavailable. Install and detect the CLI first.",
                profile.display_name
            ),
        );
    };

    let user_path = read_user_path_env();
    if user_path_contains_dir(user_path.as_deref(), &command_dir) {
        return ActionResult {
            ok: true,
            code: "user_path_already_contains_dir".to_string(),
            message: format!(
                "{} command directory is already in user PATH.",
                profile.display_name
            ),
            detail: Some(command_dir.display().to_string()),
        };
    }

    let add_command = build_add_user_path_command(&command_dir);
    match run_powershell_script(&add_command) {
        Ok(output) => {
            logging::log_line(&format!(
                "[install-assist] add user PATH key={} dir={} output={}",
                key,
                command_dir.display(),
                output
            ));
            ActionResult {
                ok: true,
                code: "user_path_updated".to_string(),
                message: format!(
                    "{} command directory was added to user PATH.",
                    profile.display_name
                ),
                detail: Some(format!(
                    "command={}\ndir={}\noutput={}",
                    add_command,
                    command_dir.display(),
                    output
                )),
            }
        }
        Err(error) => ActionResult::err("user_path_update_failed", "Join user PATH failed", error),
    }
}

#[tauri::command]
pub fn get_powershell_ps1_policy_status() -> PowerShellPs1PolicyStatus {
    match detect_powershell_effective_policy() {
        Ok(policy) => PowerShellPs1PolicyStatus {
            blocked: is_ps1_policy_blocked(&policy),
            effective_policy: policy,
            fix_command: PS1_POLICY_FIX_COMMAND.to_string(),
            detail: None,
        },
        Err(error) => PowerShellPs1PolicyStatus {
            blocked: true,
            effective_policy: "Unknown".to_string(),
            fix_command: PS1_POLICY_FIX_COMMAND.to_string(),
            detail: Some(error),
        },
    }
}

#[tauri::command]
pub fn fix_powershell_ps1_policy() -> ActionResult {
    match run_powershell_script(PS1_POLICY_FIX_COMMAND) {
        Ok(output) => {
            let status = get_powershell_ps1_policy_status();
            if status.blocked {
                return ActionResult::err(
                    "ps1_policy_still_blocked",
                    "PowerShell policy repair failed",
                    format!(
                        "Fix command executed but effective policy is still {}. detail={}",
                        status.effective_policy,
                        status.detail.unwrap_or_else(|| "none".to_string())
                    ),
                );
            }
            ActionResult {
                ok: true,
                code: "ps1_policy_repaired".to_string(),
                message: format!(
                    "PowerShell script policy repaired: {}.",
                    status.effective_policy
                ),
                detail: Some(format!(
                    "command={}\noutput={}",
                    PS1_POLICY_FIX_COMMAND, output
                )),
            }
        }
        Err(error) => ActionResult::err(
            "ps1_policy_repair_failed",
            "PowerShell policy repair failed",
            error,
        ),
    }
}

#[tauri::command]
pub fn launch_prereq_install(git_source: Option<String>) -> ActionResult {
    let prereq = get_install_prereq_status();
    let needs_git = !prereq.git;
    let needs_node = !prereq.node;
    if !needs_git && !needs_node {
        return ActionResult::ok_with_code(
            "prereq_already_installed",
            "已检测到 Git 与 Node.js，无需安装。",
        );
    }

    let parsed_git_source = parse_git_install_source(git_source);
    let git_source_label = git_install_source_label(parsed_git_source);

    if needs_node && !prereq.winget {
        return ActionResult::err(
            "winget_missing",
            "启动前置环境安装失败",
            "未检测到 winget，请先安装 App Installer 后重试。",
        );
    }
    if needs_git && matches!(parsed_git_source, GitInstallSource::Official) && !prereq.winget {
        return ActionResult::err(
            "winget_missing",
            "启动前置环境安装失败",
            "官方源安装 Git 依赖 winget，请先安装 App Installer 后重试。",
        );
    }

    let Some(command) = build_prereq_install_command(needs_git, needs_node, parsed_git_source) else {
        return ActionResult::ok_with_code(
            "prereq_already_installed",
            "已检测到 Git 与 Node.js，无需安装。",
        );
    };

    let scope_label = match (needs_git, needs_node) {
        (true, true) => "Git 与 Node.js",
        (true, false) => "Git",
        (false, true) => "Node.js",
        (false, false) => "前置环境",
    };

    match launch_elevated_powershell_install(&command) {
        Ok(output) => {
            logging::log_line(&format!(
                "[prereq-install] combined install terminal started scope={} git_source={} command={} output={}",
                scope_label, git_source_label, command, output
            ));
            let message = if needs_git {
                format!(
                    "已启动 {} 管理员安装终端（Git：{}），完成后请点击“刷新 CLI 检测”。",
                    scope_label, git_source_label
                )
            } else {
                format!(
                    "已启动 {} 管理员安装终端，完成后请点击“刷新 CLI 检测”。",
                    scope_label
                )
            };
            ActionResult {
                ok: true,
                code: "prereq_install_launch_started".to_string(),
                message,
                detail: Some(format!("{command}; {output}")),
            }
        }
        Err(error) => ActionResult::err(
            "prereq_install_launch_failed",
            "启动前置环境安装失败",
            error,
        ),
    }
}

#[tauri::command]
pub fn launch_winget_install(source: Option<String>) -> ActionResult {
    let prereq = get_install_prereq_status();
    if prereq.winget {
        return ActionResult::ok_with_code("winget_already_installed", "已检测到 winget，无需安装。");
    }

    let parsed_source = parse_winget_install_source(source);
    let source_label = winget_install_source_label(parsed_source);
    let command = build_winget_bootstrap_command(parsed_source);
    match launch_elevated_powershell_install(&command) {
        Ok(output) => {
            logging::log_line(&format!(
                "[prereq-install] winget install terminal started source={} command={} output={}",
                source_label, command, output
            ));
            ActionResult {
                ok: true,
                code: "winget_install_launch_started".to_string(),
                message: format!("已启动 winget 管理员安装终端（{}），完成后将自动复检。", source_label),
                detail: Some(format!("{command}; {output}")),
            }
        }
        Err(error) => ActionResult::err(
            "winget_install_launch_failed",
            "启动 winget 安装失败",
            error,
        ),
    }
}

#[tauri::command]
pub fn launch_git_install() -> ActionResult {
    let prereq = get_install_prereq_status();
    if prereq.git {
        return ActionResult::ok_with_code("git_already_installed", "已检测到 Git，无需安装。");
    }
    if !prereq.winget {
        return ActionResult::err(
            "winget_missing",
            "启动 Git 安装失败",
            "未检测到 winget，请先安装 App Installer 后重试。",
        );
    }

    match launch_elevated_powershell_install(GIT_WINGET_INSTALL_COMMAND) {
        Ok(output) => {
            logging::log_line(&format!(
                "[prereq-install] git install terminal started command={} output={}",
                GIT_WINGET_INSTALL_COMMAND, output
            ));
            ActionResult {
                ok: true,
                code: "git_install_launch_started".to_string(),
                message: "已启动 Git 管理员安装终端，完成后请点击“刷新 CLI 检测”。".to_string(),
                detail: Some(format!("{}; {}", GIT_WINGET_INSTALL_COMMAND, output)),
            }
        }
        Err(error) => ActionResult::err("git_install_launch_failed", "启动 Git 安装失败", error),
    }
}

#[tauri::command]
pub fn launch_nodejs_install() -> ActionResult {
    let prereq = get_install_prereq_status();
    if prereq.node {
        return ActionResult::ok_with_code("nodejs_already_installed", "已检测到 Node.js，无需安装。");
    }
    if !prereq.winget {
        return ActionResult::err(
            "winget_missing",
            "启动 Node.js 安装失败",
            "未检测到 winget，请先安装 App Installer 后重试。",
        );
    }

    match launch_elevated_powershell_install(NODEJS_WINGET_INSTALL_COMMAND) {
        Ok(output) => {
            logging::log_line(&format!(
                "[prereq-install] nodejs install terminal started command={} output={}",
                NODEJS_WINGET_INSTALL_COMMAND, output
            ));
            ActionResult {
                ok: true,
                code: "nodejs_install_launch_started".to_string(),
                message: "已启动 Node.js 管理员安装终端，完成后请点击“刷新 CLI 检测”。".to_string(),
                detail: Some(format!("{}; {}", NODEJS_WINGET_INSTALL_COMMAND, output)),
            }
        }
        Err(error) => ActionResult::err(
            "nodejs_install_launch_failed",
            "启动 Node.js 安装失败",
            error,
        ),
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
pub fn launch_cli_auth(key: String) -> ActionResult {
    let Some(profile) = find_cli_install_profile(&key) else {
        return ActionResult::err(
            "install_profile_missing",
            "启动授权失败",
            format!("不支持的 CLI key: {key}"),
        );
    };
    let Some(auth_command) = profile.auth_command else {
        return ActionResult::ok_with_code(
            "auth_not_required",
            format!("{} 无需额外授权步骤", profile.display_name),
        );
    };

    let executable = if detect::command_exists("pwsh") {
        "pwsh.exe"
    } else {
        "powershell.exe"
    };
    let args = vec![
        "-NoExit".to_string(),
        "-ExecutionPolicy".to_string(),
        "Bypass".to_string(),
        "-Command".to_string(),
        auth_command.to_string(),
    ];

    match Command::new(executable).args(&args).spawn() {
        Ok(_) => ActionResult {
            ok: true,
            code: "auth_launch_started".to_string(),
            message: format!("已启动 {} 授权终端，请完成登录后返回应用。", profile.display_name),
            detail: Some(format!(
                "{} {}",
                executable,
                args.join(" ")
            )),
        },
        Err(error) => ActionResult::err("auth_launch_failed", "启动授权失败", error.to_string()),
    }
}

#[tauri::command]
pub fn verify_kimi_installation() -> ActionResult {
    let detected = detect::detect_all_clis();
    if detected.kimi || detected.kimi_web {
        return ActionResult::ok_with_code("verify_detected", "Kimi 复检通过，已检测到可执行命令。");
    }

    if let Some(kimi_path) = resolve_kimi_executable_path() {
        return ActionResult {
            ok: true,
            code: "verify_detected_abs_path".to_string(),
            message: "Kimi 复检通过，已检测到本地安装路径。".to_string(),
            detail: Some(kimi_path.display().to_string()),
        };
    }

    ActionResult::err(
        "verify_missing",
        "Kimi 复检未通过",
        "未检测到 kimi 命令或本地安装路径。",
    )
}

#[tauri::command]
pub fn verify_kimi_python_installation() -> ActionResult {
    if !(detect::command_exists("uv") || resolve_uv_executable_path().is_some()) {
        return ActionResult::err(
            "verify_python_uv_missing",
            "Python 复检未通过",
            "未检测到 uv 命令，请先安装 uv。",
        );
    }

    match verify_uv_python_installation(KIMI_TARGET_PYTHON_VERSION) {
        Ok(detail) => ActionResult {
            ok: true,
            code: "verify_python_detected".to_string(),
            message: format!("Python {} 复检通过。", KIMI_TARGET_PYTHON_VERSION),
            detail: Some(detail),
        },
        Err(detail) => ActionResult::err(
            "verify_python_missing",
            format!("Python {} 复检未通过", KIMI_TARGET_PYTHON_VERSION),
            detail,
        ),
    }
}

#[tauri::command]
pub fn run_cli_verify(key: String) -> ActionResult {
    let detected = detect::detect_all_clis();
    let exists = match key.as_str() {
        "claude" => detected.claude,
        "codex" => detected.codex,
        "gemini" => detected.gemini,
        "kimi" => detected.kimi,
        "kimi_web" => detected.kimi_web,
        "qwencode" => detected.qwencode,
        "opencode" => detected.opencode,
        _ => {
            return ActionResult::err(
                "install_profile_missing",
                "复检失败",
                format!("不支持的 CLI key: {key}"),
            )
        }
    };

    if exists {
        return ActionResult::ok_with_code("verify_detected", "CLI 复检通过，已检测到可执行命令。");
    }

    let expected = find_cli_install_profile(&key)
        .and_then(|profile| profile.verify_command)
        .unwrap_or("where <cli>");
    ActionResult::err(
        "verify_missing",
        "CLI 复检未通过",
        format!("未检测到命令，建议在终端手动执行验证命令: {expected}"),
    )
}

#[tauri::command]
pub fn terminal_ensure_session(app: AppHandle) -> ActionResult {
    match embedded_terminal::ensure_session(&app) {
        Ok(_) => ActionResult::ok_with_code("terminal_ready", "内置终端已就绪"),
        Err(error) => ActionResult::err("terminal_ready_failed", "内置终端初始化失败", error),
    }
}

#[tauri::command]
pub fn terminal_input(app: AppHandle, data: String) -> ActionResult {
    match embedded_terminal::write_input(&app, &data) {
        Ok(_) => ActionResult::ok_with_code("terminal_input_ok", "已写入终端输入"),
        Err(error) => ActionResult::err("terminal_input_failed", "写入终端输入失败", error),
    }
}

#[tauri::command]
pub fn terminal_run_script(app: AppHandle, script: String) -> ActionResult {
    match embedded_terminal::run_script(&app, &script) {
        Ok(_) => ActionResult::ok_with_code("terminal_script_ok", "脚本已发送到内置终端"),
        Err(error) => ActionResult::err("terminal_script_failed", "执行内置终端脚本失败", error),
    }
}

#[tauri::command]
pub fn terminal_resize(app: AppHandle, cols: u16, rows: u16) -> ActionResult {
    match embedded_terminal::resize(&app, cols, rows) {
        Ok(_) => ActionResult::ok_with_code("terminal_resize_ok", "终端尺寸已更新"),
        Err(error) => ActionResult::err("terminal_resize_failed", "更新终端尺寸失败", error),
    }
}

#[tauri::command]
pub fn terminal_close_session() -> ActionResult {
    match embedded_terminal::close_session() {
        Ok(_) => ActionResult::ok_with_code("terminal_closed", "内置终端已关闭"),
        Err(error) => ActionResult::err("terminal_close_failed", "关闭内置终端失败", error),
    }
}

#[tauri::command]
pub fn launch_cli_uninstall(key: String) -> ActionResult {
    let Some(profile) = find_cli_install_profile(&key) else {
        return ActionResult::err(
            "install_profile_missing",
            "启动卸载失败",
            format!("不支持的 CLI key: {key}"),
        );
    };

    let script = build_uninstall_script(profile.uninstall_command);
    let config = state::load_app_config();
    let launch_plan = terminal::build_launch_plan(&config);
    let launch = launch_plan.build_install_command(&script);
    let resolution = launch.resolution.clone();

    match launch_visible_install_terminal(&launch) {
        Ok(_) => {
            logging::log_line(&format!(
                "[uninstall-assist] started key={} requested_terminal={} effective_terminal={} fallback={:?} theme={} install_theme_applied={} command={}",
                profile.key,
                resolution.requested_mode,
                resolution.effective_mode,
                resolution.fallback_reason,
                launch_plan.theme_id(),
                launch_plan.install_theme_applied(),
                profile.uninstall_command
            ));
            let mut detail = profile.uninstall_command.to_string();
            if let Some(reason) = resolution.fallback_reason {
                detail.push_str(&format!(
                    "\nterminal fallback: requested={} effective={} reason={reason}",
                    resolution.requested_mode, resolution.effective_mode
                ));
            }
            ActionResult {
                ok: true,
                code: "uninstall_launch_started".to_string(),
                message: format!(
                    "已启动 {} 卸载终端，请在终端中完成交互。卸载完成后请点击“刷新 CLI 检测”确认状态。",
                    profile.display_name
                ),
                detail: Some(detail),
            }
        }
        Err(error) => ActionResult::err("uninstall_launch_failed", "启动卸载失败", error),
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
pub fn open_winget_install_page() -> ActionResult {
    if !is_allowed_docs_url(WINGET_STORE_URL) {
        return ActionResult::err(
            "docs_domain_not_allowed",
            "打开页面失败",
            format!("文档域名不在白名单中: {WINGET_STORE_URL}"),
        );
    }

    match open_url_in_system_browser(WINGET_STORE_URL) {
        Ok(_) => ActionResult {
            ok: true,
            code: "open_winget_page_started".to_string(),
            message: "已通过系统浏览器打开 winget 官方安装页面".to_string(),
            detail: Some(WINGET_STORE_URL.to_string()),
        },
        Err(error) => ActionResult::err("open_winget_page_failed", "打开页面失败", error),
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
pub fn preview_context_menu_plan(config: AppConfig) -> Result<context_menu_builder::RegistryWritePlan, String> {
    let normalized = prepare_config_for_save(config, state::load_app_config().runtime);
    context_menu_service::preview_registry_write_plan(&normalized)
}

#[tauri::command]
pub fn list_execlink_context_menus() -> Result<Vec<state::InstalledMenuGroup>, String> {
    context_menu_service::list_installed_menu_groups()
}

#[tauri::command]
pub fn detect_legacy_menu_artifacts() -> Result<Vec<state::LegacyArtifact>, String> {
    context_menu_service::detect_legacy_artifacts()
}

#[tauri::command]
pub fn remove_all_execlink_context_menus() -> ActionResult {
    match context_menu_service::remove_all_context_menus() {
        Ok(removed) => ActionResult {
            ok: true,
            code: "context_menu_removed".to_string(),
            message: "已移除 ExecLink 右键菜单".to_string(),
            detail: Some(format!("共删除 {} 个注册表路径。", removed)),
        },
        Err(error) => ActionResult::err("context_menu_remove_failed", "移除 ExecLink 右键菜单失败", error),
    }
}

#[tauri::command]
pub fn notify_shell_changed() -> ActionResult {
    match shell_notify::notify_shell_changed() {
        Ok(()) => {
            let _ = state::mark_activate_success();
            ActionResult::ok_with_code("shell_notified", "已通知 Explorer 刷新右键菜单")
        }
        Err(error) => {
            let _ = state::mark_runtime_error(format!("shell_notify_failed: {error}"));
            ActionResult::err("shell_notify_failed", "通知 Explorer 刷新失败", error)
        }
    }
}

#[tauri::command]
pub fn restart_explorer_fallback() -> ActionResult {
    match shell_notify::restart_explorer_fallback() {
        Ok(()) => ActionResult::ok_with_code("explorer_restarted", "已重启 Explorer"),
        Err(error) => ActionResult::err("explorer_restart_failed", "重启 Explorer 失败", error),
    }
}

#[tauri::command]
pub fn migrate_legacy_hkcu_menu_to_v2() -> ActionResult {
    let config = state::load_app_config();
    match context_menu_service::migrate_legacy_to_v2(&config) {
        Ok(report) => ActionResult {
            ok: true,
            code: "legacy_migrated".to_string(),
            message: "已迁移 legacy HKCU 菜单到 v2".to_string(),
            detail: Some(format!(
                "迁移 legacy 路径 {} 个，写入新键 {} 个。",
                report.migrated_legacy_paths, report.written_keys
            )),
        },
        Err(error) => ActionResult::err("legacy_migration_failed", "迁移 legacy 菜单失败", error),
    }
}

#[tauri::command]
pub fn cleanup_nilesoft_artifacts() -> ActionResult {
    match context_menu_service::cleanup_nilesoft_artifacts() {
        Ok(summary) => ActionResult {
            ok: true,
            code: "nilesoft_artifacts_cleaned".to_string(),
            message: "已清理旧 Nilesoft 残留".to_string(),
            detail: Some(format!(
                "删除注册表路径 {} 个，删除运行时目录 {} 个。",
                summary.removed_registry_paths, summary.removed_runtime_dirs
            )),
        },
        Err(error) => ActionResult::err("nilesoft_artifacts_cleanup_failed", "清理旧 Nilesoft 残留失败", error),
    }
}

#[tauri::command]
pub fn enable_win11_classic_context_menu() -> ActionResult {
    match win11_classic_menu::enable() {
        Ok(status) => ActionResult {
            ok: true,
            code: "win11_classic_menu_enabled".to_string(),
            message: "已启用 Win11 经典右键菜单".to_string(),
            detail: Some(format!(
                "{}\n注册表路径：{}",
                status.message, status.registry_path
            )),
        },
        Err(error) => ActionResult::err(
            "win11_classic_menu_enable_failed",
            "启用 Win11 经典右键菜单失败",
            error,
        ),
    }
}

#[tauri::command]
pub fn disable_win11_classic_context_menu() -> ActionResult {
    match win11_classic_menu::disable() {
        Ok(status) => ActionResult {
            ok: true,
            code: "win11_classic_menu_disabled".to_string(),
            message: "已恢复 Win11 原生顶层右键菜单".to_string(),
            detail: Some(format!(
                "{}\n注册表路径：{}",
                status.message, status.registry_path
            )),
        },
        Err(error) => ActionResult::err(
            "win11_classic_menu_disable_failed",
            "恢复 Win11 原生顶层右键菜单失败",
            error,
        ),
    }
}

#[tauri::command]
pub fn apply_config(config: AppConfig) -> ActionResult {
    let config = prepare_config_for_save(config, state::load_app_config().runtime);
    if let Err(error) = state::save_app_config(&config) {
        return ActionResult::err("save_config_failed", "保存配置失败", error);
    }

    let config = state::load_app_config();
    match context_menu_service::apply_context_menu(&config) {
        Ok(report) => {
            let _ = state::mark_apply_success();
            let _ = state::mark_activate_success();
            ActionResult {
                ok: true,
                code: "context_menu_applied".to_string(),
                message: if report.group_count == 0 {
                    if config.enable_context_menu {
                        "未检测到已安装 CLI，已跳过生成 ExecLink 右键菜单".to_string()
                    } else {
                        "已移除 ExecLink 右键菜单".to_string()
                    }
                } else {
                    "已应用 ExecLink v2 右键菜单".to_string()
                },
                detail: Some(format!(
                    "删除路径 {} 个，写入键 {} 个。",
                    report.removed_paths, report.written_keys
                )),
            }
        }
        Err(error) => {
            let _ = state::mark_runtime_error(format!("apply_context_menu_failed: {error}"));
            ActionResult::err("context_menu_apply_failed", "应用右键菜单失败", error)
        }
    }
}

#[tauri::command]
pub fn get_diagnostics(_app: AppHandle) -> DiagnosticsInfo {
    let config = state::load_app_config();
    let terminal_plan = terminal::build_launch_plan(&config);
    let terminal_resolution = terminal_plan.resolution();
    let terminal_capabilities = terminal_plan.capabilities().clone();
    let log_path = logging::log_file_path().map(|p| p.display().to_string());
    let log_tail = logging::read_tail_lines(80);
    let context_menu_status = context_menu_service::inspect_context_menu_status()
        .unwrap_or_else(|error| state::ContextMenuStatus::empty(error));
    let win11_classic_menu_status = win11_classic_menu::inspect_status()
        .unwrap_or_else(|error| state::Win11ClassicMenuStatus::empty(error));
    let installed_menu_groups =
        context_menu_service::list_installed_menu_groups().unwrap_or_default();
    let legacy_artifacts = context_menu_service::detect_legacy_artifacts().unwrap_or_default();

    DiagnosticsInfo {
        generated_at: now_epoch_seconds(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        build_channel: if cfg!(debug_assertions) {
            "debug".to_string()
        } else {
            "release".to_string()
        },
        app_root: state::app_root_dir().ok().map(|p| p.display().to_string()),
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
        context_menu_status,
        win11_classic_menu_status,
        installed_menu_groups,
        legacy_artifacts,
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
    notify_shell_changed()
}

#[tauri::command]
pub fn run_startup_check() -> ActionResult {
    refresh_context_menu_icons_best_effort();
    match context_menu_service::inspect_context_menu_status() {
        Ok(status) => {
            let win11_status = win11_classic_menu::inspect_status()
                .unwrap_or_else(|error| state::Win11ClassicMenuStatus::empty(error));
            logging::log_line(&format!(
                "[startup] context menu applied={} legacy={} win11_classic_menu={}",
                status.applied, status.has_legacy_artifacts, win11_status.enabled
            ));
            ActionResult::ok("启动检查完成")
        }
        Err(error) => ActionResult::err("startup_check_failed", "启动检查失败", error),
    }
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
    fn should_parse_git_install_source() {
        assert_eq!(
            parse_git_install_source(Some("tuna".to_string())),
            GitInstallSource::Tuna
        );
        assert_eq!(
            parse_git_install_source(Some("official".to_string())),
            GitInstallSource::Official
        );
        assert_eq!(
            parse_git_install_source(Some("unexpected".to_string())),
            GitInstallSource::Official
        );
        assert_eq!(parse_git_install_source(None), GitInstallSource::Official);
    }

    #[test]
    fn should_parse_winget_install_source() {
        assert_eq!(
            parse_winget_install_source(Some("tuna".to_string())),
            WingetInstallSource::Tuna
        );
        assert_eq!(
            parse_winget_install_source(Some("official".to_string())),
            WingetInstallSource::Official
        );
        assert_eq!(
            parse_winget_install_source(Some("unexpected".to_string())),
            WingetInstallSource::Official
        );
        assert_eq!(
            parse_winget_install_source(None),
            WingetInstallSource::Official
        );
    }

    #[test]
    fn should_build_official_git_only_prereq_command() {
        let command =
            build_prereq_install_command(true, false, GitInstallSource::Official).expect("command");
        assert!(command.contains(GIT_WINGET_INSTALL_COMMAND));
        assert!(!command.contains(NODEJS_WINGET_INSTALL_COMMAND));
    }

    #[test]
    fn should_build_tuna_git_and_node_prereq_command() {
        let command =
            build_prereq_install_command(true, true, GitInstallSource::Tuna).expect("command");
        assert!(command.contains("github-release/git-for-windows/git/LatestRelease/"));
        assert!(command.contains("$latestReleasePage.Links"));
        assert!(command.contains("Git%20for%20Windows%20v"));
        assert!(command.contains("$tunaUrl = [System.Uri]::new($baseUri, $installerHref).AbsoluteUri"));
        assert!(!command.contains("$latestReleaseUrl$installerName"));
        assert!(command.contains(NODEJS_WINGET_INSTALL_COMMAND));
        assert!(!command.contains("api.github.com/repos/git-for-windows/git/releases/latest"));
        assert!(!command.contains("releases/download"));
    }

    #[test]
    fn should_skip_prereq_command_when_everything_exists() {
        let command = build_prereq_install_command(false, false, GitInstallSource::Official);
        assert!(command.is_none());
    }

    #[test]
    fn should_build_official_winget_bootstrap_command() {
        let command = build_winget_bootstrap_command(WingetInstallSource::Official);
        assert!(command.contains("Get-Command winget"));
        assert!(command.contains("https://aka.ms/getwinget"));
        assert!(!command.contains("github-release/microsoft/winget-cli/LatestRelease/"));
        assert!(!command.contains("$tunaPage.Links"));
        assert!(command.contains("Add-AppxPackage"));
        assert!(command.contains("winget not found after installation"));
    }

    #[test]
    fn should_build_tuna_winget_bootstrap_command() {
        let command = build_winget_bootstrap_command(WingetInstallSource::Tuna);
        assert!(command.contains("github-release/microsoft/winget-cli/LatestRelease/"));
        assert!(command.contains("$tunaPage.Links"));
        assert!(command.contains("Microsoft\\.DesktopAppInstaller_.*_8wekyb3d8bbwe\\.msixbundle"));
        assert!(command.contains("Add-AppxPackage"));
        assert!(command.contains("winget not found after installation"));
        assert!(!command.contains("https://aka.ms/getwinget"));
    }

    #[test]
    fn should_include_qwencode_and_opencode_hints() {
        let hints = get_cli_install_hints();
        assert!(hints.contains_key("qwencode"));
        assert!(hints.contains_key("opencode"));
    }

    #[test]
    fn should_use_npm_commands_for_claude_profile() {
        let hints = get_cli_install_hints();
        let claude = hints.get("claude").expect("claude hint");
        assert_eq!(claude.install_command, "npm install -g @anthropic-ai/claude-code");
        assert_eq!(
            claude.upgrade_command.as_deref(),
            Some("npm install -g @anthropic-ai/claude-code@latest")
        );
        assert_eq!(claude.uninstall_command, "npm uninstall -g @anthropic-ai/claude-code");
        assert!(claude.requires_node);
        assert!(!claude.risk_remote_script);
    }

    #[test]
    fn should_build_user_path_append_command() {
        let command = build_add_user_path_command(Path::new(r"C:\Users\tester\AppData\Roaming\npm"));
        assert!(command.contains("SetEnvironmentVariable('Path'"));
        assert!(command.contains("C:\\Users\\tester\\AppData\\Roaming\\npm"));
    }

}



