import { invoke } from "@tauri-apps/api/core";
import type {
  ActionResult,
  AppConfig,
  CliInstallHintMap,
  CliUserPathStatusMap,
  CliStatusMap,
  DiagnosticsInfo,
  GitInstallSource,
  WingetInstallSource,
  CliKey,
  HkcuMenuGroup,
  InstallLaunchRequest,
  InstallPrereqStatus,
  InitialState,
  InstallStatus,
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

export function ensureNilesoftInstalled() {
  return invokeTauri<InstallStatus>("ensure_nilesoft_installed");
}

export function oneClickInstallRepair(config: AppConfig) {
  return invokeTauri<ActionResult>("one_click_install_repair", { config });
}

export function requestElevationAndRegister() {
  return invokeTauri<ActionResult>("request_elevation_and_register");
}

export function attemptUnregisterNilesoft() {
  return invokeTauri<ActionResult>("attempt_unregister_nilesoft");
}

export function cleanupAppData(confirmToken?: string) {
  return invokeTauri<ActionResult>("cleanup_app_data", { confirmToken });
}

export function oneClickUnregisterCleanup(confirmToken?: string) {
  return invokeTauri<ActionResult>("one_click_unregister_cleanup", { confirmToken });
}

export function applyConfig(config: AppConfig) {
  return invokeTauri<ActionResult>("apply_config", { config });
}

export function activateNow() {
  return invokeTauri<ActionResult>("activate_now");
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

export function repairContextMenuHkcu(config: AppConfig) {
  return invokeTauri<ActionResult>("repair_context_menu_hkcu", { config });
}

export function removeContextMenuHkcu(menuTitle?: string) {
  return invokeTauri<ActionResult>("remove_context_menu_hkcu", { menuTitle });
}

export function listContextMenuGroupsHkcu() {
  return invokeTauri<HkcuMenuGroup[]>("list_context_menu_groups_hkcu");
}

export function refreshExplorer() {
  return invokeTauri<ActionResult>("refresh_explorer");
}
