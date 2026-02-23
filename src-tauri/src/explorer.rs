use crate::{logging, state::AppResult};
use std::{
    path::Path,
    process::{Command, Output},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ShellRestartOutcome {
    Success,
    Ambiguous,
}

fn evaluate_shell_restart_output(output: &Output) -> AppResult<ShellRestartOutcome> {
    if output.status.success() {
        return Ok(ShellRestartOutcome::Success);
    }

    let code = output
        .status
        .code()
        .map(|c| c.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    // 在部分环境中 Nilesoft 的 -restart 会返回 1 且 stderr 为空。
    // 该状态是否真正生效不稳定，标记为 Ambiguous，交给上层决定是否执行兜底。
    if code == "1" && stderr.is_empty() {
        logging::log_line("[activate] shell.exe -restart returned code=1 with empty stderr; mark as ambiguous");
        return Ok(ShellRestartOutcome::Ambiguous);
    }

    Err(format!("shell.exe -restart 返回失败(code={code}): {stderr}"))
}

fn restart_shell(shell_exe: &Path) -> AppResult<ShellRestartOutcome> {
    logging::log_line("[activate] running shell.exe -restart");
    let output = Command::new(shell_exe)
        .arg("-restart")
        .output()
        .map_err(|e| format!("调用 shell.exe -restart 失败: {e}"))?;

    evaluate_shell_restart_output(&output)
}

pub fn restart_explorer_fallback() -> AppResult<()> {
    logging::log_line("[activate] fallback restart explorer");

    let _ = Command::new("taskkill")
        .args(["/f", "/im", "explorer.exe"])
        .status();

    // explorer.exe 是长生命周期进程，必须使用非阻塞启动，避免命令调用卡住。
    Command::new("explorer.exe")
        .spawn()
        .map_err(|e| format!("重启 Explorer 失败: {e}"))?;

    Ok(())
}

pub fn activate_now(shell_exe: &Path) -> AppResult<String> {
    match restart_shell(shell_exe) {
        Ok(ShellRestartOutcome::Success) => Ok("已通过 shell.exe -restart 生效".to_string()),
        Ok(ShellRestartOutcome::Ambiguous) => {
            restart_explorer_fallback()?;
            Ok("shell.exe -restart 返回 code=1，已自动重启 Explorer 以确保生效".to_string())
        }
        Err(primary) => {
            restart_explorer_fallback()?;
            Ok(format!(
                "shell 重启失败，已使用 Explorer 兜底。原始错误: {primary}"
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    fn status_from(code: u32) -> std::process::ExitStatus {
        use std::os::windows::process::ExitStatusExt;
        std::process::ExitStatus::from_raw(code)
    }

    #[cfg(unix)]
    fn status_from(code: u32) -> std::process::ExitStatus {
        use std::os::unix::process::ExitStatusExt;
        std::process::ExitStatus::from_raw((code as i32) << 8)
    }

    fn fake_output(code: u32, stderr: &str) -> Output {
        Output {
            status: status_from(code),
            stdout: Vec::new(),
            stderr: stderr.as_bytes().to_vec(),
        }
    }

    #[test]
    fn should_mark_code1_with_empty_stderr_as_ambiguous() {
        let output = fake_output(1, "");
        let result = evaluate_shell_restart_output(&output).unwrap();
        assert_eq!(result, ShellRestartOutcome::Ambiguous);
    }

    #[test]
    fn should_fail_when_code1_has_stderr() {
        let output = fake_output(1, "bad parameter");
        assert!(evaluate_shell_restart_output(&output).is_err());
    }

    #[test]
    fn should_succeed_when_exit_code_is_zero() {
        let output = fake_output(0, "");
        let result = evaluate_shell_restart_output(&output).unwrap();
        assert_eq!(result, ShellRestartOutcome::Success);
    }
}
