use std::{
    collections::{BTreeMap, HashSet},
    fs,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::{
    detect, embedded_terminal, explorer, logging, nilesoft, nilesoft_install, process_util, terminal,
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
const GIT_WINGET_INSTALL_COMMAND: &str = "winget install --id Git.Git -e --source winget";
const NODEJS_WINGET_INSTALL_COMMAND: &str = "winget install OpenJS.NodeJS";
const GIT_TUNA_LATEST_RELEASE_URL: &str =
    "https://mirrors.tuna.tsinghua.edu.cn/github-release/git-for-windows/git/LatestRelease/";
const KIMI_TARGET_PYTHON_VERSION: &str = "3.13";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GitInstallSource {
    Official,
    Tuna,
}

#[derive(Debug, Clone, Serialize)]
pub struct HkcuMenuGroup {
    pub key: String,
    pub title: String,
    pub roots: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct HkcuMenuGroupRow {
    key: String,
    title: String,
    root: String,
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
        install_command: "irm https://claude.ai/install.ps1 | iex",
        upgrade_command: Some("claude update"),
        uninstall_command: r#"Remove-Item -Path "$env:USERPROFILE\.local\bin\claude.exe" -Force -ErrorAction SilentlyContinue; Remove-Item -Path "$env:USERPROFILE\.local\share\claude" -Recurse -Force -ErrorAction SilentlyContinue"#,
        auth_command: Some("claude"),
        verify_command: Some("claude --version"),
        requires_oauth: false,
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
    incoming.show_nilesoft_default_menus = false;
    incoming.no_exit = true;
    incoming.advanced_menu_mode = false;
    incoming.menu_theme_enabled = false;
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

fn git_install_source_label(source: GitInstallSource) -> &'static str {
    match source {
        GitInstallSource::Official => "官方源",
        GitInstallSource::Tuna => "清华源",
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

fn build_install_script(install_command: &str) -> String {
    format!(
        "$ErrorActionPreference='Continue'; {install_command}; Write-Host ''; Write-Host '安装命令已执行，请在该终端确认结果。'"
    )
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

fn cli_command_for_key(key: &str) -> Option<&'static str> {
    match key {
        "claude" => Some("claude"),
        "codex" => Some("codex"),
        "gemini" => Some("gemini"),
        "kimi" => Some("kimi"),
        "kimi_web" => Some("kimi web"),
        "qwencode" => Some("qwen"),
        "opencode" => Some("opencode"),
        _ => None,
    }
}

fn cli_menu_items_for_config(config: &AppConfig) -> Vec<(String, &'static str)> {
    let mut items = Vec::new();
    let mut seen = HashSet::new();
    for key in &config.cli_order {
        if !seen.insert(key.as_str()) {
            continue;
        }
        let command = match cli_command_for_key(key.as_str()) {
            Some(value) => value,
            None => continue,
        };
        let enabled = match key.as_str() {
            "claude" => config.toggles.claude,
            "codex" => config.toggles.codex,
            "gemini" => config.toggles.gemini,
            "kimi" => config.toggles.kimi,
            "kimi_web" => config.toggles.kimi_web,
            "qwencode" => config.toggles.qwencode,
            "opencode" => config.toggles.opencode,
            _ => false,
        };
        if !enabled {
            continue;
        }
        let title = match key.as_str() {
            "claude" => config.display_names.claude.clone(),
            "codex" => config.display_names.codex.clone(),
            "gemini" => config.display_names.gemini.clone(),
            "kimi" => config.display_names.kimi.clone(),
            "kimi_web" => config.display_names.kimi_web.clone(),
            "qwencode" => config.display_names.qwencode.clone(),
            "opencode" => config.display_names.opencode.clone(),
            _ => continue,
        };
        items.push((title, command));
    }
    items
}

fn shell_for_hkcu_menu() -> &'static str {
    if detect::command_exists("pwsh") {
        "pwsh.exe"
    } else {
        "powershell.exe"
    }
}

fn build_hkcu_menu_script(config: &AppConfig) -> String {
    let menu_name = escape_ps_single_quoted(&config.menu_title);
    let shell = shell_for_hkcu_menu();
    let items = cli_menu_items_for_config(config);
    let mut script = vec![
        "$ErrorActionPreference='Stop'".to_string(),
        format!("$menuName = '{menu_name}'"),
        "$roots = @(\"HKCU:\\Software\\Classes\\Directory\\Background\\shell\", \"HKCU:\\Software\\Classes\\Directory\\shell\")".to_string(),
        "foreach ($root in $roots) {".to_string(),
        "  $base = \"$root\\$menuName\"".to_string(),
        "  New-Item -Path $base -Force | Out-Null".to_string(),
        "  Set-ItemProperty -Path $base -Name 'MUIVerb' -Value $menuName -Force".to_string(),
        "  Set-ItemProperty -Path $base -Name 'Icon' -Value 'powershell.exe,0' -Force".to_string(),
        "  Set-ItemProperty -Path $base -Name 'SubCommands' -Value '' -Force".to_string(),
        "  Remove-Item -Path \"$base\\shell\" -Recurse -Force -ErrorAction SilentlyContinue".to_string(),
    ];

    for (index, (title, command)) in items.iter().enumerate() {
        let order = format!("{:02}", index + 1);
        let title_escaped = escape_ps_single_quoted(title);
        let launch = format!(
            "{shell} -NoExit -ExecutionPolicy Bypass -Command \"Set-Location -LiteralPath ''%V''; {command}\""
        );
        let launch_escaped = escape_ps_single_quoted(&launch);
        script.push(format!("  $sub = \"$base\\shell\\{order}.item\""));
        script.push("  $cmd = \"$sub\\command\"".to_string());
        script.push("  New-Item -Path $sub -Force | Out-Null".to_string());
        script.push(format!(
            "  Set-ItemProperty -Path $sub -Name 'MUIVerb' -Value '{title_escaped}' -Force"
        ));
        script.push("  New-Item -Path $cmd -Force | Out-Null".to_string());
        script.push(format!(
            "  Set-ItemProperty -Path $cmd -Name '(Default)' -Value '{launch_escaped}' -Force"
        ));
    }

    script.push("}".to_string());
    script.push("Write-Output 'hkcu_menu_applied'".to_string());
    script.join("; ")
}

fn build_remove_hkcu_menu_script(menu_title: &str) -> String {
    let menu_name = escape_ps_single_quoted(menu_title);
    [
        "$ErrorActionPreference='Stop'".to_string(),
        format!("$menuName = '{menu_name}'"),
        "$targets = @(\"HKCU:\\Software\\Classes\\Directory\\Background\\shell\\$menuName\", \"HKCU:\\Software\\Classes\\Directory\\shell\\$menuName\")".to_string(),
        "foreach ($target in $targets) { Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue }".to_string(),
        "Write-Output 'hkcu_menu_removed'".to_string(),
    ]
    .join("; ")
}

fn build_list_hkcu_menu_groups_script() -> String {
    [
        "$ErrorActionPreference='Stop'".to_string(),
        "$roots = @('HKCU:\\Software\\Classes\\Directory\\Background\\shell', 'HKCU:\\Software\\Classes\\Directory\\shell')".to_string(),
        "$rows = New-Object System.Collections.Generic.List[Object]".to_string(),
        "foreach ($root in $roots) {".to_string(),
        "  if (!(Test-Path $root)) { continue }".to_string(),
        "  foreach ($entry in Get-ChildItem -Path $root -ErrorAction SilentlyContinue) {".to_string(),
        "    $base = $entry.PSPath".to_string(),
        "    $shellPath = Join-Path $base 'shell'".to_string(),
        "    if (!(Test-Path $shellPath)) { continue }".to_string(),
        "    $cmdValues = @()".to_string(),
        "    foreach ($sub in Get-ChildItem -Path $shellPath -ErrorAction SilentlyContinue) {".to_string(),
        "      $cmdPath = Join-Path $sub.PSPath 'command'".to_string(),
        "      if (!(Test-Path $cmdPath)) { continue }".to_string(),
        "      $val = (Get-ItemProperty -LiteralPath $cmdPath -Name '(Default)' -ErrorAction SilentlyContinue).'(Default)'".to_string(),
        "      if ($val -is [string] -and $val.Length -gt 0) { $cmdValues += $val }".to_string(),
        "    }".to_string(),
        "    if ($cmdValues.Count -eq 0) { continue }".to_string(),
        "    $joined = ($cmdValues -join \"`n\")".to_string(),
        "    $hasCliToken = $joined -match '(claude|codex|gemini|kimi|qwen|opencode)'".to_string(),
        "    $hasExeclinkMarker = ($joined -match \"Set-Location -LiteralPath ''%V'';\") -or ($joined -match '(ExecLink|ExeLink|AI-CLI-Switch|execlink)')".to_string(),
        "    if (-not ($hasCliToken -and $hasExeclinkMarker)) { continue }".to_string(),
        "    $muiVerb = (Get-ItemProperty -LiteralPath $base -Name 'MUIVerb' -ErrorAction SilentlyContinue).MUIVerb".to_string(),
        "    if ([string]::IsNullOrWhiteSpace($muiVerb)) { $muiVerb = $entry.PSChildName }".to_string(),
        "    $rows.Add([PSCustomObject]@{ key = $entry.PSChildName; title = $muiVerb; root = $root }) | Out-Null".to_string(),
        "  }".to_string(),
        "}".to_string(),
        "if ($rows.Count -eq 0) { Write-Output '[]'; exit 0 }".to_string(),
        "$json = $rows | Sort-Object key, root -Unique | ConvertTo-Json -Compress -Depth 4".to_string(),
        "$escaped = [System.Text.RegularExpressions.Regex]::Replace($json, '[^\\u0000-\\u007F]', { param($m) ('\\u{0:x4}' -f [int][char]$m.Value) })".to_string(),
        "Write-Output $escaped".to_string(),
    ]
    .join("; ")
}

fn parse_hkcu_menu_groups(output: &str) -> Result<Vec<HkcuMenuGroup>, String> {
    let trimmed = output.trim();
    if trimmed.is_empty() || trimmed == "null" {
        return Ok(Vec::new());
    }

    let rows = if trimmed.starts_with('[') {
        serde_json::from_str::<Vec<HkcuMenuGroupRow>>(trimmed)
            .map_err(|error| format!("解析分组列表失败: {error}; raw={trimmed}"))?
    } else if trimmed.starts_with('{') {
        vec![
            serde_json::from_str::<HkcuMenuGroupRow>(trimmed)
                .map_err(|error| format!("解析分组对象失败: {error}; raw={trimmed}"))?,
        ]
    } else {
        return Err(format!("分组输出格式异常: {trimmed}"));
    };

    let mut grouped: BTreeMap<String, HkcuMenuGroup> = BTreeMap::new();
    for row in rows {
        if row.key.trim().is_empty() {
            continue;
        }
        let entry = grouped.entry(row.key.clone()).or_insert_with(|| HkcuMenuGroup {
            key: row.key.clone(),
            title: row.title.clone(),
            roots: Vec::new(),
        });
        if !entry.roots.iter().any(|root| root == &row.root) {
            entry.roots.push(row.root);
        }
        if entry.title.trim().is_empty() && !row.title.trim().is_empty() {
            entry.title = row.title;
        }
    }

    Ok(grouped.into_values().collect())
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

fn normalize_path_for_compare(path: &std::path::Path) -> String {
    path.to_string_lossy().replace('/', "\\").to_ascii_lowercase()
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
pub fn repair_context_menu_hkcu(config: AppConfig) -> ActionResult {
    let normalized = prepare_config_for_save(config, state::load_app_config().runtime);
    let script = build_hkcu_menu_script(&normalized);
    match run_powershell_script(&script) {
        Ok(output) => {
            logging::log_line(&format!(
                "[menu-fallback] hkcu menu repaired title={} output={}",
                normalized.menu_title, output
            ));
            ActionResult {
                ok: true,
                code: "menu_fallback_applied".to_string(),
                message: "已应用 HKCU 右键菜单兜底修复".to_string(),
                detail: Some(output),
            }
        }
        Err(error) => ActionResult::err("menu_fallback_failed", "应用 HKCU 右键菜单失败", error),
    }
}

#[tauri::command]
pub fn remove_context_menu_hkcu(menu_title: Option<String>) -> ActionResult {
    let title = menu_title
        .unwrap_or_else(|| state::load_app_config().menu_title)
        .trim()
        .to_string();
    if title.is_empty() {
        return ActionResult::err("menu_title_invalid", "移除 HKCU 菜单失败", "菜单标题不能为空");
    }
    let script = build_remove_hkcu_menu_script(&title);
    match run_powershell_script(&script) {
        Ok(output) => {
            logging::log_line(&format!(
                "[menu-fallback] hkcu menu removed title={} output={}",
                title, output
            ));
            ActionResult {
                ok: true,
                code: "menu_fallback_removed".to_string(),
                message: "已移除 HKCU 右键菜单兜底项".to_string(),
                detail: Some(output),
            }
        }
        Err(error) => ActionResult::err("menu_fallback_remove_failed", "移除 HKCU 菜单失败", error),
    }
}

#[tauri::command]
pub fn list_context_menu_groups_hkcu() -> Result<Vec<HkcuMenuGroup>, String> {
    let script = build_list_hkcu_menu_groups_script();
    let output = run_powershell_script(&script)?;
    parse_hkcu_menu_groups(&output)
}

#[tauri::command]
pub fn refresh_explorer() -> ActionResult {
    let script = "taskkill /f /im explorer.exe | Out-Null; Start-Process explorer.exe | Out-Null; Write-Output 'explorer_refreshed'";
    match run_powershell_script(script) {
        Ok(output) => ActionResult {
            ok: true,
            code: "explorer_refreshed".to_string(),
            message: "已刷新资源管理器".to_string(),
            detail: Some(output),
        },
        Err(error) => ActionResult::err("explorer_refresh_failed", "刷新资源管理器失败", error),
    }
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
    let terminal_resolution = match nilesoft::apply_config(&resolved.root, &render_config) {
        Ok(value) => value,
        Err(error) => {
            let _ = state::mark_runtime_error(format!("apply_config_failed: {error}"));
            return ActionResult::err("apply_failed", "写入配置失败", error);
        }
    };

    let mut written_roots = vec![resolved.root.display().to_string()];
    if let Some(registered_root) = nilesoft_install::registered_shell_root_dir() {
        let primary_norm = normalize_path_for_compare(&resolved.root);
        let registered_norm = normalize_path_for_compare(&registered_root);
        if primary_norm != registered_norm {
            logging::log_line(&format!(
                "[config] registered shell root differs from install root, write both: primary={} registered={}",
                resolved.root.display(),
                registered_root.display()
            ));
            if let Err(error) = nilesoft::apply_config(&registered_root, &render_config) {
                let _ = state::mark_runtime_error(format!("apply_registered_root_failed: {error}"));
                return ActionResult::err(
                    "apply_registered_root_failed",
                    "写入配置失败",
                    format!(
                        "主路径已写入，但系统当前注册路径写入失败: {}; 错误: {}",
                        registered_root.display(),
                        error
                    ),
                );
            }
            written_roots.push(registered_root.display().to_string());
        }
    }

    let _ = state::mark_apply_success();
    let mut message = format!(
        "配置已写入 {}（layout={}，terminal={}）",
        written_roots
            .iter()
            .map(|root| format!("{root}/imports/ai-clis.nss"))
            .collect::<Vec<_>>()
            .join("；"),
        resolved.layout,
        terminal_resolution.effective_mode
    );
    if terminal_resolution.fallback_reason.is_some() {
        message.push_str("，已自动回退到可用终端");
    }
    if written_roots.len() > 1 {
        message.push_str("；检测到系统注册目录与当前安装目录不一致，已自动双写以确保生效");
    }

    ActionResult::ok(message)
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



