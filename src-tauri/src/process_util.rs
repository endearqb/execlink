use std::ffi::OsStr;
use std::process::Command;

#[cfg(windows)]
use std::collections::HashSet;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn command_hidden<S: AsRef<OsStr>>(program: S) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

#[cfg(windows)]
fn read_windows_path_from_scope(scope: &str) -> Option<String> {
    let script = format!(
        "$utf8=[System.Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=$utf8; $OutputEncoding=$utf8; $v=[Environment]::GetEnvironmentVariable('Path','{scope}'); if ($v) {{ [Environment]::ExpandEnvironmentVariables($v) }}"
    );
    let output = command_hidden("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

#[cfg(windows)]
fn append_unique_segments(segments: &mut Vec<String>, seen: &mut HashSet<String>, raw_path: &str) {
    for segment in raw_path.split(';') {
        let entry = segment.trim();
        if entry.is_empty() {
            continue;
        }
        let key = entry.to_ascii_lowercase();
        if seen.insert(key) {
            segments.push(entry.to_string());
        }
    }
}

#[cfg(windows)]
pub fn refreshed_path_env() -> Option<String> {
    let mut segments: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    if let Ok(current_path) = std::env::var("PATH") {
        append_unique_segments(&mut segments, &mut seen, &current_path);
    }
    if let Some(machine_path) = read_windows_path_from_scope("Machine") {
        append_unique_segments(&mut segments, &mut seen, &machine_path);
    }
    if let Some(user_path) = read_windows_path_from_scope("User") {
        append_unique_segments(&mut segments, &mut seen, &user_path);
    }

    if segments.is_empty() {
        None
    } else {
        Some(segments.join(";"))
    }
}

#[cfg(not(windows))]
pub fn refreshed_path_env() -> Option<String> {
    std::env::var("PATH").ok()
}
