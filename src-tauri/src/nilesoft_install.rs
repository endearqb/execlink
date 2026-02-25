use crate::{
    logging, nilesoft, process_util,
    state::{self, AppResult, InstallStatus},
};
use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{path::BaseDirectory, AppHandle, Manager};
use walkdir::WalkDir;
use zip::ZipArchive;

const ZIP_NAME: &str = "nilesoft.zip";
const REGISTER_STATE_NAME: &str = ".register-state.json";
const NILESOFT_CLSID: &str = "{BAE3934B-8A6A-4BFB-81BD-3FC599A1BAF1}";

#[derive(Debug, Clone)]
pub enum UnregisterResult {
    Done,
    NotSupported(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RegisterState {
    attempted: bool,
    registered: bool,
    updated_at: String,
    shell_exe: Option<String>,
    detail: Option<String>,
}

fn now_epoch_seconds() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn marker_file(root: &Path) -> PathBuf {
    root.join(".installed")
}

fn register_state_file(root: &Path) -> PathBuf {
    root.join(REGISTER_STATE_NAME)
}

fn load_register_state(root: &Path) -> Option<RegisterState> {
    let path = register_state_file(root);
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str::<RegisterState>(&text).ok()
}

fn save_register_state(root: &Path, state: &RegisterState) -> AppResult<()> {
    let path = register_state_file(root);
    let text =
        serde_json::to_string_pretty(state).map_err(|e| format!("序列化注册状态失败: {e}"))?;
    fs::write(path, text).map_err(|e| format!("写入注册状态失败: {e}"))
}

fn persist_register_state(
    shell_exe: &Path,
    registered: bool,
    detail: Option<String>,
) -> AppResult<()> {
    let root = resolve_install_root()?;
    let payload = RegisterState {
        attempted: true,
        registered,
        updated_at: now_epoch_seconds(),
        shell_exe: Some(shell_exe.display().to_string()),
        detail,
    };
    save_register_state(&root, &payload)
}

pub fn mark_register_success(shell_exe: &Path) {
    if let Err(error) = persist_register_state(shell_exe, true, None) {
        logging::log_line(&format!(
            "[install] failed to persist register success: {error}"
        ));
    }
}

pub fn mark_register_failure(shell_exe: &Path, detail: impl Into<String>) {
    if let Err(error) = persist_register_state(shell_exe, false, Some(detail.into())) {
        logging::log_line(&format!(
            "[install] failed to persist register failure: {error}"
        ));
    }
}

pub fn resolve_install_root() -> AppResult<PathBuf> {
    state::nilesoft_root_dir()
}

pub fn resolve_resource_zip(app: &AppHandle) -> AppResult<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    let mut push_candidate = |path: PathBuf| {
        if !candidates.iter().any(|existing| existing == &path) {
            candidates.push(path);
        }
    };

    if let Ok(path) = app.path().resolve(ZIP_NAME, BaseDirectory::Resource) {
        push_candidate(path);
    }

    if let Ok(path) = app.path().resolve(format!("resources/{ZIP_NAME}"), BaseDirectory::Resource)
    {
        push_candidate(path);
    }

    if let Ok(dir) = app.path().resource_dir() {
        push_candidate(dir.join(ZIP_NAME));
        push_candidate(dir.join("resources").join(ZIP_NAME));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            push_candidate(exe_dir.join(ZIP_NAME));
            push_candidate(exe_dir.join("resources").join(ZIP_NAME));
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        push_candidate(cwd.join("resources").join(ZIP_NAME));
        push_candidate(cwd.join("src-tauri").join("resources").join(ZIP_NAME));

        if let Some(parent) = cwd.parent() {
            push_candidate(parent.join("resources").join(ZIP_NAME));
            push_candidate(parent.join("src-tauri").join("resources").join(ZIP_NAME));
        }
    }

    push_candidate(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join(ZIP_NAME));

    for candidate in &candidates {
        if candidate.exists() {
            logging::log_line(&format!(
                "[install] resolved nilesoft zip: {}",
                candidate.display()
            ));
            return Ok(candidate.clone());
        }
    }

    let attempted = candidates
        .iter()
        .map(|path| format!("- {}", path.display()))
        .collect::<Vec<_>>()
        .join("\n");

    Err(format!(
        "未找到捆绑资源 {ZIP_NAME}，请确认 src-tauri/resources/{ZIP_NAME} 存在。\n已尝试路径:\n{attempted}"
    ))
}

fn command_output_detail(stdout: &[u8], stderr: &[u8]) -> String {
    let stdout_text = String::from_utf8_lossy(stdout).trim().to_string();
    let stderr_text = String::from_utf8_lossy(stderr).trim().to_string();
    match (!stdout_text.is_empty(), !stderr_text.is_empty()) {
        (true, true) => format!("stdout: {stdout_text}; stderr: {stderr_text}"),
        (true, false) => format!("stdout: {stdout_text}"),
        (false, true) => format!("stderr: {stderr_text}"),
        (false, false) => String::new(),
    }
}

fn query_registered_shell_dll_from_registry() -> Option<PathBuf> {
    let key = format!(r"Registry::HKEY_CLASSES_ROOT\CLSID\{}\InprocServer32", NILESOFT_CLSID);
    let script = format!(
        "$utf8=[System.Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=$utf8; $OutputEncoding=$utf8; $v=(Get-ItemProperty -LiteralPath '{key}' -Name '(default)' -ErrorAction SilentlyContinue).'(default)'; if ($v) {{ Write-Output $v }}"
    );
    let output = process_util::command_hidden("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(PathBuf::from(path))
    }
}

pub fn registered_shell_root_dir() -> Option<PathBuf> {
    query_registered_shell_dll_from_registry().and_then(|dll| dll.parent().map(|p| p.to_path_buf()))
}

fn normalize_path_for_compare(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\").to_ascii_lowercase()
}

fn ensure_registration_points_to(shell_exe: &Path) -> AppResult<()> {
    let expected_root = shell_exe
        .parent()
        .ok_or_else(|| format!("shell.exe 路径非法: {}", shell_exe.display()))?;
    let Some(active_root) = registered_shell_root_dir() else {
        return Err("注册后未检测到系统 ContextMenuHandler。".to_string());
    };

    let expected_norm = normalize_path_for_compare(expected_root);
    let active_norm = normalize_path_for_compare(&active_root);
    if expected_norm == active_norm {
        return Ok(());
    }

    Err(format!(
        "注册后系统路径仍不一致: active={} current={}",
        active_root.display(),
        expected_root.display()
    ))
}

fn unzip_to_dir(zip_path: &Path, target: &Path) -> AppResult<()> {
    logging::log_line(&format!("[install] extracting zip: {}", zip_path.display()));

    let file = fs::File::open(zip_path)
        .map_err(|e| format!("打开 nilesoft zip 失败 ({}): {e}", zip_path.display()))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("解析 zip 失败: {e}"))?;

    fs::create_dir_all(target).map_err(|e| format!("创建安装目录失败: {e}"))?;

    for index in 0..archive.len() {
        let mut item = archive
            .by_index(index)
            .map_err(|e| format!("读取 zip 条目失败: {e}"))?;

        let enclosed = item
            .enclosed_name()
            .ok_or_else(|| format!("zip 条目路径非法: {}", item.name()))?
            .to_path_buf();

        let out_path = target.join(enclosed);

        if item.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|e| format!("创建目录失败 ({}): {e}", out_path.display()))?;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建父目录失败 ({}): {e}", parent.display()))?;
        }

        let mut output = fs::File::create(&out_path)
            .map_err(|e| format!("创建文件失败 ({}): {e}", out_path.display()))?;

        io::copy(&mut item, &mut output)
            .map_err(|e| format!("解压文件失败 ({}): {e}", out_path.display()))?;
    }

    Ok(())
}

pub fn find_shell_exe(root: &Path) -> Option<PathBuf> {
    if !root.exists() {
        return None;
    }

    for entry in WalkDir::new(root).follow_links(true).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }

        let name = entry.file_name().to_string_lossy();
        if name.eq_ignore_ascii_case("shell.exe") {
            return Some(entry.path().to_path_buf());
        }
    }

    None
}

pub fn locate_shell_exe() -> Option<PathBuf> {
    resolve_install_root()
        .ok()
        .and_then(|root| find_shell_exe(&root))
}

fn write_marker(root: &Path) -> AppResult<()> {
    fs::write(marker_file(root), "installed\n").map_err(|e| format!("写入安装标记失败: {e}"))
}

pub fn register_normal(shell_exe: &Path) -> AppResult<()> {
    logging::log_line(&format!(
        "[install] register normal: {} -register -restart",
        shell_exe.display()
    ));

    let output = process_util::command_hidden(shell_exe)
        .args(["-register", "-restart"])
        .output()
        .map_err(|e| format!("执行注册命令失败: {e}"))?;

    if output.status.success() {
        ensure_registration_points_to(shell_exe)?;
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Err(format!("注册失败: {stderr}"))
}

pub fn register_elevated(shell_exe: &Path) -> AppResult<()> {
    logging::log_line(&format!(
        "[install] register elevated via runas: {}",
        shell_exe.display()
    ));

    let exe_path = shell_exe.display().to_string().replace('\'', "''");
    let script = format!(
        "$p = Start-Process -FilePath '{exe_path}' -ArgumentList '-register','-restart' -Verb RunAs -Wait -PassThru; exit $p.ExitCode"
    );

    let output = process_util::command_hidden("powershell.exe")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .output()
        .map_err(|e| format!("触发提权注册失败: {e}"))?;

    if output.status.success() {
        ensure_registration_points_to(shell_exe)?;
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Err(format!("提权注册失败: {stderr}"))
}

pub fn attempt_unregister(shell_exe: &Path) -> AppResult<UnregisterResult> {
    logging::log_line(&format!(
        "[install] attempt unregister: {} -unregister -restart",
        shell_exe.display()
    ));

    let output = process_util::command_hidden(shell_exe)
        .args(["-unregister", "-restart"])
        .output()
        .map_err(|e| format!("执行反注册命令失败: {e}"))?;

    if output.status.success() {
        return Ok(UnregisterResult::Done);
    }

    let code = output.status.code().unwrap_or(-1);
    let detail = command_output_detail(&output.stdout, &output.stderr);
    let normalized = detail.to_ascii_lowercase();
    let not_supported = normalized.contains("unknown")
        || normalized.contains("unrecognized")
        || normalized.contains("invalid")
        || normalized.contains("unsupported")
        || normalized.contains("not support")
        || normalized.contains("parameter");

    if not_supported {
        let message = if detail.is_empty() {
            format!("反注册参数可能不受支持（exit code={code}）")
        } else {
            format!("反注册参数可能不受支持（exit code={code}）: {detail}")
        };
        return Ok(UnregisterResult::NotSupported(message));
    }

    let final_detail = if detail.is_empty() {
        format!("exit code={code}")
    } else {
        format!("exit code={code}; {detail}")
    };
    Err(format!("执行反注册失败: {final_detail}"))
}

pub fn inspect_installation() -> InstallStatus {
    let root = match resolve_install_root() {
        Ok(value) => value,
        Err(error) => return InstallStatus::not_installed(error),
    };

    let Some(shell) = find_shell_exe(&root) else {
        return InstallStatus::not_installed("尚未安装 Nilesoft");
    };

    let shell_text = Some(shell.display().to_string());
    let config_root = nilesoft::resolve_effective_config_root(&shell, &root)
        .ok()
        .map(|resolved| resolved.root.display().to_string());
    let register_state = load_register_state(&root);

    if let Some(active_root) = registered_shell_root_dir() {
        let expected_root = shell.parent().unwrap_or(root.as_path());
        let active_norm = normalize_path_for_compare(&active_root);
        let expected_norm = normalize_path_for_compare(expected_root);
        if active_norm != expected_norm {
            return InstallStatus::installed_unregistered(
                format!(
                    "检测到系统注册目录与当前安装目录不一致：active={} current={}。请点击“提权重试注册”完成迁移。",
                    active_root.display(),
                    expected_root.display()
                ),
                shell_text,
                config_root,
                true,
            );
        }
    }

    if let Some(saved) = register_state {
        if saved.registered {
            let shell_match = saved
                .shell_exe
                .as_ref()
                .map(|value| value == &shell.display().to_string())
                .unwrap_or(false);
            if !shell_match {
                return InstallStatus::installed_unregistered(
                    "检测到 shell.exe 路径变化，需要重新注册。",
                    shell_text,
                    config_root,
                    false,
                );
            }
            return InstallStatus::ready("已安装并完成注册", shell_text, config_root);
        }

        if saved.attempted {
            let detail = saved
                .detail
                .unwrap_or_else(|| "普通权限注册失败，请点击提权重试".to_string());
            return InstallStatus::installed_unregistered(
                format!("已安装但未完成注册: {detail}"),
                shell_text,
                config_root,
                true,
            );
        }
    }

    InstallStatus::installed_unregistered(
        "已安装，尚未确认注册状态。可点击“安装/修复 Nilesoft”重试注册。",
        shell_text,
        config_root,
        false,
    )
}

pub fn ensure_installed(app: &AppHandle) -> AppResult<InstallStatus> {
    let root = resolve_install_root()?;
    fs::create_dir_all(&root).map_err(|e| format!("创建安装目录失败: {e}"))?;

    if find_shell_exe(&root).is_none() {
        let zip = resolve_resource_zip(app)?;
        unzip_to_dir(&zip, &root)?;
    }

    write_marker(&root)?;

    let shell = find_shell_exe(&root)
        .ok_or_else(|| "解压后仍未找到 shell.exe，请检查 nilesoft.zip 结构".to_string())?;

    let resolved = nilesoft::resolve_effective_config_root(&shell, &root).ok();
    let config_root = resolved.as_ref().map(|value| value.root.display().to_string());

    if let Some(value) = resolved.as_ref() {
        let config = state::load_app_config();
        if let Err(error) = nilesoft::apply_config(&value.root, &config) {
            logging::log_line(&format!("[install] apply default config failed: {error}"));
        }
    }

    match register_normal(&shell) {
        Ok(_) => {
            mark_register_success(&shell);
            Ok(InstallStatus::ready(
                "安装并注册完成",
                Some(shell.display().to_string()),
                config_root,
            ))
        }
        Err(error) => {
            mark_register_failure(&shell, error.clone());
            Ok(InstallStatus::installed_unregistered(
                format!("普通权限注册失败: {error}。请确认后提权重试。"),
                Some(shell.display().to_string()),
                config_root,
                true,
            ))
        }
    }
}
