use std::process::Command;

use windows::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};

use crate::{logging, process_util, state::AppResult};

pub fn notify_shell_changed() -> AppResult<()> {
    logging::log_line("[context-menu] notifying shell association changed");
    unsafe {
        SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None);
    }
    Ok(())
}

pub fn restart_explorer_fallback() -> AppResult<()> {
    logging::log_line("[context-menu] restarting explorer fallback");
    let _ = process_util::command_hidden("taskkill")
        .args(["/f", "/im", "explorer.exe"])
        .status();

    Command::new("explorer.exe")
        .spawn()
        .map_err(|error| format!("重启 Explorer 失败: {error}"))?;
    Ok(())
}
