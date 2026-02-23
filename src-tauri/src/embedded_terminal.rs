use serde::Serialize;
use std::{
    io::{Read, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    thread,
};
use tauri::{AppHandle, Emitter};

use crate::{detect, logging, state};

const SESSION_ID: &str = "global";

#[derive(Debug, Clone, Serialize)]
pub struct TerminalOutputPayload {
    pub session_id: String,
    pub seq: u64,
    pub stream: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TerminalStatePayload {
    pub session_id: String,
    pub state: String,
}

#[derive(Debug)]
struct TerminalSession {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
}

static SESSION: OnceLock<Mutex<Option<TerminalSession>>> = OnceLock::new();
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn session_store() -> &'static Mutex<Option<TerminalSession>> {
    SESSION.get_or_init(|| Mutex::new(None))
}

fn next_seq() -> u64 {
    SEQUENCE.fetch_add(1, Ordering::Relaxed) + 1
}

fn emit_state(app: &AppHandle, state: &str) {
    let payload = TerminalStatePayload {
        session_id: SESSION_ID.to_string(),
        state: state.to_string(),
    };
    let _ = app.emit("terminal_state", payload);
}

fn emit_output(app: &AppHandle, stream: &str, data: String) {
    if data.is_empty() {
        return;
    }
    let payload = TerminalOutputPayload {
        session_id: SESSION_ID.to_string(),
        seq: next_seq(),
        stream: stream.to_string(),
        data,
    };
    let _ = app.emit("terminal_output", payload);
}

fn choose_shell_executable() -> String {
    let config = state::load_app_config();
    match config.terminal_mode.as_str() {
        "pwsh" => {
            if detect::command_exists("pwsh") {
                "pwsh.exe".to_string()
            } else {
                "powershell.exe".to_string()
            }
        }
        "powershell" => {
            if detect::command_exists("powershell") {
                "powershell.exe".to_string()
            } else {
                "pwsh.exe".to_string()
            }
        }
        _ => {
            if detect::command_exists("pwsh") {
                "pwsh.exe".to_string()
            } else {
                "powershell.exe".to_string()
            }
        }
    }
}

fn spawn_shell_process(app: &AppHandle) -> Result<TerminalSession, String> {
    let shell = choose_shell_executable();
    logging::log_line(&format!(
        "[embedded-terminal] spawn shell executable={shell}"
    ));

    let mut child = Command::new(&shell)
        .args([
            "-NoLogo",
            "-NoExit",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);$OutputEncoding=[Console]::OutputEncoding; Write-Host '[ExecLink] Embedded terminal ready.'",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动内置终端失败: {e}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法获取终端输入管道".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法获取终端输出管道".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法获取终端错误管道".to_string())?;

    spawn_reader_thread(app.clone(), "stdout", stdout);
    spawn_reader_thread(app.clone(), "stderr", stderr);

    Ok(TerminalSession {
        child,
        stdin: Arc::new(Mutex::new(stdin)),
    })
}

fn spawn_reader_thread(app: AppHandle, stream: &'static str, mut reader: impl Read + Send + 'static) {
    thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let text = String::from_utf8_lossy(&buffer[..count]).to_string();
                    emit_output(&app, stream, text);
                }
                Err(error) => {
                    emit_output(
                        &app,
                        "stderr",
                        format!("[embedded-terminal] 读取输出失败: {error}\n"),
                    );
                    break;
                }
            }
        }
        emit_state(&app, "idle");
    });
}

fn with_session_mut<T>(f: impl FnOnce(&mut Option<TerminalSession>) -> Result<T, String>) -> Result<T, String> {
    let store = session_store();
    let mut guard = store
        .lock()
        .map_err(|_| "内置终端会话锁定失败".to_string())?;
    f(&mut guard)
}

fn ensure_session_internal(app: &AppHandle) -> Result<(), String> {
    with_session_mut(|session_opt| {
        if let Some(session) = session_opt {
            match session.child.try_wait() {
                Ok(None) => return Ok(()),
                Ok(Some(_)) => {
                    *session_opt = None;
                }
                Err(error) => {
                    logging::log_line(&format!(
                        "[embedded-terminal] try_wait failed, recreate session: {error}"
                    ));
                    *session_opt = None;
                }
            }
        }

        let session = spawn_shell_process(app)?;
        *session_opt = Some(session);
        emit_state(app, "running");
        Ok(())
    })
}

pub fn ensure_session(app: &AppHandle) -> Result<(), String> {
    ensure_session_internal(app)
}

pub fn run_script(app: &AppHandle, script: &str) -> Result<(), String> {
    ensure_session_internal(app)?;
    with_session_mut(|session_opt| {
        let Some(session) = session_opt else {
            return Err("终端会话不存在".to_string());
        };
        let mut stdin = session
            .stdin
            .lock()
            .map_err(|_| "终端输入锁定失败".to_string())?;
        stdin
            .write_all(script.as_bytes())
            .map_err(|e| format!("写入终端脚本失败: {e}"))?;
        stdin
            .write_all(b"\r\n")
            .map_err(|e| format!("写入终端换行失败: {e}"))?;
        stdin.flush().map_err(|e| format!("刷新终端输入失败: {e}"))?;
        Ok(())
    })
}

pub fn write_input(app: &AppHandle, data: &str) -> Result<(), String> {
    ensure_session_internal(app)?;
    with_session_mut(|session_opt| {
        let Some(session) = session_opt else {
            return Err("终端会话不存在".to_string());
        };
        let mut stdin = session
            .stdin
            .lock()
            .map_err(|_| "终端输入锁定失败".to_string())?;
        stdin
            .write_all(data.as_bytes())
            .map_err(|e| format!("写入终端输入失败: {e}"))?;
        stdin.flush().map_err(|e| format!("刷新终端输入失败: {e}"))?;
        Ok(())
    })
}

pub fn resize(_app: &AppHandle, _cols: u16, _rows: u16) -> Result<(), String> {
    // 当前实现基于标准管道，暂不支持真实终端 resize；保留接口用于后续 ConPTY 升级。
    Ok(())
}

pub fn close_session() -> Result<(), String> {
    with_session_mut(|session_opt| {
        if let Some(mut session) = session_opt.take() {
            if let Err(error) = session.child.kill() {
                logging::log_line(&format!(
                    "[embedded-terminal] kill child failed: {error}"
                ));
            }
            let _ = session.child.wait();
        }
        Ok(())
    })
}
