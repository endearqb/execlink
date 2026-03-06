import { invoke } from "@tauri-apps/api/core";
import type {
  ActionResult,
  AppConfig,
  CliInstallHintMap,
  CliUserPathStatusMap,
  CliStatusMap,
  ContextMenuStatus,
  DiagnosticsInfo,
  GitInstallSource,
  WingetInstallSource,
  CliKey,
  InstalledMenuGroup,
  InstallLaunchRequest,
  InstallPrereqStatus,
  InitialState,
  LegacyArtifact,
  PowerShellPs1PolicyStatus
} from "../types/config";

const TAURI_RUNTIME_UNAVAILABLE_MESSAGE =
  "未检测到 Tauri 运行时。请使用 `npm run tauri dev` 启动桌面应用。";

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

async function invokeTauri<T>(command: string, args?: Record<string, unknown>) {
  if (!hasTauriRuntime()) {
    throw new Error(TAURI_RUNTIME_UNAVAILABLE_MESSAGE);
  }
  return invoke<T>(command, args);
}

export function getInitialState() {
  return invokeTauri<InitialState>("get_initial_state");
}

export function detectClis() {
  return invokeTauri<CliStatusMap>("detect_clis");
}

export function cleanupAppData(confirmToken?: string) {
  return invokeTauri<ActionResult>("cleanup_app_data", { confirmToken });
}

export function applyConfig(config: AppConfig) {
  return invokeTauri<ActionResult>("apply_config", { config });
}

export function previewContextMenuPlan(config: AppConfig) {
  return invokeTauri<import("../types/config").RegistryWritePlan>("preview_context_menu_plan", { config });
}

export function listExeclinkContextMenus() {
  return invokeTauri<InstalledMenuGroup[]>("list_execlink_context_menus");
}

export function removeAllExeclinkContextMenus() {
  return invokeTauri<ActionResult>("remove_all_execlink_context_menus");
}

export function notifyShellChanged() {
  return invokeTauri<ActionResult>("notify_shell_changed");
}

export function restartExplorerFallback() {
  return invokeTauri<ActionResult>("restart_explorer_fallback");
}

export function detectLegacyMenuArtifacts() {
  return invokeTauri<LegacyArtifact[]>("detect_legacy_menu_artifacts");
}

export function migrateLegacyHkcuMenuToV2() {
  return invokeTauri<ActionResult>("migrate_legacy_hkcu_menu_to_v2");
}

export function cleanupNilesoftArtifacts() {
  return invokeTauri<ActionResult>("cleanup_nilesoft_artifacts");
}

export function enableWin11ClassicContextMenu() {
  return invokeTauri<ActionResult>("enable_win11_classic_context_menu");
}

export function disableWin11ClassicContextMenu() {
  return invokeTauri<ActionResult>("disable_win11_classic_context_menu");
}

export function getDiagnostics() {
  return invokeTauri<DiagnosticsInfo>("get_diagnostics");
}

export function getCliInstallHints() {
  return invokeTauri<CliInstallHintMap>("get_cli_install_hints");
}

export function getInstallPrereqStatus() {
  return invokeTauri<InstallPrereqStatus>("get_install_prereq_status");
}

export function getCliUserPathStatuses() {
  return invokeTauri<CliUserPathStatusMap>("get_cli_user_path_statuses");
}

export function addCliCommandDirToUserPath(key: CliKey) {
  return invokeTauri<ActionResult>("add_cli_command_dir_to_user_path", { key });
}

export function getPowershellPs1PolicyStatus() {
  return invokeTauri<PowerShellPs1PolicyStatus>("get_powershell_ps1_policy_status");
}

export function fixPowershellPs1Policy() {
  return invokeTauri<ActionResult>("fix_powershell_ps1_policy");
}

export function launchCliInstall(request: InstallLaunchRequest) {
  return invokeTauri<ActionResult>("launch_cli_install", { request });
}

export function launchCliAuth(key: CliKey) {
  return invokeTauri<ActionResult>("launch_cli_auth", { key });
}

export function runCliVerify(key: CliKey) {
  return invokeTauri<ActionResult>("run_cli_verify", { key });
}

export function verifyKimiInstallation() {
  return invokeTauri<ActionResult>("verify_kimi_installation");
}

export function verifyKimiPythonInstallation() {
  return invokeTauri<ActionResult>("verify_kimi_python_installation");
}

export function launchCliUninstall(key: CliKey) {
  return invokeTauri<ActionResult>("launch_cli_uninstall", { key });
}

export function openInstallDocs(key: CliKey) {
  return invokeTauri<ActionResult>("open_install_docs", { key });
}

export function openNodejsDownloadPage() {
  return invokeTauri<ActionResult>("open_nodejs_download_page");
}

export function openWingetInstallPage() {
  return invokeTauri<ActionResult>("open_winget_install_page");
}

export function launchWingetInstall(source?: WingetInstallSource) {
  return invokeTauri<ActionResult>("launch_winget_install", { source });
}

export function launchGitInstall() {
  return invokeTauri<ActionResult>("launch_git_install");
}

export function launchNodejsInstall() {
  return invokeTauri<ActionResult>("launch_nodejs_install");
}

export function launchPrereqInstall(gitSource?: GitInstallSource) {
  return invokeTauri<ActionResult>("launch_prereq_install", { gitSource });
}

export function terminalEnsureSession() {
  return invokeTauri<ActionResult>("terminal_ensure_session");
}

export function terminalInput(data: string) {
  return invokeTauri<ActionResult>("terminal_input", { data });
}

export function terminalRunScript(script: string) {
  return invokeTauri<ActionResult>("terminal_run_script", { script });
}

export function terminalResize(cols: number, rows: number) {
  return invokeTauri<ActionResult>("terminal_resize", { cols, rows });
}

export function terminalCloseSession() {
  return invokeTauri<ActionResult>("terminal_close_session");
}
