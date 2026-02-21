use crate::{
    logging,
    state::{AppConfig, AppResult},
    terminal,
};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

#[cfg(test)]
const IMPORT_LINE: &str = "import 'imports/ai-clis.nss'";
const SHELL_NSS_MINIMAL: &str = "settings
{
  priority=1
  exclude.where = !process.is_explorer
  showdelay = 200
  modify.remove.duplicate=1
  tip.enabled=true
}

import 'imports/ai-clis.nss'
";
const SHELL_NSS_WITH_DEFAULTS: &str = "settings
{
  priority=1
  exclude.where = !process.is_explorer
  showdelay = 200
  modify.remove.duplicate=1
  tip.enabled=true
}

import 'imports/theme.nss'
import 'imports/images.nss'
import 'imports/modify.nss'
import 'imports/terminal.nss'
import 'imports/file-manage.nss'
import 'imports/develop.nss'
import 'imports/goto.nss'
import 'imports/taskbar.nss'
import 'imports/ai-clis.nss'
";

#[derive(Debug, Clone)]
pub struct ConfigRootResolution {
    pub root: PathBuf,
    pub layout: &'static str,
}

fn cli_items(config: &AppConfig) -> Vec<(String, &'static str)> {
    fn cli_item_for_key(config: &AppConfig, key: &str) -> Option<(String, &'static str)> {
        match key {
            "claude" if config.toggles.claude => Some((config.display_names.claude.clone(), "claude")),
            "codex" if config.toggles.codex => Some((config.display_names.codex.clone(), "codex")),
            "gemini" if config.toggles.gemini => Some((config.display_names.gemini.clone(), "gemini")),
            "kimi" if config.toggles.kimi => Some((config.display_names.kimi.clone(), "kimi")),
            "kimi_web" if config.toggles.kimi_web => {
                Some((config.display_names.kimi_web.clone(), "kimi web"))
            }
            "qwencode" if config.toggles.qwencode => {
                Some((config.display_names.qwencode.clone(), "qwen"))
            }
            "opencode" if config.toggles.opencode => {
                Some((config.display_names.opencode.clone(), "opencode"))
            }
            _ => None,
        }
    }

    let mut result = Vec::new();
    let mut seen = HashSet::new();
    for key in &config.cli_order {
        if !seen.insert(key.as_str()) {
            continue;
        }
        if let Some(item) = cli_item_for_key(config, key.as_str()) {
            result.push(item);
        }
    }
    result
}

fn escape_single_quoted(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "\\'")
}

pub fn render_ai_clis_nss(config: &AppConfig) -> String {
    if !config.enable_context_menu {
        return "// context menu disabled by user\n".to_string();
    }

    let items = cli_items(config);

    if items.is_empty() {
        return "// no cli item enabled\n".to_string();
    }

    let launch_plan = terminal::build_launch_plan(config);
    let rendered_items = items
        .iter()
        .map(|(title, command)| {
            let launch = launch_plan.build_menu_command(command);
            let escaped_title = escape_single_quoted(title);
            format!(
                "  item(title='{escaped_title}' cmd='{}' dir=@sel.path args='{}')",
                escape_single_quoted(&launch.executable),
                escape_single_quoted(&launch.args)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let menu_title = escape_single_quoted(&config.menu_title);
    format!(
        "menu(type='dir|back.dir' mode='single' title='{menu_title}')\n{{\n{rendered_items}\n}}\n"
    )
}

fn write_shell_nss(config_root: &Path, show_nilesoft_default_menus: bool) -> AppResult<()> {
    fs::create_dir_all(config_root).map_err(|e| format!("创建配置目录失败: {e}"))?;
    fs::create_dir_all(config_root.join("imports"))
        .map_err(|e| format!("创建 imports 目录失败: {e}"))?;

    let shell_nss = config_root.join("shell.nss");
    let content = if show_nilesoft_default_menus {
        SHELL_NSS_WITH_DEFAULTS
    } else {
        SHELL_NSS_MINIMAL
    };
    fs::write(shell_nss, content).map_err(|e| format!("写入 shell.nss 失败: {e}"))?;
    Ok(())
}

fn has_layout(root: &Path) -> bool {
    root.join("shell.nss").exists() || root.join("imports").is_dir()
}

pub fn resolve_effective_config_root(
    shell_exe: &Path,
    install_root: &Path,
) -> AppResult<ConfigRootResolution> {
    let shell_dir = shell_exe
        .parent()
        .ok_or_else(|| format!("shell.exe 路径非法: {}", shell_exe.display()))?;
    let config_dir = install_root.join("config");

    let shell_layout = has_layout(shell_dir);
    let config_layout = has_layout(&config_dir);

    let resolution = if shell_layout {
        ConfigRootResolution {
            root: shell_dir.to_path_buf(),
            layout: "shell-root",
        }
    } else if config_layout {
        ConfigRootResolution {
            root: config_dir,
            layout: "config-subdir",
        }
    } else {
        ConfigRootResolution {
            root: shell_dir.to_path_buf(),
            layout: "bootstrap-shell-root",
        }
    };

    logging::log_line(&format!(
        "[config] resolved config root={} layout={} shell={} install_root={}",
        resolution.root.display(),
        resolution.layout,
        shell_exe.display(),
        install_root.display()
    ));
    Ok(resolution)
}

pub fn write_ai_clis_nss(config_root: &Path, content: &str) -> AppResult<()> {
    let imports = config_root.join("imports");
    fs::create_dir_all(&imports).map_err(|e| format!("创建 imports 目录失败: {e}"))?;

    let file = imports.join("ai-clis.nss");
    fs::write(file, content).map_err(|e| format!("写入 ai-clis.nss 失败: {e}"))?;
    Ok(())
}

#[cfg(test)]
fn is_ident_byte(value: u8) -> bool {
    value.is_ascii_alphanumeric() || value == b'_'
}

#[cfg(test)]
fn find_shell_block_open(content: &str) -> Option<usize> {
    let needle = b"shell";
    let bytes = content.as_bytes();
    if bytes.len() < needle.len() {
        return None;
    }

    for index in 0..=(bytes.len() - needle.len()) {
        if &bytes[index..index + needle.len()] != needle {
            continue;
        }

        let start_ok = index == 0 || !is_ident_byte(bytes[index - 1]);
        let end_idx = index + needle.len();
        let end_ok = end_idx >= bytes.len() || !is_ident_byte(bytes[end_idx]);
        if !start_ok || !end_ok {
            continue;
        }

        let mut cursor = end_idx;
        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        if cursor < bytes.len() && bytes[cursor] == b'{' {
            return Some(cursor);
        }
    }

    None
}

#[cfg(test)]
fn find_matching_brace(content: &str, open_brace: usize) -> Option<usize> {
    let mut depth = 0_i32;
    let bytes = content.as_bytes();

    for (index, byte) in bytes.iter().enumerate().skip(open_brace) {
        if *byte == b'{' {
            depth += 1;
            continue;
        }
        if *byte == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some(index);
            }
        }
    }

    None
}

#[cfg(test)]
fn inject_import_into_shell_block(content: &str) -> Option<String> {
    let open_brace = find_shell_block_open(content)?;
    let close_brace = find_matching_brace(content, open_brace)?;

    let mut out = String::new();
    out.push_str(&content[..close_brace]);
    if !out.ends_with('\n') {
        out.push('\n');
    }
    out.push_str("  ");
    out.push_str(IMPORT_LINE);
    out.push('\n');
    out.push_str(&content[close_brace..]);
    Some(out)
}

#[cfg(test)]
pub fn ensure_shell_import(config_root: &Path) -> AppResult<()> {
    fs::create_dir_all(config_root).map_err(|e| format!("创建配置目录失败: {e}"))?;
    fs::create_dir_all(config_root.join("imports"))
        .map_err(|e| format!("创建 imports 目录失败: {e}"))?;

    let shell_nss = config_root.join("shell.nss");

    if !shell_nss.exists() {
        let bootstrap = format!("shell\n{{\n  {IMPORT_LINE}\n}}\n");
        fs::write(shell_nss, bootstrap).map_err(|e| format!("创建 shell.nss 失败: {e}"))?;
        return Ok(());
    }

    let mut content =
        fs::read_to_string(&shell_nss).map_err(|e| format!("读取 shell.nss 失败: {e}"))?;

    if !content.contains(IMPORT_LINE) {
        if let Some(updated) = inject_import_into_shell_block(&content) {
            content = updated;
        } else {
            logging::log_line("[config] shell.nss 未找到 shell{}，回退为文件末尾追加 import");
            if !content.ends_with('\n') {
                content.push('\n');
            }
            content.push_str(IMPORT_LINE);
            content.push('\n');
        }
        fs::write(shell_nss, content).map_err(|e| format!("更新 shell.nss 失败: {e}"))?;
    }

    Ok(())
}

pub fn apply_config(config_root: &Path, config: &AppConfig) -> AppResult<terminal::TerminalResolution> {
    let launch_plan = terminal::build_launch_plan(config);
    let content = render_ai_clis_nss(config);
    write_ai_clis_nss(config_root, &content)?;
    write_shell_nss(config_root, config.show_nilesoft_default_menus)?;
    Ok(launch_plan.resolution())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{
        AppConfig, CliDisplayNames, CliToggles, PsPromptStyle, TerminalMode, TerminalThemeMode,
        CONFIG_VERSION,
    };
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn unique_temp(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("{prefix}_{unique}"))
    }

    fn sample_config() -> AppConfig {
        AppConfig {
            version: CONFIG_VERSION,
            enable_context_menu: true,
            menu_title: "AI CLIs".to_string(),
            cli_order: vec![
                "claude".to_string(),
                "codex".to_string(),
                "gemini".to_string(),
                "kimi".to_string(),
                "kimi_web".to_string(),
                "qwencode".to_string(),
                "opencode".to_string(),
            ],
            display_names: CliDisplayNames::default(),
            show_nilesoft_default_menus: false,
            terminal_mode: TerminalMode::Auto,
            terminal_theme_id: "vscode-dark-plus".to_string(),
            terminal_theme_mode: TerminalThemeMode::Auto,
            ps_prompt_style: PsPromptStyle::Basic,
            advanced_menu_mode: false,
            menu_theme_enabled: false,
            use_windows_terminal: false,
            no_exit: true,
            toggles: CliToggles {
                claude: true,
                codex: true,
                gemini: false,
                kimi: false,
                kimi_web: false,
                qwencode: false,
                opencode: false,
            },
            runtime: Default::default(),
        }
    }

    #[test]
    fn should_render_enabled_items_only() {
        let output = render_ai_clis_nss(&sample_config());
        assert!(output.contains("Claude Code"));
        assert!(output.contains("Codex"));
        assert!(!output.contains("Gemini"));
    }

    #[test]
    fn should_respect_no_exit_flag() {
        let mut cfg = sample_config();
        cfg.no_exit = false;
        let output = render_ai_clis_nss(&cfg);
        assert!(output.contains("-Command "));
        assert!(output.contains("codex"));
        assert!(!output.contains("-NoExit -Command "));
    }

    #[test]
    fn should_render_kimi_web_command() {
        let mut cfg = sample_config();
        cfg.toggles.kimi_web = true;
        let output = render_ai_clis_nss(&cfg);
        assert!(output.contains("Kimi Web"));
        assert!(output.contains("-NoExit -Command "));
        assert!(output.contains("kimi web"));
    }

    #[test]
    fn should_render_custom_menu_title() {
        let mut cfg = sample_config();
        cfg.menu_title = "我的助手们".to_string();
        let output = render_ai_clis_nss(&cfg);
        assert!(output.contains("title='我的助手们'"));
    }

    #[test]
    fn should_render_custom_cli_item_title() {
        let mut cfg = sample_config();
        cfg.display_names.codex = "Open Codex".to_string();
        let output = render_ai_clis_nss(&cfg);
        assert!(output.contains("item(title='Open Codex'"));
        assert!(!output.contains("item(title='Codex'"));
    }

    #[test]
    fn should_render_cli_items_by_config_order() {
        let mut cfg = sample_config();
        cfg.toggles.gemini = true;
        cfg.toggles.qwencode = true;
        cfg.cli_order = vec![
            "qwencode".to_string(),
            "gemini".to_string(),
            "claude".to_string(),
            "codex".to_string(),
        ];

        let output = render_ai_clis_nss(&cfg);
        let qwen_index = output.find("Qwen Code").unwrap();
        let gemini_index = output.find("Gemini").unwrap();
        let claude_index = output.find("Claude Code").unwrap();
        assert!(qwen_index < gemini_index);
        assert!(gemini_index < claude_index);
        assert!(output.contains("qwen"));
    }

    #[test]
    fn should_switch_shell_profile_by_default_menu_toggle() {
        let root = unique_temp("ai_cli_switch_shell_profile");
        fs::create_dir_all(&root).unwrap();

        let mut cfg = sample_config();
        cfg.show_nilesoft_default_menus = false;
        apply_config(&root, &cfg).unwrap();

        let shell_nss = fs::read_to_string(root.join("shell.nss")).unwrap();
        assert!(shell_nss.contains("import 'imports/ai-clis.nss'"));
        assert!(!shell_nss.contains("import 'imports/terminal.nss'"));

        cfg.show_nilesoft_default_menus = true;
        apply_config(&root, &cfg).unwrap();
        let shell_nss_with_defaults = fs::read_to_string(root.join("shell.nss")).unwrap();
        assert!(shell_nss_with_defaults.contains("import 'imports/terminal.nss'"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn should_keep_shell_import_idempotent() {
        let root = unique_temp("ai_cli_switch_test");

        fs::create_dir_all(&root).unwrap();
        let shell_nss = root.join("shell.nss");
        fs::write(&shell_nss, "shell\n{\n}\n").unwrap();

        ensure_shell_import(&root).unwrap();
        ensure_shell_import(&root).unwrap();

        let output = fs::read_to_string(&shell_nss).unwrap();
        assert_eq!(output.matches(IMPORT_LINE).count(), 1);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn should_resolve_shell_root_layout() {
        let install_root = unique_temp("ai_cli_switch_install");
        let shell_dir = install_root.join("package");
        fs::create_dir_all(shell_dir.join("imports")).unwrap();
        fs::write(shell_dir.join("shell.nss"), "settings{}\n").unwrap();
        fs::write(shell_dir.join("shell.exe"), "").unwrap();

        let shell_exe = shell_dir.join("shell.exe");
        let resolved = resolve_effective_config_root(&shell_exe, &install_root).unwrap();
        assert_eq!(resolved.layout, "shell-root");
        assert_eq!(resolved.root, shell_dir);

        let _ = fs::remove_dir_all(install_root);
    }

    #[test]
    fn should_resolve_config_subdir_layout() {
        let install_root = unique_temp("ai_cli_switch_install");
        fs::create_dir_all(install_root.join("config").join("imports")).unwrap();
        fs::write(
            install_root.join("config").join("shell.nss"),
            "shell\n{\n}\n",
        )
        .unwrap();
        fs::write(install_root.join("shell.exe"), "").unwrap();

        let shell_exe = install_root.join("shell.exe");
        let resolved = resolve_effective_config_root(&shell_exe, &install_root).unwrap();
        assert_eq!(resolved.layout, "config-subdir");
        assert_eq!(resolved.root, install_root.join("config"));

        let _ = fs::remove_dir_all(install_root);
    }

    #[test]
    fn should_bootstrap_to_shell_root_when_no_layout() {
        let install_root = unique_temp("ai_cli_switch_install");
        let cleanup_root = install_root.clone();
        fs::create_dir_all(&install_root).unwrap();
        fs::write(install_root.join("shell.exe"), "").unwrap();

        let shell_exe = install_root.join("shell.exe");
        let resolved = resolve_effective_config_root(&shell_exe, &install_root).unwrap();
        assert_eq!(resolved.layout, "bootstrap-shell-root");
        assert_eq!(resolved.root, install_root);

        let _ = fs::remove_dir_all(cleanup_root);
    }

    #[test]
    fn should_append_import_when_no_shell_block() {
        let root = unique_temp("ai_cli_switch_test");
        fs::create_dir_all(&root).unwrap();
        let shell_nss = root.join("shell.nss");
        fs::write(&shell_nss, "settings\n{\n}\n").unwrap();

        ensure_shell_import(&root).unwrap();
        let output = fs::read_to_string(&shell_nss).unwrap();
        assert!(output.contains(IMPORT_LINE));
        assert_eq!(output.matches(IMPORT_LINE).count(), 1);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn should_insert_import_into_shell_block() {
        let root = unique_temp("ai_cli_switch_test");
        fs::create_dir_all(&root).unwrap();
        let shell_nss = root.join("shell.nss");
        fs::write(
            &shell_nss,
            "shell\n{\n  menu()\n  {\n  }\n}\nsettings\n{\n}\n",
        )
        .unwrap();

        ensure_shell_import(&root).unwrap();
        let output = fs::read_to_string(&shell_nss).unwrap();
        assert!(output.contains("shell\n{\n  menu()"));
        assert_eq!(output.matches(IMPORT_LINE).count(), 1);
        assert!(output.find(IMPORT_LINE).unwrap() < output.rfind("}\nsettings").unwrap());

        let _ = fs::remove_dir_all(root);
    }
}
