use serde::Serialize;

use crate::{
    detect,
    state::{AppConfig, PsPromptStyle, TerminalMode, TerminalThemeMode},
};

const WT_EXECUTABLE: &str = "wt.exe";
const PWSH_EXECUTABLE: &str = "pwsh.exe";
const POWERSHELL_EXECUTABLE: &str = "powershell.exe";
const DEFAULT_THEME_ID: &str = "vscode-dark-plus";
const DEFAULT_LIGHT_THEME_ID: &str = "vscode-light-plus";

#[derive(Debug, Clone, Serialize)]
pub struct TerminalCapabilities {
    pub wt: bool,
    pub pwsh: bool,
    pub powershell: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct TerminalResolution {
    pub requested_mode: String,
    pub effective_mode: String,
    pub fallback_reason: Option<String>,
}

#[derive(Debug, Clone)]
pub struct MenuLaunchCommand {
    pub executable: String,
    pub args: String,
}

#[derive(Debug, Clone)]
pub struct SpawnLaunchCommand {
    pub executable: String,
    pub args: Vec<String>,
    pub resolution: TerminalResolution,
}

#[derive(Debug, Clone)]
pub struct TerminalLaunchPlan {
    capabilities: TerminalCapabilities,
    requested_mode: TerminalMode,
    effective_mode: TerminalMode,
    fallback_reason: Option<String>,
    effective_executable: String,
    wt_inner_shell: Option<String>,
    no_exit: bool,
    prompt_style: PsPromptStyle,
    advanced_menu_mode: bool,
    menu_theme_enabled: bool,
    theme: &'static ThemeSpec,
}

#[derive(Debug, Clone, Copy)]
struct ThemeSpec {
    id: &'static str,
    dark: bool,
    paired_theme_id: &'static str,
    console_background: &'static str,
    console_foreground: &'static str,
    prompt_path_rgb: (u8, u8, u8),
    prompt_symbol_rgb: (u8, u8, u8),
    tab_color: &'static str,
}

const THEMES: [ThemeSpec; 12] = [
    ThemeSpec {
        id: "vscode-dark-plus",
        dark: true,
        paired_theme_id: "vscode-light-plus",
        console_background: "Black",
        console_foreground: "Gray",
        prompt_path_rgb: (86, 156, 214),
        prompt_symbol_rgb: (78, 201, 176),
        tab_color: "#0E639C",
    },
    ThemeSpec {
        id: "vscode-light-plus",
        dark: false,
        paired_theme_id: "vscode-dark-plus",
        console_background: "White",
        console_foreground: "Black",
        prompt_path_rgb: (0, 92, 197),
        prompt_symbol_rgb: (11, 136, 153),
        tab_color: "#007ACC",
    },
    ThemeSpec {
        id: "monokai",
        dark: true,
        paired_theme_id: "monokai-light",
        console_background: "Black",
        console_foreground: "Gray",
        prompt_path_rgb: (166, 226, 46),
        prompt_symbol_rgb: (249, 38, 114),
        tab_color: "#A6E22E",
    },
    ThemeSpec {
        id: "monokai-light",
        dark: false,
        paired_theme_id: "monokai",
        console_background: "White",
        console_foreground: "Black",
        prompt_path_rgb: (102, 122, 24),
        prompt_symbol_rgb: (188, 67, 117),
        tab_color: "#88981D",
    },
    ThemeSpec {
        id: "dracula",
        dark: true,
        paired_theme_id: "one-light",
        console_background: "Black",
        console_foreground: "Gray",
        prompt_path_rgb: (80, 250, 123),
        prompt_symbol_rgb: (189, 147, 249),
        tab_color: "#BD93F9",
    },
    ThemeSpec {
        id: "one-light",
        dark: false,
        paired_theme_id: "dracula",
        console_background: "White",
        console_foreground: "Black",
        prompt_path_rgb: (80, 97, 130),
        prompt_symbol_rgb: (166, 38, 164),
        tab_color: "#4078F2",
    },
    ThemeSpec {
        id: "github-dark",
        dark: true,
        paired_theme_id: "github-light",
        console_background: "Black",
        console_foreground: "Gray",
        prompt_path_rgb: (121, 192, 255),
        prompt_symbol_rgb: (163, 113, 247),
        tab_color: "#238636",
    },
    ThemeSpec {
        id: "github-light",
        dark: false,
        paired_theme_id: "github-dark",
        console_background: "White",
        console_foreground: "Black",
        prompt_path_rgb: (9, 105, 218),
        prompt_symbol_rgb: (130, 80, 223),
        tab_color: "#1F6FEB",
    },
    ThemeSpec {
        id: "nord",
        dark: true,
        paired_theme_id: "solarized-light",
        console_background: "Black",
        console_foreground: "Gray",
        prompt_path_rgb: (129, 161, 193),
        prompt_symbol_rgb: (180, 142, 173),
        tab_color: "#5E81AC",
    },
    ThemeSpec {
        id: "solarized-light",
        dark: false,
        paired_theme_id: "nord",
        console_background: "White",
        console_foreground: "Black",
        prompt_path_rgb: (38, 139, 210),
        prompt_symbol_rgb: (108, 113, 196),
        tab_color: "#268BD2",
    },
    ThemeSpec {
        id: "gruvbox-dark",
        dark: true,
        paired_theme_id: "gruvbox-light",
        console_background: "Black",
        console_foreground: "Gray",
        prompt_path_rgb: (184, 187, 38),
        prompt_symbol_rgb: (215, 153, 33),
        tab_color: "#B8BB26",
    },
    ThemeSpec {
        id: "gruvbox-light",
        dark: false,
        paired_theme_id: "gruvbox-dark",
        console_background: "White",
        console_foreground: "Black",
        prompt_path_rgb: (121, 116, 14),
        prompt_symbol_rgb: (175, 58, 3),
        tab_color: "#98971A",
    },
];

pub fn detect_terminal_capabilities() -> TerminalCapabilities {
    TerminalCapabilities {
        wt: detect::command_exists("wt"),
        pwsh: detect::command_exists("pwsh"),
        powershell: detect::command_exists("powershell"),
    }
}

pub fn build_launch_plan(config: &AppConfig) -> TerminalLaunchPlan {
    let capabilities = detect_terminal_capabilities();
    let (effective_mode, fallback_reason) = resolve_terminal_mode(config.terminal_mode, &capabilities);
    let effective_executable = match effective_mode {
        TerminalMode::Pwsh => PWSH_EXECUTABLE.to_string(),
        TerminalMode::Powershell => POWERSHELL_EXECUTABLE.to_string(),
        TerminalMode::Wt => WT_EXECUTABLE.to_string(),
        TerminalMode::Auto => POWERSHELL_EXECUTABLE.to_string(),
    };

    let wt_inner_shell = match effective_mode {
        TerminalMode::Wt => Some(preferred_powershell_shell(&capabilities).to_string()),
        _ => None,
    };

    let theme = resolve_theme(config);

    TerminalLaunchPlan {
        capabilities,
        requested_mode: config.terminal_mode,
        effective_mode,
        fallback_reason,
        effective_executable,
        wt_inner_shell,
        no_exit: config.no_exit,
        prompt_style: config.ps_prompt_style,
        advanced_menu_mode: config.advanced_menu_mode,
        menu_theme_enabled: config.menu_theme_enabled,
        theme,
    }
}

impl TerminalLaunchPlan {
    pub fn capabilities(&self) -> &TerminalCapabilities {
        &self.capabilities
    }

    pub fn theme_id(&self) -> &'static str {
        self.theme.id
    }

    pub fn resolution(&self) -> TerminalResolution {
        TerminalResolution {
            requested_mode: self.requested_mode.as_str().to_string(),
            effective_mode: self.effective_mode.as_str().to_string(),
            fallback_reason: self.fallback_reason.clone(),
        }
    }

    pub fn menu_mode(&self) -> &'static str {
        if self.should_apply_menu_theme() {
            "advanced"
        } else {
            "minimal"
        }
    }

    pub fn menu_theme_applied(&self) -> bool {
        self.should_apply_menu_theme()
    }

    pub fn install_theme_applied(&self) -> bool {
        true
    }

    pub fn build_menu_command(&self, cli_command: &str) -> MenuLaunchCommand {
        let script = if self.should_apply_menu_theme() {
            self.build_menu_advanced_script(cli_command)
        } else {
            cli_command.to_string()
        };
        match self.effective_mode {
            TerminalMode::Wt => {
                let inner_shell = self
                    .wt_inner_shell
                    .as_deref()
                    .unwrap_or(POWERSHELL_EXECUTABLE);
                let inner_args = build_powershell_args_string(self.no_exit, false, &script);
                let args = format!(
                    "new-tab --title \"ExecLink\" --tabColor \"{}\" -d \"@sel.path\" {} {}",
                    self.theme.tab_color, inner_shell, inner_args
                );
                MenuLaunchCommand {
                    executable: WT_EXECUTABLE.to_string(),
                    args,
                }
            }
            TerminalMode::Pwsh | TerminalMode::Powershell | TerminalMode::Auto => MenuLaunchCommand {
                executable: self.effective_executable.clone(),
                args: build_powershell_args_string(self.no_exit, false, &script),
            },
        }
    }

    pub fn build_install_command(&self, install_script: &str) -> SpawnLaunchCommand {
        let script = self.build_script(install_script);
        match self.effective_mode {
            TerminalMode::Wt => {
                let inner_shell = self
                    .wt_inner_shell
                    .as_deref()
                    .unwrap_or(POWERSHELL_EXECUTABLE);
                let mut args = vec![
                    "new-tab".to_string(),
                    "--title".to_string(),
                    "ExecLink Installer".to_string(),
                    "--tabColor".to_string(),
                    self.theme.tab_color.to_string(),
                    inner_shell.to_string(),
                ];
                args.extend(build_powershell_args_vec(true, true, &script));
                SpawnLaunchCommand {
                    executable: WT_EXECUTABLE.to_string(),
                    args,
                    resolution: self.resolution(),
                }
            }
            TerminalMode::Pwsh | TerminalMode::Powershell | TerminalMode::Auto => {
                SpawnLaunchCommand {
                    executable: self.effective_executable.clone(),
                    args: build_powershell_args_vec(true, true, &script),
                    resolution: self.resolution(),
                }
            }
        }
    }

    fn build_script(&self, command_statement: &str) -> String {
        let mut statements = vec![build_theme_init_statement(self.theme)];
        if matches!(self.prompt_style, PsPromptStyle::Basic) {
            statements.push(build_prompt_statement(self.theme));
        }
        statements.push(command_statement.to_string());
        statements.join("; ")
    }

    fn build_menu_advanced_script(&self, command_statement: &str) -> String {
        self.build_script(command_statement)
    }

    fn should_apply_menu_theme(&self) -> bool {
        self.advanced_menu_mode && self.menu_theme_enabled
    }
}

fn resolve_terminal_mode(
    requested_mode: TerminalMode,
    capabilities: &TerminalCapabilities,
) -> (TerminalMode, Option<String>) {
    let fallback_to_shell = |reason: &str| {
        if capabilities.pwsh {
            (TerminalMode::Pwsh, Some(reason.to_string()))
        } else if capabilities.powershell {
            (TerminalMode::Powershell, Some(reason.to_string()))
        } else {
            (TerminalMode::Powershell, Some("no_powershell_detected".to_string()))
        }
    };

    match requested_mode {
        TerminalMode::Auto => {
            if capabilities.wt {
                (TerminalMode::Wt, None)
            } else if capabilities.pwsh {
                (TerminalMode::Pwsh, None)
            } else if capabilities.powershell {
                (TerminalMode::Powershell, None)
            } else {
                (
                    TerminalMode::Powershell,
                    Some("auto_no_terminal_detected".to_string()),
                )
            }
        }
        TerminalMode::Wt => {
            if capabilities.wt {
                (TerminalMode::Wt, None)
            } else {
                fallback_to_shell("wt_not_found")
            }
        }
        TerminalMode::Pwsh => {
            if capabilities.pwsh {
                (TerminalMode::Pwsh, None)
            } else if capabilities.powershell {
                (TerminalMode::Powershell, Some("pwsh_not_found".to_string()))
            } else {
                (TerminalMode::Powershell, Some("pwsh_not_found".to_string()))
            }
        }
        TerminalMode::Powershell => {
            if capabilities.powershell {
                (TerminalMode::Powershell, None)
            } else if capabilities.pwsh {
                (TerminalMode::Pwsh, Some("powershell_not_found".to_string()))
            } else {
                (
                    TerminalMode::Powershell,
                    Some("powershell_not_found".to_string()),
                )
            }
        }
    }
}

fn preferred_powershell_shell(capabilities: &TerminalCapabilities) -> &'static str {
    if capabilities.pwsh {
        PWSH_EXECUTABLE
    } else {
        POWERSHELL_EXECUTABLE
    }
}

fn find_theme(id: &str) -> Option<&'static ThemeSpec> {
    THEMES.iter().find(|theme| theme.id == id)
}

fn default_dark_theme() -> &'static ThemeSpec {
    find_theme(DEFAULT_THEME_ID).expect("default dark theme not found")
}

fn default_light_theme() -> &'static ThemeSpec {
    find_theme(DEFAULT_LIGHT_THEME_ID).expect("default light theme not found")
}

fn resolve_theme(config: &AppConfig) -> &'static ThemeSpec {
    let requested = find_theme(config.terminal_theme_id.as_str()).unwrap_or_else(default_dark_theme);
    match config.terminal_theme_mode {
        TerminalThemeMode::Auto => requested,
        TerminalThemeMode::Dark => {
            if requested.dark {
                requested
            } else if !requested.paired_theme_id.is_empty() {
                find_theme(requested.paired_theme_id)
                    .filter(|theme| theme.dark)
                    .unwrap_or_else(default_dark_theme)
            } else {
                default_dark_theme()
            }
        }
        TerminalThemeMode::Light => {
            if !requested.dark {
                requested
            } else if !requested.paired_theme_id.is_empty() {
                find_theme(requested.paired_theme_id)
                    .filter(|theme| !theme.dark)
                    .unwrap_or_else(default_light_theme)
            } else {
                default_light_theme()
            }
        }
    }
}

fn build_powershell_args_string(
    no_exit: bool,
    use_execution_policy_bypass: bool,
    script: &str,
) -> String {
    let mut args = Vec::new();
    if no_exit {
        args.push("-NoExit".to_string());
    }
    if use_execution_policy_bypass {
        args.push("-ExecutionPolicy".to_string());
        args.push("Bypass".to_string());
    }
    args.push("-Command".to_string());
    args.push(format!("\"{}\"", script.replace('"', "\\\"")));
    args.join(" ")
}

fn build_powershell_args_vec(
    no_exit: bool,
    use_execution_policy_bypass: bool,
    script: &str,
) -> Vec<String> {
    let mut args = Vec::new();
    if no_exit {
        args.push("-NoExit".to_string());
    }
    if use_execution_policy_bypass {
        args.push("-ExecutionPolicy".to_string());
        args.push("Bypass".to_string());
    }
    args.push("-Command".to_string());
    args.push(script.to_string());
    args
}

fn build_theme_init_statement(theme: &ThemeSpec) -> String {
    format!(
        "try {{ $host.UI.RawUI.BackgroundColor = '{}'; $host.UI.RawUI.ForegroundColor = '{}'; Clear-Host }} catch {{}}",
        theme.console_background, theme.console_foreground
    )
}

fn build_prompt_statement(theme: &ThemeSpec) -> String {
    let (path_r, path_g, path_b) = theme.prompt_path_rgb;
    let (symbol_r, symbol_g, symbol_b) = theme.prompt_symbol_rgb;
    format!(
        "function global:prompt {{ $cwd = (Get-Location).Path; $esc = [char]27; return ('{{0}}[38;2;{path_r};{path_g};{path_b}m{{1}}{{0}}[0m {{0}}[38;2;{symbol_r};{symbol_g};{symbol_b}m>{{0}}[0m ' -f $esc, $cwd) }}"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{CliDisplayNames, CliToggles, RuntimeState, CONFIG_VERSION};

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
            terminal_theme_id: DEFAULT_THEME_ID.to_string(),
            terminal_theme_mode: TerminalThemeMode::Auto,
            ps_prompt_style: PsPromptStyle::Basic,
            uv_install_source_mode: Default::default(),
            install_timeouts: Default::default(),
            advanced_menu_mode: false,
            menu_theme_enabled: false,
            use_windows_terminal: false,
            no_exit: true,
            toggles: CliToggles::default(),
            runtime: RuntimeState::default(),
        }
    }

    #[test]
    fn should_fallback_when_wt_is_missing() {
        let caps = TerminalCapabilities {
            wt: false,
            pwsh: true,
            powershell: true,
        };
        let (effective, fallback) = resolve_terminal_mode(TerminalMode::Wt, &caps);
        assert_eq!(effective, TerminalMode::Pwsh);
        assert_eq!(fallback.as_deref(), Some("wt_not_found"));
    }

    #[test]
    fn should_keep_requested_theme_for_auto_mode() {
        let mut config = sample_config();
        config.terminal_theme_id = "github-light".to_string();
        config.terminal_theme_mode = TerminalThemeMode::Auto;
        let theme = resolve_theme(&config);
        assert_eq!(theme.id, "github-light");
    }

    #[test]
    fn should_switch_to_dark_pair_for_dark_mode() {
        let mut config = sample_config();
        config.terminal_theme_id = "github-light".to_string();
        config.terminal_theme_mode = TerminalThemeMode::Dark;
        let theme = resolve_theme(&config);
        assert_eq!(theme.id, "github-dark");
    }

    #[test]
    fn should_build_wt_install_launch_with_inner_shell() {
        let mut config = sample_config();
        config.terminal_mode = TerminalMode::Wt;
        let plan = build_launch_plan(&config);
        let launch = plan.build_install_command("npm install -g @openai/codex");
        assert!(
            launch.executable == WT_EXECUTABLE
                || launch.executable == PWSH_EXECUTABLE
                || launch.executable == POWERSHELL_EXECUTABLE
        );
        if launch.executable == WT_EXECUTABLE {
            assert!(launch.args.contains(&"new-tab".to_string()));
        }
    }

    #[test]
    fn should_use_minimal_menu_command_by_default() {
        let config = sample_config();
        let plan = build_launch_plan(&config);
        let launch = plan.build_menu_command("codex");
        assert_eq!(plan.menu_mode(), "minimal");
        assert!(!launch.args.contains("RawUI"));
        assert!(!launch.args.contains("global:prompt"));
    }

    #[test]
    fn should_apply_menu_theme_in_advanced_mode() {
        let mut config = sample_config();
        config.advanced_menu_mode = true;
        config.menu_theme_enabled = true;
        let plan = build_launch_plan(&config);
        let launch = plan.build_menu_command("codex");
        assert_eq!(plan.menu_mode(), "advanced");
        assert!(launch.args.contains("RawUI"));
    }
}
