import { Switch, Tabs, Toast } from "@base-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow, type Window as TauriWindow } from "@tauri-apps/api/window";
import {
  addCliCommandDirToUserPath,
  applyConfig,
  cleanupNilesoftArtifacts,
  cleanupAppData,
  disableWin11ClassicContextMenu,
  detectClis,
  detectLegacyMenuArtifacts,
  enableWin11ClassicContextMenu,
  getCliInstallHints,
  getCliUserPathStatuses,
  getInitialState,
  getInstallPrereqStatus,
  getPowershellPs1PolicyStatus,
  listExeclinkContextMenus,
  launchCliAuth,
  launchPrereqInstall,
  launchWingetInstall,
  migrateLegacyHkcuMenuToV2,
  fixPowershellPs1Policy,
  notifyShellChanged,
  openNodejsDownloadPage,
  openWingetInstallPage,
  openInstallDocs,
  removeAllExeclinkContextMenus,
  restartExplorerFallback,
  runCliVerify,
  verifyKimiInstallation,
  verifyKimiPythonInstallation,
  terminalCloseSession,
  terminalEnsureSession,
  terminalResize,
  terminalRunScript
} from "../api/tauri";
import { CliConfigTable } from "../components/CliConfigTable";
import { AppConfirmDialog } from "../components/AppConfirmDialog";
import { GitInstallSourceDialog } from "../components/GitInstallSourceDialog";
import { NpmRegistrySourceDialog } from "../components/NpmRegistrySourceDialog";
import { UvInstallSourceDialog } from "../components/UvInstallSourceDialog";
import { WingetInstallSourceDialog } from "../components/WingetInstallSourceDialog";
import { QuickSetupWizard } from "../components/QuickSetupWizard";
import { UsageGuideDialog } from "../components/UsageGuideDialog";
import appLogo from "../assets/excelink_logo.png";
import {
  CLI_DEFAULT_ORDER,
  CLI_DEFAULT_TITLES,
  type ContextMenuStatus,
  DEFAULT_CONFIG,
  normalizeCliOrder,
  type ActionResult,
  type AppConfig,
  type CliInstallHintMap,
  type CliKey,
  type CliUserPathStatusMap,
  type CliStatusMap,
  type GitInstallSource,
  type InstalledMenuGroup,
  type InstallCountdownState,
  type InstallPrereqStatus,
  type InstallTimeoutConfig,
  type LegacyArtifact,
  type PowerShellPs1PolicyStatus,
  type QuickSetupPhase,
  type QuickSetupStatus,
  type TerminalOutputEvent,
  type TerminalStateEvent,
  type Win11ClassicMenuStatus,
  type UvInstallSourceMode,
  DEFAULT_INSTALL_TIMEOUTS
} from "../types/config";

const EMPTY_STATUS: CliStatusMap = {
  claude: false,
  codex: false,
  gemini: false,
  kimi: false,
  kimi_web: false,
  qwencode: false,
  opencode: false,
  pwsh: false
};

const EMPTY_CONTEXT_MENU_STATUS: ContextMenuStatus = {
  applied: false,
  enabled_roots: [],
  has_legacy_artifacts: false,
  requires_manual_refresh: false,
  current_group_id: null,
  current_group_title: null,
  message: "未初始化"
};

const EMPTY_WIN11_CLASSIC_MENU_STATUS: Win11ClassicMenuStatus = {
  enabled: false,
  registry_path: "HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32",
  restart_recommended: true,
  message: "未初始化"
};

const EMPTY_PREREQ: InstallPrereqStatus = {
  git: false,
  node: false,
  npm: false,
  uv: false,
  pwsh: false,
  winget: false,
  wsl: false
};

const EMPTY_CLI_USER_PATH_STATUS: CliUserPathStatusMap = {};

type TabKey = "cli" | "menu";

const TABS: Array<{ key: TabKey; title: string }> = [
  { key: "cli", title: "CLI" },
  { key: "menu", title: "配置" }
];

const TERMINAL_MODE_OPTIONS: Array<{ value: AppConfig["terminal_mode"]; label: string }> = [
  { value: "wt", label: "Windows Terminal (wt)" },
  { value: "auto", label: "Auto（自动选择）" },
  { value: "pwsh", label: "PowerShell 7 (pwsh)" },
  { value: "powershell", label: "Windows PowerShell" }
];

const CLEANUP_CONFIRM_TOKEN = "CONFIRM_CLEANUP_EXECLINK";
const APP_VERSION = __APP_VERSION__;
const GITHUB_REPO_URL = "https://github.com/endearqb/execlink";
const INSTALL_RECHECK_INTERVAL_MS = 2000;
const OUTSET_LARGE = "shadow-[6px_6px_12px_#d5d0c4,-6px_-6px_12px_#ffffff]";
const OUTSET_SMALL = "shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff]";
const INSET_SMALL = "shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff]";
const BUTTON_BASE_CLASS = `rounded-[var(--radius-lg)] border border-[#ddd5c9] px-4 py-2.5 text-sm font-medium outline-none transition-[box-shadow,transform,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff] disabled:cursor-not-allowed disabled:opacity-60`;
const PRIMARY_BUTTON_CLASS = `${BUTTON_BASE_CLASS} bg-[#e8e1d7] text-[var(--ui-text)] ${OUTSET_SMALL} hover:text-[#665a4f]`;
const SECONDARY_BUTTON_CLASS = `${BUTTON_BASE_CLASS} bg-[var(--ui-base)] text-[var(--ui-text)] ${OUTSET_SMALL} hover:text-[#665a4f]`;
const DANGER_BUTTON_CLASS = `${BUTTON_BASE_CLASS} bg-[#ecddd8] text-[#8a4f45] ${OUTSET_SMALL} hover:text-[#7d473e]`;
const RUNTIME_BUTTON_SIZE_CLASS = "px-3 py-1.5 text-xs";
const RUNTIME_PRIMARY_BUTTON_CLASS = `${PRIMARY_BUTTON_CLASS} ${RUNTIME_BUTTON_SIZE_CLASS}`;
const RUNTIME_SECONDARY_BUTTON_CLASS = `${SECONDARY_BUTTON_CLASS} ${RUNTIME_BUTTON_SIZE_CLASS}`;
const RUNTIME_DANGER_BUTTON_CLASS = `${DANGER_BUTTON_CLASS} ${RUNTIME_BUTTON_SIZE_CLASS}`;
const HEADER_ACTION_BUTTON_CLASS = `rounded-[var(--radius-sm)] border border-[#ddd5c9] bg-[var(--ui-base)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ui-text)] ${OUTSET_SMALL} outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[#665a4f] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff] disabled:cursor-not-allowed disabled:opacity-60`;
const HEADER_WINDOW_BUTTON_CLASS = `grid h-6 w-7 place-items-center rounded-[var(--radius-xs)] border border-[#ddd5c9] bg-[var(--ui-base)] text-[var(--ui-muted)] ${OUTSET_SMALL} outline-none transition-[box-shadow,transform,color,background-color] duration-150 hover:text-[var(--ui-text)] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff] disabled:cursor-not-allowed disabled:opacity-60`;
const INPUT_CLASS = `w-full rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-2.5 text-sm text-[var(--ui-text)] outline-none ${INSET_SMALL} transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#8f8072]/35 disabled:cursor-not-allowed disabled:opacity-60`;
const FIELD_CLASS = "grid gap-1.5";
const FIELD_LABEL_CLASS = "font-semibold text-[var(--ui-text)]";
const PANEL_CONTENT_CLASS = "grid gap-4";
const PANEL_TITLE_CLASS = "text-base font-semibold text-[var(--ui-text)]";
const HOVER_BUBBLE_CLASS = `pointer-events-none absolute top-[calc(100%+8px)] z-10 translate-y-0.5 whitespace-nowrap rounded-[var(--radius-pill)] bg-[var(--ui-base)] px-2.5 py-[5px] text-[11px] text-[var(--ui-muted)] opacity-0 transition-[opacity,transform] duration-150 ${OUTSET_SMALL}`;
const COLLAPSIBLE_PANEL_CLASS = `rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[var(--ui-base)] p-3 ${OUTSET_SMALL}`;
const COLLAPSIBLE_PANEL_SUMMARY_CLASS = "cursor-pointer select-none text-sm font-semibold text-[var(--ui-text)]";
const MENU_HEADER_SWITCH_ROOT_CLASS = `group relative inline-flex h-7 w-12 cursor-pointer items-center rounded-full border border-[#ddd5c9] bg-[var(--ui-base)] p-1 ${OUTSET_SMALL} transition-[box-shadow,background-color,transform] duration-150 before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:outline-2 before:outline-offset-2 before:outline-transparent data-[checked]:bg-[#d7cec0] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60 focus-visible:outline-none focus-visible:before:outline-[#8f8072] active:scale-[0.98] active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff] data-[checked]:active:bg-[#cec2b2]`;
const MENU_HEADER_SWITCH_THUMB_CLASS = `block size-5 rounded-full bg-[var(--ui-base)] ${OUTSET_SMALL} transition-transform duration-150 group-data-[checked]:translate-x-5`;
const TAB_CLASS =
  "relative flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold leading-none text-[var(--ui-muted)] outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[var(--ui-text)] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 data-[active]:bg-[var(--ui-base)] data-[active]:text-[var(--ui-text)] data-[active]:shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]";
const TOAST_ROOT_CLASS = `pointer-events-auto flex items-start justify-between gap-2.5 rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-2.5 opacity-100 ${OUTSET_SMALL} [--toast-stack-offset:calc(var(--toast-offset-y,0px)+(var(--toast-index,0)*3px))] [transform:translate3d(var(--toast-swipe-movement-x,0px),calc(var(--toast-stack-offset)+var(--toast-swipe-movement-y,0px)),0)_scale(calc(1-(var(--toast-index,0)*0.02)))] transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[transform,opacity] data-[starting-style]:opacity-0 data-[starting-style]:[transform:translate3d(0,calc(var(--toast-stack-offset)+14px),0)_scale(0.96)] data-[ending-style]:opacity-0 data-[ending-style]:[transform:translate3d(var(--toast-swipe-movement-x,0px),calc(var(--toast-stack-offset)+10px),0)_scale(0.96)] data-[type=success]:bg-[#e8e1d7] data-[type=error]:bg-[#ecddd8]`;
const TOAST_TITLE_CLASS = "text-[0.92rem] font-bold leading-[1.3] text-[var(--ui-text)] data-[type=error]:text-[#7d473e]";
const TOAST_DESCRIPTION_CLASS = "m-0 text-xs text-[var(--ui-muted)] data-[type=error]:text-[#8a4f45]";
const SELECT_CLASS = `w-full appearance-none rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-2.5 pr-9 text-sm text-[var(--ui-text)] outline-none ${INSET_SMALL} transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#8f8072]/35 disabled:cursor-not-allowed disabled:opacity-60`;
const UV_TUNA_SIMPLE_INDEX_URL = "https://pypi.tuna.tsinghua.edu.cn/simple/";
const UV_ALIYUN_SIMPLE_INDEX_URL = "https://mirrors.aliyun.com/pypi/simple/";
const UV_TUNA_LATEST_RELEASE_URL = "https://mirrors.tuna.tsinghua.edu.cn/github-release/astral-sh/uv/LatestRelease/";
const UV_ALIYUN_LATEST_RELEASE_URL = "https://mirrors.aliyun.com/github-release/astral-sh/uv/LatestRelease/";
const UV_WINDOWS_ASSET_PATTERN = "(?i)uv-x86_64-pc-windows-msvc\\.zip$";
const KIMI_TARGET_PYTHON_VERSION = "3.13";
const KIMI_TARGET_PYTHON_PATCH_VERSION = "3.13.12";
const KIMI_TARGET_PYTHON_USER_EXE = "Programs\\Python\\Python313\\python.exe";
const KIMI_PYTHON_INSTALLER_FILENAME = `python-${KIMI_TARGET_PYTHON_PATCH_VERSION}-amd64.exe`;
const KIMI_PYTHON_INSTALLER_TEMP_FILENAME = `execlink-${KIMI_PYTHON_INSTALLER_FILENAME}`;
const KIMI_TUNA_PYTHON_INSTALLER_URL = `https://mirrors.tuna.tsinghua.edu.cn/python/${KIMI_TARGET_PYTHON_PATCH_VERSION}/${KIMI_PYTHON_INSTALLER_FILENAME}`;
const KIMI_ALIYUN_PYTHON_INSTALLER_URL = `https://mirrors.aliyun.com/python-release/windows/${KIMI_PYTHON_INSTALLER_FILENAME}`;
const MIRROR_PROBE_CONNECT_TIMEOUT_SEC = 3;
const MIRROR_PROBE_MAX_TIME_SEC = 8;
const MAINTENANCE_FAILURE_CODES = new Set([
  "maintenance_failed",
  "maintenance_install_failed",
  "maintenance_register_incomplete",
  "maintenance_menu_sync_failed"
]);
const NPM_NPMMIRROR_REGISTRY_URL = "https://registry.npmmirror.com";

type InstallLaunchMode = "official" | "mirror";
type NpmRegistrySource = "official" | "npmmirror";
type WingetInstallEntry = "prereq" | "install" | "quick_setup";
type WingetInstallMethod = "official" | "store";
type UvInstallSourceDialogChoice = UvInstallSourceMode;

interface InstallAttemptContext {
  key: CliKey;
  expectedDetected: boolean;
  mode: InstallLaunchMode;
}

interface InstallLaunchOptions {
  mode?: InstallLaunchMode;
  npmRegistrySource?: NpmRegistrySource;
  skipPrimaryConfirm?: boolean;
  skipRiskConfirm?: boolean;
  fromMirrorFallback?: boolean;
}

interface NpmRegistryDialogState {
  open: boolean;
  title: string;
  officialCommand: string;
  mirrorCommand: string;
}

interface UvSourceDialogState {
  open: boolean;
}

interface TimeoutBounds {
  min: number;
  max: number;
}

const INSTALL_TIMEOUT_BOUNDS: Record<keyof InstallTimeoutConfig, TimeoutBounds> = {
  terminal_script_timeout_ms: { min: 30_000, max: 30 * 60 * 1000 },
  install_recheck_timeout_ms: { min: 60_000, max: 30 * 60 * 1000 },
  quick_setup_detect_timeout_ms: { min: 60_000, max: 30 * 60 * 1000 },
  mirror_probe_timeout_ms: { min: 5_000, max: 120_000 },
  python_runtime_check_timeout_ms: { min: 5_000, max: 180_000 },
  winget_install_recheck_timeout_ms: { min: 60_000, max: 15 * 60 * 1000 }
};

const INSTALL_TIMEOUT_FIELDS: Array<{
  key: keyof InstallTimeoutConfig;
  title: string;
  description: string;
}> = [
  {
    key: "terminal_script_timeout_ms",
    title: "脚本执行超时",
    description: "单条内置终端命令等待结果标记的最大时长。"
  },
  {
    key: "install_recheck_timeout_ms",
    title: "安装复检超时",
    description: "仅执行安装/卸载后等待检测状态变化的最大时长。"
  },
  {
    key: "quick_setup_detect_timeout_ms",
    title: "向导复检超时",
    description: "快速安装向导中检测 uv/python/kimi 的最大时长。"
  },
  {
    key: "mirror_probe_timeout_ms",
    title: "镜像探测超时",
    description: "镜像 URL 探测命令的等待时长。"
  },
  {
    key: "python_runtime_check_timeout_ms",
    title: "Python 运行时检查超时",
    description: "Python 运行时快速校验命令的等待时长。"
  },
  {
    key: "winget_install_recheck_timeout_ms",
    title: "winget 复检超时",
    description: "winget 启动安装后自动复检的最大时长。"
  }
];

const EMPTY_QUICK_SETUP: QuickSetupStatus = {
  key: null,
  phase: "idle",
  running: false,
  message: "尚未开始快速安装向导。",
  detail: null
};

const EMPTY_NPM_REGISTRY_DIALOG: NpmRegistryDialogState = {
  open: false,
  title: "",
  officialCommand: "",
  mirrorCommand: ""
};

const EMPTY_UV_SOURCE_DIALOG: UvSourceDialogState = {
  open: false
};

interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
}

interface MaintenanceDetailDialogState {
  open: boolean;
  title: string;
  message: string;
}

function clampTimeout(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeInstallTimeouts(input?: InstallTimeoutConfig | null): InstallTimeoutConfig {
  const next: InstallTimeoutConfig = {
    ...DEFAULT_INSTALL_TIMEOUTS,
    ...(input ?? {})
  };
  for (const key of Object.keys(INSTALL_TIMEOUT_BOUNDS) as Array<keyof InstallTimeoutConfig>) {
    const bounds = INSTALL_TIMEOUT_BOUNDS[key];
    next[key] = clampTimeout(next[key], bounds.min, bounds.max);
  }
  return next;
}

function buildNetworkErrorHint(detail: string) {
  if (!detail.includes("native_exit_code=-2147012867")) {
    return detail;
  }
  return `${detail}\n提示: native_exit_code=-2147012867 (0x80072EFD) 通常表示网络连接失败或域名不可达。`;
}

function isKimiMirrorInstallKey(key: CliKey) {
  return key === "kimi" || key === "kimi_web";
}

function wingetInstallEntryLabel(entry: WingetInstallEntry) {
  if (entry === "prereq") {
    return "前置环境安装";
  }
  if (entry === "quick_setup") {
    return "快速安装向导";
  }
  return "CLI 安装";
}

function wingetInstallMethodLabel(method: WingetInstallMethod) {
  return method === "store" ? "微软商店手动下载" : "官方源下载";
}

function uvInstallSourceModeLabel(mode: UvInstallSourceMode) {
  switch (mode) {
    case "official":
      return "官方优先";
    case "tuna":
      return "清华优先";
    case "aliyun":
      return "阿里优先";
    default:
      return "自动回退";
  }
}

function normalizeLockedConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    no_exit: true
  };
}

function filterConfigTogglesByDetection(config: AppConfig, detected: CliStatusMap): AppConfig {
  return {
    ...config,
    toggles: {
      ...config.toggles,
      claude: config.toggles.claude && detected.claude,
      codex: config.toggles.codex && detected.codex,
      gemini: config.toggles.gemini && detected.gemini,
      kimi: config.toggles.kimi && detected.kimi,
      kimi_web: config.toggles.kimi_web && detected.kimi_web,
      qwencode: config.toggles.qwencode && detected.qwencode,
      opencode: config.toggles.opencode && detected.opencode
    }
  };
}

type UvInstallStepKey = "winget" | "official_script" | "tuna_mirror" | "aliyun_mirror";

function buildKimiInstallCommand(useMirror: boolean, uvSourceMode: UvInstallSourceMode) {
  return buildKimiToolInstallCommand(useMirror, true, uvSourceMode);
}

function buildKimiPythonInstallCommand(useMirror: boolean) {
  if (useMirror) {
    return `uv python install ${KIMI_TARGET_PYTHON_VERSION}`;
  }
  return `uv python install ${KIMI_TARGET_PYTHON_VERSION}`;
}

function buildKimiCliInstallCommand(useMirror: boolean) {
  return useMirror
    ? `uv tool install kimi-cli --python ${KIMI_TARGET_PYTHON_VERSION} -i ${UV_TUNA_SIMPLE_INDEX_URL}`
    : `uv tool install kimi-cli --python ${KIMI_TARGET_PYTHON_VERSION}`;
}

function escapePsSingleQuoted(value: string) {
  return value.replace(/'/g, "''");
}

function buildKimiPythonRuntimeCheckCommand() {
  const escapedUserPythonPath = escapePsSingleQuoted(KIMI_TARGET_PYTHON_USER_EXE);
  return [
    `$__execlink_user_python = Join-Path $env:LocalAppData '${escapedUserPythonPath}'`,
    "if (Test-Path $__execlink_user_python) { & $__execlink_user_python --version; if ($LASTEXITCODE -eq 0) { return } }",
    "$__execlink_py_launcher = Get-Command py -ErrorAction SilentlyContinue",
    `if ($__execlink_py_launcher) { & py -${KIMI_TARGET_PYTHON_VERSION} --version; if ($LASTEXITCODE -eq 0) { return } }`,
    `throw 'python ${KIMI_TARGET_PYTHON_VERSION} runtime not found'`
  ].join("; ");
}

function buildKimiPythonInstallerTempPathPrefix() {
  const escapedTempFile = escapePsSingleQuoted(KIMI_PYTHON_INSTALLER_TEMP_FILENAME);
  return `$__execlink_python_installer = Join-Path $env:TEMP '${escapedTempFile}'`;
}

function buildUrlProbeCommand(url: string) {
  const escaped = escapePsSingleQuoted(url);
  return [
    `$__execlink_probe_url='${escaped}'`,
    `$__execlink_probe_code = & curl.exe -I -L --connect-timeout ${MIRROR_PROBE_CONNECT_TIMEOUT_SEC} --max-time ${MIRROR_PROBE_MAX_TIME_SEC} -sS -o NUL -w '%{http_code}' "$__execlink_probe_url"`,
    "if ($LASTEXITCODE -ne 0) { throw ('curl_exit_code=' + $LASTEXITCODE) }",
    "if (-not ($__execlink_probe_code -match '^\\d{3}$')) { throw ('http_status=' + $__execlink_probe_code) }",
    "if ([int]$__execlink_probe_code -ge 400) { throw ('http_status=' + $__execlink_probe_code) }"
  ].join("; ");
}

function buildKimiMirrorPythonInstallSteps(mirrorUrl: string) {
  const escaped = escapePsSingleQuoted(mirrorUrl);
  const tempPathPrefix = buildKimiPythonInstallerTempPathPrefix();
  const runtimeCheckCommand = buildKimiPythonRuntimeCheckCommand();
  return [
    [
      tempPathPrefix,
      `$__execlink_python_installer_url='${escaped}'`,
      "Invoke-WebRequest -Uri $__execlink_python_installer_url -OutFile $__execlink_python_installer -TimeoutSec 30 -MaximumRedirection 3 -ErrorAction Stop"
    ].join("; "),
    [
      tempPathPrefix,
      "if (-not (Test-Path $__execlink_python_installer)) { throw 'python installer file missing after download' }",
      "$__execlink_installer_proc = Start-Process -FilePath $__execlink_python_installer -ArgumentList @('/quiet','InstallAllUsers=0','PrependPath=1','Include_pip=1','Include_test=0') -Wait -PassThru",
      "if ($null -eq $__execlink_installer_proc) { throw 'python installer process unavailable' }",
      "if ($__execlink_installer_proc.ExitCode -ne 0) { throw ('python installer exit_code=' + $__execlink_installer_proc.ExitCode) }"
    ].join("; "),
    runtimeCheckCommand,
    `${tempPathPrefix}; if (Test-Path $__execlink_python_installer) { Remove-Item $__execlink_python_installer -Force -ErrorAction SilentlyContinue }`
  ];
}

function buildKimiMirrorCliInstallSteps(indexUrl: string) {
  const escaped = escapePsSingleQuoted(indexUrl);
  const escapedUserPythonPath = escapePsSingleQuoted(KIMI_TARGET_PYTHON_USER_EXE);
  return [
    [
      `$__execlink_user_python = Join-Path $env:LocalAppData '${escapedUserPythonPath}'`,
      `$__execlink_kimi_python = if (Test-Path $__execlink_user_python) { $__execlink_user_python } else { '${KIMI_TARGET_PYTHON_VERSION}' }`,
      `uv tool install kimi-cli --python "$__execlink_kimi_python" -i '${escaped}'`
    ].join("; ")
  ];
}

function buildKimiMirrorPythonInstallPlanPreview() {
  return [
    `步骤 1: 探测镜像可用性（curl，connect ${MIRROR_PROBE_CONNECT_TIMEOUT_SEC} 秒，max ${MIRROR_PROBE_MAX_TIME_SEC} 秒）`,
    `  - ${KIMI_TUNA_PYTHON_INSTALLER_URL}`,
    `  - ${KIMI_ALIYUN_PYTHON_INSTALLER_URL}`,
    "步骤 2: 对可用镜像逐个执行以下步骤：",
    `  - 下载安装器到 %TEMP%\\${KIMI_PYTHON_INSTALLER_TEMP_FILENAME}`,
    "  - 静默安装：Start-Process <installer> /quiet InstallAllUsers=0 PrependPath=1",
    `  - 快速校验：Python ${KIMI_TARGET_PYTHON_VERSION} 运行时`,
    "  - 清理临时安装器",
    "步骤 3: 全部镜像失败时立即退出安装"
  ].join("\n");
}

function buildKimiMirrorCliInstallPlanPreview() {
  return [
    `步骤 1: 探测索引可用性（curl，connect ${MIRROR_PROBE_CONNECT_TIMEOUT_SEC} 秒，max ${MIRROR_PROBE_MAX_TIME_SEC} 秒）`,
    `  - ${UV_TUNA_SIMPLE_INDEX_URL}`,
    `  - ${UV_ALIYUN_SIMPLE_INDEX_URL}`,
    "步骤 2: 对可用索引逐个执行以下命令：",
    `  - uv tool install kimi-cli --python '<Python313 路径或 ${KIMI_TARGET_PYTHON_VERSION}>' -i '<索引地址>'`,
    "步骤 3: 全部索引失败时立即退出安装"
  ].join("\n");
}

function buildUvMirrorInstallScript(latestReleaseUrl: string, sourceLabel: string) {
  const escapedUrl = escapePsSingleQuoted(latestReleaseUrl);
  const escapedPattern = escapePsSingleQuoted(UV_WINDOWS_ASSET_PATTERN);
  const escapedLabel = escapePsSingleQuoted(sourceLabel);
  return [
    `$__execlink_uv_release_url='${escapedUrl}'`,
    `$__execlink_uv_asset_pattern='${escapedPattern}'`,
    "$__execlink_uv_base_uri=[System.Uri]$__execlink_uv_release_url",
    "$__execlink_uv_page=Invoke-WebRequest -Uri $__execlink_uv_release_url -TimeoutSec 45 -ErrorAction Stop",
    "$__execlink_uv_links=@($__execlink_uv_page.Links | Where-Object { $_.href })",
    "$__execlink_uv_asset_href=$__execlink_uv_links | ForEach-Object { $_.href } | Where-Object { $_ -match $__execlink_uv_asset_pattern } | Select-Object -First 1",
    "if (-not $__execlink_uv_asset_href) { throw 'uv windows x64 asset link missing in latest release page' }",
    "$__execlink_uv_asset_url=[System.Uri]::new($__execlink_uv_base_uri, $__execlink_uv_asset_href).AbsoluteUri",
    "$__execlink_uv_zip=Join-Path $env:TEMP 'execlink-uv-x64.zip'",
    "$__execlink_uv_extract=Join-Path $env:TEMP ('execlink-uv-' + [System.Guid]::NewGuid().ToString('N'))",
    "$__execlink_uv_target_dir=Join-Path $HOME '.local\\bin'",
    "Invoke-WebRequest -Uri $__execlink_uv_asset_url -OutFile $__execlink_uv_zip -TimeoutSec 180 -MaximumRedirection 8 -ErrorAction Stop",
    "if (-not (Test-Path $__execlink_uv_zip)) { throw 'uv zip missing after download' }",
    "Expand-Archive -Path $__execlink_uv_zip -DestinationPath $__execlink_uv_extract -Force",
    "$__execlink_uv_exe=Get-ChildItem -Path $__execlink_uv_extract -Recurse -Filter 'uv.exe' -ErrorAction SilentlyContinue | Select-Object -First 1",
    "if (-not $__execlink_uv_exe) { throw 'uv.exe missing in extracted archive' }",
    "New-Item -ItemType Directory -Force -Path $__execlink_uv_target_dir | Out-Null",
    "Copy-Item -Path $__execlink_uv_exe.FullName -Destination (Join-Path $__execlink_uv_target_dir 'uv.exe') -Force",
    "if (Test-Path $__execlink_uv_zip) { Remove-Item $__execlink_uv_zip -Force -ErrorAction SilentlyContinue }",
    "if (Test-Path $__execlink_uv_extract) { Remove-Item $__execlink_uv_extract -Recurse -Force -ErrorAction SilentlyContinue }",
    `Write-Host 'uv mirror install step done: ${escapedLabel}'`
  ].join("; ");
}

function buildEnsureUvStepOrder(mode: UvInstallSourceMode): UvInstallStepKey[] {
  if (mode === "official") {
    return ["winget", "official_script"];
  }
  if (mode === "tuna") {
    return ["tuna_mirror", "official_script"];
  }
  if (mode === "aliyun") {
    return ["aliyun_mirror", "official_script"];
  }
  return ["winget", "official_script", "tuna_mirror", "aliyun_mirror"];
}

function buildEnsureUvStepScript(step: UvInstallStepKey) {
  switch (step) {
    case "winget":
      return [
        "$__execlink_winget_cmd = Get-Command winget -ErrorAction SilentlyContinue",
        "if (-not $__execlink_winget_cmd) { throw 'winget command not found' }",
        "winget install --id astral-sh.uv -e --source winget --accept-source-agreements --accept-package-agreements"
      ].join("; ");
    case "official_script":
      return "Invoke-RestMethod -Uri 'https://astral.sh/uv/install.ps1' | Invoke-Expression";
    case "tuna_mirror":
      return buildUvMirrorInstallScript(UV_TUNA_LATEST_RELEASE_URL, "tuna");
    case "aliyun_mirror":
      return buildUvMirrorInstallScript(UV_ALIYUN_LATEST_RELEASE_URL, "aliyun");
    default:
      return "";
  }
}

function buildEnsureUvCommandLines(mode: UvInstallSourceMode, includeVersionCheck: boolean) {
  const steps = buildEnsureUvStepOrder(mode);
  const stepLabel: Record<UvInstallStepKey, string> = {
    winget: "winget",
    official_script: "official",
    tuna_mirror: "tuna",
    aliyun_mirror: "aliyun"
  };
  const lines = [
    "$__execlink_uv_failures = New-Object System.Collections.Generic.List[string]",
    "$__execlink_uv_cmd = Get-Command uv -ErrorAction SilentlyContinue",
    "$__execlink_uv_candidate_dirs = @((Join-Path $HOME '.local\\bin'), (Join-Path $HOME '.cargo\\bin'))",
    "foreach ($__execlink_uv_bin_dir in $__execlink_uv_candidate_dirs) { if ((Test-Path $__execlink_uv_bin_dir) -and ($env:Path -notlike \"*$__execlink_uv_bin_dir*\")) { $env:Path = \"$__execlink_uv_bin_dir;$env:Path\" } }",
    "$__execlink_uv_cmd = Get-Command uv -ErrorAction SilentlyContinue"
  ];

  for (const step of steps) {
    lines.push("if (-not $__execlink_uv_cmd) {");
    lines.push(`  try { ${buildEnsureUvStepScript(step)} } catch { $__execlink_uv_failures.Add('${stepLabel[step]}: ' + $_.Exception.Message) }`);
    lines.push("  $__execlink_uv_cmd = Get-Command uv -ErrorAction SilentlyContinue");
    lines.push("}");
  }

  lines.push("if (-not $__execlink_uv_cmd) {");
  lines.push("  $__execlink_uv_detail = if ($__execlink_uv_failures.Count -gt 0) { $__execlink_uv_failures -join ' | ' } else { 'no fallback step executed' }");
  lines.push("  throw ('uv not found after installation. attempts=' + $__execlink_uv_detail)");
  lines.push("}");
  if (includeVersionCheck) {
    lines.push("uv --version");
  }
  return lines;
}

function buildKimiToolInstallCommand(useMirror: boolean, ensureUv: boolean, uvSourceMode: UvInstallSourceMode) {
  const lines = ["$ErrorActionPreference='Stop'"];

  if (ensureUv) {
    lines.push(...buildEnsureUvCommandLines(uvSourceMode, false));
  }

  lines.push(buildKimiPythonInstallCommand(useMirror));
  lines.push(buildKimiCliInstallCommand(useMirror));
  return lines.join("\n");
}

function buildKimiUvBootstrapCommands(uvSourceMode: UvInstallSourceMode) {
  return ["$ErrorActionPreference='Stop'", ...buildEnsureUvCommandLines(uvSourceMode, true)];
}

function encodeUtf8ToBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function buildInstallCommandForMode(
  key: CliKey,
  installCommand: string,
  mode: InstallLaunchMode,
  uvSourceMode: UvInstallSourceMode
) {
  if (isKimiMirrorInstallKey(key)) {
    if (mode === "mirror") {
      return buildKimiInstallCommand(true, uvSourceMode);
    }
    return installCommand;
  }
  return installCommand;
}

function shouldPromptNpmRegistry(command: string) {
  return command
    .split(/\r?\n/)
    .some((line) => /\bnpm(?:\.cmd)?\s+(?:install|i)\b/i.test(line.trim()));
}

function appendNpmRegistryToCommand(command: string, registryUrl: string) {
  return command
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!/\bnpm(?:\.cmd)?\s+(?:install|i)\b/i.test(trimmed)) {
        return line;
      }
      if (/--registry(?:=|\s+)/i.test(trimmed)) {
        return line.replace(/--registry(?:=|\s+)\S+/i, `--registry=${registryUrl}`);
      }
      return `${line} --registry=${registryUrl}`;
    })
    .join("\n");
}

function applyNpmRegistrySource(command: string, source?: NpmRegistrySource) {
  if (source !== "npmmirror") {
    return command;
  }
  return appendNpmRegistryToCommand(command, NPM_NPMMIRROR_REGISTRY_URL);
}

function hasTauriRuntime() {
  if (typeof window === "undefined") {
    return false;
  }
  const candidate = window as Window & {
    __TAURI_INTERNALS__?: {
      invoke?: unknown;
    };
  };
  return typeof candidate.__TAURI_INTERNALS__?.invoke === "function";
}

function normalizeContextMenuStatus(status: ContextMenuStatus | null | undefined): ContextMenuStatus {
  return {
    ...EMPTY_CONTEXT_MENU_STATUS,
    ...status
  };
}

function normalizeWin11ClassicMenuStatus(
  status: Win11ClassicMenuStatus | null | undefined
): Win11ClassicMenuStatus {
  return {
    ...EMPTY_WIN11_CLASSIC_MENU_STATUS,
    ...status
  };
}

export function HomePage() {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [statuses, setStatuses] = useState<CliStatusMap>(EMPTY_STATUS);
  const [installHints, setInstallHints] = useState<CliInstallHintMap>({});
  const [cliUserPathStatuses, setCliUserPathStatuses] = useState<CliUserPathStatusMap>(EMPTY_CLI_USER_PATH_STATUS);
  const [installPrereq, setInstallPrereq] = useState<InstallPrereqStatus>(EMPTY_PREREQ);
  const [contextMenuStatus, setContextMenuStatus] = useState<ContextMenuStatus>(EMPTY_CONTEXT_MENU_STATUS);
  const [win11ClassicMenuStatus, setWin11ClassicMenuStatus] = useState<Win11ClassicMenuStatus>(
    EMPTY_WIN11_CLASSIC_MENU_STATUS
  );
  const [installingKey, setInstallingKey] = useState<CliKey | null>(null);
  const [lastResult, setLastResult] = useState<ActionResult | null>(null);
  const [quickSetup, setQuickSetup] = useState<QuickSetupStatus>(EMPTY_QUICK_SETUP);
  const [focusedCliKey, setFocusedCliKey] = useState<CliKey | null>(null);
  const [terminalState, setTerminalState] = useState("idle");
  const [installedMenuGroups, setInstalledMenuGroups] = useState<InstalledMenuGroup[]>([]);
  const [legacyArtifacts, setLegacyArtifacts] = useState<LegacyArtifact[]>([]);
  const [selectedMenuGroupKeys, setSelectedMenuGroupKeys] = useState<string[]>([]);
  const [loadingMenuGroups, setLoadingMenuGroups] = useState(false);
  const [windowBusy, setWindowBusy] = useState(false);
  const [usageGuideOpen, setUsageGuideOpen] = useState(false);
  const [gitSourceDialogOpen, setGitSourceDialogOpen] = useState(false);
  const [wingetSourceDialogOpen, setWingetSourceDialogOpen] = useState(false);
  const [npmRegistryDialog, setNpmRegistryDialog] = useState<NpmRegistryDialogState>(EMPTY_NPM_REGISTRY_DIALOG);
  const [uvSourceDialog, setUvSourceDialog] = useState<UvSourceDialogState>(EMPTY_UV_SOURCE_DIALOG);
  const [terminalCountdown, setTerminalCountdown] = useState<InstallCountdownState | null>(null);
  const [quickSetupLogTail, setQuickSetupLogTail] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    title: "",
    message: "",
    confirmText: "确认",
    cancelText: "取消",
    danger: false
  });
  const [maintenanceDetailDialog, setMaintenanceDetailDialog] = useState<MaintenanceDetailDialogState>({
    open: false,
    title: "",
    message: ""
  });
  const installPollTimerRef = useRef<number | null>(null);
  const terminalAutoCloseTimerRef = useRef<number | null>(null);
  const terminalCountdownTimerRef = useRef<number | null>(null);
  const installPollExpectedRef = useRef<boolean | null>(null);
  const installAttemptContextRef = useRef<InstallAttemptContext | null>(null);
  const installLauncherRef = useRef<((key: CliKey, options?: InstallLaunchOptions) => Promise<void>) | null>(
    null
  );
  const terminalUnlistenRef = useRef<UnlistenFn[]>([]);
  const confirmResolveRef = useRef<((accepted: boolean) => void) | null>(null);
  const gitSourceResolveRef = useRef<((source: GitInstallSource | null) => void) | null>(null);
  const wingetSourceResolveRef = useRef<((source: WingetInstallMethod | null) => void) | null>(null);
  const npmRegistryResolveRef = useRef<((source: NpmRegistrySource | null) => void) | null>(null);
  const uvSourceResolveRef = useRef<((source: UvInstallSourceDialogChoice | null) => void) | null>(null);
  const installTimeoutsRef = useRef<InstallTimeoutConfig>(normalizeInstallTimeouts(DEFAULT_CONFIG.install_timeouts));
  const toastManager = Toast.useToastManager();
  const toastAddRef = useRef(toastManager.add);
  const configRef = useRef(config);
  const tauriWindow = useMemo(() => (hasTauriRuntime() ? getCurrentWindow() : null), []);
  toastAddRef.current = toastManager.add;
  configRef.current = config;
  installTimeoutsRef.current = normalizeInstallTimeouts(config.install_timeouts);

  const appendTerminalPanelOutput = useCallback((text: string) => {
    if (!text) {
      return;
    }
    const host = window as Window & {
      __EXECLINK_TERMINAL_WRITE__?: (payload: string) => void;
      __EXECLINK_TERMINAL_BUFFER__?: string;
    };
    const writer = host.__EXECLINK_TERMINAL_WRITE__;
    if (writer) {
      writer(text);
      return;
    }
    const previous = host.__EXECLINK_TERMINAL_BUFFER__ ?? "";
    const merged = `${previous}${text}`;
    host.__EXECLINK_TERMINAL_BUFFER__ = merged.length > 120000 ? merged.slice(merged.length - 120000) : merged;
  }, []);

  const clearTerminalPanelBuffer = useCallback(() => {
    const host = window as Window & {
      __EXECLINK_TERMINAL_BUFFER__?: string;
    };
    host.__EXECLINK_TERMINAL_BUFFER__ = "";
  }, []);

  const getTerminalPanelBuffer = useCallback(() => {
    const host = window as Window & {
      __EXECLINK_TERMINAL_BUFFER__?: string;
    };
    return host.__EXECLINK_TERMINAL_BUFFER__ ?? "";
  }, []);

  const getTimeoutMs = useCallback((key: keyof InstallTimeoutConfig) => {
    return installTimeoutsRef.current[key];
  }, []);

  const clearTerminalCountdownTimer = useCallback(() => {
    if (terminalCountdownTimerRef.current !== null) {
      window.clearInterval(terminalCountdownTimerRef.current);
      terminalCountdownTimerRef.current = null;
    }
  }, []);

  const stopTerminalCountdown = useCallback(() => {
    clearTerminalCountdownTimer();
    setTerminalCountdown(null);
  }, [clearTerminalCountdownTimer]);

  const startTerminalCountdown = useCallback(
    (label: string, totalMs: number) => {
      const safeTotal = Math.max(1000, Math.round(totalMs));
      clearTerminalCountdownTimer();
      const deadline = Date.now() + safeTotal;
      setTerminalCountdown({
        active: true,
        label,
        total_ms: safeTotal,
        remaining_ms: safeTotal
      });
      terminalCountdownTimerRef.current = window.setInterval(() => {
        const remaining = Math.max(0, deadline - Date.now());
        setTerminalCountdown({
          active: remaining > 0,
          label,
          total_ms: safeTotal,
          remaining_ms: remaining
        });
        if (remaining <= 0) {
          clearTerminalCountdownTimer();
        }
      }, 250);
    },
    [clearTerminalCountdownTimer]
  );

  const getTerminalBufferTail = useCallback((maxLines = 40) => {
    const segment = getTerminalPanelBuffer();
    const tail = segment
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(-maxLines)
      .join("\n")
      .trim();
    return tail || null;
  }, [getTerminalPanelBuffer]);

  const refreshQuickSetupLogTail = useCallback(() => {
    setQuickSetupLogTail(getTerminalBufferTail(40));
  }, [getTerminalBufferTail]);

  const stopInstallPolling = useCallback(() => {
    if (installPollTimerRef.current !== null) {
      window.clearInterval(installPollTimerRef.current);
      installPollTimerRef.current = null;
    }
    installPollExpectedRef.current = null;
    installAttemptContextRef.current = null;
    setInstallingKey(null);
    stopTerminalCountdown();
  }, [stopTerminalCountdown]);

  useEffect(() => {
    return () => {
      if (installPollTimerRef.current !== null) {
        window.clearInterval(installPollTimerRef.current);
      }
      if (terminalAutoCloseTimerRef.current !== null) {
        window.clearTimeout(terminalAutoCloseTimerRef.current);
      }
      if (terminalCountdownTimerRef.current !== null) {
        window.clearInterval(terminalCountdownTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const unlistenOutput = await listen<TerminalOutputEvent>("terminal_output", (event) => {
        appendTerminalPanelOutput(event.payload.data);
        refreshQuickSetupLogTail();
      });

      const unlistenState = await listen<TerminalStateEvent>("terminal_state", (event) => {
        setTerminalState(event.payload.state);
      });

      if (!active) {
        unlistenOutput();
        unlistenState();
        return;
      }
      terminalUnlistenRef.current = [unlistenOutput, unlistenState];
    })();

    return () => {
      active = false;
      for (const unlisten of terminalUnlistenRef.current) {
        try {
          unlisten();
        } catch {
          // ignore
        }
      }
      terminalUnlistenRef.current = [];
    };
  }, [appendTerminalPanelOutput, refreshQuickSetupLogTail]);

  const runWindowAction = useCallback(
    async (action: (win: TauriWindow) => Promise<void>) => {
      if (!tauriWindow || windowBusy) {
        return;
      }
      setWindowBusy(true);
      try {
        await action(tauriWindow);
      } catch {
        // ignore non-critical window action errors
      } finally {
        setWindowBusy(false);
      }
    },
    [tauriWindow, windowBusy]
  );

  const onProductBarMouseDown = useCallback(
    async (event: ReactMouseEvent<HTMLElement>) => {
      if (!tauriWindow || event.button !== 0) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-no-drag='true']")) {
        return;
      }
      if (event.detail >= 2) {
        await runWindowAction((win) => win.toggleMaximize());
        return;
      }
      try {
        await tauriWindow.startDragging();
      } catch {
        // ignore drag errors
      }
    },
    [runWindowAction, tauriWindow]
  );

  const settleConfirmDialog = useCallback((accepted: boolean) => {
    const resolver = confirmResolveRef.current;
    confirmResolveRef.current = null;
    setConfirmDialog((prev) => ({
      ...prev,
      open: false
    }));
    if (resolver) {
      resolver(accepted);
    }
  }, []);

  const settleGitSourceDialog = useCallback((source: GitInstallSource | null) => {
    const resolver = gitSourceResolveRef.current;
    gitSourceResolveRef.current = null;
    setGitSourceDialogOpen(false);
    if (resolver) {
      resolver(source);
    }
  }, []);

  const closeMaintenanceDetailDialog = useCallback(() => {
    setMaintenanceDetailDialog((prev) => ({
      ...prev,
      open: false
    }));
  }, []);

  const settleWingetSourceDialog = useCallback((source: WingetInstallMethod | null) => {
    const resolver = wingetSourceResolveRef.current;
    wingetSourceResolveRef.current = null;
    setWingetSourceDialogOpen(false);
    if (resolver) {
      resolver(source);
    }
  }, []);

  const settleNpmRegistryDialog = useCallback((source: NpmRegistrySource | null) => {
    const resolver = npmRegistryResolveRef.current;
    npmRegistryResolveRef.current = null;
    setNpmRegistryDialog(EMPTY_NPM_REGISTRY_DIALOG);
    if (resolver) {
      resolver(source);
    }
  }, []);

  const settleUvSourceDialog = useCallback((source: UvInstallSourceDialogChoice | null) => {
    const resolver = uvSourceResolveRef.current;
    uvSourceResolveRef.current = null;
    setUvSourceDialog(EMPTY_UV_SOURCE_DIALOG);
    if (resolver) {
      resolver(source);
    }
  }, []);

  const applyUvSourceDialogSelection = useCallback(
    (source: UvInstallSourceDialogChoice | null) => {
      if (source) {
        setConfig((prev) => ({
          ...prev,
          uv_install_source_mode: source
        }));
      }
      settleUvSourceDialog(source);
    },
    [settleUvSourceDialog]
  );

  const requestConfirm = useCallback(
    (options: {
      title: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
      danger?: boolean;
    }) => {
      if (confirmResolveRef.current) {
        confirmResolveRef.current(false);
        confirmResolveRef.current = null;
      }
      return new Promise<boolean>((resolve) => {
        confirmResolveRef.current = resolve;
        setConfirmDialog({
          open: true,
          title: options.title,
          message: options.message,
          confirmText: options.confirmText ?? "确认",
          cancelText: options.cancelText ?? "取消",
          danger: Boolean(options.danger)
        });
      });
    },
    []
  );

  useEffect(() => {
    return () => {
      if (confirmResolveRef.current) {
        confirmResolveRef.current(false);
        confirmResolveRef.current = null;
      }
    };
  }, []);

  const requestGitInstallSource = useCallback(() => {
    if (gitSourceResolveRef.current) {
      gitSourceResolveRef.current(null);
      gitSourceResolveRef.current = null;
    }
    return new Promise<GitInstallSource | null>((resolve) => {
      gitSourceResolveRef.current = resolve;
      setGitSourceDialogOpen(true);
    });
  }, []);

  const requestWingetInstallMethod = useCallback(() => {
    if (wingetSourceResolveRef.current) {
      wingetSourceResolveRef.current(null);
      wingetSourceResolveRef.current = null;
    }
    return new Promise<WingetInstallMethod | null>((resolve) => {
      wingetSourceResolveRef.current = resolve;
      setWingetSourceDialogOpen(true);
    });
  }, []);

  const requestNpmRegistrySource = useCallback((title: string, baseCommand: string) => {
    if (npmRegistryResolveRef.current) {
      npmRegistryResolveRef.current(null);
      npmRegistryResolveRef.current = null;
    }
    return new Promise<NpmRegistrySource | null>((resolve) => {
      npmRegistryResolveRef.current = resolve;
      setNpmRegistryDialog({
        open: true,
        title,
        officialCommand: applyNpmRegistrySource(baseCommand, "official"),
        mirrorCommand: applyNpmRegistrySource(baseCommand, "npmmirror")
      });
    });
  }, []);

  const requestUvInstallSourceMode = useCallback(() => {
    if (uvSourceResolveRef.current) {
      uvSourceResolveRef.current(null);
      uvSourceResolveRef.current = null;
    }
    return new Promise<UvInstallSourceDialogChoice | null>((resolve) => {
      uvSourceResolveRef.current = resolve;
      setUvSourceDialog({ open: true });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (gitSourceResolveRef.current) {
        gitSourceResolveRef.current(null);
        gitSourceResolveRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (wingetSourceResolveRef.current) {
        wingetSourceResolveRef.current(null);
        wingetSourceResolveRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (npmRegistryResolveRef.current) {
        npmRegistryResolveRef.current(null);
        npmRegistryResolveRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (uvSourceResolveRef.current) {
        uvSourceResolveRef.current(null);
        uvSourceResolveRef.current = null;
      }
    };
  }, []);

  const refreshInitialState = useCallback(async () => {
    const state = await getInitialState();
    const normalizedConfig = normalizeLockedConfig({
      ...state.config,
      cli_order: normalizeCliOrder(state.config.cli_order),
      install_timeouts: normalizeInstallTimeouts(state.config.install_timeouts)
    });
    const contextMenuStatus = normalizeContextMenuStatus(state.context_menu_status);
    const win11ClassicMenuStatus = normalizeWin11ClassicMenuStatus(state.win11_classic_menu_status);
    setConfig(normalizedConfig);
    setStatuses(state.cli_status);
    setContextMenuStatus(contextMenuStatus);
    setWin11ClassicMenuStatus(win11ClassicMenuStatus);
    return {
      ...state,
      config: normalizedConfig,
      context_menu_status: contextMenuStatus,
      win11_classic_menu_status: win11ClassicMenuStatus
    };
  }, []);

  const refreshCliUserPathStatuses = useCallback(async () => {
    try {
      const next = await getCliUserPathStatuses();
      setCliUserPathStatuses(next);
      return next;
    } catch {
      setCliUserPathStatuses(EMPTY_CLI_USER_PATH_STATUS);
      return EMPTY_CLI_USER_PATH_STATUS;
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const state = await refreshInitialState();

        const [hintResult, prereqResult, cliUserPathResult] = await Promise.allSettled([
          getCliInstallHints(),
          getInstallPrereqStatus(),
          refreshCliUserPathStatuses()
        ]);

        if (hintResult.status === "fulfilled") {
          setInstallHints(hintResult.value);
        } else {
          setInstallHints({});
        }

        if (prereqResult.status === "fulfilled") {
          setInstallPrereq(prereqResult.value);
        } else {
          setInstallPrereq(EMPTY_PREREQ);
        }

        if (cliUserPathResult.status === "rejected") {
          setCliUserPathStatuses(EMPTY_CLI_USER_PATH_STATUS);
        }

      } catch (error) {
        const detail = String(error);
        const runtimeUnavailable = detail.includes("未检测到 Tauri 运行时");
        setLastResult({
          ok: false,
          code: runtimeUnavailable ? "tauri_runtime_unavailable" : "init_failed",
          message: runtimeUnavailable ? "请通过 Tauri 桌面端启动" : "初始化失败",
          detail
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshCliUserPathStatuses, refreshInitialState]);

  const setToggle = useCallback((key: CliKey, checked: boolean) => {
    setConfig((prev) => ({
      ...prev,
      toggles: {
        ...prev.toggles,
        [key]: checked
      }
    }));
  }, []);

  const setDisplayName = useCallback((key: CliKey, value: string) => {
    setConfig((prev) => ({
      ...prev,
      display_names: {
        ...prev.display_names,
        [key]: value
      }
    }));
  }, []);

  const setInstallTimeoutValueMs = useCallback((key: keyof InstallTimeoutConfig, nextValueMs: number) => {
    setConfig((prev) => ({
      ...prev,
      install_timeouts: normalizeInstallTimeouts({
        ...prev.install_timeouts,
        [key]: nextValueMs
      })
    }));
  }, []);

  const runAction = useCallback(async (fn: () => Promise<ActionResult>) => {
    setWorking(true);
    try {
      const result = await fn();
      setLastResult(result);
      return result;
    } catch (error) {
      const result = {
        ok: false,
        code: "runtime_exception",
        message: "操作失败",
        detail: String(error)
      } satisfies ActionResult;
      setLastResult(result);
      return result;
    } finally {
      setWorking(false);
    }
  }, []);

  const promptOpenWingetInstallPage = useCallback(
    async (reason: string) => {
      const shouldOpen = await requestConfirm({
        title: "打开 winget 官方安装页",
        message: [
          reason,
          "",
          "是否打开 Microsoft Store 安装页手动安装 winget？",
          "https://apps.microsoft.com/detail/9NBLGGH4NNS1"
        ].join("\n"),
        confirmText: "打开安装页",
        cancelText: "稍后处理"
      });
      if (!shouldOpen) {
        return;
      }
      const openResult = await openWingetInstallPage();
      setLastResult(openResult);
    },
    [requestConfirm]
  );

  const ensureWingetBeforeCliInstall = useCallback(
    async (entry: WingetInstallEntry): Promise<boolean> => {
      const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
      const entryLabel = wingetInstallEntryLabel(entry);
      const verifyTimeoutMs = getTimeoutMs("winget_install_recheck_timeout_ms");
      try {
        const prereq = await getInstallPrereqStatus();
        setInstallPrereq(prereq);
        if (prereq.winget) {
          return true;
        }

        const selectedMethod = await requestWingetInstallMethod();
        if (!selectedMethod) {
          setLastResult({
            ok: false,
            code: "winget_install_cancelled",
            message: "已取消 winget 安装",
            detail: `入口：${entryLabel}`
          });
          return false;
        }

        const methodLabel = wingetInstallMethodLabel(selectedMethod);
        if (selectedMethod === "store") {
          const openResult = await openWingetInstallPage();
          if (!openResult.ok) {
            setLastResult(openResult);
            return false;
          }
          setLastResult({
            ok: false,
            code: "winget_install_manual_required",
            message: "请先在微软商店完成 winget 安装后重试。",
            detail: `入口：${entryLabel}；安装方式：${methodLabel}\n${openResult.detail ?? ""}`.trim()
          });
          return false;
        }

        const launchResult = await launchWingetInstall("official");
        setLastResult(launchResult);
        if (!launchResult.ok) {
          await promptOpenWingetInstallPage(`winget ${methodLabel}启动失败。`);
          return false;
        }

        startTerminalCountdown("winget 安装复检", verifyTimeoutMs);
        try {
          const startedAt = Date.now();
          while (Date.now() - startedAt < verifyTimeoutMs) {
            await wait(INSTALL_RECHECK_INTERVAL_MS);
            const next = await getInstallPrereqStatus();
            setInstallPrereq(next);
            if (next.winget) {
              setLastResult({
                ok: true,
                code: "winget_install_ready",
                message: "已检测到 winget，继续执行安装流程。",
                detail: `入口：${entryLabel}；安装方式：${methodLabel}`
              });
              return true;
            }
          }
        } finally {
          stopTerminalCountdown();
        }

        setLastResult({
          ok: false,
          code: "winget_install_verify_timeout",
          message: "winget 安装后复检超时",
          detail: "未在预期时间内检测到 winget，请确认安装窗口已完成并重试。"
        });
        await promptOpenWingetInstallPage(`未在预期时间内检测到 winget（安装方式：${methodLabel}）。`);
        return false;
      } catch (error) {
        setLastResult({
          ok: false,
          code: "winget_install_exception",
          message: "winget 前置检查失败",
          detail: String(error)
        });
        return false;
      }
    },
    [getTimeoutMs, promptOpenWingetInstallPage, requestWingetInstallMethod, startTerminalCountdown, stopTerminalCountdown]
  );

  const ensurePs1PolicyReady = useCallback(
    async (contextTitle: string) => {
      let status: PowerShellPs1PolicyStatus;
      try {
        status = await getPowershellPs1PolicyStatus();
      } catch (error) {
        setLastResult({
          ok: false,
          code: "ps1_policy_status_failed",
          message: `${contextTitle} failed`,
          detail: String(error)
        });
        return false;
      }

      if (!status.blocked) {
        return true;
      }

      const accepted = await requestConfirm({
        title: "PowerShell script policy is blocking .ps1",
        message: [
          `${contextTitle} needs PowerShell script execution permission.`,
          `Current policy: ${status.effective_policy}`,
          `Fix command:\n${status.fix_command}`,
          "\nClick confirm to repair this automatically."
        ].join("\n"),
        confirmText: "Allow and Fix",
        cancelText: "Cancel",
        danger: true
      });
      if (!accepted) {
        setLastResult({
          ok: false,
          code: "ps1_policy_fix_cancelled",
          message: `${contextTitle} cancelled`,
          detail: `Current policy: ${status.effective_policy}`
        });
        return false;
      }

      const fixResult = await runAction(fixPowershellPs1Policy);
      if (!fixResult.ok) {
        return false;
      }

      try {
        const nextStatus = await getPowershellPs1PolicyStatus();
        if (nextStatus.blocked) {
          setLastResult({
            ok: false,
            code: "ps1_policy_still_blocked",
            message: `${contextTitle} failed`,
            detail: `Effective policy is still ${nextStatus.effective_policy}`
          });
          return false;
        }
      } catch (error) {
        setLastResult({
          ok: false,
          code: "ps1_policy_status_failed",
          message: `${contextTitle} failed`,
          detail: String(error)
        });
        return false;
      }

      return true;
    },
    [requestConfirm, runAction]
  );

  const clearTerminalAutoCloseTimer = useCallback(() => {
    if (terminalAutoCloseTimerRef.current !== null) {
      window.clearTimeout(terminalAutoCloseTimerRef.current);
      terminalAutoCloseTimerRef.current = null;
    }
  }, []);

  const closeEmbeddedTerminalSilently = useCallback(async () => {
    clearTerminalAutoCloseTimer();
    stopTerminalCountdown();
    try {
      await terminalCloseSession();
    } catch {
      // ignore terminal close failures for auto-close path
    } finally {
      setTerminalState("idle");
      setFocusedCliKey(null);
      clearTerminalPanelBuffer();
      setQuickSetupLogTail(null);
    }
  }, [clearTerminalAutoCloseTimer, clearTerminalPanelBuffer, stopTerminalCountdown]);

  const scheduleTerminalAutoClose = useCallback(
    (delayMs = 3000) => {
      clearTerminalAutoCloseTimer();
      terminalAutoCloseTimerRef.current = window.setTimeout(() => {
        terminalAutoCloseTimerRef.current = null;
        void closeEmbeddedTerminalSilently();
      }, delayMs);
    },
    [clearTerminalAutoCloseTimer, closeEmbeddedTerminalSilently]
  );

  const emitTerminalScriptPreview = useCallback(
    (label: string, script: string) => {
      appendTerminalPanelOutput(`\n[ExecLink] ${label}\n> ${script}\n`);
    },
    [appendTerminalPanelOutput]
  );

  const runTerminalScriptAndWait = useCallback(
    async (
      label: string,
      script: string,
      timeoutMs = getTimeoutMs("terminal_script_timeout_ms"),
      countdownLabel?: string
    ): Promise<ActionResult> => {
      const marker = `execlink_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const baselineBuffer = getTerminalPanelBuffer();
      const baselineLength = baselineBuffer.length;
      const encodedScript = encodeUtf8ToBase64(script);
      const wrappedScript = [
        "$ErrorActionPreference='Stop'",
        `$__execlink_script_b64='${encodedScript}'`,
        "$__execlink_script_text=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($__execlink_script_b64))",
        `$__execlink_result_marker='${marker}'`,
        "$__execlink_result_error=$null",
        "$global:LASTEXITCODE=0",
        "try { & ([ScriptBlock]::Create($__execlink_script_text)) } catch { $__execlink_result_error=$_.Exception.Message }",
        "if (-not $__execlink_result_error -and $null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {",
        "  $__execlink_result_error='native_exit_code=' + $LASTEXITCODE",
        "}",
        "if ($__execlink_result_error) {",
        "  Write-Output ('[ExecLink][Result][' + $__execlink_result_marker + '][FAIL]')",
        "  Write-Output ('[ExecLink][Error][' + $__execlink_result_marker + '] ' + $__execlink_result_error)",
        "} else {",
        "  Write-Output ('[ExecLink][Result][' + $__execlink_result_marker + '][OK]')",
        "}"
      ].join("; ");

      startTerminalCountdown(countdownLabel ?? label, timeoutMs);
      try {
        const submitResult = await terminalRunScript(wrappedScript);
        if (!submitResult.ok) {
          return {
            ...submitResult,
            code: "terminal_script_submit_failed",
            message: `${label} 写入终端失败`
          };
        }

        const okToken = `[ExecLink][Result][${marker}][OK]`;
        const failToken = `[ExecLink][Result][${marker}][FAIL]`;
        const errorToken = `[ExecLink][Error][${marker}]`;
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const currentBuffer = getTerminalPanelBuffer();
          const segment = currentBuffer.length >= baselineLength ? currentBuffer.slice(baselineLength) : currentBuffer;
          if (segment.includes(okToken)) {
            refreshQuickSetupLogTail();
            return {
              ok: true,
              code: "terminal_script_completed",
              message: `${label} 执行成功`,
              detail: script
            };
          }
          if (segment.includes(failToken)) {
            const errorIndex = segment.lastIndexOf(errorToken);
            let detail: string | null = null;
            if (errorIndex >= 0) {
              const errorText = segment.slice(errorIndex + errorToken.length).trimStart();
              const firstLine = errorText.split(/\r?\n/, 1)[0]?.trim();
              detail = firstLine ? firstLine : null;
            }
            const finalDetail = buildNetworkErrorHint(detail ?? `${label} failed in embedded terminal.`);
            refreshQuickSetupLogTail();
            return {
              ok: false,
              code: "terminal_script_runtime_failed",
              message: `${label} 执行失败`,
              detail: finalDetail
            };
          }
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }

        const timeoutDetail = (() => {
          const currentBuffer = getTerminalPanelBuffer();
          const segment = currentBuffer.length >= baselineLength ? currentBuffer.slice(baselineLength) : currentBuffer;
          const tail = segment
            .split(/\r?\n/)
            .filter((line) => line.trim().length > 0)
            .slice(-40)
            .join("\n")
            .trim();
          if (!tail) {
            return `未在 ${Math.round(timeoutMs / 1000)} 秒内收到终端结果标记。`;
          }
          return `未在 ${Math.round(timeoutMs / 1000)} 秒内收到终端结果标记。\n最近终端输出：\n${tail}`;
        })();
        refreshQuickSetupLogTail();
        return {
          ok: false,
          code: "terminal_script_result_timeout",
          message: `${label} 执行超时`,
          detail: timeoutDetail
        };
      } finally {
        stopTerminalCountdown();
      }
    },
    [getTerminalPanelBuffer, getTimeoutMs, refreshQuickSetupLogTail, startTerminalCountdown, stopTerminalCountdown]
  );

  const runTerminalCommandsSequentially = useCallback(
    async (label: string, commands: string[]): Promise<ActionResult> => {
      const filtered = commands.map((command) => command.trim()).filter((command) => command.length > 0);
      const total = filtered.length;
      for (let index = 0; index < total; index += 1) {
        const command = filtered[index];
        appendTerminalPanelOutput(`\n[ExecLink] ${label} [${index + 1}/${total}]\n> ${command}\n`);
        const result = await runTerminalScriptAndWait(`${label} 第 ${index + 1} 步`, command);
        if (!result.ok) {
          return {
            ...result,
            code: "terminal_step_failed",
            message: `${label} 第 ${index + 1} 步执行失败`
          };
        }
      }
      return {
        ok: true,
        code: "terminal_steps_completed",
        message: `${label} 命令执行完成`,
        detail: filtered.join("\n")
      };
    },
    [appendTerminalPanelOutput, runTerminalScriptAndWait]
  );

  const buildConfigWithCliDetected = useCallback(
    (base: AppConfig, key: CliKey, detected: boolean): AppConfig =>
      normalizeLockedConfig({
        ...base,
        cli_order: normalizeCliOrder(base.cli_order),
        toggles: {
          ...base.toggles,
          [key]: detected
        }
      }),
    []
  );

  const syncContextMenuConfig = useCallback(
    async (payload: AppConfig, reason: "install" | "uninstall" | "register"): Promise<ActionResult> => {
      const effectivePayload = normalizeLockedConfig(payload);
      const applyResult = await applyConfig(effectivePayload);
      if (!applyResult.ok) {
        return applyResult;
      }
      const notifyResult = await notifyShellChanged();
      if (!notifyResult.ok) {
        return notifyResult;
      }
      return {
        ok: true,
        code: "menu_sync_applied",
        message: reason === "uninstall" ? "已同步卸载后的右键菜单" : "已同步右键菜单",
        detail: applyResult.detail ?? notifyResult.detail ?? null
      };
    },
    []
  );

  const syncMenuAfterCliChange = useCallback(
    async (key: CliKey, detected: boolean, detectedMap?: CliStatusMap) => {
      const payload = buildConfigWithCliDetected(configRef.current, key, detected);
      setConfig(payload);
      const resolvedDetected = detectedMap ?? (await detectClis());
      setStatuses(resolvedDetected);
      const filteredPayload = filterConfigTogglesByDetection(payload, resolvedDetected);

      const syncResult = await syncContextMenuConfig(
        filteredPayload,
        detected ? "install" : "uninstall"
      );
      if (!syncResult.ok) {
        setLastResult(syncResult);
        return false;
      }

      await refreshInitialState();
      setLastResult({
        ok: true,
        code: detected ? "install_detected_synced" : "uninstall_detected_synced",
        message: detected
          ? `${CLI_DEFAULT_TITLES[key]} 已检测到，右键菜单已自动更新。`
          : `${CLI_DEFAULT_TITLES[key]} 已卸载，右键菜单已自动更新。`,
        detail: syncResult.detail ?? null
      });
      return true;
    },
    [buildConfigWithCliDetected, refreshInitialState, syncContextMenuConfig]
  );

  const requestMirrorFallbackRetry = useCallback(
    async (key: CliKey, reason: "timeout" | "failed") => {
      const launcher = installLauncherRef.current;
      if (!launcher) {
        return;
      }
      const hint = installHints[key];
      const displayName = hint?.display_name ?? CLI_DEFAULT_TITLES[key];
      const accepted = await requestConfirm({
        title: "清华源安装复检未通过",
        message: [
          `${displayName} 使用清华源后${reason === "timeout" ? "复检超时" : "复检失败"}。`,
          "可能是镜像同步延迟或网络连通性问题。",
          "\n是否回退官方源并重试一次安装？"
        ].join("\n"),
        confirmText: "回退官方源重试",
        cancelText: "稍后手动处理"
      });
      if (!accepted) {
        return;
      }
      await launcher(key, {
        mode: "official",
        skipPrimaryConfirm: true,
        skipRiskConfirm: true,
        fromMirrorFallback: true
      });
    },
    [installHints, requestConfirm]
  );

  const startInstallRecheck = useCallback(
    (key: CliKey, expectedDetected: boolean, mode: InstallLaunchMode = "official") => {
      stopInstallPolling();
      installPollExpectedRef.current = expectedDetected;
      installAttemptContextRef.current = { key, expectedDetected, mode };
      setInstallingKey(key);
      const installRecheckTimeoutMs = getTimeoutMs("install_recheck_timeout_ms");
      startTerminalCountdown(`${CLI_DEFAULT_TITLES[key]} ${expectedDetected ? "安装" : "卸载"}复检`, installRecheckTimeoutMs);
      const startedAt = Date.now();

      installPollTimerRef.current = window.setInterval(() => {
        void (async () => {
          try {
            const next = await detectClis();
            setStatuses(next);

            if (next[key] === expectedDetected) {
              installAttemptContextRef.current = null;
              stopInstallPolling();
              setWorking(true);
              try {
                const synced = await syncMenuAfterCliChange(key, expectedDetected, next);
                await refreshCliUserPathStatuses();
                if (synced) {
                  scheduleTerminalAutoClose(3000);
                }
              } finally {
                setWorking(false);
              }
              return;
            }

            if (Date.now() - startedAt >= installRecheckTimeoutMs) {
              const attemptContext = installAttemptContextRef.current;
              installAttemptContextRef.current = null;
              stopInstallPolling();
              const actionLabel = expectedDetected ? "安装" : "卸载";
              setLastResult({
                ok: false,
                code: expectedDetected ? "install_detect_timeout" : "uninstall_detect_timeout",
                message: `${CLI_DEFAULT_TITLES[key]} ${actionLabel}后复检超时`,
                detail: `请确认${actionLabel}命令是否已完成，并手动点击“刷新 CLI 检测”。`
              });
              if (
                expectedDetected &&
                attemptContext?.key === key &&
                attemptContext.mode === "mirror" &&
                isKimiMirrorInstallKey(key)
              ) {
                await requestMirrorFallbackRetry(key, "timeout");
              }
            }
          } catch (error) {
            const attemptContext = installAttemptContextRef.current;
            installAttemptContextRef.current = null;
            stopInstallPolling();
            setLastResult({
              ok: false,
              code: expectedDetected ? "install_detect_failed" : "uninstall_detect_failed",
              message: `${expectedDetected ? "安装" : "卸载"}后复检失败`,
              detail: String(error)
            });
            if (
              expectedDetected &&
              attemptContext?.key === key &&
              attemptContext.mode === "mirror" &&
              isKimiMirrorInstallKey(key)
            ) {
              await requestMirrorFallbackRetry(key, "failed");
            }
          }
        })();
      }, INSTALL_RECHECK_INTERVAL_MS);
    },
    [
      getTimeoutMs,
      refreshCliUserPathStatuses,
      requestMirrorFallbackRetry,
      scheduleTerminalAutoClose,
      startTerminalCountdown,
      stopInstallPolling,
      syncMenuAfterCliChange
    ]
  );

  const onEnsureInstall = useCallback(async () => {
    setWorking(true);
    try {
      await refreshInitialState();
      setLastResult({
        ok: true,
        code: "context_menu_state_refreshed",
        message: "右键菜单状态已刷新",
        detail: null
      });
    } catch (error) {
      setLastResult({
        ok: false,
        code: "context_menu_state_refresh_failed",
        message: "刷新右键菜单状态失败",
        detail: String(error)
      });
    } finally {
      setWorking(false);
    }
  }, [refreshInitialState]);

  const onRetryElevation = useCallback(async () => {
    setWorking(true);
    try {
      const result = await notifyShellChanged();
      setLastResult(result);
      if (result.ok) {
        await refreshInitialState();
      }
    } catch (error) {
      setLastResult({
        ok: false,
        code: "shell_refresh_failed",
        message: "通知 Explorer 刷新失败",
        detail: String(error)
      });
    } finally {
      setWorking(false);
    }
  }, [refreshInitialState]);

  const onDetect = useCallback(async () => {
    setWorking(true);
    try {
      const [next, prereq] = await Promise.all([detectClis(), getInstallPrereqStatus()]);
      setStatuses(next);
      setInstallPrereq(prereq);
      await refreshCliUserPathStatuses();

      if (
        installingKey &&
        installPollExpectedRef.current !== null &&
        next[installingKey] === installPollExpectedRef.current
      ) {
        const detected = installPollExpectedRef.current === true;
        stopInstallPolling();
        const synced = await syncMenuAfterCliChange(installingKey, detected, next);
        if (synced) {
          scheduleTerminalAutoClose(3000);
        }
        return;
      }

      setLastResult({ ok: true, code: "ok", message: "检测完成", detail: null });
    } catch (error) {
      setLastResult({ ok: false, code: "detect_failed", message: "检测失败", detail: String(error) });
    } finally {
      setWorking(false);
    }
  }, [
    installingKey,
    refreshCliUserPathStatuses,
    scheduleTerminalAutoClose,
    stopInstallPolling,
    syncMenuAfterCliChange
  ]);

  const onCopyInstallCommand = useCallback(
    async (key: CliKey) => {
      const hint = installHints[key];
      if (!hint) {
        setLastResult({
          ok: false,
          code: "install_hint_missing",
          message: "未找到安装指引",
          detail: `未配置 ${key} 的安装命令。`
        });
        return;
      }
      try {
        await navigator.clipboard.writeText(hint.install_command);
        setLastResult({
          ok: true,
          code: "ok",
          message: `已复制 ${hint.display_name} 安装命令`,
          detail: hint.install_command
        });
      } catch (error) {
        setLastResult({
          ok: false,
          code: "clipboard_failed",
          message: "复制安装命令失败",
          detail: String(error)
        });
      }
    },
    [installHints]
  );

  const onOpenInstallDocs = useCallback(
    async (key: CliKey) => {
      const hint = installHints[key];
      if (!hint) {
        setLastResult({
          ok: false,
          code: "install_hint_missing",
          message: "未找到安装指引",
          detail: `未配置 ${key} 的文档链接。`
        });
        return;
      }
      const result = await runAction(() => openInstallDocs(key));
      if (!result.ok) {
        return;
      }
      setLastResult({
        ok: true,
        code: result.code,
        message: `已打开 ${hint.display_name} 安装说明`,
        detail: hint.docs_url
      });
    },
    [installHints, runAction]
  );

  const onOpenNodejsDownload = useCallback(async () => {
    const result = await runAction(openNodejsDownloadPage);
    if (!result.ok) {
      return;
    }
    setLastResult({
      ok: true,
      code: result.code,
      message: "已打开 Node.js 下载页面",
      detail: "https://nodejs.org/zh-cn/download"
    });
  }, [runAction]);

  const onAddCliCommandDirToUserPath = useCallback(
    async (key: CliKey) => {
      const status = cliUserPathStatuses[key];
      const command = status?.add_user_path_command?.trim() ?? "";
      if (command) {
        const accepted = await requestConfirm({
          title: `Add ${CLI_DEFAULT_TITLES[key]} command to user PATH`,
          message: [`Command:\n${command}`, "\nClick confirm to execute this command."].join("\n"),
          confirmText: "Add to PATH",
          cancelText: "Cancel"
        });
        if (!accepted) {
          setLastResult({
            ok: false,
            code: "user_path_fix_cancelled",
            message: "Add to PATH cancelled",
            detail: null
          });
          return;
        }
      }

      const result = await runAction(() => addCliCommandDirToUserPath(key));
      if (!result.ok) {
        return;
      }
      await refreshCliUserPathStatuses();
    },
    [cliUserPathStatuses, refreshCliUserPathStatuses, requestConfirm, runAction]
  );

  const onLaunchPrereqInstall = useCallback(async () => {
    const wingetReady = await ensureWingetBeforeCliInstall("prereq");
    if (!wingetReady) {
      return;
    }

    const prereq = await getInstallPrereqStatus();
    setInstallPrereq(prereq);
    const needsGit = !prereq.git;

    let gitSource: GitInstallSource | undefined;
    if (needsGit) {
      const selected = await requestGitInstallSource();
      if (!selected) {
        setLastResult({
          ok: false,
          code: "prereq_install_cancelled",
          message: "已取消前置环境安装",
          detail: null
        });
        return;
      }
      gitSource = selected;
    }

    await runAction(() => launchPrereqInstall(gitSource));
  }, [ensureWingetBeforeCliInstall, requestGitInstallSource, runAction]);

  const launchInstall = useCallback(
    async (key: CliKey, options?: InstallLaunchOptions) => {
      const mode = options?.mode ?? "official";
      const mirrorMode = mode === "mirror";
      if (mirrorMode && !isKimiMirrorInstallKey(key)) {
        setLastResult({
          ok: false,
          code: "mirror_install_unsupported",
          message: "该 CLI 不支持清华源一键安装",
          detail: `仅 kimi / kimi_web 支持镜像安装，当前 key=${key}。`
        });
        return;
      }

      const hint = installHints[key];
      if (!hint) {
        setLastResult({
          ok: false,
          code: "install_hint_missing",
          message: "未找到安装指引",
          detail: `未配置 ${key} 的仅执行安装信息。`
        });
        return;
      }

      const wingetReady = await ensureWingetBeforeCliInstall("install");
      if (!wingetReady) {
        return;
      }

      const prereq = await getInstallPrereqStatus();
      setInstallPrereq(prereq);

      const precheckLines = [
        `Git: ${prereq.git ? "✅" : "❌"}`,
        `Node.js: ${prereq.node ? "✅" : "❌"}`,
        `npm: ${prereq.npm ? "✅" : "❌"}`,
        `uv: ${prereq.uv ? "✅" : "❌"}`,
        `pwsh: ${prereq.pwsh ? "✅" : "❌"}`,
        `winget: ${prereq.winget ? "✅" : "❌"}`,
        `WSL: ${prereq.wsl ? "✅" : "❌"}`
      ];

      const uvSourceMode = configRef.current.uv_install_source_mode ?? "auto";
      const baseInstallCommand = buildInstallCommandForMode(key, hint.install_command, mode, uvSourceMode);
      let selectedNpmRegistrySource = options?.npmRegistrySource;
      if (!selectedNpmRegistrySource && shouldPromptNpmRegistry(baseInstallCommand)) {
        const npmRegistrySource = await requestNpmRegistrySource(
          `Select npm registry source for ${hint.display_name} install`,
          baseInstallCommand
        );
        if (!npmRegistrySource) {
          setLastResult({
            ok: false,
            code: "install_cancelled",
            message: "已取消安装",
            detail: null
          });
          return;
        }
        selectedNpmRegistrySource = npmRegistrySource;
      }
      const effectiveInstallCommand = applyNpmRegistrySource(baseInstallCommand, selectedNpmRegistrySource);
      const installSourceLabel = mirrorMode ? "清华源" : "官方源";
      const isKimiInstall = isKimiMirrorInstallKey(key);

      const ps1Ready = await ensurePs1PolicyReady(`Install ${hint.display_name}`);
      if (!ps1Ready) {
        return;
      }

      if (!options?.skipPrimaryConfirm) {
        const firstConfirm = await requestConfirm({
          title: `确认安装 ${hint.display_name}${mirrorMode ? "（清华源）" : ""}`,
            message: [
              `将启动 ${hint.display_name} 安装（${installSourceLabel}）。`,
              mirrorMode ? `\n镜像地址: ${UV_TUNA_SIMPLE_INDEX_URL}` : "",
              mirrorMode && isKimiInstall ? `Python 安装器镜像: ${KIMI_TUNA_PYTHON_INSTALLER_URL}` : "",
              mirrorMode && isKimiInstall ? `Python 安装器回退: ${KIMI_ALIYUN_PYTHON_INSTALLER_URL}` : "",
              mirrorMode && isKimiInstall ? `Python 目标版本: ${KIMI_TARGET_PYTHON_PATCH_VERSION}` : "",
              mirrorMode && isKimiInstall ? `uv 安装源策略: ${uvSourceMode}` : "",
              mirrorMode && isKimiInstall ? "将先检测 uv；如缺失将自动安装 uv，再执行 uv 安装 Kimi CLI。" : "",
              `\n命令:\n${effectiveInstallCommand}`,
              `\n来源域名: ${hint.official_domain}`,
            `发行方: ${hint.publisher}`,
            `\n前置检查:\n${precheckLines.join("\n")}`,
            "\n命令会在内置终端执行，继续吗？"
          ]
            .filter(Boolean)
            .join("\n"),
          confirmText: "继续安装",
          cancelText: "取消"
        });

        if (!firstConfirm) {
          setLastResult({
            ok: false,
            code: "install_cancelled",
            message: mirrorMode ? "已取消清华源安装" : "已取消仅执行安装",
            detail: null
          });
          return;
        }
      }

      if (hint.risk_remote_script && !options?.skipRiskConfirm) {
        const secondConfirm = await requestConfirm({
          title: "高风险安装命令确认",
          message: [
            "该安装命令包含远程脚本执行（例如 irm|iex / curl|bash）。",
            "请确认你信任来源后再继续。",
            "\n是否继续执行高风险安装命令？"
          ].join("\n"),
          confirmText: "继续执行",
          cancelText: "取消",
          danger: true
        });
        if (!secondConfirm) {
          setLastResult({
            ok: false,
            code: "install_cancelled",
            message: mirrorMode ? "已取消清华源安装" : "已取消仅执行安装",
            detail: "远程脚本二次确认未通过。"
          });
          return;
        }
      }

      clearTerminalAutoCloseTimer();
      setQuickSetup(EMPTY_QUICK_SETUP);
      setFocusedCliKey(key);
      if (options?.fromMirrorFallback) {
        setLastResult({
          ok: true,
          code: "install_retry_official_started",
          message: `${hint.display_name} 正在回退官方源重试安装`,
          detail: null
        });
      }
      setWorking(true);
      try {
        const readyResult = await terminalEnsureSession();
        if (!readyResult.ok) {
          setLastResult(readyResult);
          return;
        }
        setTerminalState("running");
        emitTerminalScriptPreview(
          `${hint.display_name} 安装命令${mirrorMode ? "（清华源）" : "（官方源）"}`,
          effectiveInstallCommand
        );
        const result = await runTerminalScriptAndWait(
          `${hint.display_name} 安装命令`,
          effectiveInstallCommand,
          getTimeoutMs("terminal_script_timeout_ms"),
          `${hint.display_name} 安装命令`
        );
        setLastResult(result);
        if (result.ok) {
          startInstallRecheck(key, true, mode);
        }
      } catch (error) {
        setLastResult({
          ok: false,
          code: "install_launch_failed",
          message: mirrorMode ? "启动清华源安装失败" : "启动仅执行安装失败",
          detail: String(error)
        });
      } finally {
        setWorking(false);
      }
    },
    [
      clearTerminalAutoCloseTimer,
      ensureWingetBeforeCliInstall,
      ensurePs1PolicyReady,
      emitTerminalScriptPreview,
      getTimeoutMs,
      installHints,
      requestConfirm,
      requestNpmRegistrySource,
      runTerminalScriptAndWait,
      startInstallRecheck
    ]
  );

  installLauncherRef.current = launchInstall;

  const onLaunchInstall = useCallback(
    async (key: CliKey) => {
      await launchInstall(key, { mode: "official" });
    },
    [launchInstall]
  );

  const onLaunchAuth = useCallback(
    async (key: CliKey) => {
      const hint = installHints[key];
      const displayName = hint?.display_name ?? CLI_DEFAULT_TITLES[key];
      const result = await runAction(() => launchCliAuth(key));
      if (!result.ok) {
        return;
      }
      setLastResult({
        ok: true,
        code: result.code,
        message:
          result.code === "auth_not_required"
            ? `${displayName} 无需额外登录步骤`
            : `已启动 ${displayName} 登录流程`,
        detail: result.detail ?? hint?.auth_command ?? null
      });
    },
    [installHints, runAction]
  );

  const onLaunchUpgrade = useCallback(
    async (key: CliKey) => {
      const hint = installHints[key];
      const displayName = hint?.display_name ?? CLI_DEFAULT_TITLES[key];
      const baseUpgradeCommand = hint?.upgrade_command?.trim();

      if (!baseUpgradeCommand) {
        setLastResult({
          ok: false,
          code: "upgrade_command_missing",
          message: "未找到升级指引",
          detail: `${displayName} 暂未配置升级命令。`
        });
        return;
      }

      let selectedNpmRegistrySource: NpmRegistrySource | undefined;
      if (shouldPromptNpmRegistry(baseUpgradeCommand)) {
        const npmRegistrySource = await requestNpmRegistrySource(
          `Select npm registry source for ${displayName} upgrade`,
          baseUpgradeCommand
        );
        if (!npmRegistrySource) {
          setLastResult({
            ok: false,
            code: "upgrade_cancelled",
            message: "已取消升级",
            detail: null
          });
          return;
        }
        selectedNpmRegistrySource = npmRegistrySource;
      }
      const upgradeCommand = applyNpmRegistrySource(baseUpgradeCommand, selectedNpmRegistrySource);

      const ps1Ready = await ensurePs1PolicyReady(`Upgrade ${displayName}`);
      if (!ps1Ready) {
        return;
      }

      const accepted = await requestConfirm({
        title: `确认升级 ${displayName}`,
        message: [`将执行以下升级命令：`, `\n${upgradeCommand}`, "\n命令会在内置终端执行，继续吗？"].join("\n"),
        confirmText: "继续升级",
        cancelText: "取消"
      });
      if (!accepted) {
        setLastResult({
          ok: false,
          code: "upgrade_cancelled",
          message: "已取消升级",
          detail: null
        });
        return;
      }

      clearTerminalAutoCloseTimer();
      setQuickSetup(EMPTY_QUICK_SETUP);
      setFocusedCliKey(key);
      setWorking(true);
      try {
        const readyResult = await terminalEnsureSession();
        if (!readyResult.ok) {
          setLastResult(readyResult);
          return;
        }
        setTerminalState("running");
        emitTerminalScriptPreview(`${displayName} 升级命令`, upgradeCommand);
        const upgradeResult = await runTerminalScriptAndWait(
          `${displayName} 升级命令`,
          upgradeCommand,
          getTimeoutMs("terminal_script_timeout_ms"),
          `${displayName} 升级命令`
        );
        if (!upgradeResult.ok) {
          setLastResult(upgradeResult);
          return;
        }

        const verify = await runCliVerify(key);
        if (!verify.ok) {
          setLastResult({
            ...verify,
            message: `${displayName} 升级后复检未通过`
          });
          return;
        }

        const latestStatuses = await detectClis();
        setStatuses(latestStatuses);
        await refreshCliUserPathStatuses();
        setLastResult({
          ok: true,
          code: "upgrade_done",
          message: `${displayName} 升级完成`,
          detail: upgradeCommand
        });
        scheduleTerminalAutoClose(3000);
      } catch (error) {
        setLastResult({
          ok: false,
          code: "upgrade_failed",
          message: "升级失败",
          detail: String(error)
        });
      } finally {
        setWorking(false);
      }
    },
    [
      clearTerminalAutoCloseTimer,
      ensurePs1PolicyReady,
      emitTerminalScriptPreview,
      getTimeoutMs,
      installHints,
      refreshCliUserPathStatuses,
      requestConfirm,
      requestNpmRegistrySource,
      runTerminalScriptAndWait,
      scheduleTerminalAutoClose
    ]
  );

  const onLaunchUninstall = useCallback(
    async (key: CliKey) => {
      const hint = installHints[key];
      const displayName = hint?.display_name ?? CLI_DEFAULT_TITLES[key];
      const uninstallCommand = hint?.uninstall_command?.trim();

      if (!uninstallCommand) {
        setLastResult({
          ok: false,
          code: "uninstall_hint_missing",
          message: "未找到卸载指引",
          detail: `未配置 ${key} 的卸载命令。`
        });
        return;
      }

      const accepted = await requestConfirm({
        title: `确认卸载 ${displayName}`,
        message: [
          `将启动 ${displayName} 卸载。`,
          `\n命令:\n${uninstallCommand}`,
          "\n命令会在内置终端执行，继续吗？"
        ].join("\n"),
        confirmText: "继续卸载",
        cancelText: "取消",
        danger: true
      });

      if (!accepted) {
        setLastResult({
          ok: false,
          code: "uninstall_cancelled",
          message: "已取消卸载",
          detail: null
        });
        return;
      }

      clearTerminalAutoCloseTimer();
      setQuickSetup(EMPTY_QUICK_SETUP);
      setFocusedCliKey(key);
      setWorking(true);
      try {
        const readyResult = await terminalEnsureSession();
        if (!readyResult.ok) {
          setLastResult(readyResult);
          return;
        }
        setTerminalState("running");
        emitTerminalScriptPreview(`${displayName} 卸载命令`, uninstallCommand);
        const result = await runTerminalScriptAndWait(
          `${displayName} 卸载命令`,
          uninstallCommand,
          getTimeoutMs("terminal_script_timeout_ms"),
          `${displayName} 卸载命令`
        );
        setLastResult(result);
        if (result.ok) {
          startInstallRecheck(key, false);
        }
      } catch (error) {
        setLastResult({
          ok: false,
          code: "uninstall_launch_failed",
          message: "启动卸载失败",
          detail: String(error)
        });
      } finally {
        setWorking(false);
      }
    },
    [
      clearTerminalAutoCloseTimer,
      emitTerminalScriptPreview,
      getTimeoutMs,
      installHints,
      requestConfirm,
      runTerminalScriptAndWait,
      startInstallRecheck
    ]
  );

  const setQuickPhase = useCallback(
    (phase: QuickSetupPhase, message: string, detail: string | null = null, running = true) => {
      setQuickSetup((prev) => ({
        ...prev,
        phase,
        running,
        message,
        detail
      }));
    },
    []
  );

  const onQuickSetup = useCallback(
    async (key: CliKey) => {
      const hint = installHints[key];
      if (!hint) {
        setLastResult({
          ok: false,
          code: "install_hint_missing",
          message: "未找到安装指引",
          detail: `未配置 ${key} 的快速安装向导信息。`
        });
        return;
      }

      clearTerminalAutoCloseTimer();
      setFocusedCliKey(key);
      setQuickSetupLogTail(null);
      setQuickSetup({
        key,
        phase: "precheck",
        running: true,
        message: "正在准备快速安装向导...",
        detail: null
      });

      setQuickPhase("precheck", "检查 winget 前置环境...");
      const wingetReady = await ensureWingetBeforeCliInstall("quick_setup");
      if (!wingetReady) {
        setQuickSetup({
          key,
          phase: "failed",
          running: false,
          message: "缺少 winget 前置环境",
          detail: "请先完成 winget 安装后重试快速安装向导。"
        });
        return;
      }

      const readyResult = await terminalEnsureSession();
      if (!readyResult.ok) {
        setQuickSetup({
          key,
          phase: "failed",
          running: false,
          message: "内置终端初始化失败",
          detail: readyResult.detail ?? null
        });
        setLastResult(readyResult);
        return;
      }

      setTerminalState("running");

      try {
        const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
        const scriptTimeoutMs = getTimeoutMs("terminal_script_timeout_ms");
        const quickDetectTimeoutMs = getTimeoutMs("quick_setup_detect_timeout_ms");
        const mirrorProbeTimeoutMs = getTimeoutMs("mirror_probe_timeout_ms");
        const pythonRuntimeCheckTimeoutMs = getTimeoutMs("python_runtime_check_timeout_ms");

        setQuickPhase("precheck", "检查安装前置环境...");
        const prereq = await getInstallPrereqStatus();
        setInstallPrereq(prereq);

        if (hint.requires_node && (!prereq.node || !prereq.npm)) {
          const openNode = await requestConfirm({
            title: "缺少 Node.js / npm 前置环境",
            message: `${hint.display_name} 依赖 Node.js/npm。是否先打开 Node.js 下载页面？`,
            confirmText: "打开下载页",
            cancelText: "稍后处理"
          });
          if (openNode) {
            await runAction(openNodejsDownloadPage);
          }
          setQuickSetup({
            key,
            phase: "failed",
            running: false,
            message: "缺少 Node.js/npm 前置环境",
            detail: "请先安装 Node.js（含 npm）后重试快速安装向导。"
          });
          setLastResult({
            ok: false,
            code: "quick_setup_prereq_missing",
            message: "快速安装向导前置检查失败",
            detail: `${hint.display_name} 需要 Node.js/npm。`
          });
          return;
        }

        const ps1Ready = await ensurePs1PolicyReady(`Quick setup ${hint.display_name}`);
        if (!ps1Ready) {
          setQuickSetup({
            key,
            phase: "failed",
            running: false,
            message: "PowerShell 脚本策略未就绪",
            detail: "请先允许执行 ps1 脚本后再重试。"
          });
          return;
        }

        if (hint.risk_remote_script && !isKimiMirrorInstallKey(key)) {
          const acceptedRisk = await requestConfirm({
            title: "高风险安装命令确认",
            message: [
              `将通过内置终端执行 ${hint.display_name} 安装命令：`,
              `\n${hint.install_command}`,
              "\n该命令包含远程脚本执行，是否继续？"
            ].join("\n"),
            confirmText: "继续执行",
            cancelText: "取消",
            danger: true
          });
          if (!acceptedRisk) {
            setQuickSetup({
              key,
              phase: "failed",
              running: false,
              message: "已取消快速安装向导",
              detail: "远程脚本二次确认未通过。"
            });
            setLastResult({
              ok: false,
              code: "quick_setup_cancelled",
              message: "已取消快速安装向导",
              detail: null
            });
            return;
          }
        }

        if (isKimiMirrorInstallKey(key)) {
          let uvReady = prereq.uv;
          if (!uvReady) {
            setQuickPhase("choose_source", "请选择 uv 安装源策略...");
            const selectedUvSourceMode = await requestUvInstallSourceMode();
            if (!selectedUvSourceMode) {
              setQuickSetup({
                key,
                phase: "failed",
                running: false,
                message: "已取消快速安装向导",
                detail: "已取消 uv 安装源选择。"
              });
              setLastResult({
                ok: false,
                code: "quick_setup_cancelled",
                message: "已取消快速安装向导",
                detail: "已取消 uv 安装源选择。"
              });
              return;
            }

            const uvBootstrapCommands = buildKimiUvBootstrapCommands(selectedUvSourceMode);
            const uvBootstrapCommand = uvBootstrapCommands.join("\n");
            const acceptedUvInstall = await requestConfirm({
              title: "确认执行 uv 安装命令",
              message: [
                "未检测到 uv，快速安装向导将执行以下命令安装并复检：",
                `\n当前 uv 安装源策略：${selectedUvSourceMode}`,
                `\n${uvBootstrapCommand}`,
                "\n以上命令将写入内置终端执行，是否继续？"
              ].join("\n"),
              confirmText: "继续执行",
              cancelText: "取消",
              danger: true
            });
            if (!acceptedUvInstall) {
              setQuickSetup({
                key,
                phase: "failed",
                running: false,
                message: "已取消快速安装向导",
                detail: "已取消 uv 安装步骤。"
              });
              setLastResult({
                ok: false,
                code: "quick_setup_cancelled",
                message: "已取消快速安装向导",
                detail: "已取消 uv 安装步骤。"
              });
              return;
            }
            setQuickPhase("precheck_uv", "未检测到 uv，准备安装 uv...");
            setQuickPhase("install_uv", "正在安装 uv...", uvBootstrapCommand);
            const uvScriptResult = await runTerminalCommandsSequentially(
              "Kimi 前置：安装 uv",
              uvBootstrapCommands
            );
            if (!uvScriptResult.ok) {
              setQuickSetup({
                key,
                phase: "failed",
                running: false,
                message: "内置终端执行 uv 安装命令失败",
                detail: uvScriptResult.detail ?? null
              });
              setLastResult({
                ...uvScriptResult,
                code: "quick_setup_uv_install_failed",
                message: "快速安装向导 uv 安装失败"
              });
              return;
            }

            setQuickPhase("install_uv", "uv 安装完成，正在重启内置终端会话...");
            const closed = await terminalCloseSession();
            if (!closed.ok) {
              setQuickSetup({
                key,
                phase: "failed",
                running: false,
                message: "uv 安装后终端重启失败",
                detail: closed.detail ?? null
              });
              setLastResult({
                ...closed,
                code: "uv_terminal_restart_failed",
                message: "uv 安装后终端重启失败"
              });
              return;
            }
            const reEnsured = await terminalEnsureSession();
            if (!reEnsured.ok) {
              setQuickSetup({
                key,
                phase: "failed",
                running: false,
                message: "uv 安装后终端重启失败",
                detail: reEnsured.detail ?? null
              });
              setLastResult({
                ...reEnsured,
                code: "uv_terminal_restart_failed",
                message: "uv 安装后终端重启失败"
              });
              return;
            }
            setTerminalState("running");
          } else {
            setQuickPhase("precheck_uv", "已检测到 uv，跳过安装步骤。");
          }

          setQuickPhase("verify_uv", "正在检测 uv 是否可用...");
          startTerminalCountdown("uv 安装复检", quickDetectTimeoutMs);
          try {
            const uvStartedAt = Date.now();
            while (Date.now() - uvStartedAt < quickDetectTimeoutMs) {
              const nextPrereq = await getInstallPrereqStatus();
              setInstallPrereq(nextPrereq);
              if (nextPrereq.uv) {
                uvReady = true;
                break;
              }
              await wait(INSTALL_RECHECK_INTERVAL_MS);
            }
          } finally {
            stopTerminalCountdown();
          }

          if (!uvReady) {
            setQuickSetup({
              key,
              phase: "failed",
              running: false,
              message: "uv 安装后复检超时",
              detail: "请检查终端输出，确认 uv 已安装后重试。"
            });
            setLastResult({
              ok: false,
              code: "quick_setup_uv_verify_failed",
              message: "快速安装向导 uv 复检未通过",
              detail: "未检测到 uv 命令。"
            });
            return;
          }

          setQuickPhase("choose_source", "请选择 Kimi 安装源...");
          const useOfficialSource = await requestConfirm({
            title: "选择 Kimi 安装源",
            message: [
              "请选择 Kimi CLI 安装源。",
              "确认：官方源",
              `取消：清华镜像（PyPI：${UV_TUNA_SIMPLE_INDEX_URL}）`,
              `清华源模式会先尝试 Python 安装器镜像：${KIMI_TUNA_PYTHON_INSTALLER_URL}`,
              `失败后自动尝试阿里镜像：${KIMI_ALIYUN_PYTHON_INSTALLER_URL}`,
              `安装 kimi-cli 时会先尝试索引：${UV_TUNA_SIMPLE_INDEX_URL}`,
              `失败后自动尝试索引：${UV_ALIYUN_SIMPLE_INDEX_URL}`,
              "如果镜像安装失败，将立即报错并退出，不再等待复检。"
            ].join("\n"),
            confirmText: "使用官方源",
            cancelText: "使用清华源"
          });

          const installMode: InstallLaunchMode = useOfficialSource ? "official" : "mirror";
          const sourceLabel = installMode === "official" ? "官方源" : "清华源";
          const pythonMirrorCandidates = [KIMI_TUNA_PYTHON_INSTALLER_URL, KIMI_ALIYUN_PYTHON_INSTALLER_URL];
          const kimiIndexCandidates = [UV_TUNA_SIMPLE_INDEX_URL, UV_ALIYUN_SIMPLE_INDEX_URL];
          const pythonInstallCommand = buildKimiPythonInstallCommand(false);
          const kimiInstallCommand = buildKimiCliInstallCommand(false);
          const pythonRuntimeCheckCommand = buildKimiPythonRuntimeCheckCommand();
          const pythonInstallPlanPreview =
            installMode === "mirror" ? buildKimiMirrorPythonInstallPlanPreview() : pythonInstallCommand;
          const kimiInstallPlanPreview =
            installMode === "mirror" ? buildKimiMirrorCliInstallPlanPreview() : kimiInstallCommand;

          setQuickPhase("precheck_python", `正在检测 Python ${KIMI_TARGET_PYTHON_VERSION} 是否可用...`);
          const initialPythonVerify =
            installMode === "mirror"
              ? await runTerminalScriptAndWait(
                  `Python ${KIMI_TARGET_PYTHON_VERSION} 运行时预检`,
                  pythonRuntimeCheckCommand,
                  pythonRuntimeCheckTimeoutMs
                )
              : await verifyKimiPythonInstallation();
          if (!initialPythonVerify.ok) {
            const acceptedPythonInstall = await requestConfirm({
              title: `确认执行 Python ${KIMI_TARGET_PYTHON_VERSION} 安装命令（${sourceLabel}）`,
              message: [
                `快速安装向导将执行以下命令安装 Python ${KIMI_TARGET_PYTHON_VERSION}（${sourceLabel}）：`,
                `\n${pythonInstallPlanPreview}`,
                "\n以上命令将写入内置终端执行，是否继续？"
              ].join("\n"),
              confirmText: "继续执行",
              cancelText: "取消"
            });
            if (!acceptedPythonInstall) {
              setQuickSetup({
                key,
                phase: "failed",
                running: false,
                message: "已取消快速安装向导",
                detail: `已取消 Python ${KIMI_TARGET_PYTHON_VERSION} 安装步骤。`
              });
              setLastResult({
                ok: false,
                code: "quick_setup_cancelled",
                message: "已取消快速安装向导",
                detail: `已取消 Python ${KIMI_TARGET_PYTHON_VERSION} 安装步骤。`
              });
              return;
            }

            setQuickPhase(
              "install_python",
              `正在执行 Python ${KIMI_TARGET_PYTHON_VERSION} 安装命令（${sourceLabel}）...`,
              pythonInstallPlanPreview
            );
            emitTerminalScriptPreview(`Python ${KIMI_TARGET_PYTHON_VERSION} 安装计划（${sourceLabel}）`, pythonInstallPlanPreview);

            let pythonInstallResult: ActionResult = {
              ok: false,
              code: "quick_setup_python_install_failed",
              message: "快速安装向导 Python 安装失败",
              detail: "Python 安装步骤未执行。"
            };
            let successfulPythonMirror: string | null = null;

            if (installMode === "mirror") {
              const failureDetails: string[] = [];
              for (const mirrorUrl of pythonMirrorCandidates) {
                const probeCommand = buildUrlProbeCommand(mirrorUrl);
                setQuickPhase("install_python", `正在探测 Python 镜像可用性：${mirrorUrl}`, probeCommand);
                emitTerminalScriptPreview(`Python 镜像探测（${mirrorUrl}）`, probeCommand);
                const probeResult = await runTerminalScriptAndWait(
                  `Python 镜像探测（${mirrorUrl}）`,
                  probeCommand,
                  mirrorProbeTimeoutMs
                );
                if (!probeResult.ok) {
                  failureDetails.push(`[probe] ${mirrorUrl} => ${probeResult.detail ?? probeResult.message}`);
                  continue;
                }

                const steps = buildKimiMirrorPythonInstallSteps(mirrorUrl);
                setQuickPhase(
                  "install_python",
                  `正在执行 Python ${KIMI_TARGET_PYTHON_VERSION} 安装（镜像：${mirrorUrl}）...`,
                  steps.join("\n")
                );
                pythonInstallResult = await runTerminalCommandsSequentially(
                  `Python ${KIMI_TARGET_PYTHON_VERSION} 安装（${mirrorUrl}）`,
                  steps
                );
                if (pythonInstallResult.ok) {
                  successfulPythonMirror = mirrorUrl;
                  break;
                }
                failureDetails.push(`[install] ${mirrorUrl} => ${pythonInstallResult.detail ?? pythonInstallResult.message}`);
              }

              if (!pythonInstallResult.ok) {
                pythonInstallResult = {
                  ...pythonInstallResult,
                  code: "quick_setup_python_install_failed",
                  message: "快速安装向导 Python 安装失败",
                  detail: failureDetails.join("\n") || pythonInstallResult.detail || "所有镜像均不可用或安装失败。"
                };
              }
            } else {
              pythonInstallResult = await runTerminalScriptAndWait(
                `Python ${KIMI_TARGET_PYTHON_VERSION} 安装（${sourceLabel}）`,
                pythonInstallCommand
              );
            }
            if (!pythonInstallResult.ok) {
              setQuickSetup({
                key,
                phase: "failed",
                running: false,
                message: `内置终端执行 Python ${KIMI_TARGET_PYTHON_VERSION} 安装命令失败`,
                detail: pythonInstallResult.detail ?? null
              });
              setLastResult({
                ...pythonInstallResult,
                code: "quick_setup_python_install_failed",
                message: "快速安装向导 Python 安装失败"
              });
              return;
            }

            setLastResult({
              ok: true,
              code: "quick_setup_python_install_started",
              message:
                installMode === "mirror" && successfulPythonMirror
                  ? `Python ${KIMI_TARGET_PYTHON_VERSION} 已通过镜像安装：${successfulPythonMirror}`
                  : `已在内置终端执行 Python ${KIMI_TARGET_PYTHON_VERSION} 安装命令（${sourceLabel}）`,
              detail:
                installMode === "mirror" && successfulPythonMirror
                  ? successfulPythonMirror
                  : pythonInstallCommand
            });

            if (installMode === "mirror") {
              setQuickPhase(
                "verify_python",
                `正在快速检测 Python ${KIMI_TARGET_PYTHON_VERSION} 运行时...`,
                pythonRuntimeCheckCommand
              );
              const runtimeVerifyResult = await runTerminalScriptAndWait(
                `Python ${KIMI_TARGET_PYTHON_VERSION} 运行时检测`,
                pythonRuntimeCheckCommand,
                pythonRuntimeCheckTimeoutMs
              );
              if (!runtimeVerifyResult.ok) {
                setQuickSetup({
                  key,
                  phase: "failed",
                  running: false,
                  message: `Python ${KIMI_TARGET_PYTHON_VERSION} 安装后快速复检失败`,
                  detail: runtimeVerifyResult.detail ?? "请检查终端输出，确认 Python 已安装后重试。"
                });
                setLastResult({
                  ok: false,
                  code: "quick_setup_python_verify_failed",
                  message: "快速安装向导 Python 复检未通过",
                  detail: runtimeVerifyResult.detail
                });
                return;
              }
            } else {
              setQuickPhase("verify_python", `等待 Python ${KIMI_TARGET_PYTHON_VERSION} 安装检测结果...`);
              const pythonStartedAt = Date.now();
              let pythonDetected = false;
              let lastPythonVerifyDetail: string | null = initialPythonVerify.detail ?? null;
              startTerminalCountdown(`Python ${KIMI_TARGET_PYTHON_VERSION} 安装复检`, quickDetectTimeoutMs);
              try {
                while (Date.now() - pythonStartedAt < quickDetectTimeoutMs) {
                  const verify = await verifyKimiPythonInstallation();
                  lastPythonVerifyDetail = verify.detail ?? null;
                  if (verify.ok) {
                    pythonDetected = true;
                    break;
                  }
                  await wait(INSTALL_RECHECK_INTERVAL_MS);
                }
              } finally {
                stopTerminalCountdown();
              }

              if (!pythonDetected) {
                setQuickSetup({
                  key,
                  phase: "failed",
                  running: false,
                  message: `Python ${KIMI_TARGET_PYTHON_VERSION} 安装后复检超时`,
                  detail: lastPythonVerifyDetail ?? "请检查终端输出，确认 Python 已安装后重试。"
                });
                setLastResult({
                  ok: false,
                  code: "quick_setup_python_verify_failed",
                  message: "快速安装向导 Python 复检未通过",
                  detail: lastPythonVerifyDetail
                });
                return;
              }
            }
          } else {
            setQuickPhase("precheck_python", `已检测到 Python ${KIMI_TARGET_PYTHON_VERSION}，跳过安装步骤。`);
          }

          const acceptedKimiInstall = await requestConfirm({
            title: `确认执行 Kimi 安装命令（${sourceLabel}）`,
            message: [
              `快速安装向导将执行以下命令安装 Kimi CLI（${sourceLabel}）：`,
              `\n${kimiInstallPlanPreview}`,
              "\n以上命令将写入内置终端执行，是否继续？"
            ].join("\n"),
            confirmText: "继续执行",
            cancelText: "取消"
          });
          if (!acceptedKimiInstall) {
            setQuickSetup({
              key,
              phase: "failed",
              running: false,
              message: "已取消快速安装向导",
              detail: "已取消 Kimi 安装步骤。"
            });
            setLastResult({
              ok: false,
              code: "quick_setup_cancelled",
              message: "已取消快速安装向导",
              detail: "已取消 Kimi 安装步骤。"
            });
            return;
          }

          setQuickPhase("install_kimi", `正在执行 Kimi 安装命令（${sourceLabel}）...`, kimiInstallPlanPreview);
          emitTerminalScriptPreview(`Kimi 安装计划（${sourceLabel}）`, kimiInstallPlanPreview);

          let kimiInstallResult: ActionResult = {
            ok: false,
            code: "quick_setup_kimi_install_failed",
            message: "快速安装向导 Kimi 安装失败",
            detail: "Kimi 安装步骤未执行。"
          };
          let successfulKimiIndex: string | null = null;

          if (installMode === "mirror") {
            const failureDetails: string[] = [];
            for (const indexUrl of kimiIndexCandidates) {
              const probeCommand = buildUrlProbeCommand(indexUrl);
              setQuickPhase("install_kimi", `正在探测包索引可用性：${indexUrl}`, probeCommand);
              emitTerminalScriptPreview(`Kimi 索引探测（${indexUrl}）`, probeCommand);
              const probeResult = await runTerminalScriptAndWait(
                `Kimi 索引探测（${indexUrl}）`,
                probeCommand,
                mirrorProbeTimeoutMs
              );
              if (!probeResult.ok) {
                failureDetails.push(`[probe] ${indexUrl} => ${probeResult.detail ?? probeResult.message}`);
                continue;
              }

              const steps = buildKimiMirrorCliInstallSteps(indexUrl);
              setQuickPhase("install_kimi", `正在执行 Kimi 安装（索引：${indexUrl}）...`, steps.join("\n"));
              kimiInstallResult = await runTerminalCommandsSequentially(`Kimi 安装（${indexUrl}）`, steps);
              if (kimiInstallResult.ok) {
                successfulKimiIndex = indexUrl;
                break;
              }
              failureDetails.push(`[install] ${indexUrl} => ${kimiInstallResult.detail ?? kimiInstallResult.message}`);
            }

            if (!kimiInstallResult.ok) {
              kimiInstallResult = {
                ...kimiInstallResult,
                code: "quick_setup_kimi_install_failed",
                message: "快速安装向导 Kimi 安装失败",
                detail: failureDetails.join("\n") || kimiInstallResult.detail || "所有索引均不可用或安装失败。"
              };
            }
          } else {
            kimiInstallResult = await runTerminalScriptAndWait(`Kimi 安装（${sourceLabel}）`, kimiInstallCommand);
          }
          if (!kimiInstallResult.ok) {
            setQuickSetup({
              key,
              phase: "failed",
              running: false,
              message: "内置终端执行 Kimi 安装命令失败",
              detail: kimiInstallResult.detail ?? null
            });
            setLastResult({
              ...kimiInstallResult,
              code: "quick_setup_kimi_install_failed",
              message: "快速安装向导 Kimi 安装失败"
            });
            return;
          }

          setLastResult({
            ok: true,
            code: "quick_setup_kimi_install_started",
            message:
              installMode === "mirror" && successfulKimiIndex
                ? `Kimi 已通过索引安装：${successfulKimiIndex}`
                : `已在内置终端执行 Kimi 安装命令（${sourceLabel}）`,
            detail:
              installMode === "mirror" && successfulKimiIndex
                ? successfulKimiIndex
                : kimiInstallCommand
          });

          setQuickPhase("verify_kimi", "等待 Kimi 安装检测结果...");
          const kimiStartedAt = Date.now();
          let kimiDetected = false;
          let lastVerifyDetail: string | null = null;
          startTerminalCountdown("Kimi 安装复检", quickDetectTimeoutMs);
          try {
            while (Date.now() - kimiStartedAt < quickDetectTimeoutMs) {
              const verify = await verifyKimiInstallation();
              lastVerifyDetail = verify.detail ?? null;
              if (verify.ok) {
                kimiDetected = true;
                break;
              }
              await wait(INSTALL_RECHECK_INTERVAL_MS);
            }
          } finally {
            stopTerminalCountdown();
          }

          if (!kimiDetected) {
            setQuickSetup({
              key,
              phase: "failed",
              running: false,
              message: "Kimi 安装后复检超时",
              detail: lastVerifyDetail ?? "请检查终端输出，完成后可点击重试。"
            });
            setLastResult({
              ok: false,
              code: "quick_setup_kimi_verify_timeout",
              message: "快速安装向导 Kimi 复检超时",
              detail: lastVerifyDetail
            });
            return;
          }

          const latestStatuses = await detectClis();
          setStatuses(latestStatuses);
          await refreshCliUserPathStatuses();

          setQuickPhase("apply_menu", "正在自动应用右键菜单配置...");
          const payload = buildConfigWithCliDetected(configRef.current, key, true);
          setConfig(payload);

          const syncResult = await syncContextMenuConfig(payload, "install");
          if (!syncResult.ok) {
            setQuickSetup({
              key,
              phase: "failed",
              running: false,
              message: "右键菜单自动应用失败",
              detail: syncResult.detail ?? null
            });
            setLastResult(syncResult);
            return;
          }

          if (syncResult.code === "menu_sync_fallback_applied") {
            setQuickPhase("fallback", "主路径失败，已自动切换 HKCU 兜底修复...");
          }

          await refreshInitialState();
          await refreshCliUserPathStatuses();

          if (hint.requires_oauth && hint.auth_command) {
            setQuickPhase("auth", "正在触发 Kimi 授权登录...");
            const authResult = await launchCliAuth(key);

            if (authResult.ok) {
              setLastResult({
                ok: true,
                code: "quick_setup_auth_triggered",
                message: "已触发 Kimi 登录，请在浏览器完成授权",
                detail: hint.auth_command
              });
            } else {
              setLastResult({
                ...authResult,
                code: "quick_setup_auth_trigger_failed",
                message: "Kimi 登录命令触发失败"
              });
            }

            setQuickSetup(EMPTY_QUICK_SETUP);
            await closeEmbeddedTerminalSilently();
            return;
          }

          setQuickSetup(EMPTY_QUICK_SETUP);
          await closeEmbeddedTerminalSilently();
          setLastResult({
            ok: true,
            code: "quick_setup_done",
            message: `${hint.display_name} 快速安装向导完成`,
            detail: syncResult.detail ?? null
          });
          return;
        }

        const quickInstallBaseCommand = buildInstallCommandForMode(
          key,
          hint.install_command,
          "official",
          configRef.current.uv_install_source_mode ?? "auto"
        );
        let quickInstallCommand = quickInstallBaseCommand;
        if (shouldPromptNpmRegistry(quickInstallBaseCommand)) {
          const selectedNpmRegistrySource = await requestNpmRegistrySource(
            `Select npm registry source for ${hint.display_name} install`,
            quickInstallBaseCommand
          );
          if (!selectedNpmRegistrySource) {
            setQuickSetup({
              key,
              phase: "failed",
              running: false,
              message: "已取消快速安装向导",
              detail: "npm 源选择已取消。"
            });
            setLastResult({
              ok: false,
              code: "quick_setup_cancelled",
              message: "已取消快速安装向导",
              detail: null
            });
            return;
          }
          quickInstallCommand = applyNpmRegistrySource(quickInstallBaseCommand, selectedNpmRegistrySource);
        }
        setQuickPhase("install", "正在执行安装命令...");
        emitTerminalScriptPreview(`${hint.display_name} 安装命令`, quickInstallCommand);
        const installScriptResult = await runTerminalScriptAndWait(
          `${hint.display_name} 安装命令`,
          quickInstallCommand,
          scriptTimeoutMs,
          `${hint.display_name} 安装命令`
        );
        if (!installScriptResult.ok) {
          setQuickSetup({
            key,
            phase: "failed",
            running: false,
            message: "内置终端执行安装命令失败",
            detail: installScriptResult.detail ?? null
          });
          setLastResult(installScriptResult);
          return;
        }
        setLastResult({
          ok: true,
          code: "quick_setup_install_started",
          message: `已在内置终端执行 ${hint.display_name} 安装命令`,
          detail: quickInstallCommand
        });

        setQuickPhase("detect", "等待安装检测结果...");
        const startedAt = Date.now();
        let detected = false;
        startTerminalCountdown(`${hint.display_name} 安装复检`, quickDetectTimeoutMs);
        try {
          while (Date.now() - startedAt < quickDetectTimeoutMs) {
            const verify = await runCliVerify(key);
            if (verify.ok) {
              detected = true;
              break;
            }
            await new Promise((resolve) => window.setTimeout(resolve, INSTALL_RECHECK_INTERVAL_MS));
          }
        } finally {
          stopTerminalCountdown();
        }

        if (!detected) {
          setQuickSetup({
            key,
            phase: "failed",
            running: false,
            message: "安装后复检超时",
            detail: "请检查终端输出，完成后可点击重试。"
          });
          setLastResult({
            ok: false,
            code: "quick_setup_detect_timeout",
            message: "快速安装向导复检超时",
            detail: null
          });
          return;
        }

        if (hint.requires_oauth && hint.auth_command) {
          setQuickPhase("auth", "正在启动授权步骤...");
          const authResult = await launchCliAuth(key);
          if (!authResult.ok) {
            setQuickSetup({
              key,
              phase: "failed",
              running: false,
              message: "启动授权失败",
              detail: authResult.detail ?? null
            });
            setLastResult(authResult);
            return;
          }
          const authDone = await requestConfirm({
            title: "授权步骤确认",
            message: "完成浏览器授权后点击“已完成”继续。",
            confirmText: "已完成",
            cancelText: "尚未完成"
          });
          if (!authDone) {
            setQuickSetup({
              key,
              phase: "failed",
              running: false,
              message: "授权尚未完成",
              detail: "请完成授权后重试快速安装向导。"
            });
            return;
          }
        }

        setQuickPhase("apply_menu", "正在自动应用右键菜单配置...");
        const payload = buildConfigWithCliDetected(configRef.current, key, true);
        setConfig(payload);

        const syncResult = await syncContextMenuConfig(payload, "install");
        if (!syncResult.ok) {
          setQuickSetup({
            key,
            phase: "failed",
            running: false,
            message: "右键菜单自动应用失败",
            detail: syncResult.detail ?? null
          });
          setLastResult(syncResult);
          return;
        }

        if (syncResult.code === "menu_sync_fallback_applied") {
          setQuickPhase("fallback", "主路径失败，已自动切换 HKCU 兜底修复...");
        }

        await refreshInitialState();
        await refreshCliUserPathStatuses();
        setQuickSetup({
          key,
          phase: "done",
          running: false,
          message: `${hint.display_name} 快速安装向导完成。`,
          detail: "Windows 11 顶层新菜单当前不支持；如未直接显示，请在“显示更多选项”或按 Shift+F10 查看经典菜单。"
        });
        setLastResult({
          ok: true,
          code: "quick_setup_done",
          message: `${hint.display_name} 快速安装向导完成`,
          detail: syncResult.detail ?? null
        });
        setQuickSetup(EMPTY_QUICK_SETUP);
        scheduleTerminalAutoClose(3000);
      } catch (error) {
        setQuickSetup({
          key,
          phase: "failed",
          running: false,
          message: "快速安装向导执行异常",
          detail: String(error)
        });
        setLastResult({
          ok: false,
          code: "quick_setup_exception",
          message: "快速安装向导失败",
          detail: String(error)
        });
      }
    },
    [
      syncContextMenuConfig,
      buildConfigWithCliDetected,
      clearTerminalAutoCloseTimer,
      closeEmbeddedTerminalSilently,
      detectClis,
      ensureWingetBeforeCliInstall,
      ensurePs1PolicyReady,
      emitTerminalScriptPreview,
      getTimeoutMs,
      installHints,
      requestConfirm,
      requestNpmRegistrySource,
      requestUvInstallSourceMode,
      refreshCliUserPathStatuses,
      refreshInitialState,
      runAction,
      runTerminalCommandsSequentially,
      runTerminalScriptAndWait,
      scheduleTerminalAutoClose,
      setQuickPhase,
      startTerminalCountdown,
      stopTerminalCountdown,
      verifyKimiInstallation
    ]
  );

  const ensureReady = useCallback(
    (_action: string) => true,
    []
  );

  const onApply = useCallback(async () => {
    if (!ensureReady("应用配置")) {
      return;
    }
    const payload = normalizeLockedConfig({
      ...config,
      cli_order: normalizeCliOrder(config.cli_order),
      install_timeouts: normalizeInstallTimeouts(config.install_timeouts)
    });
    const applyResult = await runAction(() => applyConfig(payload));
    if (!applyResult.ok) {
      return;
    }

    const activateResult = await runAction(notifyShellChanged);
    if (!activateResult.ok) {
      return;
    }

    await refreshInitialState();
  }, [config, ensureReady, refreshInitialState, runAction]);

  const onCleanupData = useCallback(async () => {
    const first = await runAction(() => cleanupAppData());
    if (first.code !== "cleanup_confirm_required") {
      if (first.ok) {
        await refreshInitialState();
      }
      return;
    }

    const accepted = await requestConfirm({
      title: "确认清理应用数据",
      message: "将清理 %LOCALAPPDATA%/execlink/ 下的配置、日志与旧菜单运行时数据。此操作不可撤销，是否继续？",
      confirmText: "继续清理",
      cancelText: "取消",
      danger: true
    });
    if (!accepted) {
      setLastResult({
        ok: false,
        code: "cleanup_cancelled",
        message: "已取消清理",
        detail: null
      });
      return;
    }

    const second = await runAction(() => cleanupAppData(CLEANUP_CONFIRM_TOKEN));
    if (second.ok) {
      await refreshInitialState();
    }
  }, [refreshInitialState, requestConfirm, runAction]);

  const onOneClickUnregisterCleanup = useCallback(async () => {
    const accepted = await requestConfirm({
      title: "确认清理旧残留",
      message: "将清理旧 Nilesoft 目录与 ExecLink 旧菜单残留。此操作不可撤销，是否继续？",
      confirmText: "继续执行",
      cancelText: "取消",
      danger: true
    });
    if (!accepted) {
      setLastResult({
        ok: false,
        code: "unregister_cleanup_cancelled",
        message: "已取消清理旧残留",
        detail: null
      });
      return;
    }
    await runAction(cleanupNilesoftArtifacts);
    await refreshInitialState();
  }, [refreshInitialState, requestConfirm, runAction]);

  const onMigrateLegacyMenus = useCallback(async () => {
    const result = await runAction(migrateLegacyHkcuMenuToV2);
    if (!result.ok) {
      return;
    }
    const [groups, legacy] = await Promise.all([listExeclinkContextMenus(), detectLegacyMenuArtifacts()]);
    setInstalledMenuGroups(groups);
    setLegacyArtifacts(legacy);
    setSelectedMenuGroupKeys([]);
    await refreshInitialState();
  }, [refreshInitialState, runAction]);

  const onRemoveMenuFallback = useCallback(async () => {
    const accepted = await requestConfirm({
      title: "确认删除 ExecLink 菜单",
      message: `将删除当前用户下“${config.menu_title}”相关的 ExecLink 右键菜单，是否继续？`,
      confirmText: "继续删除",
      cancelText: "取消",
      danger: true
    });
    if (!accepted) {
      return;
    }
    const result = await runAction(removeAllExeclinkContextMenus);
    if (!result.ok) {
      return;
    }
    await refreshInitialState();
  }, [config.menu_title, refreshInitialState, requestConfirm, runAction]);

  const onEnableWin11ClassicMenu = useCallback(async () => {
    const accepted = await requestConfirm({
      title: "启用 Win11 经典右键菜单",
      message: [
        "将为当前用户开启系统级 Win11 经典右键菜单覆盖。",
        "这会影响整个资源管理器右键菜单，而不只是 ExecLink。",
        "",
        "如未立即生效，通常仍需点击“Explorer 兜底刷新”或重新登录。",
        "是否继续？"
      ].join("\n"),
      confirmText: "继续启用",
      cancelText: "取消",
      danger: true
    });
    if (!accepted) {
      return;
    }
    const result = await runAction(enableWin11ClassicContextMenu);
    if (!result.ok) {
      return;
    }
    await refreshInitialState();
  }, [refreshInitialState, requestConfirm, runAction]);

  const onDisableWin11ClassicMenu = useCallback(async () => {
    const accepted = await requestConfirm({
      title: "恢复 Win11 原生顶层菜单",
      message: [
        "将移除当前用户的经典右键菜单覆盖，恢复 Win11 原生顶层右键菜单。",
        "这同样会影响整个资源管理器右键菜单。",
        "",
        "如未立即生效，通常仍需点击“Explorer 兜底刷新”或重新登录。",
        "是否继续？"
      ].join("\n"),
      confirmText: "恢复原生菜单",
      cancelText: "取消",
      danger: true
    });
    if (!accepted) {
      return;
    }
    const result = await runAction(disableWin11ClassicContextMenu);
    if (!result.ok) {
      return;
    }
    await refreshInitialState();
  }, [refreshInitialState, requestConfirm, runAction]);

  const refreshHkcuGroups = useCallback(async (silent = false) => {
    if (!silent) {
      setLoadingMenuGroups(true);
    }
    try {
      const [groups, legacy] = await Promise.all([listExeclinkContextMenus(), detectLegacyMenuArtifacts()]);
      setInstalledMenuGroups(groups);
      setLegacyArtifacts(legacy);
      setSelectedMenuGroupKeys((prev) =>
        prev.filter((key) => groups.some((group) => group.group_id === key))
      );
      if (!silent) {
        setLastResult({
          ok: true,
          code: "menu_groups_scanned",
          message:
            groups.length || legacy.length
              ? `检测到 ${groups.length} 个 v2 分组，${legacy.length} 个 legacy 残留`
              : "未检测到需要处理的菜单项",
          detail: groups.length
            ? groups.map((group) => `${group.title} [${group.group_id}]`).join("；")
            : null
        });
      }
    } catch (error) {
      if (!silent) {
        setLastResult({
          ok: false,
          code: "menu_groups_scan_failed",
          message: "检测右键菜单失败",
          detail: String(error)
        });
      }
    } finally {
      if (!silent) {
        setLoadingMenuGroups(false);
      }
    }
  }, []);

  const onToggleHkcuGroupSelection = useCallback((key: string, checked: boolean) => {
    setSelectedMenuGroupKeys((prev) => {
      if (checked) {
        if (prev.includes(key)) {
          return prev;
        }
        return [...prev, key];
      }
      return prev.filter((value) => value !== key);
    });
  }, []);

  const onDeleteSelectedHkcuGroups = useCallback(async () => {
    if (selectedMenuGroupKeys.length === 0) {
      setLastResult({
        ok: false,
        code: "menu_groups_empty_selection",
        message: "请先选择要删除的分组",
        detail: null
      });
      return;
    }

    const selectedGroups = installedMenuGroups.filter((group) => selectedMenuGroupKeys.includes(group.group_id));
    const accepted = await requestConfirm({
      title: "确认删除已安装菜单",
      message: `将删除当前检测到的 ExecLink 菜单分组：\n${selectedGroups
        .map((group) => `- ${group.title} [${group.group_id}]`)
        .join("\n")}\n\n是否继续？`,
      confirmText: "继续删除",
      cancelText: "取消",
      danger: true
    });
    if (!accepted) {
      return;
    }

    setWorking(true);
    try {
      const result = await removeAllExeclinkContextMenus();
      if (!result.ok) {
        setLastResult(result);
        return;
      }

      await refreshHkcuGroups(true);
      setSelectedMenuGroupKeys([]);
      setLastResult({
        ok: true,
        code: "installed_menu_groups_removed",
        message: `已删除 ${selectedGroups.length} 个菜单分组`,
        detail: selectedGroups.map((group) => `${group.title} [${group.group_id}]`).join("；")
      });
    } catch (error) {
      setLastResult({
        ok: false,
        code: "menu_groups_remove_failed",
        message: "删除已安装菜单失败",
        detail: String(error)
      });
    } finally {
      setWorking(false);
    }
  }, [installedMenuGroups, refreshHkcuGroups, requestConfirm, selectedMenuGroupKeys]);

  const onCloseQuickSetup = useCallback(() => {
    setQuickSetup(EMPTY_QUICK_SETUP);
    setQuickSetupLogTail(null);
    stopTerminalCountdown();
  }, [stopTerminalCountdown]);

  const onRetryQuickSetup = useCallback(() => {
    if (!quickSetup.key) {
      return;
    }
    void onQuickSetup(quickSetup.key);
  }, [onQuickSetup, quickSetup.key]);

  const onTerminalEnsureReady = useCallback(async () => {
    const result = await terminalEnsureSession();
    if (!result.ok) {
      setLastResult(result);
    }
  }, []);

  const onTerminalRunScript = useCallback(async (script: string) => {
    const result = await terminalRunScript(script);
    setLastResult(result);
  }, []);

  const onTerminalResize = useCallback(async (cols: number, rows: number) => {
    await terminalResize(cols, rows);
  }, []);

  const onCloseFocusedTerminal = useCallback(async () => {
    stopInstallPolling();
    clearTerminalAutoCloseTimer();
    stopTerminalCountdown();
    const result = await terminalCloseSession();
    setLastResult(result);
    setTerminalState("idle");
    setFocusedCliKey(null);
    clearTerminalPanelBuffer();
    setQuickSetupLogTail(null);
  }, [clearTerminalAutoCloseTimer, clearTerminalPanelBuffer, stopInstallPolling, stopTerminalCountdown]);

  const orderedCliKeys = useMemo(() => normalizeCliOrder(config.cli_order), [config.cli_order]);
  const effectiveInstallTimeouts = useMemo(
    () => normalizeInstallTimeouts(config.install_timeouts),
    [config.install_timeouts]
  );
  const canOperate = true;
  const showPrereqInstallButton = !installPrereq.git || !installPrereq.node;
  const prereqInstallButtonLabel = useMemo(() => {
    if (!installPrereq.git && !installPrereq.node) {
      return "安装前置环境";
    }
    if (!installPrereq.git) {
      return "安装 Git";
    }
    if (!installPrereq.node) {
      return "安装 Node.js";
    }
    return "安装前置环境";
  }, [installPrereq.git, installPrereq.node]);

  useEffect(() => {
    void refreshHkcuGroups(true);
  }, [refreshHkcuGroups]);

  useEffect(() => {
    if (!lastResult) {
      return;
    }

    const isMaintenanceFailure =
      !lastResult.ok &&
      MAINTENANCE_FAILURE_CODES.has(lastResult.code);

    if (isMaintenanceFailure) {
      const detailLines = [
        `错误码: [${lastResult.code}]`,
        `错误信息: ${lastResult.message}`,
        ""
      ];
      if (lastResult.detail && lastResult.detail.trim().length > 0) {
        detailLines.push(lastResult.detail);
      } else {
        detailLines.push("未返回更多细节，请查看运行日志。");
      }
      setMaintenanceDetailDialog({
        open: true,
        title: "一键维护失败详情",
        message: detailLines.join("\n")
      });
    }

    toastAddRef.current({
      type: lastResult.ok ? "success" : "error",
      priority: lastResult.ok ? "low" : "high",
      timeout: lastResult.ok ? 2600 : 10000,
      title: lastResult.message,
      description: (
        <div className="grid gap-1">
          <span className="font-mono text-[11px] text-[var(--ui-muted)]">[{lastResult.code}]</span>
          {isMaintenanceFailure ? (
            <span className="text-xs text-[var(--ui-muted)]">详情弹窗已自动打开。</span>
          ) : lastResult.detail ? (
            <details className="text-xs">
              <summary className="cursor-pointer select-none text-[var(--ui-text)]">详情</summary>
              <pre className="mt-1.5 text-[11px]">{lastResult.detail}</pre>
            </details>
          ) : null}
        </div>
      )
    });
  }, [lastResult]);

  return (
    <main className="app-window-shell min-h-screen w-full overflow-hidden rounded-[var(--radius-2xl)] border border-[#ddd5c9] px-3 py-2 text-[var(--ui-text)] max-[420px]:rounded-[var(--radius-xl)] max-[420px]:px-2 max-[420px]:py-1.5">
      <header
        className={`fixed top-2 left-2 right-2 z-[1300] flex items-center justify-between gap-3 rounded-[var(--radius-2xl)] border border-[#ddd5c9] bg-[var(--ui-base)] p-3 ${OUTSET_SMALL} max-[420px]:left-1 max-[420px]:right-1 max-[420px]:rounded-[var(--radius-xl)]`}
        onMouseDown={(event) => void onProductBarMouseDown(event)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`relative inline-flex w-[150px] flex-none items-center gap-3 rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-2 ${OUTSET_SMALL} max-[420px]:w-auto max-[420px]:px-2.5`}
          >
            <span className="absolute inset-1 rounded-full bg-green-700/20 blur-md" />
            <img
              className="relative block h-9 w-[124px] object-contain max-[420px]:h-8 max-[420px]:w-[106px]"
              src={appLogo}
              alt="ExecLink logo"
            />
            <h1
              className="group relative m-0 inline-flex cursor-default items-center rounded-[var(--radius-md)] px-2 py-1 leading-[1.1] outline-none focus-visible:ring-2 focus-visible:ring-[#8f8072]/45 max-[420px]:hidden"
              tabIndex={0}
            >
              <span className="text-[#4b443e]">Exec</span>
              <span className="text-green-600">Link</span>
              <span className={`pointer-events-none absolute top-[calc(100%+8px)] left-0 z-10 translate-y-0.5 whitespace-nowrap rounded-[var(--radius-pill)] bg-[var(--ui-base)] px-2.5 py-[5px] text-[11px] text-[var(--ui-muted)] opacity-0 transition-[opacity,transform] duration-150 ${OUTSET_SMALL} group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100`}>
                Windows 右键菜单 AI CLI 快捷入口，Win11 请在“显示更多选项”中查看
              </span>
            </h1>
          </div>
        </div>
        <div data-no-drag="true" className="ml-auto grid gap-1.5">
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              className={HEADER_WINDOW_BUTTON_CLASS}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => setUsageGuideOpen(true)}
              aria-label="打开使用说明向导"
            >
              <span className="text-[11px] font-bold leading-none">?</span>
            </button>
            <button
              type="button"
              className={HEADER_WINDOW_BUTTON_CLASS}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => void runWindowAction((win) => win.minimize())}
              disabled={!tauriWindow || windowBusy}
              aria-label="最小化窗口"
            >
              <span className="block h-[1.5px] w-2.5 rounded bg-current" />
            </button>
            <button
              type="button"
              className={`${HEADER_WINDOW_BUTTON_CLASS} hover:bg-[#e9d7d2] hover:text-[#8a4f45]`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => void runWindowAction((win) => win.close())}
              disabled={!tauriWindow || windowBusy}
              aria-label="关闭窗口"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <button className={HEADER_ACTION_BUTTON_CLASS} onClick={onDetect} disabled={working || loading}>
              刷新 CLI 检测
            </button>
            {showPrereqInstallButton ? (
              <button className={HEADER_ACTION_BUTTON_CLASS} onClick={onLaunchPrereqInstall} disabled={working || loading}>
                {prereqInstallButtonLabel}
              </button>
            ) : null}
            <button className={HEADER_ACTION_BUTTON_CLASS} onClick={onApply} disabled={working || loading}>
              应用配置
            </button>
          </div>
        </div>
      </header>

      <section className="app-content-scroll fixed top-[84px] bottom-[52px] left-1 right-1 z-[1100] overflow-x-hidden overflow-y-auto pb-2 max-[420px]:top-[78px] max-[420px]:bottom-[46px] max-[420px]:left-0.5 max-[420px]:right-0.5">
      <div className="w-full px-1">
      <Tabs.Root defaultValue="cli" className="grid gap-4 pt-4 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2 max-[420px]:gap-1.5">
            <Tabs.List
              className={`inline-flex w-max max-w-full items-center gap-1 rounded-full border border-[#ddd5c9] bg-[var(--ui-base)] p-1.5 ${INSET_SMALL}`}
              aria-label="主分组"
            >
              {TABS.map((tab) => (
                <Tabs.Tab key={tab.key} value={tab.key} className={TAB_CLASS}>
                  {tab.title}
                </Tabs.Tab>
              ))}
              <Tabs.Indicator className="hidden" />
            </Tabs.List>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2 max-[420px]:w-full">
              <label className="group/menu-title relative block shrink-0">
                <input
                  className={`${INPUT_CLASS} w-[220px] py-2 text-xs max-[760px]:w-[168px] max-[420px]:w-[124px] max-[420px]:px-2 max-[420px]:py-1.5`}
                  value={config.menu_title}
                  onChange={(event) =>
                    setConfig((prev) => ({
                      ...prev,
                      menu_title: event.target.value
                    }))
                  }
                  placeholder="菜单分组"
                  aria-label="右键菜单分组名称"
                />
                <span
                  className={`${HOVER_BUBBLE_CLASS} right-0 group-hover/menu-title:translate-y-0 group-hover/menu-title:opacity-100 group-focus-within/menu-title:translate-y-0 group-focus-within/menu-title:opacity-100`}
                >
                  右键菜单分组名称
                </span>
              </label>
              <span className="group/menu-switch relative inline-flex shrink-0">
                <Switch.Root
                  className={MENU_HEADER_SWITCH_ROOT_CLASS}
                  checked={config.enable_context_menu}
                  onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, enable_context_menu: checked }))}
                  aria-label={config.enable_context_menu ? "关闭右键菜单" : "启用右键菜单"}
                >
                  <Switch.Thumb className={MENU_HEADER_SWITCH_THUMB_CLASS} />
                </Switch.Root>
                <span
                  className={`${HOVER_BUBBLE_CLASS} right-0 group-hover/menu-switch:translate-y-0 group-hover/menu-switch:opacity-100 group-focus-within/menu-switch:translate-y-0 group-focus-within/menu-switch:opacity-100`}
                >
                  {config.enable_context_menu ? "关闭" : "启用菜单"}
                </span>
              </span>
            </div>
          </div>

          <Tabs.Panel value="cli" className="p-0">
            <div className={PANEL_CONTENT_CLASS}>
              {quickSetup.key ? (
                <QuickSetupWizard
                  status={quickSetup}
                  countdown={terminalCountdown}
                  logTail={quickSetupLogTail}
                  onClose={onCloseQuickSetup}
                  onRetry={onRetryQuickSetup}
                />
              ) : null}
              <CliConfigTable
                orderedCliKeys={orderedCliKeys}
                displayNames={config.display_names}
                toggles={config.toggles}
                statuses={statuses}
                installHints={installHints}
                cliUserPathStatuses={cliUserPathStatuses}
                installPrereq={installPrereq}
                loading={loading}
                working={working}
                installingKey={installingKey}
                focusedCliKey={focusedCliKey}
                terminalState={terminalState}
                terminalCountdown={terminalCountdown}
                suppressTerminal={Boolean(quickSetup.key)}
                onReorder={(nextOrder) =>
                  setConfig((prev) => ({
                    ...prev,
                    cli_order: nextOrder
                  }))
                }
                onSetDisplayName={setDisplayName}
                onSetToggle={setToggle}
                onCopyInstallCommand={onCopyInstallCommand}
                onOpenInstallDocs={onOpenInstallDocs}
                onOpenNodejsDownload={onOpenNodejsDownload}
                onLaunchInstall={onLaunchInstall}
                onAddCliCommandDirToUserPath={onAddCliCommandDirToUserPath}
                onLaunchAuth={onLaunchAuth}
                onLaunchUpgrade={onLaunchUpgrade}
                onLaunchUninstall={onLaunchUninstall}
                onQuickSetup={onQuickSetup}
                onTerminalEnsureReady={onTerminalEnsureReady}
                onTerminalRunScript={onTerminalRunScript}
                onTerminalResize={onTerminalResize}
                onTerminalCloseSession={onCloseFocusedTerminal}
              />
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="menu" className="p-0">
            <div className={PANEL_CONTENT_CLASS}>
              <details className={COLLAPSIBLE_PANEL_CLASS}>
                <summary className={COLLAPSIBLE_PANEL_SUMMARY_CLASS}>右键菜单状态</summary>
                <div className="mt-3 grid gap-3">
                  <p className="text-sm text-[var(--ui-muted)]">{contextMenuStatus.message}</p>
                  <p>
                    已应用 v2 菜单: <strong>{contextMenuStatus.applied ? "是" : "否"}</strong>
                  </p>
                  <p>
                    当前分组: <strong>{contextMenuStatus.current_group_title ?? contextMenuStatus.current_group_id ?? "未检测到"}</strong>
                  </p>
                  <p>
                    生效作用域: <code>{contextMenuStatus.enabled_roots.length ? contextMenuStatus.enabled_roots.join(" | ") : "未检测到"}</code>
                  </p>
                  <p>
                    Legacy 残留: <strong>{legacyArtifacts.length}</strong>
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    <button className={RUNTIME_PRIMARY_BUTTON_CLASS} onClick={onEnsureInstall} disabled={working || loading}>
                      刷新状态
                    </button>
                    <button className={RUNTIME_SECONDARY_BUTTON_CLASS} onClick={onRetryElevation} disabled={working || loading}>
                      通知 Explorer 刷新
                    </button>
                    <button
                      className={RUNTIME_SECONDARY_BUTTON_CLASS}
                      onClick={() => void runAction(restartExplorerFallback)}
                      disabled={working || loading}
                    >
                      Explorer 兜底刷新
                    </button>
                  </div>
                </div>
              </details>

              <details className={COLLAPSIBLE_PANEL_CLASS}>
                <summary className={COLLAPSIBLE_PANEL_SUMMARY_CLASS}>迁移与清理</summary>
                <div className="mt-3 grid gap-3">
                  <p className="text-sm text-[var(--ui-muted)]">
                    用于迁移旧版 PowerShell HKCU 菜单、清理旧 Nilesoft 残留，以及移除当前用户下的 ExecLink 菜单。
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      className={RUNTIME_PRIMARY_BUTTON_CLASS}
                      onClick={onMigrateLegacyMenus}
                      disabled={working || loading || legacyArtifacts.length === 0}
                    >
                      迁移 Legacy 菜单
                    </button>
                    <button
                      className={RUNTIME_SECONDARY_BUTTON_CLASS}
                      onClick={onRemoveMenuFallback}
                      disabled={working || loading}
                    >
                      删除当前菜单
                    </button>
                    <button
                      className={RUNTIME_DANGER_BUTTON_CLASS}
                      onClick={onOneClickUnregisterCleanup}
                      disabled={working || loading}
                    >
                      清理旧残留
                    </button>
                  </div>
                  <details className={`rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] p-3 ${OUTSET_SMALL}`}>
                    <summary className={COLLAPSIBLE_PANEL_SUMMARY_CLASS}>菜单扫描结果</summary>
                    <div className="mt-2 grid gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          className={RUNTIME_SECONDARY_BUTTON_CLASS}
                          onClick={() => void refreshHkcuGroups(false)}
                          disabled={working || loading || loadingMenuGroups}
                        >
                          {loadingMenuGroups ? "检测中..." : "扫描菜单状态"}
                        </button>
                        <button
                          className={RUNTIME_DANGER_BUTTON_CLASS}
                          onClick={onDeleteSelectedHkcuGroups}
                          disabled={working || loading || selectedMenuGroupKeys.length === 0}
                        >
                          删除已选分组
                        </button>
                      </div>
                      {installedMenuGroups.length === 0 && legacyArtifacts.length === 0 ? (
                        <p className="text-xs text-[var(--ui-muted)]">未检测到已安装分组或 legacy 残留。</p>
                      ) : (
                        <div className="grid gap-1.5">
                          {installedMenuGroups.map((group) => {
                            const checked = selectedMenuGroupKeys.includes(group.group_id);
                            return (
                              <label
                                key={group.group_id}
                                className={`flex items-start gap-2 rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] px-2.5 py-2 text-xs ${OUTSET_SMALL}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => onToggleHkcuGroupSelection(group.group_id, event.target.checked)}
                                  disabled={working || loading}
                                  className="mt-0.5"
                                />
                                <span className="grid gap-0.5">
                                  <span className="font-semibold text-[var(--ui-text)]">
                                    {group.title}{" "}
                                    <span className="font-mono text-[11px] text-[var(--ui-muted)]">[{group.group_id}]</span>
                                  </span>
                                  <span className="text-[11px] text-[var(--ui-muted)]">
                                    出现位置：{group.roots.join(" | ")}
                                  </span>
                                  <span className="text-[11px] text-[var(--ui-muted)]">
                                    项目：{group.item_ids.join(" | ")}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                          {legacyArtifacts.map((artifact) => (
                            <div
                              key={artifact.path}
                              className={`rounded-[var(--radius-md)] border border-[#ddcfc2] bg-[#ecddd8] px-2.5 py-2 text-xs ${OUTSET_SMALL}`}
                            >
                              <div className="font-semibold text-[#7d473e]">
                                Legacy: {artifact.title} <span className="font-mono text-[11px]">[{artifact.root}]</span>
                              </div>
                              <div className="mt-0.5 text-[11px] text-[#8a4f45]">{artifact.path}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              </details>

              <details className={COLLAPSIBLE_PANEL_CLASS}>
                <summary className={COLLAPSIBLE_PANEL_SUMMARY_CLASS}>Windows 11 经典菜单开关</summary>
                <div className="mt-3 grid gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="max-w-[30rem] text-sm text-[var(--ui-muted)]">
                      这是当前用户级系统开关，会影响整个资源管理器右键菜单，而不只是 ExecLink。
                    </p>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        win11ClassicMenuStatus.enabled
                          ? "border-[#b9caaa] bg-[#e5eddc] text-[#4f6b35]"
                          : "border-[#d8cfbf] bg-[#efe7db] text-[#7b6850]"
                      }`}
                    >
                      {win11ClassicMenuStatus.enabled ? "已启用经典菜单" : "原生顶层菜单"}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--ui-muted)]">{win11ClassicMenuStatus.message}</p>
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      className={RUNTIME_PRIMARY_BUTTON_CLASS}
                      onClick={onEnableWin11ClassicMenu}
                      disabled={working || loading || win11ClassicMenuStatus.enabled}
                    >
                      启用经典右键菜单
                    </button>
                    <button
                      className={RUNTIME_SECONDARY_BUTTON_CLASS}
                      onClick={onDisableWin11ClassicMenu}
                      disabled={working || loading || !win11ClassicMenuStatus.enabled}
                    >
                      恢复 Win11 原生菜单
                    </button>
                  </div>
                  <div
                    className={`grid gap-1 rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[#efe7db] px-3 py-2 text-xs text-[#6e6255] ${OUTSET_SMALL}`}
                  >
                    <p>若切换后未立即生效，请先点击上方“Explorer 兜底刷新”；仍未变化时请重新登录。</p>
                    <p>注册表路径：<code>{win11ClassicMenuStatus.registry_path}</code></p>
                    <p>
                      当前版本的 ExecLink 仍是经典菜单方案；若不启用该系统开关，在 Windows 11 上仍需通过“显示更多选项”进入。
                    </p>
                  </div>
                </div>
              </details>

              <details className={COLLAPSIBLE_PANEL_CLASS}>
                <summary className={COLLAPSIBLE_PANEL_SUMMARY_CLASS}>运行与安装策略</summary>
                <div className="mt-3 grid gap-4">
                  <p className="text-sm text-[var(--ui-muted)]">
                    调整菜单命令的终端运行方式、uv 安装回退策略，以及安装流程的超时窗口。
                  </p>
                  <label className={FIELD_CLASS}>
                    <span className={FIELD_LABEL_CLASS}>终端运行器</span>
                    <span className="relative block">
                      <select
                        className={SELECT_CLASS}
                        value={config.terminal_mode}
                        onChange={(event) =>
                          setConfig((prev) => ({
                            ...prev,
                            terminal_mode: event.target.value as AppConfig["terminal_mode"]
                          }))
                        }
                      >
                        {TERMINAL_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[var(--ui-light)]">
                        v
                      </span>
                    </span>
                  </label>
                  <section className={`grid gap-3 rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[var(--ui-base)] p-3 ${INSET_SMALL}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="grid gap-0.5">
                        <span className="text-sm font-semibold text-[var(--ui-text)]">uv 安装源策略</span>
                        <span className="text-xs text-[var(--ui-muted)]">
                          当前：{uvInstallSourceModeLabel(config.uv_install_source_mode)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={RUNTIME_SECONDARY_BUTTON_CLASS}
                        disabled={working || loading}
                        onClick={() => setUvSourceDialog({ open: true })}
                      >
                        选择策略
                      </button>
                    </div>
                    <p className="text-xs text-[var(--ui-muted)]">
                      自动策略会按 <code>winget -&gt; 官方脚本 -&gt; 清华镜像 -&gt; 阿里镜像</code> 依次回退。
                    </p>
                  </section>
                  <section className={`grid gap-3 rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[var(--ui-base)] p-3 ${INSET_SMALL}`}>
                    <h3 className="text-sm font-semibold text-[var(--ui-text)]">安装超时（秒）</h3>
                    <p className="text-xs text-[var(--ui-muted)]">
                      所有安装流程都会显示倒计时，超时后会自动返回失败详情。范围超出会自动纠正到安全区间。
                    </p>
                    <div className="grid gap-2">
                      {INSTALL_TIMEOUT_FIELDS.map((field) => {
                        const bounds = INSTALL_TIMEOUT_BOUNDS[field.key];
                        const valueSeconds = Math.round(effectiveInstallTimeouts[field.key] / 1000);
                        return (
                          <label key={field.key} className={FIELD_CLASS}>
                            <span className="text-xs font-semibold text-[var(--ui-text)]">{field.title}</span>
                            <span className="text-[11px] text-[var(--ui-muted)]">{field.description}</span>
                            <input
                              type="number"
                              min={Math.round(bounds.min / 1000)}
                              max={Math.round(bounds.max / 1000)}
                              step={1}
                              className={INPUT_CLASS}
                              value={valueSeconds}
                              onChange={(event) => {
                                const next = Number.parseInt(event.target.value, 10);
                                if (!Number.isFinite(next)) {
                                  return;
                                }
                                setInstallTimeoutValueMs(field.key, next * 1000);
                              }}
                            />
                            <span className="text-[11px] text-[var(--ui-muted)]">
                              范围：{Math.round(bounds.min / 1000)} ~ {Math.round(bounds.max / 1000)} 秒
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </details>
            </div>
          </Tabs.Panel>

      </Tabs.Root>
      </div>
      </section>

      <footer
        className={`fixed bottom-2 left-2 right-2 z-[1250] flex items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[color-mix(in_srgb,var(--ui-base)_92%,white_8%)] px-3 py-1.5 text-[11px] text-[var(--ui-muted)] ${OUTSET_SMALL} max-[420px]:left-1 max-[420px]:right-1 max-[420px]:rounded-[var(--radius-md)] max-[420px]:px-2.5 max-[420px]:py-1`}
      >
        <span>
          ExecLink <span className="text-[var(--ui-light)]">Version</span> <code>{APP_VERSION}</code>
        </span>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="underline decoration-[#c5bdaf] underline-offset-2 transition-colors duration-150 hover:text-[var(--ui-text)]"
        >
          GitHub Repository
        </a>
      </footer>

      <GitInstallSourceDialog
        open={gitSourceDialogOpen}
        onSelectOfficial={() => settleGitSourceDialog("official")}
        onSelectTuna={() => settleGitSourceDialog("tuna")}
        onCancel={() => settleGitSourceDialog(null)}
      />

      <WingetInstallSourceDialog
        open={wingetSourceDialogOpen}
        onSelectOfficial={() => settleWingetSourceDialog("official")}
        onSelectStore={() => settleWingetSourceDialog("store")}
        onCancel={() => settleWingetSourceDialog(null)}
      />

      <NpmRegistrySourceDialog
        open={npmRegistryDialog.open}
        title={npmRegistryDialog.title}
        officialCommand={npmRegistryDialog.officialCommand}
        mirrorCommand={npmRegistryDialog.mirrorCommand}
        onSelectOfficial={() => settleNpmRegistryDialog("official")}
        onSelectMirror={() => settleNpmRegistryDialog("npmmirror")}
        onCancel={() => settleNpmRegistryDialog(null)}
      />

      <UvInstallSourceDialog
        open={uvSourceDialog.open}
        onSelectAuto={() => applyUvSourceDialogSelection("auto")}
        onSelectOfficial={() => applyUvSourceDialogSelection("official")}
        onSelectTuna={() => applyUvSourceDialogSelection("tuna")}
        onSelectAliyun={() => applyUvSourceDialogSelection("aliyun")}
        onCancel={() => applyUvSourceDialogSelection(null)}
      />

      <AppConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        danger={confirmDialog.danger}
        onConfirm={() => settleConfirmDialog(true)}
        onCancel={() => settleConfirmDialog(false)}
      />

      <AppConfirmDialog
        open={maintenanceDetailDialog.open}
        title={maintenanceDetailDialog.title}
        message={maintenanceDetailDialog.message}
        confirmText="知道了"
        cancelText="关闭"
        danger
        onConfirm={closeMaintenanceDetailDialog}
        onCancel={closeMaintenanceDetailDialog}
      />

      <UsageGuideDialog open={usageGuideOpen} onClose={() => setUsageGuideOpen(false)} />

      <Toast.Portal>
        <Toast.Viewport className="pointer-events-none fixed right-3.5 bottom-14 z-[1200] grid w-[min(380px,calc(100vw-28px))] gap-2 max-[420px]:bottom-12">
          {toastManager.toasts.map((toast) => (
            <Toast.Root key={toast.id} toast={toast} className={TOAST_ROOT_CLASS}>
              <Toast.Content className="grid min-w-0 gap-1">
                <Toast.Title className={TOAST_TITLE_CLASS} />
                <Toast.Description className={TOAST_DESCRIPTION_CLASS} />
              </Toast.Content>
              <Toast.Close
                className={`rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] px-1.5 py-0.5 text-[15px] leading-none text-[var(--ui-muted)] outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[var(--ui-text)] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff] ${OUTSET_SMALL}`}
                aria-label="关闭通知"
              >
                ×
              </Toast.Close>
            </Toast.Root>
          ))}
        </Toast.Viewport>
      </Toast.Portal>
    </main>
  );
}


