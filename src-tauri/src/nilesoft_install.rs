use crate::{
    logging, nilesoft, process_util,
    state::{self, AppResult, InstallStatus},
};
use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
    process::Output,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{path::BaseDirectory, AppHandle, Manager};
use walkdir::WalkDir;
use zip::ZipArchive;

const ZIP_NAME: &str = "nilesoft.zip";
const REGISTER_STATE_NAME: &str = ".register-state.json";
const NILESOFT_CLSID: &str = "{BAE3934B-8A6A-4BFB-81BD-3FC599A1BAF1}";
const REGISTER_VERIFY_TIMEOUT: Duration = Duration::from_secs(8);
const REGISTER_VERIFY_INTERVAL: Duration = Duration::from_millis(250);

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

pub fn clear_register_state() -> AppResult<()> {
    let root = resolve_install_root()?;
    let path = register_state_file(&root);
    if !path.exists() {
        return Ok(());
    }
    fs::remove_file(&path).map_err(|e| format!("清理注册状态标记失败: {e}"))
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
    let expected_norm = normalize_path_for_compare(expected_root);
    let started = Instant::now();
    let mut last_error = "注册后未检测到系统 ContextMenuHandler。".to_string();

    loop {
        if let Some(active_root) = registered_shell_root_dir() {
            let active_norm = normalize_path_for_compare(&active_root);
            if expected_norm == active_norm {
                return Ok(());
            }
            last_error = format!(
                "注册后系统路径仍不一致: active={} current={}",
                active_root.display(),
                expected_root.display()
            );
        }

        if started.elapsed() >= REGISTER_VERIFY_TIMEOUT {
            break;
        }
        thread::sleep(REGISTER_VERIFY_INTERVAL);
    }

    Err(last_error)
}

fn merge_copy_dir_recursive_skip_existing(src: &Path, dest: &Path) -> AppResult<()> {
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
            merge_copy_dir_recursive_skip_existing(&src_path, &dest_path)?;
            continue;
        }

        if dest_path.exists() {
            continue;
        }

        fs::copy(&src_path, &dest_path).map_err(|e| {
            format!(
                "复制缺失文件失败 ({} -> {}): {e}",
                src_path.display(),
                dest_path.display()
            )
        })?;
    }
    Ok(())
}

fn recover_install_root_from_source(source_root: &Path, target_root: &Path) -> AppResult<()> {
    let source_norm = normalize_path_for_compare(source_root);
    let target_norm = normalize_path_for_compare(target_root);
    if source_norm == target_norm {
        return Err("恢复安装目录失败：源目录与目标目录相同".to_string());
    }

    if !source_root.exists() {
        return Err(format!("恢复安装目录失败：源目录不存在 ({})", source_root.display()));
    }
    if find_shell_exe(source_root).is_none() {
        return Err(format!(
            "恢复安装目录失败：源目录未检测到 shell.exe ({})",
            source_root.display()
        ));
    }

    // Avoid deleting/replacing files in target root because shell.dll may be loaded by Explorer
    // and locked (os error 32). We only backfill missing files.
    merge_copy_dir_recursive_skip_existing(source_root, target_root)?;
    if find_shell_exe(target_root).is_none() {
        return Err(format!(
            "恢复安装目录失败：复制后目标目录仍未检测到 shell.exe ({})",
            target_root.display()
        ));
    }
    Ok(())
}

fn try_recover_install_root_from_registered_root(target_root: &Path) -> AppResult<bool> {
    let Some(registered_root) = registered_shell_root_dir() else {
        return Ok(false);
    };

    logging::log_line(&format!(
        "[install] detected registered root candidate for recovery: {}",
        registered_root.display()
    ));
    recover_install_root_from_source(&registered_root, target_root)?;
    logging::log_line(&format!(
        "[install] recovered install root from registered root: {} -> {}",
        registered_root.display(),
        target_root.display()
    ));
    Ok(true)
}

fn unique_backfill_temp_dir() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("execlink-nilesoft-backfill-{nanos}"))
}

fn backfill_missing_files_from_package(app: &AppHandle, target_root: &Path) -> AppResult<()> {
    let zip_path = resolve_resource_zip(app)?;
    let temp_root = unique_backfill_temp_dir();
    fs::create_dir_all(&temp_root).map_err(|e| format!("创建临时修复目录失败: {e}"))?;

    let backfill_result = (|| -> AppResult<()> {
        unzip_to_dir(&zip_path, &temp_root)?;
        merge_copy_dir_recursive_skip_existing(&temp_root, target_root)?;
        Ok(())
    })();

    if let Err(error) = fs::remove_dir_all(&temp_root) {
        logging::log_line(&format!(
            "[install] cleanup backfill temp dir failed ({}): {error}",
            temp_root.display()
        ));
    }

    backfill_result
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

    let code = output.status.code().unwrap_or(-1);
    let detail = command_output_detail(&output.stdout, &output.stderr);
    if detail.is_empty() {
        Err(format!("注册失败 (exit code={code})"))
    } else {
        Err(format!("注册失败 (exit code={code}): {detail}"))
    }
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

    let code = output.status.code().unwrap_or(-1);
    let detail = command_output_detail(&output.stdout, &output.stderr);
    if detail.is_empty() {
        Err(format!("提权注册失败 (exit code={code})"))
    } else {
        Err(format!("提权注册失败 (exit code={code}): {detail}"))
    }
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

    parse_unregister_output(output)
}

pub fn attempt_unregister_elevated(shell_exe: &Path) -> AppResult<UnregisterResult> {
    logging::log_line(&format!(
        "[install] attempt unregister elevated via runas: {}",
        shell_exe.display()
    ));

    let exe_path = shell_exe.display().to_string().replace('\'', "''");
    let script = format!(
        "$p = Start-Process -FilePath '{exe_path}' -ArgumentList '-unregister','-restart' -Verb RunAs -Wait -PassThru; exit $p.ExitCode"
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
        .map_err(|e| format!("触发提权反注册失败: {e}"))?;

    parse_unregister_output(output).map_err(|e| format!("提权反注册失败: {e}"))
}

fn parse_unregister_output(output: Output) -> AppResult<UnregisterResult> {
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

fn build_install_status(
    install_root: &Path,
    shell: &Path,
    config_root: Option<String>,
    active_root: Option<PathBuf>,
    register_state: Option<RegisterState>,
) -> InstallStatus {
    let shell_text = Some(shell.display().to_string());
    let expected_root = shell.parent().unwrap_or(install_root);

    if let Some(active_root) = active_root {
        let active_norm = normalize_path_for_compare(&active_root);
        let expected_norm = normalize_path_for_compare(expected_root);
        if active_norm == expected_norm {
            return InstallStatus::ready("已安装并完成注册", shell_text, config_root);
        }
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

    if let Some(saved) = register_state {
        if saved.attempted && !saved.registered {
            let detail = saved
                .detail
                .unwrap_or_else(|| "普通权限注册失败，请点击提权重试".to_string());
            return InstallStatus::installed_unregistered(
                format!("已安装但未完成注册：{detail}"),
                shell_text,
                config_root,
                true,
            );
        }
    }

    InstallStatus::installed_unregistered(
        "已安装，但未检测到系统注册状态。可点击“安装/修复 Nilesoft”重试注册。",
        shell_text,
        config_root,
        false,
    )
}

pub fn inspect_installation() -> InstallStatus {
    let root = match resolve_install_root() {
        Ok(value) => value,
        Err(error) => return InstallStatus::not_installed(error),
    };

    let Some(shell) = find_shell_exe(&root) else {
        return InstallStatus::not_installed("尚未安装 Nilesoft");
    };

    let config_root = nilesoft::resolve_effective_config_root(&shell, &root)
        .ok()
        .map(|resolved| resolved.root.display().to_string());
    let register_state = load_register_state(&root);
    let active_root = registered_shell_root_dir();
    build_install_status(&root, &shell, config_root, active_root, register_state)
}

pub fn ensure_installed(app: &AppHandle) -> AppResult<InstallStatus> {
    let root = resolve_install_root()?;
    fs::create_dir_all(&root).map_err(|e| format!("创建安装目录失败: {e}"))?;

    if find_shell_exe(&root).is_none() {
        let install_result = (|| -> AppResult<()> {
            let zip = resolve_resource_zip(app)?;
            unzip_to_dir(&zip, &root)?;
            Ok(())
        })();

        if let Err(install_error) = install_result {
            logging::log_line(&format!(
                "[install] package installation failed, trying recovery from registered root: {install_error}"
            ));
            match try_recover_install_root_from_registered_root(&root) {
                Ok(true) => {
                    logging::log_line(
                        "[install] install recovery completed from registered root, continue registration flow",
                    );
                }
                Ok(false) => {
                    return Err(format!(
                        "安装/修复失败，且未找到可恢复的系统注册目录。原始错误: {install_error}"
                    ));
                }
                Err(recover_error) => {
                    return Err(format!(
                        "安装/修复失败。原始错误: {install_error}; 自动恢复失败: {recover_error}"
                    ));
                }
            }
        }
    }

    if let Err(error) = backfill_missing_files_from_package(app, &root) {
        logging::log_line(&format!(
            "[install] backfill missing package files skipped due to error: {error}"
        ));
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("execlink-{prefix}-{nanos}"))
    }

    fn sample_register_state(attempted: bool, registered: bool, detail: Option<&str>) -> RegisterState {
        RegisterState {
            attempted,
            registered,
            updated_at: "0".to_string(),
            shell_exe: None,
            detail: detail.map(str::to_string),
        }
    }

    #[test]
    fn should_mark_ready_when_registry_matches_shell_root() {
        let install_root = PathBuf::from(r"C:\Users\tester\AppData\Local\execlink\nilesoft-shell");
        let shell = install_root.join("shell.exe");
        let status = build_install_status(
            &install_root,
            &shell,
            Some("config".to_string()),
            Some(install_root.clone()),
            Some(sample_register_state(true, false, Some("legacy failure"))),
        );

        assert!(status.installed);
        assert!(status.registered);
        assert!(!status.needs_elevation);
    }

    #[test]
    fn should_mark_unregistered_when_registry_missing_even_if_saved_registered() {
        let install_root = PathBuf::from(r"C:\Users\tester\AppData\Local\execlink\nilesoft-shell");
        let shell = install_root.join("shell.exe");
        let status = build_install_status(
            &install_root,
            &shell,
            Some("config".to_string()),
            None,
            Some(sample_register_state(true, true, None)),
        );

        assert!(status.installed);
        assert!(!status.registered);
        assert!(!status.needs_elevation);
    }

    #[test]
    fn should_require_elevation_when_registry_points_to_other_root() {
        let install_root = PathBuf::from(r"C:\Users\tester\AppData\Local\execlink\nilesoft-shell");
        let shell = install_root.join("shell.exe");
        let status = build_install_status(
            &install_root,
            &shell,
            Some("config".to_string()),
            Some(PathBuf::from(r"C:\Other\nilesoft")),
            None,
        );

        assert!(status.installed);
        assert!(!status.registered);
        assert!(status.needs_elevation);
    }

    #[test]
    fn should_recover_install_root_from_source() {
        let source_root = temp_dir("recover-src");
        let target_root = temp_dir("recover-dst");
        let source_nested = source_root.join("nested");
        let source_shell = source_root.join("shell.exe");
        let source_conf = source_nested.join("shell.nss");

        fs::create_dir_all(&source_nested).expect("create source nested");
        fs::write(&source_shell, b"shell").expect("write shell");
        fs::write(&source_conf, b"config").expect("write config");

        recover_install_root_from_source(&source_root, &target_root).expect("recover from source");

        assert!(target_root.join("shell.exe").exists());
        assert!(target_root.join("nested").join("shell.nss").exists());

        let _ = fs::remove_dir_all(&source_root);
        let _ = fs::remove_dir_all(&target_root);
    }

    #[test]
    fn should_fail_recover_when_source_and_target_are_same() {
        let root = temp_dir("recover-same");
        fs::create_dir_all(&root).expect("create root");
        fs::write(root.join("shell.exe"), b"shell").expect("write shell");

        let error = recover_install_root_from_source(&root, &root).expect_err("should fail on same path");
        assert!(error.contains("源目录与目标目录相同"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn should_not_overwrite_existing_files_when_recovering() {
        let source_root = temp_dir("recover-noswap-src");
        let target_root = temp_dir("recover-noswap-dst");
        fs::create_dir_all(&source_root).expect("create source");
        fs::create_dir_all(&target_root).expect("create target");

        fs::write(source_root.join("shell.exe"), b"source-shell").expect("write source shell");
        fs::write(source_root.join("shell.dll"), b"source-dll").expect("write source dll");
        fs::write(target_root.join("shell.dll"), b"target-dll").expect("write target dll");

        recover_install_root_from_source(&source_root, &target_root).expect("recover");

        let shell_exe = fs::read(target_root.join("shell.exe")).expect("read shell exe");
        let shell_dll = fs::read(target_root.join("shell.dll")).expect("read shell dll");
        assert_eq!(shell_exe, b"source-shell");
        assert_eq!(shell_dll, b"target-dll");

        let _ = fs::remove_dir_all(&source_root);
        let _ = fs::remove_dir_all(&target_root);
    }
}
