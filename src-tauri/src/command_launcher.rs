use crate::{
    detect,
    state::{TerminalMode, AppResult},
};

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RunnerKind {
    Pwsh,
    WindowsPowerShell,
    WindowsTerminal,
}

impl RunnerKind {
    pub fn as_str(self) -> &'static str {
        match self {
            RunnerKind::Pwsh => "pwsh",
            RunnerKind::WindowsPowerShell => "powershell",
            RunnerKind::WindowsTerminal => "wt",
        }
    }
}

fn preferred_runner_order(requested: TerminalMode) -> [RunnerKind; 3] {
    match requested {
        TerminalMode::Wt => [
            RunnerKind::WindowsTerminal,
            RunnerKind::Pwsh,
            RunnerKind::WindowsPowerShell,
        ],
        TerminalMode::Pwsh => [
            RunnerKind::Pwsh,
            RunnerKind::WindowsPowerShell,
            RunnerKind::WindowsTerminal,
        ],
        TerminalMode::Powershell => [
            RunnerKind::WindowsPowerShell,
            RunnerKind::Pwsh,
            RunnerKind::WindowsTerminal,
        ],
        TerminalMode::Auto => [
            RunnerKind::WindowsTerminal,
            RunnerKind::Pwsh,
            RunnerKind::WindowsPowerShell,
        ],
    }
}

fn runner_available(kind: RunnerKind) -> bool {
    match kind {
        RunnerKind::Pwsh => detect::command_exists("pwsh"),
        RunnerKind::WindowsPowerShell => detect::command_exists("powershell"),
        RunnerKind::WindowsTerminal => detect::command_exists("wt"),
    }
}

fn shell_executable_for_runner(kind: RunnerKind) -> &'static str {
    match kind {
        RunnerKind::Pwsh => "pwsh.exe",
        RunnerKind::WindowsPowerShell => "powershell.exe",
        RunnerKind::WindowsTerminal => "wt.exe",
    }
}

pub fn resolve_runner(requested: TerminalMode) -> RunnerKind {
    preferred_runner_order(requested)
        .into_iter()
        .find(|kind| runner_available(*kind))
        .unwrap_or(RunnerKind::WindowsPowerShell)
}

fn resolve_terminal_inner_shell() -> RunnerKind {
    if runner_available(RunnerKind::Pwsh) {
        RunnerKind::Pwsh
    } else {
        RunnerKind::WindowsPowerShell
    }
}

fn escape_for_ps_command(command: &str) -> String {
    command.replace('\"', "`\"")
}

fn build_direct_powershell_script(cli_command: &str) -> String {
    format!(
        "& {{ Set-Location -LiteralPath $args[0]; {} }}",
        escape_for_ps_command(cli_command)
    )
}

pub fn build_final_command(
    requested: TerminalMode,
    cli_command: &str,
    working_dir_placeholder: &str,
) -> AppResult<(RunnerKind, String)> {
    let runner = resolve_runner(requested);
    let final_command = match runner {
        RunnerKind::WindowsTerminal => {
            let inner = resolve_terminal_inner_shell();
            format!(
                "{} -d \"{}\" {} -NoExit -ExecutionPolicy Bypass -Command \"{}\"",
                shell_executable_for_runner(RunnerKind::WindowsTerminal),
                working_dir_placeholder,
                shell_executable_for_runner(inner),
                escape_for_ps_command(cli_command)
            )
        }
        RunnerKind::Pwsh | RunnerKind::WindowsPowerShell => format!(
            "{} -NoExit -ExecutionPolicy Bypass -Command \"{}\" \"{}\"",
            shell_executable_for_runner(runner),
            build_direct_powershell_script(cli_command),
            working_dir_placeholder
        ),
    };

    Ok((runner, final_command))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_fallback_to_powershell_when_requested_runner_missing() {
        let runner = resolve_runner(TerminalMode::Powershell);
        assert!(matches!(
            runner,
            RunnerKind::WindowsPowerShell | RunnerKind::Pwsh | RunnerKind::WindowsTerminal
        ));
    }

    #[test]
    fn should_build_pwsh_style_command_with_percent_v() {
        let (_, command) =
            build_final_command(TerminalMode::Powershell, "claude", "%V").expect("command");
        assert!(command.contains("Set-Location -LiteralPath $args[0]; claude"));
        assert!(command.ends_with("\"%V\""));
    }

    #[test]
    fn should_escape_double_quotes_for_ps_command() {
        let (_, command) =
            build_final_command(TerminalMode::Pwsh, "kimi \"web\"", "%V").expect("command");
        assert!(command.contains("kimi `\"web`\""));
    }

    #[test]
    fn should_not_wrap_working_dir_placeholder_in_empty_single_quotes() {
        let (_, command) =
            build_final_command(TerminalMode::Pwsh, "codex", "%V").expect("command");
        assert!(!command.contains("''%V''"));
        assert!(command.contains("\"%V\""));
    }
}
