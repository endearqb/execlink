export type CliKey =
  | "claude"
  | "codex"
  | "gemini"
  | "kimi"
  | "kimi_web"
  | "qwencode"
  | "opencode";

export const CLI_DEFAULT_ORDER: CliKey[] = [
  "claude",
  "codex",
  "gemini",
  "kimi",
  "kimi_web",
  "qwencode",
  "opencode"
];

export const CLI_DEFAULT_TITLES: Record<CliKey, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini",
  kimi: "Kimi",
  kimi_web: "Kimi Web",
  qwencode: "Qwen Code",
  opencode: "OpenCode"
};

export type FixedLaunchModeParentCliKey = "claude" | "codex" | "gemini";
export type FixedLaunchModeKey = "claude_skip_permissions" | "gemini_yolo" | "codex_yolo";

export const FIXED_LAUNCH_MODE_ORDER: FixedLaunchModeKey[] = [
  "claude_skip_permissions",
  "gemini_yolo",
  "codex_yolo"
];

export const FIXED_LAUNCH_MODE_DEFAULT_TITLES: Record<FixedLaunchModeKey, string> = {
  claude_skip_permissions: "Claude Code (Skip Permissions)",
  gemini_yolo: "Gemini (YOLO)",
  codex_yolo: "Codex (YOLO)"
};

export const FIXED_LAUNCH_MODE_PARENT: Record<FixedLaunchModeKey, FixedLaunchModeParentCliKey> = {
  claude_skip_permissions: "claude",
  gemini_yolo: "gemini",
  codex_yolo: "codex"
};

export const FIXED_LAUNCH_MODE_BY_PARENT: Record<FixedLaunchModeParentCliKey, FixedLaunchModeKey[]> = {
  claude: ["claude_skip_permissions"],
  gemini: ["gemini_yolo"],
  codex: ["codex_yolo"]
};

const CLI_KEY_SET = new Set<CliKey>(CLI_DEFAULT_ORDER);

export function normalizeCliOrder(order: readonly string[] | null | undefined): CliKey[] {
  const seen = new Set<CliKey>();
  const normalized: CliKey[] = [];

  for (const key of order ?? []) {
    const candidate = key as CliKey;
    if (!CLI_KEY_SET.has(candidate) || seen.has(candidate)) {
      continue;
    }
    normalized.push(candidate);
    seen.add(candidate);
  }

  for (const key of CLI_DEFAULT_ORDER) {
    if (seen.has(key)) {
      continue;
    }
    normalized.push(key);
    seen.add(key);
  }

  return normalized;
}

export interface CliDisplayNames {
  claude: string;
  codex: string;
  gemini: string;
  kimi: string;
  kimi_web: string;
  qwencode: string;
  opencode: string;
}

export interface FixedLaunchModeConfig {
  enabled: boolean;
  display_name: string;
}

export interface FixedLaunchModesConfig {
  claude_skip_permissions: FixedLaunchModeConfig;
  gemini_yolo: FixedLaunchModeConfig;
  codex_yolo: FixedLaunchModeConfig;
}

export interface RuntimeState {
  last_apply_at: string | null;
  last_activate_at: string | null;
  last_error: string | null;
}

export type UvInstallSourceMode = "auto" | "official" | "tuna" | "aliyun";

export interface InstallTimeoutConfig {
  terminal_script_timeout_ms: number;
  install_recheck_timeout_ms: number;
  quick_setup_detect_timeout_ms: number;
  mirror_probe_timeout_ms: number;
  python_runtime_check_timeout_ms: number;
  winget_install_recheck_timeout_ms: number;
}

export type TerminalMode = "auto" | "pwsh" | "powershell" | "wt";
export type TerminalThemeMode = "auto" | "dark" | "light";
export type PsPromptStyle = "basic" | "none";

export interface TerminalThemeOption {
  id: string;
  name: string;
}

export const TERMINAL_THEME_OPTIONS: TerminalThemeOption[] = [
  { id: "vscode-dark-plus", name: "VS Code Dark+" },
  { id: "vscode-light-plus", name: "VS Code Light+" },
  { id: "monokai", name: "Monokai" },
  { id: "monokai-light", name: "Monokai Light" },
  { id: "dracula", name: "Dracula" },
  { id: "one-light", name: "One Light" },
  { id: "github-dark", name: "GitHub Dark" },
  { id: "github-light", name: "GitHub Light" },
  { id: "nord", name: "Nord" },
  { id: "solarized-light", name: "Solarized Light" },
  { id: "gruvbox-dark", name: "Gruvbox Dark" },
  { id: "gruvbox-light", name: "Gruvbox Light" }
];

export interface AppConfig {
  version: number;
  enable_context_menu: boolean;
  menu_title: string;
  cli_order: CliKey[];
  display_names: CliDisplayNames;
  terminal_mode: TerminalMode;
  terminal_theme_id: string;
  terminal_theme_mode: TerminalThemeMode;
  ps_prompt_style: PsPromptStyle;
  uv_install_source_mode: UvInstallSourceMode;
  install_timeouts: InstallTimeoutConfig;
  // backward-compatible field, currently not exposed in UI
  use_windows_terminal: boolean;
  no_exit: boolean;
  toggles: Record<CliKey, boolean>;
  fixed_launch_modes: FixedLaunchModesConfig;
  runtime: RuntimeState;
}

export interface CliStatusMap {
  claude: boolean;
  codex: boolean;
  gemini: boolean;
  kimi: boolean;
  kimi_web: boolean;
  qwencode: boolean;
  opencode: boolean;
  pwsh: boolean;
}

export interface ContextMenuStatus {
  applied: boolean;
  enabled_roots: string[];
  has_legacy_artifacts: boolean;
  requires_manual_refresh: boolean;
  current_group_id?: string | null;
  current_group_title?: string | null;
  message: string;
}

export interface Win11ClassicMenuStatus {
  enabled: boolean;
  registry_path: string;
  restart_recommended: boolean;
  message: string;
}

export interface InstalledMenuGroup {
  group_id: string;
  title: string;
  roots: string[];
  item_ids: string[];
  schema_version: number;
}

export interface LegacyArtifact {
  path: string;
  title: string;
  root: string;
  reason: string;
}

export interface ActionResult {
  ok: boolean;
  code: string;
  message: string;
  detail?: string | null;
}

export interface CliInstallHint {
  key: CliKey;
  display_name: string;
  install_command: string;
  upgrade_command?: string | null;
  uninstall_command: string;
  auth_command?: string | null;
  verify_command?: string | null;
  requires_oauth: boolean;
  docs_url: string;
  official_domain: string;
  publisher: string;
  risk_remote_script: boolean;
  requires_node: boolean;
  wsl_recommended: boolean;
}

export type CliInstallHintMap = Record<string, CliInstallHint>;

export interface CliUserPathStatus {
  key: CliKey;
  command_dir?: string | null;
  needs_user_path_fix: boolean;
  add_user_path_command?: string | null;
  message: string;
}

export type CliUserPathStatusMap = Record<string, CliUserPathStatus>;

export interface InstallPrereqStatus {
  git: boolean;
  node: boolean;
  npm: boolean;
  uv: boolean;
  pwsh: boolean;
  winget: boolean;
  wsl: boolean;
}

export interface PowerShellPs1PolicyStatus {
  blocked: boolean;
  effective_policy: string;
  fix_command: string;
  detail?: string | null;
}

export type GitInstallSource = "official" | "tuna";
export type WingetInstallSource = "official" | "tuna";

export interface InstallLaunchRequest {
  key: CliKey;
  confirmed_remote_script: boolean;
}

export type QuickSetupPhase =
  | "idle"
  | "precheck"
  | "precheck_uv"
  | "precheck_python"
  | "install"
  | "install_uv"
  | "install_python"
  | "verify_uv"
  | "verify_python"
  | "choose_source"
  | "install_kimi"
  | "verify_kimi"
  | "detect"
  | "auth"
  | "apply_menu"
  | "fallback"
  | "done"
  | "failed";

export interface QuickSetupStatus {
  key: CliKey | null;
  phase: QuickSetupPhase;
  running: boolean;
  message: string;
  detail?: string | null;
}

export interface InstallCountdownState {
  active: boolean;
  label: string;
  total_ms: number;
  remaining_ms: number;
}

export interface TerminalOutputEvent {
  session_id: string;
  seq: number;
  stream: string;
  data: string;
}

export interface TerminalStateEvent {
  session_id: string;
  state: string;
}

export interface InitialState {
  config: AppConfig;
  cli_status: CliStatusMap;
  context_menu_status: ContextMenuStatus;
  win11_classic_menu_status: Win11ClassicMenuStatus;
}

export interface DiagnosticsInfo {
  generated_at: string;
  app_version: string;
  build_channel: string;
  app_root?: string | null;
  config_version: number;
  runtime: RuntimeState;
  terminal_mode_requested: string;
  terminal_mode_effective: string;
  terminal_fallback_reason?: string | null;
  terminal_menu_mode: string;
  terminal_menu_theme_applied: boolean;
  terminal_install_theme_applied: boolean;
  terminal_theme_id: string;
  terminal_theme_mode: string;
  terminal_prompt_style: string;
  terminal_wt_available: boolean;
  terminal_pwsh_available: boolean;
  terminal_powershell_available: boolean;
  log_path?: string | null;
  log_tail: string[];
  context_menu_status: ContextMenuStatus;
  win11_classic_menu_status: Win11ClassicMenuStatus;
  installed_menu_groups: InstalledMenuGroup[];
  legacy_artifacts: LegacyArtifact[];
}

export interface RegistryValueSpec {
  name?: string | null;
  kind: "sz" | "dword";
  data: string;
}

export interface RegistryKeySpec {
  path: string;
  values: RegistryValueSpec[];
}

export interface RegistryWritePlan {
  schema_version: number;
  owner: string;
  deletes: string[];
  creates: RegistryKeySpec[];
}

export const DEFAULT_INSTALL_TIMEOUTS: InstallTimeoutConfig = {
  terminal_script_timeout_ms: 10 * 60 * 1000,
  install_recheck_timeout_ms: 10 * 60 * 1000,
  quick_setup_detect_timeout_ms: 5 * 60 * 1000,
  mirror_probe_timeout_ms: 20 * 1000,
  python_runtime_check_timeout_ms: 15 * 1000,
  winget_install_recheck_timeout_ms: 3 * 60 * 1000
};

export const DEFAULT_CONFIG: AppConfig = {
  version: 11,
  enable_context_menu: true,
  menu_title: "AI CLIs",
  cli_order: [...CLI_DEFAULT_ORDER],
  display_names: {
    claude: "Claude Code",
    codex: "Codex",
    gemini: "Gemini",
    kimi: "Kimi",
    kimi_web: "Kimi Web",
    qwencode: "Qwen Code",
    opencode: "OpenCode"
  },
  terminal_mode: "wt",
  terminal_theme_id: "vscode-dark-plus",
  terminal_theme_mode: "auto",
  ps_prompt_style: "basic",
  uv_install_source_mode: "auto",
  install_timeouts: { ...DEFAULT_INSTALL_TIMEOUTS },
  use_windows_terminal: true,
  no_exit: true,
  toggles: {
    claude: true,
    codex: true,
    gemini: true,
    kimi: true,
    kimi_web: true,
    qwencode: true,
    opencode: true
  },
  fixed_launch_modes: {
    claude_skip_permissions: {
      enabled: true,
      display_name: FIXED_LAUNCH_MODE_DEFAULT_TITLES.claude_skip_permissions
    },
    gemini_yolo: {
      enabled: true,
      display_name: FIXED_LAUNCH_MODE_DEFAULT_TITLES.gemini_yolo
    },
    codex_yolo: {
      enabled: true,
      display_name: FIXED_LAUNCH_MODE_DEFAULT_TITLES.codex_yolo
    }
  },
  runtime: {
    last_apply_at: null,
    last_activate_at: null,
    last_error: null
  }
};
