import { Tabs, Toast } from "@base-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  activateNow,
  applyConfig,
  attemptUnregisterNilesoft,
  cleanupAppData,
  detectClis,
  ensureNilesoftInstalled,
  getCliInstallHints,
  getInitialState,
  getInstallPrereqStatus,
  listContextMenuGroupsHkcu,
  openNodejsDownloadPage,
  openInstallDocs,
  refreshExplorer,
  removeContextMenuHkcu,
  repairContextMenuHkcu,
  requestElevationAndRegister,
  runCliVerify,
  terminalCloseSession,
  terminalEnsureSession,
  terminalResize,
  terminalRunScript
} from "../api/tauri";
import { CliConfigTable } from "../components/CliConfigTable";
import { QuickSetupWizard } from "../components/QuickSetupWizard";
import { ToggleRow } from "../components/ToggleRow";
import appLogo from "../assets/excelink_logo.png";
import {
  CLI_DEFAULT_ORDER,
  CLI_DEFAULT_TITLES,
  DEFAULT_CONFIG,
  TERMINAL_THEME_OPTIONS,
  normalizeCliOrder,
  type ActionResult,
  type AppConfig,
  type CliInstallHintMap,
  type CliKey,
  type CliStatusMap,
  type HkcuMenuGroup,
  type InstallPrereqStatus,
  type InstallStatus,
  type QuickSetupPhase,
  type QuickSetupStatus,
  type TerminalOutputEvent,
  type TerminalStateEvent
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

const EMPTY_INSTALL: InstallStatus = {
  installed: false,
  registered: false,
  needs_elevation: false,
  message: "未初始化",
  shell_exe: null,
  config_root: null
};

const EMPTY_PREREQ: InstallPrereqStatus = {
  node: false,
  npm: false,
  pwsh: false,
  winget: false,
  wsl: false
};

type TabKey = "cli" | "menu" | "runtime" | "about";

const TABS: Array<{ key: TabKey; title: string }> = [
  { key: "cli", title: "CLI" },
  { key: "menu", title: "菜单" },
  { key: "runtime", title: "安装/生效" },
  { key: "about", title: "关于我" }
];

const TERMINAL_MODE_OPTIONS: Array<{ value: AppConfig["terminal_mode"]; label: string }> = [
  { value: "wt", label: "Windows Terminal (wt)" },
  { value: "auto", label: "Auto（自动选择）" },
  { value: "pwsh", label: "PowerShell 7 (pwsh)" },
  { value: "powershell", label: "Windows PowerShell" }
];

const CLEANUP_CONFIRM_TOKEN = "CONFIRM_CLEANUP_EXECLINK";
const APP_IDENTIFIER = "com.endearqb.execlink";
const APP_PUBLISHER = "endearqb";
const APP_VERSION = "0.1.0";
const INSTALL_RECHECK_INTERVAL_MS = 2000;
const INSTALL_RECHECK_TIMEOUT_MS = 10 * 60 * 1000;
const OUTSET_LARGE = "shadow-[10px_10px_20px_#d5d0c4,-10px_-10px_20px_#ffffff]";
const OUTSET_SMALL = "shadow-[5px_5px_10px_#d5d0c4,-5px_-5px_10px_#ffffff]";
const INSET_SMALL = "shadow-[inset_4px_4px_8px_#d5d0c4,inset_-4px_-4px_8px_#ffffff]";
const BUTTON_BASE_CLASS = `rounded-2xl border border-[#ddd5c9] px-4 py-2.5 text-sm font-medium outline-none transition-[box-shadow,transform,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_2px_2px_5px_#d5d0c4,inset_-2px_-2px_5px_#ffffff] disabled:cursor-not-allowed disabled:opacity-60`;
const PRIMARY_BUTTON_CLASS = `${BUTTON_BASE_CLASS} bg-[#e8e1d7] text-[var(--ui-text)] ${OUTSET_SMALL} hover:text-[#665a4f]`;
const SECONDARY_BUTTON_CLASS = `${BUTTON_BASE_CLASS} bg-[var(--ui-base)] text-[var(--ui-text)] ${OUTSET_SMALL} hover:text-[#665a4f]`;
const DANGER_BUTTON_CLASS = `${BUTTON_BASE_CLASS} bg-[#ecddd8] text-[#8a4f45] ${OUTSET_SMALL} hover:text-[#7d473e]`;
const INPUT_CLASS = `w-full rounded-2xl border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-2.5 text-sm text-[var(--ui-text)] outline-none ${INSET_SMALL} transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#8f8072]/35 disabled:cursor-not-allowed disabled:opacity-60`;
const FIELD_CLASS = "grid gap-1.5";
const FIELD_LABEL_CLASS = "font-semibold text-[var(--ui-text)]";
const PANEL_CONTENT_CLASS = "grid gap-4";
const PANEL_TITLE_CLASS = "text-base font-semibold text-[var(--ui-text)]";
const PANEL_BLOCK_CLASS = `grid gap-3 rounded-[1.5rem] border border-[#ddd5c9] bg-[var(--ui-base)] p-4 ${INSET_SMALL} max-[540px]:rounded-[1.25rem]`;
const TAB_CLASS =
  "relative flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold leading-none text-[var(--ui-muted)] outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[var(--ui-text)] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 data-[active]:bg-[var(--ui-base)] data-[active]:text-[var(--ui-text)] data-[active]:shadow-[5px_5px_10px_#d5d0c4,-5px_-5px_10px_#ffffff] active:scale-95 active:shadow-[inset_2px_2px_5px_#d5d0c4,inset_-2px_-2px_5px_#ffffff]";
const TOAST_ROOT_CLASS = `pointer-events-auto flex items-start justify-between gap-2.5 rounded-[1.35rem] border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-2.5 opacity-100 ${OUTSET_SMALL} [--toast-stack-offset:calc(var(--toast-offset-y,0px)+(var(--toast-index,0)*3px))] [transform:translate3d(var(--toast-swipe-movement-x,0px),calc(var(--toast-stack-offset)+var(--toast-swipe-movement-y,0px)),0)_scale(calc(1-(var(--toast-index,0)*0.02)))] transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[transform,opacity] data-[starting-style]:opacity-0 data-[starting-style]:[transform:translate3d(0,calc(var(--toast-stack-offset)+14px),0)_scale(0.96)] data-[ending-style]:opacity-0 data-[ending-style]:[transform:translate3d(var(--toast-swipe-movement-x,0px),calc(var(--toast-stack-offset)+10px),0)_scale(0.96)] data-[type=success]:bg-[#e8e1d7] data-[type=error]:bg-[#ecddd8]`;
const TOAST_TITLE_CLASS = "text-[0.92rem] font-bold leading-[1.3] text-[var(--ui-text)] data-[type=error]:text-[#7d473e]";
const TOAST_DESCRIPTION_CLASS = "m-0 text-xs text-[var(--ui-muted)] data-[type=error]:text-[#8a4f45]";
const SELECT_CLASS = `w-full appearance-none rounded-2xl border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-2.5 pr-9 text-sm text-[var(--ui-text)] outline-none ${INSET_SMALL} transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#8f8072]/35 disabled:cursor-not-allowed disabled:opacity-60`;
const QUICK_SETUP_DETECT_TIMEOUT_MS = 5 * 60 * 1000;

const EMPTY_QUICK_SETUP: QuickSetupStatus = {
  key: null,
  phase: "idle",
  running: false,
  message: "尚未开始快速安装向导。",
  detail: null
};

export function HomePage() {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [statuses, setStatuses] = useState<CliStatusMap>(EMPTY_STATUS);
  const [installHints, setInstallHints] = useState<CliInstallHintMap>({});
  const [installPrereq, setInstallPrereq] = useState<InstallPrereqStatus>(EMPTY_PREREQ);
  const [install, setInstall] = useState<InstallStatus>(EMPTY_INSTALL);
  const [installingKey, setInstallingKey] = useState<CliKey | null>(null);
  const [lastResult, setLastResult] = useState<ActionResult | null>(null);
  const [quickSetup, setQuickSetup] = useState<QuickSetupStatus>(EMPTY_QUICK_SETUP);
  const [focusedCliKey, setFocusedCliKey] = useState<CliKey | null>(null);
  const [terminalState, setTerminalState] = useState("idle");
  const [hkcuGroups, setHkcuGroups] = useState<HkcuMenuGroup[]>([]);
  const [selectedHkcuGroupKeys, setSelectedHkcuGroupKeys] = useState<string[]>([]);
  const [loadingHkcuGroups, setLoadingHkcuGroups] = useState(false);
  const installPollTimerRef = useRef<number | null>(null);
  const installPollExpectedRef = useRef<boolean | null>(null);
  const terminalUnlistenRef = useRef<UnlistenFn[]>([]);
  const toastManager = Toast.useToastManager();
  const toastAddRef = useRef(toastManager.add);
  const configRef = useRef(config);
  toastAddRef.current = toastManager.add;
  configRef.current = config;

  const stopInstallPolling = useCallback(() => {
    if (installPollTimerRef.current !== null) {
      window.clearInterval(installPollTimerRef.current);
      installPollTimerRef.current = null;
    }
    installPollExpectedRef.current = null;
    setInstallingKey(null);
  }, []);

  useEffect(() => {
    return () => {
      if (installPollTimerRef.current !== null) {
        window.clearInterval(installPollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const unlistenOutput = await listen<TerminalOutputEvent>("terminal_output", (event) => {
        const writer = (window as Window & {
          __EXECLINK_TERMINAL_WRITE__?: (text: string) => void;
        }).__EXECLINK_TERMINAL_WRITE__;
        if (writer) {
          writer(event.payload.data);
        }
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
  }, []);

  const refreshInitialState = useCallback(async () => {
    const state = await getInitialState();
    const normalizedConfig: AppConfig = {
      ...state.config,
      cli_order: normalizeCliOrder(state.config.cli_order)
    };
    setConfig(normalizedConfig);
    setStatuses(state.cli_status);
    setInstall(state.install_status);
    return {
      ...state,
      config: normalizedConfig
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const state = await refreshInitialState();

        const [hintResult, prereqResult] = await Promise.allSettled([
          getCliInstallHints(),
          getInstallPrereqStatus()
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

        if (!state.install_status.installed) {
          const ensured = await ensureNilesoftInstalled();
          setInstall(ensured);
          if (ensured.needs_elevation) {
            setLastResult({
              ok: false,
              code: "register_admin_required",
              message: "Nilesoft 注册需要管理员权限",
              detail: `${ensured.message}\n请在“安装/生效”页点击“提权重试注册”。`
            });
          }
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
  }, [refreshInitialState]);

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

  const buildConfigWithCliDetected = useCallback(
    (base: AppConfig, key: CliKey, detected: boolean): AppConfig => ({
      ...base,
      cli_order: normalizeCliOrder(base.cli_order),
      toggles: {
        ...base.toggles,
        [key]: detected
      }
    }),
    []
  );

  const applyMenuConfigWithFallback = useCallback(
    async (payload: AppConfig, reason: "install" | "uninstall" | "register"): Promise<ActionResult> => {
      const applyResult = await applyConfig(payload);
      if (applyResult.ok) {
        const activateResult = await activateNow();
        if (activateResult.ok) {
          return {
            ok: true,
            code: "menu_sync_applied",
            message: reason === "uninstall" ? "已同步卸载后的右键菜单" : "已同步右键菜单",
            detail: applyResult.detail ?? activateResult.detail ?? null
          };
        }
      }

      const fallbackResult = await repairContextMenuHkcu(payload);
      if (!fallbackResult.ok) {
        return fallbackResult;
      }
      const refreshResult = await refreshExplorer();
      if (!refreshResult.ok) {
        return refreshResult;
      }

      return {
        ok: true,
        code: "menu_sync_fallback_applied",
        message: reason === "uninstall" ? "已通过 HKCU 兜底同步卸载后的右键菜单" : "已通过 HKCU 兜底同步右键菜单",
        detail: fallbackResult.detail ?? refreshResult.detail ?? null
      };
    },
    []
  );

  const syncMenuAfterCliChange = useCallback(
    async (key: CliKey, detected: boolean) => {
      const payload = buildConfigWithCliDetected(configRef.current, key, detected);
      setConfig(payload);

      const syncResult = await applyMenuConfigWithFallback(payload, detected ? "install" : "uninstall");
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
    [applyMenuConfigWithFallback, buildConfigWithCliDetected, refreshInitialState]
  );

  const startInstallRecheck = useCallback(
    (key: CliKey, expectedDetected: boolean) => {
      stopInstallPolling();
      installPollExpectedRef.current = expectedDetected;
      setInstallingKey(key);
      const startedAt = Date.now();

      installPollTimerRef.current = window.setInterval(() => {
        void (async () => {
          try {
            const next = await detectClis();
            setStatuses(next);

            if (next[key] === expectedDetected) {
              stopInstallPolling();
              setWorking(true);
              try {
                await syncMenuAfterCliChange(key, expectedDetected);
              } finally {
                setWorking(false);
              }
              return;
            }

            if (Date.now() - startedAt >= INSTALL_RECHECK_TIMEOUT_MS) {
              stopInstallPolling();
              const actionLabel = expectedDetected ? "安装" : "卸载";
              setLastResult({
                ok: false,
                code: expectedDetected ? "install_detect_timeout" : "uninstall_detect_timeout",
                message: `${CLI_DEFAULT_TITLES[key]} ${actionLabel}后复检超时`,
                detail: `请确认${actionLabel}命令是否已完成，并手动点击“刷新 CLI 检测”。`
              });
            }
          } catch (error) {
            stopInstallPolling();
            setLastResult({
              ok: false,
              code: expectedDetected ? "install_detect_failed" : "uninstall_detect_failed",
              message: `${expectedDetected ? "安装" : "卸载"}后复检失败`,
              detail: String(error)
            });
          }
        })();
      }, INSTALL_RECHECK_INTERVAL_MS);
    },
    [stopInstallPolling, syncMenuAfterCliChange]
  );

  const onEnsureInstall = useCallback(async () => {
    setWorking(true);
    try {
      const result = await ensureNilesoftInstalled();
      if (result.needs_elevation) {
        setInstall((prev) => ({
          ...prev,
          ...result,
          registered: false,
          needs_elevation: true
        }));
        const lower = result.message.toLowerCase();
        const adminMissing =
          lower.includes("missing administrative privileges") ||
          lower.includes("administrator") ||
          result.message.includes("管理员");
        setLastResult({
          ok: false,
          code: "register_admin_required",
          message: adminMissing ? "缺少管理员权限，需提权注册" : "Nilesoft 尚未完成注册",
          detail: `${result.message}\n请点击“提权重试注册”。`
        });
        return;
      }

      setInstall(result);
      await refreshInitialState();
      setLastResult({
        ok: true,
        code: "ensure_install_ok",
        message: "Nilesoft 安装/修复完成",
        detail: result.message
      });
    } catch (error) {
      setLastResult({
        ok: false,
        code: "ensure_install_failed",
        message: "安装失败",
        detail: String(error)
      });
    } finally {
      setWorking(false);
    }
  }, [refreshInitialState]);

  const onRetryElevation = useCallback(async () => {
    setWorking(true);
    try {
      const elevated = await requestElevationAndRegister();
      setLastResult(elevated);
      if (!elevated.ok) {
        const recheck = await ensureNilesoftInstalled();
        setInstall((prev) => ({
          ...prev,
          ...recheck,
          registered: false,
          needs_elevation: true
        }));
        return;
      }

      const state = await refreshInitialState();
      if (!state.install_status.registered || state.install_status.needs_elevation) {
        setInstall((prev) => ({
          ...prev,
          ...state.install_status,
          registered: false,
          needs_elevation: true
        }));
        setLastResult({
          ok: false,
          code: "register_state_inconsistent",
          message: "提权后注册状态仍异常",
          detail: `${state.install_status.message}\n请再次点击“提权重试注册”。`
        });
        return;
      }

      const payload: AppConfig = {
        ...configRef.current,
        cli_order: normalizeCliOrder(configRef.current.cli_order)
      };
      setConfig(payload);

      const syncResult = await applyMenuConfigWithFallback(payload, "register");
      if (!syncResult.ok) {
        setLastResult(syncResult);
        return;
      }

      await refreshInitialState();
      setLastResult({
        ok: true,
        code: "register_menu_synced",
        message: "提权注册成功，右键菜单已同步",
        detail: syncResult.detail ?? null
      });
    } catch (error) {
      setLastResult({
        ok: false,
        code: "register_elevated_failed",
        message: "提权注册失败",
        detail: String(error)
      });
    } finally {
      setWorking(false);
    }
  }, [applyMenuConfigWithFallback, refreshInitialState]);

  const onDetect = useCallback(async () => {
    setWorking(true);
    try {
      const [next, prereq] = await Promise.all([detectClis(), getInstallPrereqStatus()]);
      setStatuses(next);
      setInstallPrereq(prereq);

      if (
        installingKey &&
        installPollExpectedRef.current !== null &&
        next[installingKey] === installPollExpectedRef.current
      ) {
        const detected = installPollExpectedRef.current === true;
        stopInstallPolling();
        await syncMenuAfterCliChange(installingKey, detected);
        return;
      }

      setLastResult({ ok: true, code: "ok", message: "检测完成", detail: null });
    } catch (error) {
      setLastResult({ ok: false, code: "detect_failed", message: "检测失败", detail: String(error) });
    } finally {
      setWorking(false);
    }
  }, [installingKey, stopInstallPolling, syncMenuAfterCliChange]);

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

  const onLaunchInstall = useCallback(
    async (key: CliKey) => {
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

      const precheckLines = [
        `Node.js: ${installPrereq.node ? "✅" : "❌"}`,
        `npm: ${installPrereq.npm ? "✅" : "❌"}`,
        `pwsh: ${installPrereq.pwsh ? "✅" : "❌"}`,
        `winget: ${installPrereq.winget ? "✅" : "❌"}`,
        `WSL: ${installPrereq.wsl ? "✅" : "❌"}`
      ];

      const firstConfirm = window.confirm(
        [
          `将启动 ${hint.display_name} 安装。`,
          `\n命令:\n${hint.install_command}`,
          `\n来源域名: ${hint.official_domain}`,
          `发行方: ${hint.publisher}`,
          `\n前置检查:\n${precheckLines.join("\n")}`,
          "\n命令会在内置终端执行，继续吗？"
        ].join("\n")
      );

      if (!firstConfirm) {
        setLastResult({
          ok: false,
          code: "install_cancelled",
          message: "已取消仅执行安装",
          detail: null
        });
        return;
      }

      if (hint.risk_remote_script) {
        const secondConfirm = window.confirm(
          [
            "该安装命令包含远程脚本执行（例如 irm|iex / curl|bash）。",
            "请确认你信任来源后再继续。",
            "\n是否继续执行高风险安装命令？"
          ].join("\n")
        );
        if (!secondConfirm) {
          setLastResult({
            ok: false,
            code: "install_cancelled",
            message: "已取消仅执行安装",
            detail: "远程脚本二次确认未通过。"
          });
          return;
        }
      }

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
        const result = await terminalRunScript(hint.install_command);
        setLastResult(result);
        if (result.ok) {
          startInstallRecheck(key, true);
        }
      } catch (error) {
        setLastResult({
          ok: false,
          code: "install_launch_failed",
          message: "启动仅执行安装失败",
          detail: String(error)
        });
      } finally {
        setWorking(false);
      }
    },
    [installHints, installPrereq, startInstallRecheck]
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

      const accepted = window.confirm(
        [
          `将启动 ${displayName} 卸载。`,
          `\n命令:\n${uninstallCommand}`,
          "\n命令会在内置终端执行，继续吗？"
        ].join("\n")
      );

      if (!accepted) {
        setLastResult({
          ok: false,
          code: "uninstall_cancelled",
          message: "已取消卸载",
          detail: null
        });
        return;
      }

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
        const result = await terminalRunScript(uninstallCommand);
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
    [installHints, startInstallRecheck]
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

      setFocusedCliKey(key);
      setQuickSetup({
        key,
        phase: "precheck",
        running: true,
        message: "正在准备快速安装向导...",
        detail: null
      });

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
        setQuickPhase("precheck", "检查安装前置环境...");
        const prereq = await getInstallPrereqStatus();
        setInstallPrereq(prereq);

        if (hint.requires_node && (!prereq.node || !prereq.npm)) {
          const openNode = window.confirm(
            `${hint.display_name} 依赖 Node.js/npm。是否先打开 Node.js 下载页面？`
          );
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

        if (hint.risk_remote_script) {
          const acceptedRisk = window.confirm(
            [
              `将通过内置终端执行 ${hint.display_name} 安装命令：`,
              `\n${hint.install_command}`,
              "\n该命令包含远程脚本执行，是否继续？"
            ].join("\n")
          );
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

        setQuickPhase("install", "正在执行安装命令...");
        const installScriptResult = await terminalRunScript(hint.install_command);
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
          detail: hint.install_command
        });

        setQuickPhase("detect", "等待安装检测结果...");
        const startedAt = Date.now();
        let detected = false;
        while (Date.now() - startedAt < QUICK_SETUP_DETECT_TIMEOUT_MS) {
          const verify = await runCliVerify(key);
          if (verify.ok) {
            detected = true;
            break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, INSTALL_RECHECK_INTERVAL_MS));
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
          const authResult = await terminalRunScript(hint.auth_command);
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
          const authDone = window.confirm("完成浏览器授权后点击“确定”继续。");
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

        const syncResult = await applyMenuConfigWithFallback(payload, "install");
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
        setQuickSetup({
          key,
          phase: "done",
          running: false,
          message: `${hint.display_name} 快速安装向导完成。`,
          detail: "如在 Windows 11 现代菜单未显示，可先按 Shift+F10 查看经典菜单。"
        });
        setLastResult({
          ok: true,
          code: "quick_setup_done",
          message: `${hint.display_name} 快速安装向导完成`,
          detail: syncResult.detail ?? null
        });
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
      applyMenuConfigWithFallback,
      buildConfigWithCliDetected,
      installHints,
      refreshInitialState,
      runAction,
      setQuickPhase
    ]
  );

  const ensureReady = useCallback(
    (action: string) => {
      if (!install.installed) {
        setLastResult({
          ok: false,
          code: "install_required",
          message: `${action}失败`,
          detail: "未安装 Nilesoft，请先执行“安装/修复 Nilesoft”。"
        });
        return false;
      }
      if (!install.registered) {
        setLastResult({
          ok: false,
          code: "register_required",
          message: `${action}失败`,
          detail: "Nilesoft 尚未完成注册，请先点击“提权重试注册”。"
        });
        return false;
      }
      if (install.needs_elevation) {
        setLastResult({
          ok: false,
          code: "register_admin_required",
          message: `${action}失败`,
          detail: "当前注册状态需要管理员权限，请先点击“提权重试注册”。"
        });
        return false;
      }
      return true;
    },
    [install.installed, install.needs_elevation, install.registered]
  );

  const onApply = useCallback(async () => {
    if (!ensureReady("应用配置")) {
      return;
    }
    const payload: AppConfig = {
      ...config,
      cli_order: normalizeCliOrder(config.cli_order)
    };
    const applyResult = await runAction(() => applyConfig(payload));
    if (!applyResult.ok) {
      return;
    }

    const activateResult = await runAction(activateNow);
    if (!activateResult.ok) {
      return;
    }

    await refreshInitialState();
  }, [config, ensureReady, refreshInitialState, runAction]);

  const onAttemptUnregister = useCallback(async () => {
    await runAction(attemptUnregisterNilesoft);
    await refreshInitialState();
  }, [refreshInitialState, runAction]);

  const onCleanupData = useCallback(async () => {
    const first = await runAction(() => cleanupAppData());
    if (first.code !== "cleanup_confirm_required") {
      if (first.ok) {
        await refreshInitialState();
      }
      return;
    }

    const accepted = window.confirm(
      "将清理 %LOCALAPPDATA%/execlink/ 下的配置、日志与 Nilesoft 目录。此操作不可撤销，是否继续？"
    );
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
  }, [refreshInitialState, runAction]);

  const onRepairMenuFallback = useCallback(async () => {
    const payload: AppConfig = {
      ...config,
      cli_order: normalizeCliOrder(config.cli_order)
    };
    const result = await runAction(() => repairContextMenuHkcu(payload));
    if (!result.ok) {
      return;
    }
    await runAction(refreshExplorer);
  }, [config, runAction]);

  const onRemoveMenuFallback = useCallback(async () => {
    const accepted = window.confirm(`将删除 HKCU 下“${config.menu_title}”兜底菜单，是否继续？`);
    if (!accepted) {
      return;
    }
    const result = await runAction(() => removeContextMenuHkcu(config.menu_title));
    if (!result.ok) {
      return;
    }
    await runAction(refreshExplorer);
  }, [config.menu_title, runAction]);

  const refreshHkcuGroups = useCallback(async (silent = false) => {
    if (!silent) {
      setLoadingHkcuGroups(true);
    }
    try {
      const groups = await listContextMenuGroupsHkcu();
      setHkcuGroups(groups);
      setSelectedHkcuGroupKeys((prev) => prev.filter((key) => groups.some((group) => group.key === key)));
      if (!silent) {
        setLastResult({
          ok: true,
          code: "menu_groups_scanned",
          message: groups.length ? `检测到 ${groups.length} 个历史分组` : "未检测到可清理的历史分组",
          detail: groups.length
            ? groups.map((group) => `${group.title} [${group.key}]`).join("；")
            : null
        });
      }
    } catch (error) {
      if (!silent) {
        setLastResult({
          ok: false,
          code: "menu_groups_scan_failed",
          message: "检测历史分组失败",
          detail: String(error)
        });
      }
    } finally {
      if (!silent) {
        setLoadingHkcuGroups(false);
      }
    }
  }, []);

  const onToggleHkcuGroupSelection = useCallback((key: string, checked: boolean) => {
    setSelectedHkcuGroupKeys((prev) => {
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
    if (selectedHkcuGroupKeys.length === 0) {
      setLastResult({
        ok: false,
        code: "menu_groups_empty_selection",
        message: "请先选择要删除的分组",
        detail: null
      });
      return;
    }

    const selectedGroups = hkcuGroups.filter((group) => selectedHkcuGroupKeys.includes(group.key));
    const accepted = window.confirm(
      `将删除以下 HKCU 历史分组：\n${selectedGroups.map((group) => `- ${group.title} [${group.key}]`).join("\n")}\n\n是否继续？`
    );
    if (!accepted) {
      return;
    }

    setWorking(true);
    try {
      for (const key of selectedHkcuGroupKeys) {
        const result = await removeContextMenuHkcu(key);
        if (!result.ok) {
          setLastResult({
            ...result,
            message: `删除分组失败：${key}`
          });
          return;
        }
      }

      const refreshResult = await refreshExplorer();
      if (!refreshResult.ok) {
        setLastResult(refreshResult);
        return;
      }

      await refreshHkcuGroups(true);
      setSelectedHkcuGroupKeys([]);
      setLastResult({
        ok: true,
        code: "menu_groups_removed",
        message: `已删除 ${selectedHkcuGroupKeys.length} 个历史分组`,
        detail: selectedGroups.map((group) => `${group.title} [${group.key}]`).join("；")
      });
    } catch (error) {
      setLastResult({
        ok: false,
        code: "menu_groups_remove_failed",
        message: "删除历史分组失败",
        detail: String(error)
      });
    } finally {
      setWorking(false);
    }
  }, [hkcuGroups, refreshHkcuGroups, selectedHkcuGroupKeys]);

  const onCloseQuickSetup = useCallback(() => {
    setQuickSetup(EMPTY_QUICK_SETUP);
  }, []);

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
    const result = await terminalCloseSession();
    setLastResult(result);
    setTerminalState("idle");
    setFocusedCliKey(null);
  }, [stopInstallPolling]);

  const orderedCliKeys = useMemo(() => normalizeCliOrder(config.cli_order), [config.cli_order]);
  const canOperate = install.installed && install.registered && !install.needs_elevation;

  const aboutInfoText = useMemo(
    () =>
      [
        "app_name=ExecLink",
        `version=${APP_VERSION}`,
        `publisher=${APP_PUBLISHER}`,
        `identifier=${APP_IDENTIFIER}`,
        "data_root=%LOCALAPPDATA%/execlink/",
        "config_file=%LOCALAPPDATA%/execlink/config.json",
        "nilesoft_root=%LOCALAPPDATA%/execlink/nilesoft-shell/",
        "log_root=%LOCALAPPDATA%/execlink/logs/"
      ].join("\n"),
    []
  );

  const onCopyAboutInfo = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(aboutInfoText);
      setLastResult({
        ok: true,
        code: "ok",
        message: "关于信息已复制到剪贴板",
        detail: null
      });
    } catch (error) {
      setLastResult({
        ok: false,
        code: "clipboard_failed",
        message: "复制关于信息失败",
        detail: String(error)
      });
    }
  }, [aboutInfoText]);

  useEffect(() => {
    void refreshHkcuGroups(true);
  }, [refreshHkcuGroups]);

  useEffect(() => {
    if (!lastResult) {
      return;
    }

    toastAddRef.current({
      type: lastResult.ok ? "success" : "error",
      priority: lastResult.ok ? "low" : "high",
      timeout: lastResult.ok ? 2600 : 4500,
      title: lastResult.message,
      description: (
        <div className="grid gap-1">
          <span className="font-mono text-[11px] text-[var(--ui-muted)]">[{lastResult.code}]</span>
          {lastResult.detail ? (
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
    <main className="mx-auto min-h-screen max-w-[1120px] px-3 py-3 text-[var(--ui-text)] max-[540px]:px-2.5 max-[540px]:py-2.5">
      <div className={`rounded-[3rem] bg-[var(--ui-env)] p-3 ${OUTSET_LARGE} max-[540px]:rounded-[2.1rem] max-[540px]:p-2`}>
        <div className={`rounded-[2.75rem] border border-[#e3dacd] bg-[var(--ui-base)] p-6 max-[540px]:rounded-[2rem] max-[540px]:p-3.5`}>
        <header className={`mb-5 flex items-center justify-between gap-4 rounded-[2rem] border border-[#ddd5c9] bg-[var(--ui-base)] p-4 ${OUTSET_SMALL} max-[540px]:mb-4 max-[540px]:flex-col max-[540px]:items-stretch max-[540px]:rounded-[1.5rem]`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className={`relative inline-flex w-[150px] flex-none items-center gap-3 rounded-2xl border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-2 ${OUTSET_SMALL} max-[540px]:w-[212px]`}>
              <span className="absolute inset-1 rounded-full bg-green-700/20 blur-md" />
              <img
                className="relative block h-10 w-[132px] object-contain max-[540px]:w-[112px]"
                src={appLogo}
                alt="ExecLink logo"
              />
              <h1
                className="group relative m-0 inline-flex cursor-default items-center rounded-xl px-2 py-1 leading-[1.1] outline-none focus-visible:ring-2 focus-visible:ring-[#8f8072]/45"
                tabIndex={0}
              >
                <span className="text-[#4b443e]">Exec</span>
                <span className="text-green-600">Link</span>
                <span className={`pointer-events-none absolute top-[calc(100%+8px)] left-0 z-10 translate-y-0.5 whitespace-nowrap rounded-full bg-[var(--ui-base)] px-2.5 py-[5px] text-[11px] text-[var(--ui-muted)] opacity-0 transition-[opacity,transform] duration-150 ${OUTSET_SMALL} group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100`}>
                  Windows 11 右键菜单 AI CLI 快捷入口
                </span>
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2.5 max-[540px]:w-full max-[540px]:justify-start">
            <button className={PRIMARY_BUTTON_CLASS} onClick={onDetect} disabled={working || loading}>
              刷新 CLI 检测
            </button>
            <button className={PRIMARY_BUTTON_CLASS} onClick={onApply} disabled={working || loading || !canOperate}>
              应用配置
            </button>
          </div>
        </header>

        <Tabs.Root defaultValue="cli" className="grid gap-4">
          <Tabs.List
            className={`inline-flex w-max max-w-full items-center gap-1 overflow-x-auto rounded-full border border-[#ddd5c9] bg-[var(--ui-base)] p-1.5 ${INSET_SMALL}`}
            aria-label="主分组"
          >
            {TABS.map((tab) => (
              <Tabs.Tab key={tab.key} value={tab.key} className={TAB_CLASS}>
                {tab.title}
              </Tabs.Tab>
            ))}
            <Tabs.Indicator className="hidden" />
          </Tabs.List>

          <Tabs.Panel value="cli" className="p-0">
            <div className={PANEL_CONTENT_CLASS}>
              {quickSetup.key ? (
                <QuickSetupWizard
                  status={quickSetup}
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
                installPrereq={installPrereq}
                loading={loading}
                working={working}
                installingKey={installingKey}
                focusedCliKey={focusedCliKey}
                terminalState={terminalState}
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
              <section className={PANEL_BLOCK_CLASS}>
                <label className={FIELD_CLASS}>
                  <span className={FIELD_LABEL_CLASS}>右键菜单分组名称</span>
                  <input
                    className={INPUT_CLASS}
                    value={config.menu_title}
                    onChange={(event) =>
                      setConfig((prev) => ({
                        ...prev,
                        menu_title: event.target.value
                      }))
                    }
                    placeholder="例如：我的助手们"
                  />
                </label>
                <ToggleRow
                  title="启用右键菜单"
                  checked={config.enable_context_menu}
                  onChange={(checked) => setConfig((prev) => ({ ...prev, enable_context_menu: checked }))}
                  description="关闭后仅保留配置文件，不显示 AI 菜单项"
                />
                <ToggleRow
                  title="显示 Nilesoft 默认菜单"
                  checked={config.show_nilesoft_default_menus}
                  onChange={(checked) =>
                    setConfig((prev) => ({ ...prev, show_nilesoft_default_menus: checked }))
                  }
                  description="关闭时仅保留本应用生成的 AI 菜单"
                />
                <ToggleRow
                  title="PowerShell 使用 -NoExit"
                  checked={config.no_exit}
                  onChange={(checked) => setConfig((prev) => ({ ...prev, no_exit: checked }))}
                  description="关闭后终端执行命令后可自动退出"
                />
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
                <details className={`rounded-[1.25rem] border border-[#ddd5c9] bg-[var(--ui-base)] p-3 ${OUTSET_SMALL}`}>
                  <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--ui-text)]">
                    高级模式（默认不影响右键主题）
                  </summary>
                  <div className="mt-3 grid gap-3">
                    <ToggleRow
                      title="启用高级右键模式"
                      checked={config.advanced_menu_mode}
                      onChange={(checked) => setConfig((prev) => ({ ...prev, advanced_menu_mode: checked }))}
                      description="关闭时右键菜单强制走极简命令；主题仅用于安装终端。"
                    />
                    <ToggleRow
                      title="右键菜单启用主题注入"
                      checked={config.menu_theme_enabled}
                      onChange={(checked) => setConfig((prev) => ({ ...prev, menu_theme_enabled: checked }))}
                      disabled={!config.advanced_menu_mode}
                      description="仅在“高级右键模式”开启后生效。"
                    />
                    <label className={FIELD_CLASS}>
                      <span className={FIELD_LABEL_CLASS}>终端主题（VS Code 映射）</span>
                      <span className="relative block">
                        <select
                          className={SELECT_CLASS}
                          value={config.terminal_theme_id}
                          onChange={(event) =>
                            setConfig((prev) => ({
                              ...prev,
                              terminal_theme_id: event.target.value
                            }))
                          }
                        >
                          {TERMINAL_THEME_OPTIONS.map((theme) => (
                            <option key={theme.id} value={theme.id}>
                              {theme.name}
                            </option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[var(--ui-light)]">
                          v
                        </span>
                      </span>
                    </label>
                    <label className={FIELD_CLASS}>
                      <span className={FIELD_LABEL_CLASS}>主题模式</span>
                      <span className="relative block">
                        <select
                          className={SELECT_CLASS}
                          value={config.terminal_theme_mode}
                          onChange={(event) =>
                            setConfig((prev) => ({
                              ...prev,
                              terminal_theme_mode: event.target.value as AppConfig["terminal_theme_mode"]
                            }))
                          }
                        >
                          <option value="auto">Auto（优先当前主题）</option>
                          <option value="dark">Dark</option>
                          <option value="light">Light</option>
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[var(--ui-light)]">
                          v
                        </span>
                      </span>
                    </label>
                    <label className={FIELD_CLASS}>
                      <span className={FIELD_LABEL_CLASS}>PowerShell 提示符风格</span>
                      <span className="relative block">
                        <select
                          className={SELECT_CLASS}
                          value={config.ps_prompt_style}
                          onChange={(event) =>
                            setConfig((prev) => ({
                              ...prev,
                              ps_prompt_style: event.target.value as AppConfig["ps_prompt_style"]
                            }))
                          }
                        >
                          <option value="basic">基础彩色提示符</option>
                          <option value="none">不改提示符</option>
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[var(--ui-light)]">
                          v
                        </span>
                      </span>
                    </label>
                  </div>
                </details>
              </section>
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="runtime" className="p-0">
            <div className={PANEL_CONTENT_CLASS}>
              <section className={PANEL_BLOCK_CLASS}>
                <h2 className={PANEL_TITLE_CLASS}>Nilesoft 安装状态</h2>
                <p className="text-sm text-[var(--ui-muted)]">{install.message}</p>
                <p>
                  已安装: <strong>{install.installed ? "是" : "否"}</strong>
                </p>
                <p>
                  已注册: <strong>{install.registered && !install.needs_elevation ? "是" : "否"}</strong>
                </p>
                <p>
                  Shell 路径: <code>{install.shell_exe ?? "未检测到"}</code>
                </p>
                <p>
                  配置根: <code>{install.config_root ?? "未解析"}</code>
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <button className={PRIMARY_BUTTON_CLASS} onClick={onEnsureInstall} disabled={working || loading}>
                    安装/修复 Nilesoft
                  </button>
                  {install.installed && (!install.registered || install.needs_elevation) ? (
                    <button className={SECONDARY_BUTTON_CLASS} onClick={onRetryElevation} disabled={working || loading}>
                      提权重试注册
                    </button>
                  ) : null}
                </div>
              </section>

              <section className={PANEL_BLOCK_CLASS}>
                <h2 className={PANEL_TITLE_CLASS}>恢复与清理</h2>
                <p className="text-sm text-[var(--ui-muted)]">
                  用于卸载或异常恢复。建议先尝试反注册，再按需清理
                  <code>%LOCALAPPDATA%/execlink/</code> 数据目录。
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <button className={SECONDARY_BUTTON_CLASS} onClick={onAttemptUnregister} disabled={working || loading}>
                    尝试反注册 Nilesoft
                  </button>
                  <button className={SECONDARY_BUTTON_CLASS} onClick={onRepairMenuFallback} disabled={working || loading}>
                    HKCU 一键修复菜单
                  </button>
                  <button className={SECONDARY_BUTTON_CLASS} onClick={onRemoveMenuFallback} disabled={working || loading}>
                    移除 HKCU 兜底菜单
                  </button>
                  <button className={DANGER_BUTTON_CLASS} onClick={onCleanupData} disabled={working || loading}>
                    清理应用数据
                  </button>
                </div>
                <div className={`grid gap-2 rounded-[1.1rem] border border-[#ddd5c9] bg-[var(--ui-base)] p-3 ${OUTSET_SMALL}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--ui-text)]">历史 HKCU 分组清理</span>
                    <button
                      className={SECONDARY_BUTTON_CLASS}
                      onClick={() => void refreshHkcuGroups(false)}
                      disabled={working || loading || loadingHkcuGroups}
                    >
                      {loadingHkcuGroups ? "检测中..." : "检测历史分组"}
                    </button>
                    <button
                      className={DANGER_BUTTON_CLASS}
                      onClick={onDeleteSelectedHkcuGroups}
                      disabled={working || loading || selectedHkcuGroupKeys.length === 0}
                    >
                      删除选中分组
                    </button>
                  </div>
                  {hkcuGroups.length === 0 ? (
                    <p className="text-xs text-[var(--ui-muted)]">未检测到可清理的历史分组。</p>
                  ) : (
                    <div className="grid gap-1.5">
                      {hkcuGroups.map((group) => {
                        const checked = selectedHkcuGroupKeys.includes(group.key);
                        return (
                          <label
                            key={group.key}
                            className={`flex items-start gap-2 rounded-xl border border-[#ddd5c9] bg-[var(--ui-base)] px-2.5 py-2 text-xs ${OUTSET_SMALL}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => onToggleHkcuGroupSelection(group.key, event.target.checked)}
                              disabled={working || loading}
                              className="mt-0.5"
                            />
                            <span className="grid gap-0.5">
                              <span className="font-semibold text-[var(--ui-text)]">
                                {group.title} <span className="font-mono text-[11px] text-[var(--ui-muted)]">[{group.key}]</span>
                              </span>
                              <span className="text-[11px] text-[var(--ui-muted)]">
                                出现位置：{group.roots.join(" | ")}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              {!canOperate ? (
                <section className={`grid gap-2 rounded-[1.25rem] border border-[#ddcfc2] bg-[#ecddd8] p-3 ${INSET_SMALL}`}>
                  <h2 className={PANEL_TITLE_CLASS}>操作前置条件</h2>
                  <p className="text-sm text-[#7d473e]">
                    当前状态未满足“已安装 + 已注册”，已阻止“应用配置（自动生效）”。
                  </p>
                  <p className="text-sm text-[#7d473e]">
                    请先点击“安装/修复 Nilesoft”，如提示失败再点击“提权重试注册”。
                  </p>
                </section>
              ) : null}
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="about" className="p-0">
            <div className={PANEL_CONTENT_CLASS}>
              <section className={PANEL_BLOCK_CLASS}>
                <h2 className={PANEL_TITLE_CLASS}>关于我</h2>
                <p className="text-sm text-[var(--ui-muted)]">
                  ExecLink 用于在 Windows 11 右键菜单中快速启动常用 AI CLI 工具。
                </p>
                <p>
                  发布方：<code>{APP_PUBLISHER}</code>
                </p>
                <p>
                  应用标识：<code>{APP_IDENTIFIER}</code>
                </p>
                <p>
                  应用版本：<code>{APP_VERSION}</code>
                </p>
                <p>
                  数据目录：<code>%LOCALAPPDATA%/execlink/</code>
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <button className={SECONDARY_BUTTON_CLASS} onClick={onCopyAboutInfo} disabled={working || loading}>
                    复制关于信息
                  </button>
                </div>
              </section>
            </div>
          </Tabs.Panel>
        </Tabs.Root>
      </div>

      <Toast.Portal>
        <Toast.Viewport className="pointer-events-none fixed right-3.5 bottom-3.5 z-[1200] grid w-[min(380px,calc(100vw-28px))] gap-2">
          {toastManager.toasts.map((toast) => (
            <Toast.Root key={toast.id} toast={toast} className={TOAST_ROOT_CLASS}>
              <Toast.Content className="grid min-w-0 gap-1">
                <Toast.Title className={TOAST_TITLE_CLASS} />
                <Toast.Description className={TOAST_DESCRIPTION_CLASS} />
              </Toast.Content>
              <Toast.Close
                className={`rounded-xl border border-[#ddd5c9] bg-[var(--ui-base)] px-1.5 py-0.5 text-[15px] leading-none text-[var(--ui-muted)] outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[var(--ui-text)] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_2px_2px_5px_#d5d0c4,inset_-2px_-2px_5px_#ffffff] ${OUTSET_SMALL}`}
                aria-label="关闭通知"
              >
                ×
              </Toast.Close>
            </Toast.Root>
          ))}
        </Toast.Viewport>
      </Toast.Portal>
      </div>
    </main>
  );
}







