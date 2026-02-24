use crate::state::CliStatusMap;
use crate::process_util;

fn where_exists_with_path(command: &str, path_env: Option<&str>) -> bool {
    let mut where_command = process_util::command_hidden("where.exe");
    where_command.arg(command);
    if let Some(path_value) = path_env {
        where_command.env("PATH", path_value);
    }
    where_command
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

pub fn command_exists_with_path(command: &str, path_env: Option<&str>) -> bool {
    where_exists_with_path(command, path_env)
}

pub fn command_exists(command: &str) -> bool {
    let refreshed_path = process_util::refreshed_path_env();
    command_exists_with_path(command, refreshed_path.as_deref())
}

fn any_exists(commands: &[&str], path_env: Option<&str>) -> bool {
    commands
        .iter()
        .any(|command| where_exists_with_path(command, path_env))
}

pub fn detect_all_clis() -> CliStatusMap {
    let refreshed_path = process_util::refreshed_path_env();
    let path_ref = refreshed_path.as_deref();
    CliStatusMap {
        claude: where_exists_with_path("claude", path_ref),
        codex: where_exists_with_path("codex", path_ref),
        gemini: where_exists_with_path("gemini", path_ref),
        kimi: where_exists_with_path("kimi", path_ref),
        kimi_web: where_exists_with_path("kimi", path_ref),
        qwencode: any_exists(&["qwen", "qwencode"], path_ref),
        opencode: where_exists_with_path("opencode", path_ref),
        pwsh: where_exists_with_path("pwsh", path_ref),
    }
}
