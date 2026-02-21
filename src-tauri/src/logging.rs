use crate::state;
use std::{
    fs,
    io::Write,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

pub fn log_file_path() -> Option<PathBuf> {
    state::logs_dir().ok().map(|dir| dir.join("runtime.log"))
}

pub fn log_line(line: &str) {
    let dir = match state::logs_dir() {
        Ok(value) => value,
        Err(_) => return,
    };

    if fs::create_dir_all(&dir).is_err() {
        return;
    }

    let file = dir.join("runtime.log");
    let mut f = match fs::OpenOptions::new().create(true).append(true).open(file) {
        Ok(value) => value,
        Err(_) => return,
    };

    let _ = writeln!(f, "[{}] {}", timestamp(), line);
}

pub fn read_tail_lines(max_lines: usize) -> Vec<String> {
    let Some(path) = log_file_path() else {
        return Vec::new();
    };

    let content = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    let mut lines = content
        .lines()
        .rev()
        .take(max_lines)
        .map(str::to_string)
        .collect::<Vec<_>>();
    lines.reverse();
    lines
}
