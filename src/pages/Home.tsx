import { Tabs, Toast } from "@base-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  launchCliInstall,
  openNodejsDownloadPage,
  openInstallDocs,
  requestElevationAndRegister
} from "../api/tauri";
import { CliConfigTable } from "../components/CliConfigTable";
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
  type InstallPrereqStatus,
  type InstallStatus
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
  const installPollTimerRef = useRef<number | null>(null);
  const toastManager = Toast.useToastManager();
  const toastAddRef = useRef(toastManager.add);
  toastAddRef.current = toastManager.add;

  const stopInstallPolling = useCallback(() => {
    if (installPollTimerRef.current !== null) {
      window.clearInterval(installPollTimerRef.current);
      installPollTimerRef.current = null;
    }
    setInstallingKey(null);
  }, []);

  useEffect(() => {
    return () => {
      if (installPollTimerRef.current !== null) {
        window.clearInterval(installPollTimerRef.current);
      }
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

  const maybePromptElevation = useCallback(
    async (message: string) => {
      const accepted = window.confirm(message);
      if (!accepted) {
        return;
      }
      const elevated = await requestElevationAndRegister();
      setLastResult(elevated);
      if (elevated.ok) {
        await refreshInitialState();
      }
    },
    [refreshInitialState]
  );

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
            await maybePromptElevation("首次初始化需要管理员权限完成注册，是否立即提权重试？");
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
  }, [maybePromptElevation, refreshInitialState]);

  const setToggle = useCallback((key: CliKey, checked: boolean) => {
    setConfig((prev) => ({
      ...prev,
      toggles: {
        ...prev.toggles,
        [key]: checked
      }
    }));
  }, []);

  useEffect(() => {
    setConfig((prev) => {
      const nextToggles = {
        ...prev.toggles,
        claude: prev.toggles.claude && statuses.claude,
        codex: prev.toggles.codex && statuses.codex,
        gemini: prev.toggles.gemini && statuses.gemini,
        kimi: prev.toggles.kimi && statuses.kimi,
        kimi_web: prev.toggles.kimi_web && statuses.kimi_web,
        qwencode: prev.toggles.qwencode && statuses.qwencode,
        opencode: prev.toggles.opencode && statuses.opencode
      };

      const changed = CLI_DEFAULT_ORDER.some((key) => nextToggles[key] !== prev.toggles[key]);
      if (!changed) {
        return prev;
      }

      return {
        ...prev,
        toggles: nextToggles
      };
    });
  }, [statuses]);

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

  const startInstallRecheck = useCallback(
    (key: CliKey) => {
      stopInstallPolling();
      setInstallingKey(key);
      const startedAt = Date.now();

      installPollTimerRef.current = window.setInterval(() => {
        void (async () => {
          try {
            const next = await detectClis();
            setStatuses(next);

            if (next[key]) {
              stopInstallPolling();
              setLastResult({
                ok: true,
                code: "install_detected",
                message: `${CLI_DEFAULT_TITLES[key]} 已检测到，可正常启用。`,
                detail: null
              });
              return;
            }

            if (Date.now() - startedAt >= INSTALL_RECHECK_TIMEOUT_MS) {
              stopInstallPolling();
              setLastResult({
                ok: false,
                code: "install_detect_timeout",
                message: `${CLI_DEFAULT_TITLES[key]} 安装后复检超时`,
                detail: "请确认安装终端是否已完成，并手动点击“刷新 CLI 检测”。"
              });
            }
          } catch (error) {
            stopInstallPolling();
            setLastResult({
              ok: false,
              code: "install_detect_failed",
              message: "安装后复检失败",
              detail: String(error)
            });
          }
        })();
      }, INSTALL_RECHECK_INTERVAL_MS);
    },
    [stopInstallPolling]
  );

  const onEnsureInstall = useCallback(async () => {
    setWorking(true);
    try {
      const result = await ensureNilesoftInstalled();
      setInstall(result);
      if (result.needs_elevation) {
        const accepted = window.confirm("注册 Nilesoft 需要管理员权限，是否立即提权重试？");
        if (accepted) {
          const elevated = await requestElevationAndRegister();
          setLastResult(elevated);
          if (elevated.ok) {
            await refreshInitialState();
          }
        }
      }
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
    await runAction(requestElevationAndRegister);
    await refreshInitialState();
  }, [refreshInitialState, runAction]);

  const onDetect = useCallback(async () => {
    setWorking(true);
    try {
      const [next, prereq] = await Promise.all([detectClis(), getInstallPrereqStatus()]);
      setStatuses(next);
      setInstallPrereq(prereq);

      if (installingKey && next[installingKey]) {
        stopInstallPolling();
        setLastResult({
          ok: true,
          code: "install_detected",
          message: `${CLI_DEFAULT_TITLES[installingKey]} 已检测到，可正常启用。`,
          detail: null
        });
      } else {
        setLastResult({ ok: true, code: "ok", message: "检测完成", detail: null });
      }
    } catch (error) {
      setLastResult({ ok: false, code: "detect_failed", message: "检测失败", detail: String(error) });
    } finally {
      setWorking(false);
    }
  }, [installingKey, stopInstallPolling]);

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
          detail: `未配置 ${key} 的一键安装信息。`
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
          "\n命令会在外部终端可见执行，继续吗？"
        ].join("\n")
      );

      if (!firstConfirm) {
        setLastResult({
          ok: false,
          code: "install_cancelled",
          message: "已取消一键安装",
          detail: null
        });
        return;
      }

      let confirmedRemoteScript = false;
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
            message: "已取消一键安装",
            detail: "远程脚本二次确认未通过。"
          });
          return;
        }
        confirmedRemoteScript = true;
      }

      setWorking(true);
      try {
        const result = await launchCliInstall({
          key,
          confirmed_remote_script: confirmedRemoteScript
        });
        setLastResult(result);
        if (result.ok) {
          startInstallRecheck(key);
        }
      } catch (error) {
        setLastResult({
          ok: false,
          code: "install_launch_failed",
          message: "启动一键安装失败",
          detail: String(error)
        });
      } finally {
        setWorking(false);
      }
    },
    [installHints, installPrereq, startInstallRecheck]
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
      return true;
    },
    [install.installed, install.registered]
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

  const orderedCliKeys = useMemo(() => normalizeCliOrder(config.cli_order), [config.cli_order]);
  const canOperate = install.installed && install.registered;

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
    if (!lastResult) {
      return;
    }

    toastAddRef.current({
      type: lastResult.ok ? "success" : "error",
      priority: lastResult.ok ? "low" : "high",
      timeout: lastResult.ok ? 2600 : 4500,
      title: lastResult.message,
      description: (
        <div className="toast-description-body">
          <span className="toast-code">[{lastResult.code}]</span>
          {lastResult.detail ? (
            <details className="toast-details">
              <summary>详情</summary>
              <pre>{lastResult.detail}</pre>
            </details>
          ) : null}
        </div>
      )
    });
  }, [lastResult]);

  return (
    <main className="container">
      <header className="page-header">
        <div className="brand-block">
          <img className="brand-logo" src={appLogo} alt="ExecLink logo" />
          <div className="brand-title-wrap">
            <h1 className="brand-title" tabIndex={0}>
              <span className="brand-title-exec">Exec</span>
              <span className="brand-title-link">Link</span>
              <span className="brand-title-tooltip">Windows 11 右键菜单 AI CLI 快捷入口</span>
            </h1>
          </div>
        </div>
        <div className="header-actions">
          <button onClick={onDetect} disabled={working || loading}>
            刷新 CLI 检测
          </button>
          <button onClick={onApply} disabled={working || loading || !canOperate}>
            应用配置
          </button>
        </div>
      </header>

      <Tabs.Root defaultValue="cli" className="tabs-root">
        <Tabs.List className="tabs" aria-label="主分组">
          {TABS.map((tab) => (
            <Tabs.Tab key={tab.key} value={tab.key} className="tab">
              {tab.title}
            </Tabs.Tab>
          ))}
          <Tabs.Indicator className="tabs-indicator" />
        </Tabs.List>

        <Tabs.Panel value="cli" className="tab-panel">
          <div className="panel-content">
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
            />
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="menu" className="tab-panel">
          <div className="panel-content">
            <h2>菜单与行为设置</h2>
            <label className="field">
              <span className="field-label">右键菜单分组名称</span>
              <input
                className="text-input"
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
            <label className="field">
              <span className="field-label">终端运行器</span>
              <select
                className="text-input"
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
            </label>
            <details className="panel-block">
              <summary>高级模式（默认不影响右键主题）</summary>
              <div className="panel-content">
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
                <label className="field">
                  <span className="field-label">终端主题（VS Code 映射）</span>
                  <select
                    className="text-input"
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
                </label>
                <label className="field">
                  <span className="field-label">主题模式</span>
                  <select
                    className="text-input"
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
                </label>
                <label className="field">
                  <span className="field-label">PowerShell 提示符风格</span>
                  <select
                    className="text-input"
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
                </label>
              </div>
            </details>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="runtime" className="tab-panel">
          <div className="panel-content">
            <section className="panel-block">
              <h2>Nilesoft 安装状态</h2>
              <p>{install.message}</p>
              <p>
                已安装: <strong>{install.installed ? "是" : "否"}</strong>
              </p>
              <p>
                已注册: <strong>{install.registered ? "是" : "否"}</strong>
              </p>
              <p>
                Shell 路径: <code>{install.shell_exe ?? "未检测到"}</code>
              </p>
              <p>
                配置根: <code>{install.config_root ?? "未解析"}</code>
              </p>
              <div className="actions">
                <button onClick={onEnsureInstall} disabled={working || loading}>
                  安装/修复 Nilesoft
                </button>
                {install.installed && !install.registered ? (
                  <button onClick={onRetryElevation} disabled={working || loading} className="secondary">
                    提权重试注册
                  </button>
                ) : null}
              </div>
            </section>

            <section className="panel-block">
              <h2>恢复与清理</h2>
              <p>
                用于卸载或异常恢复。建议先尝试反注册，再按需清理
                <code>%LOCALAPPDATA%/execlink/</code> 数据目录。
              </p>
              <div className="actions">
                <button onClick={onAttemptUnregister} disabled={working || loading} className="secondary">
                  尝试反注册 Nilesoft
                </button>
                <button onClick={onCleanupData} disabled={working || loading} className="danger">
                  清理应用数据
                </button>
              </div>
            </section>

            {!canOperate ? (
              <section className="panel-block warning-block">
                <h2>操作前置条件</h2>
                <p>当前状态未满足“已安装 + 已注册”，已阻止“应用配置（自动生效）”。</p>
                <p>请先点击“安装/修复 Nilesoft”，如提示失败再点击“提权重试注册”。</p>
              </section>
            ) : null}
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="about" className="tab-panel">
          <div className="panel-content">
            <h2>关于我</h2>
            <p>ExecLink 用于在 Windows 11 右键菜单中快速启动常用 AI CLI 工具。</p>
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
            <div className="actions">
              <button onClick={onCopyAboutInfo} disabled={working || loading} className="secondary">
                复制关于信息
              </button>
            </div>
          </div>
        </Tabs.Panel>
      </Tabs.Root>

      <Toast.Portal>
        <Toast.Viewport className="toast-viewport">
          {toastManager.toasts.map((toast) => (
            <Toast.Root key={toast.id} toast={toast} className="toast-root">
              <Toast.Content className="toast-content">
                <Toast.Title className="toast-title" />
                <Toast.Description className="toast-description" />
              </Toast.Content>
              <Toast.Close className="toast-close" aria-label="关闭通知">
                ×
              </Toast.Close>
            </Toast.Root>
          ))}
        </Toast.Viewport>
      </Toast.Portal>
    </main>
  );
}





