use std::process::Command;

use crate::state::CliStatusMap;

fn where_exists(command: &str) -> bool {
    Command::new("where.exe")
        .arg(command)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

pub fn command_exists(command: &str) -> bool {
    where_exists(command)
}

fn any_exists(commands: &[&str]) -> bool {
    commands.iter().any(|command| where_exists(command))
}

pub fn detect_all_clis() -> CliStatusMap {
    CliStatusMap {
        claude: where_exists("claude"),
        codex: where_exists("codex"),
        gemini: where_exists("gemini"),
        kimi: where_exists("kimi"),
        kimi_web: where_exists("kimi"),
        qwencode: any_exists(&["qwen", "qwencode"]),
        opencode: where_exists("opencode"),
        pwsh: where_exists("pwsh"),
    }
}
