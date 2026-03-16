import { Switch } from "@base-ui/react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, type ReactNode } from "react";
import {
  CLI_DEFAULT_ORDER,
  CLI_DEFAULT_TITLES,
  FIXED_LAUNCH_MODE_BY_PARENT,
  type CliInstallHint,
  type CliInstallHintMap,
  type InstallCountdownState,
  type CliUserPathStatusMap,
  type CliKey,
  type CliStatusMap,
  type FixedLaunchModeKey,
  type FixedLaunchModesConfig,
  type InstallPrereqStatus
} from "../types/config";
import { TerminalPanel } from "./TerminalPanel";

const OUTSET_LARGE = "shadow-[6px_6px_12px_#d5d0c4,-6px_-6px_12px_#ffffff]";
const OUTSET_SMALL = "shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff]";
const INSET_SMALL = "shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff]";
const BUTTON_BASE_CLASS = `rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] text-[var(--ui-text)] ${OUTSET_SMALL} px-3 py-1.5 text-xs font-medium outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[#6a5e52] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff] disabled:cursor-not-allowed disabled:opacity-60`;
const ICON_BUTTON_CLASS = `inline-flex size-9 items-center justify-center rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] text-[var(--ui-muted)] ${OUTSET_SMALL} outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[#8a4f45] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff] disabled:cursor-not-allowed disabled:opacity-60`;
const ICON_BUTTON_COMPACT_CLASS = `inline-flex size-7 items-center justify-center rounded-[var(--radius-sm)] border border-[#ddd5c9] bg-[var(--ui-base)] text-[var(--ui-muted)] ${OUTSET_SMALL} outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[#8a4f45] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff] disabled:cursor-not-allowed disabled:opacity-60`;
const NODE_DOWNLOAD_COMPACT_BUTTON_CLASS = `${BUTTON_BASE_CLASS} px-2 py-0.5 text-[10px] leading-[1.25]`;
const INLINE_NAME_INPUT_CLASS = `w-[118px] rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] px-2 py-1 text-xs text-[var(--ui-text)] outline-none ${INSET_SMALL} transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#8f8072]/35 disabled:cursor-not-allowed disabled:opacity-60 max-[420px]:w-[84px]`;
const SUBMODE_NAME_INPUT_CLASS = `w-full rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] px-2 py-1.5 text-[11px] text-[var(--ui-text)] outline-none ${INSET_SMALL} transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#8f8072]/35 disabled:cursor-not-allowed disabled:opacity-60`;
const SWITCH_ROOT_CLASS = `group relative inline-flex h-7 w-12 cursor-pointer items-center rounded-full border-0 bg-[var(--ui-base)] p-1 ${OUTSET_SMALL} transition-[box-shadow,background-color,transform] duration-150 before:pointer-events-none before:absolute before:rounded-full before:outline-2 before:outline-offset-2 before:outline-transparent data-[checked]:bg-[#d7cec0] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60 focus-visible:outline-none focus-visible:before:inset-0 focus-visible:before:outline-[#8f8072] active:scale-[0.98] active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff] data-[checked]:active:bg-[#cec2b2]`;
const SWITCH_THUMB_CLASS = `block size-5 rounded-full bg-[var(--ui-base)] ${OUTSET_SMALL} transition-transform duration-150 group-data-[checked]:translate-x-5`;
const DETECTED_ROW_CLASS = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2";
const UNDETECTED_ROW_CLASS = "grid grid-cols-1 items-center";
const HOVER_BUBBLE_BASE_CLASS =
  "pointer-events-none absolute -top-8 translate-y-0.5 whitespace-nowrap rounded-[var(--radius-pill)] bg-[#8f8072] px-2 py-1 text-[10px] text-[#f6f0e7] opacity-0 shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] transition-[opacity,transform] duration-100";
const FIXED_LAUNCH_MODE_COMMAND_LABELS: Record<FixedLaunchModeKey, string> = {
  claude_skip_permissions: "claude --dangerously-skip-permissions",
  gemini_yolo: "gemini --yolo",
  codex_yolo: "codex --yolo"
};

interface IconActionButtonProps {
  label: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  onClick: () => void | Promise<void>;
  children: ReactNode;
}

interface CliCardRow {
  key: CliKey;
  title: string;
  displayName: string;
  enabled: boolean;
  detected: boolean;
  hint?: CliInstallHint;
  fixedLaunchModes: FixedLaunchModeRow[];
}

interface FixedLaunchModeRow {
  key: FixedLaunchModeKey;
  displayName: string;
  enabled: boolean;
}

interface CliConfigTableProps {
  orderedCliKeys: CliKey[];
  displayNames: Record<CliKey, string>;
  toggles: Record<CliKey, boolean>;
  fixedLaunchModes: FixedLaunchModesConfig;
  statuses: CliStatusMap;
  installHints: CliInstallHintMap;
  cliUserPathStatuses: CliUserPathStatusMap;
  installPrereq: InstallPrereqStatus;
  loading: boolean;
  working: boolean;
  installingKey: CliKey | null;
  focusedCliKey: CliKey | null;
  terminalState: string;
  terminalCountdown: InstallCountdownState | null;
  suppressTerminal: boolean;
  onReorder: (nextOrder: CliKey[]) => void;
  onSetDisplayName: (key: CliKey, value: string) => void;
  onSetToggle: (key: CliKey, checked: boolean) => void;
  onSetFixedLaunchModeDisplayName: (key: FixedLaunchModeKey, value: string) => void;
  onSetFixedLaunchModeEnabled: (key: FixedLaunchModeKey, checked: boolean) => void;
  onCopyInstallCommand: (key: CliKey) => void | Promise<void>;
  onOpenInstallDocs: (key: CliKey) => void | Promise<void>;
  onOpenNodejsDownload: () => void | Promise<void>;
  onLaunchInstall: (key: CliKey) => void | Promise<void>;
  onAddCliCommandDirToUserPath: (key: CliKey) => void | Promise<void>;
  onLaunchAuth: (key: CliKey) => void | Promise<void>;
  onLaunchUpgrade: (key: CliKey) => void | Promise<void>;
  onLaunchUninstall: (key: CliKey) => void | Promise<void>;
  onQuickSetup: (key: CliKey) => void | Promise<void>;
  onTerminalEnsureReady: () => void | Promise<void>;
  onTerminalRunScript: (script: string) => void | Promise<void>;
  onTerminalResize: (cols: number, rows: number) => void | Promise<void>;
  onTerminalCloseSession: () => void | Promise<void>;
}

interface SortableCliCardProps {
  row: CliCardRow;
  loading: boolean;
  working: boolean;
  installingKey: CliKey | null;
  focusMode: boolean;
  showTerminal: boolean;
  terminalState: string;
  terminalCountdown: InstallCountdownState | null;
  installPrereq: InstallPrereqStatus;
  cliUserPathStatus?: CliUserPathStatusMap[string];
  onSetDisplayName: (key: CliKey, value: string) => void;
  onSetToggle: (key: CliKey, checked: boolean) => void;
  onSetFixedLaunchModeDisplayName: (key: FixedLaunchModeKey, value: string) => void;
  onSetFixedLaunchModeEnabled: (key: FixedLaunchModeKey, checked: boolean) => void;
  onCopyInstallCommand: (key: CliKey) => void | Promise<void>;
  onOpenInstallDocs: (key: CliKey) => void | Promise<void>;
  onOpenNodejsDownload: () => void | Promise<void>;
  onLaunchInstall: (key: CliKey) => void | Promise<void>;
  onAddCliCommandDirToUserPath: (key: CliKey) => void | Promise<void>;
  onLaunchAuth: (key: CliKey) => void | Promise<void>;
  onLaunchUpgrade: (key: CliKey) => void | Promise<void>;
  onLaunchUninstall: (key: CliKey) => void | Promise<void>;
  onQuickSetup: (key: CliKey) => void | Promise<void>;
  onTerminalEnsureReady: () => void | Promise<void>;
  onTerminalRunScript: (script: string) => void | Promise<void>;
  onTerminalResize: (cols: number, rows: number) => void | Promise<void>;
  onTerminalCloseSession: () => void | Promise<void>;
}

function isCliKey(value: string): value is CliKey {
  return (CLI_DEFAULT_ORDER as string[]).includes(value);
}

function IconActionButton({
  label,
  disabled,
  className = "",
  buttonClassName = "",
  onClick,
  children
}: IconActionButtonProps) {
  return (
    <span className={`group/action relative inline-flex ${className}`.trim()}>
      <button
        type="button"
        className={buttonClassName || ICON_BUTTON_CLASS}
        disabled={disabled}
        onClick={() => void onClick()}
        title={label}
        aria-label={label}
      >
        {children}
      </button>
      <span
        className={`${HOVER_BUBBLE_BASE_CLASS} left-1/2 -translate-x-1/2 group-hover/action:translate-y-0 group-hover/action:opacity-100 group-focus-within/action:translate-y-0 group-focus-within/action:opacity-100`}
      >
        {label}
      </span>
    </span>
  );
}

function SortableCliCard({
  row,
  loading,
  working,
  installingKey,
  focusMode,
  showTerminal,
  terminalState,
  terminalCountdown,
  installPrereq,
  cliUserPathStatus,
  onSetDisplayName,
  onSetToggle,
  onSetFixedLaunchModeDisplayName,
  onSetFixedLaunchModeEnabled,
  onCopyInstallCommand,
  onOpenInstallDocs,
  onOpenNodejsDownload,
  onLaunchInstall,
  onAddCliCommandDirToUserPath,
  onLaunchAuth,
  onLaunchUpgrade,
  onLaunchUninstall,
  onQuickSetup,
  onTerminalEnsureReady,
  onTerminalRunScript,
  onTerminalResize,
  onTerminalCloseSession
}: SortableCliCardProps) {
  const rowDisabled = !row.detected;
  const isInstalled = row.detected;
  const dragDisabled = loading || working || focusMode;
  const hint = row.hint;
  const nodeReady = installPrereq.node && installPrereq.npm;
  const showNodeDownload = Boolean(hint?.requires_node) && !nodeReady;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
    disabled: dragDisabled
  });

  const cardClass = [
    "rounded-none border-0 bg-transparent p-0 shadow-none transition-[transform,opacity] duration-150",
    "mb-0",
    rowDisabled ? "opacity-85" : "",
    isDragging ? "scale-[1.01]" : ""
  ]
    .join(" ")
    .trim();
  const dragTitleClass = [
    `group/drag relative inline-flex max-w-full select-none items-center gap-2 rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-2 ${OUTSET_SMALL}`,
    dragDisabled
      ? "cursor-not-allowed text-[var(--ui-light)]"
      : "cursor-grab text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-[0.98] active:cursor-grabbing active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]",
    "max-[420px]:max-w-none"
  ].join(" ");
  const titleClass = [
    "truncate text-base font-bold max-[420px]:max-w-full",
    isInstalled ? "max-w-[180px]" : "max-w-none"
  ].join(" ");
  const statusClass = [
    "rounded-[var(--radius-pill)] border border-[#ddd5c9] px-2.5 py-0.5 text-[10px] font-semibold",
    row.detected ? "bg-[#e4ded4] text-[#5f564d]" : "bg-[#efe8dd] text-[#877a6e]"
  ].join(" ");
  const nodeTagClass = `rounded-[var(--radius-pill)] border border-[#ddd5c9] bg-[#e8e1d6] px-2.5 py-0.5 text-[10px] text-[#5f564d] ${OUTSET_SMALL}`;
  const quickSetupLabel = "快速安装向导";
  const installOnlyLabel = installingKey === row.key ? "安装中..." : "仅执行安装";
  const authLabel = `登录 ${row.title}`;
  const upgradeLabel = `升级 ${row.title}`;
  const uninstallLabel = `卸载 ${row.title}`;
  const copyLabel = `复制 ${row.title} 安装命令`;
  const docsLabel = `打开 ${row.title} 安装说明`;

  const userPathFixLabel = "加入环境变量";
  const showUserPathFixAction = Boolean(cliUserPathStatus?.needs_user_path_fix);
  const fixedLaunchModesDisabled = working || loading || !row.enabled;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <article ref={setNodeRef} style={style} className={cardClass} aria-disabled={rowDisabled}>
      {isInstalled ? (
        <div className={DETECTED_ROW_CLASS}>
          <div
            ref={setActivatorNodeRef}
            tabIndex={dragDisabled ? -1 : 0}
            {...(dragDisabled ? {} : { ...attributes, ...listeners })}
            className={`${dragTitleClass} min-w-0`}
            aria-label={`${row.title} 拖拽排序`}
            aria-disabled={dragDisabled}
          >
            <span className="flex w-full min-w-0 items-center justify-between gap-1.5">
              <span className="group/drag-title relative inline-flex min-w-0 items-center">
                <span className={titleClass}>{row.title}</span>
                <span
                  className={`${HOVER_BUBBLE_BASE_CLASS} left-1/2 -translate-x-1/2 group-hover/drag-title:translate-y-0 group-hover/drag-title:opacity-100`}
                >
                  拖拽可排序
                </span>
              </span>
              <span
                data-no-drag="true"
                className="inline-flex shrink-0 items-center gap-1.5 max-[420px]:gap-1"
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              >
                {showUserPathFixAction ? (
                  <IconActionButton
                    label={userPathFixLabel}
                    disabled={working || loading || !!installingKey}
                    onClick={() => onAddCliCommandDirToUserPath(row.key)}
                    className="shrink-0"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                      <path d="M4 12h16" strokeLinecap="round" />
                      <path d="M12 4v16" strokeLinecap="round" />
                    </svg>
                  </IconActionButton>
                ) : null}
                <IconActionButton
                  label={authLabel}
                  disabled={working || loading || !!installingKey || !row.hint}
                  onClick={() => onLaunchAuth(row.key)}
                  className="shrink-0"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                    <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
                    <path d="M4 20a8 8 0 0 1 16 0" strokeLinecap="round" />
                  </svg>
                </IconActionButton>
                <IconActionButton
                  label={upgradeLabel}
                  disabled={working || loading || !!installingKey || !row.hint?.upgrade_command}
                  onClick={() => onLaunchUpgrade(row.key)}
                  className="shrink-0"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                    <path d="M12 20V10" strokeLinecap="round" />
                    <path d="m8 14 4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 5h16" strokeLinecap="round" />
                  </svg>
                </IconActionButton>
                <IconActionButton
                  label={uninstallLabel}
                  disabled={working || loading || !!installingKey}
                  onClick={() => onLaunchUninstall(row.key)}
                  className="shrink-0"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                    <path d="M4 7h16" strokeLinecap="round" />
                    <path d="M9 7V5h6v2" strokeLinecap="round" />
                    <path d="M8 7l1 12h6l1-12" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M10 11v5M14 11v5" strokeLinecap="round" />
                  </svg>
                </IconActionButton>
              </span>
            </span>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-1.5 whitespace-nowrap max-[420px]:gap-1">
            <label className="group/cli-display-name relative block shrink-0">
              <input
                className={`${INLINE_NAME_INPUT_CLASS} shrink-0`}
                value={row.displayName}
                onChange={(event) => onSetDisplayName(row.key, event.target.value)}
                disabled={working || loading}
                aria-label={`${row.title} 自定义名称`}
              />
              <span
                className={`pointer-events-none absolute top-[calc(100%+8px)] right-0 z-10 translate-y-0.5 whitespace-nowrap rounded-[var(--radius-pill)] bg-[var(--ui-base)] px-2.5 py-[5px] text-[11px] text-[var(--ui-muted)] opacity-0 transition-[opacity,transform] duration-150 ${OUTSET_SMALL} group-hover/cli-display-name:translate-y-0 group-hover/cli-display-name:opacity-100 group-focus-within/cli-display-name:translate-y-0 group-focus-within/cli-display-name:opacity-100`}
              >
                自定义菜单显示名称
              </span>
            </label>
            <Switch.Root
              className={`${SWITCH_ROOT_CLASS} shrink-0`}
              checked={row.enabled}
              onCheckedChange={(checked) => onSetToggle(row.key, checked)}
              disabled={working || loading}
              aria-label={`${row.title} 启用开关`}
            >
              <Switch.Thumb className={SWITCH_THUMB_CLASS} />
            </Switch.Root>
          </div>
        </div>
      ) : (
        <div className={UNDETECTED_ROW_CLASS}>
          <div
            ref={setActivatorNodeRef}
            tabIndex={dragDisabled ? -1 : 0}
            {...(dragDisabled ? {} : { ...attributes, ...listeners })}
            className={`${dragTitleClass} min-w-0 flex-wrap`}
            aria-label={`${row.title} 拖拽排序`}
            aria-disabled={dragDisabled}
          >
            <span className="group/drag-title relative inline-flex min-w-0 items-center">
              <span className={titleClass}>{row.title}</span>
              <span
                className={`${HOVER_BUBBLE_BASE_CLASS} left-1/2 -translate-x-1/2 group-hover/drag-title:translate-y-0 group-hover/drag-title:opacity-100`}
              >
                拖拽可排序
              </span>
            </span>
            <span className={`${statusClass} max-[420px]:hidden`}>{row.detected ? "已检测到" : "未检测到"}</span>
            <span
              data-no-drag="true"
              className="inline-flex items-center gap-1 whitespace-nowrap"
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <IconActionButton
                label={quickSetupLabel}
                disabled={loading || working || !!installingKey}
                onClick={() => onQuickSetup(row.key)}
                buttonClassName={ICON_BUTTON_COMPACT_CLASS}
                className="shrink-0"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                  <path d="M4 20 20 4" strokeLinecap="round" />
                  <path
                    d="m14 4 1-2 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="m2 14 1-2 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </IconActionButton>
              <IconActionButton
                label={installOnlyLabel}
                disabled={loading || working || !hint?.install_command || !!installingKey}
                onClick={() => onLaunchInstall(row.key)}
                buttonClassName={ICON_BUTTON_COMPACT_CLASS}
                className="shrink-0"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                  <path d="M12 4v10" strokeLinecap="round" />
                  <path d="m8 10 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 19h16" strokeLinecap="round" />
                </svg>
              </IconActionButton>
              <IconActionButton
                label={copyLabel}
                disabled={loading || !hint?.install_command}
                onClick={() => onCopyInstallCommand(row.key)}
                buttonClassName={ICON_BUTTON_COMPACT_CLASS}
                className="shrink-0"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
                </svg>
              </IconActionButton>
              <IconActionButton
                label={docsLabel}
                disabled={loading || !hint?.docs_url}
                onClick={() => onOpenInstallDocs(row.key)}
                buttonClassName={ICON_BUTTON_COMPACT_CLASS}
                className="shrink-0"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                  <path d="M14 4h6v6" strokeLinecap="round" />
                  <path d="M10 14L20 4" strokeLinecap="round" />
                  <path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" strokeLinecap="round" />
                </svg>
              </IconActionButton>
              {showNodeDownload ? (
                <button
                  type="button"
                  className={`${NODE_DOWNLOAD_COMPACT_BUTTON_CLASS} shrink-0`}
                  disabled={loading || working}
                  onClick={() => void onOpenNodejsDownload()}
                >
                  下载 Node.js
                </button>
              ) : null}
            </span>
            {hint?.requires_node ? <span className={`${nodeTagClass} max-[420px]:hidden`}>Node.js 依赖</span> : null}
            {hint?.wsl_recommended ? <span className={`${nodeTagClass} max-[480px]:hidden`}>建议 WSL</span> : null}
          </div>
        </div>
      )}

      {row.detected && row.fixedLaunchModes.length > 0 ? (
        <div className={`mt-3 rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[#f3eee6] p-3 ${OUTSET_SMALL}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="grid gap-0.5">
              <span className="text-[11px] font-semibold text-[#5f564d]">固定启动方式</span>
              <span className="text-[10px] text-[#877a6e]">默认项会保留，固定模式会紧跟在对应 CLI 后面。</span>
            </div>
            {!row.enabled ? (
              <span className="rounded-[var(--radius-pill)] border border-[#ddd5c9] bg-[#e8e1d6] px-2 py-0.5 text-[10px] font-semibold text-[#7a6e63]">
                随组关闭
              </span>
            ) : null}
          </div>

          <div className="grid gap-2">
            {row.fixedLaunchModes.map((fixedLaunchMode) => (
              <div
                key={fixedLaunchMode.key}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius-md)] border border-[#e0d7cb] bg-[var(--ui-base)] px-2.5 py-2 ${OUTSET_SMALL} ${
                  !row.enabled ? "opacity-70" : ""
                }`}
              >
                <label className="grid gap-1.5">
                  <input
                    className={SUBMODE_NAME_INPUT_CLASS}
                    value={fixedLaunchMode.displayName}
                    onChange={(event) => onSetFixedLaunchModeDisplayName(fixedLaunchMode.key, event.target.value)}
                    disabled={fixedLaunchModesDisabled}
                    aria-label={`${row.title} 固定启动方式名称`}
                  />
                  <span className="text-[10px] text-[#7a6e63]">{FIXED_LAUNCH_MODE_COMMAND_LABELS[fixedLaunchMode.key]}</span>
                </label>

                <div className="grid justify-items-end gap-1">
                  <Switch.Root
                    className={`${SWITCH_ROOT_CLASS} shrink-0`}
                    checked={fixedLaunchMode.enabled}
                    onCheckedChange={(checked) => onSetFixedLaunchModeEnabled(fixedLaunchMode.key, checked)}
                    disabled={fixedLaunchModesDisabled}
                    aria-label={`${fixedLaunchMode.displayName} 启用开关`}
                  >
                    <Switch.Thumb className={SWITCH_THUMB_CLASS} />
                  </Switch.Root>
                  <span className="text-[10px] text-[#7a6e63]">
                    {!row.enabled ? "随组关闭" : fixedLaunchMode.enabled ? "已启用" : "已关闭"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {showTerminal ? (
        <div className="mt-3">
          <TerminalPanel
            state={terminalState}
            countdown={terminalCountdown}
            onEnsureReady={onTerminalEnsureReady}
            onRunScript={onTerminalRunScript}
            onResize={onTerminalResize}
            onCloseSession={onTerminalCloseSession}
          />
        </div>
      ) : null}
    </article>
  );
}

export function CliConfigTable({
  orderedCliKeys,
  displayNames,
  toggles,
  fixedLaunchModes,
  statuses,
  installHints,
  cliUserPathStatuses,
  installPrereq,
  loading,
  working,
  installingKey,
  focusedCliKey,
  terminalState,
  terminalCountdown,
  suppressTerminal,
  onReorder,
  onSetDisplayName,
  onSetToggle,
  onSetFixedLaunchModeDisplayName,
  onSetFixedLaunchModeEnabled,
  onCopyInstallCommand,
  onOpenInstallDocs,
  onOpenNodejsDownload,
  onLaunchInstall,
  onAddCliCommandDirToUserPath,
  onLaunchAuth,
  onLaunchUpgrade,
  onLaunchUninstall,
  onQuickSetup,
  onTerminalEnsureReady,
  onTerminalRunScript,
  onTerminalResize,
  onTerminalCloseSession
}: CliConfigTableProps) {
  const rows = useMemo<CliCardRow[]>(
    () =>
      orderedCliKeys.map((key) => ({
        fixedLaunchModes:
          key === "claude" || key === "codex" || key === "gemini"
            ? FIXED_LAUNCH_MODE_BY_PARENT[key].map((fixedLaunchModeKey) => ({
                key: fixedLaunchModeKey,
                displayName: fixedLaunchModes[fixedLaunchModeKey].display_name,
                enabled: fixedLaunchModes[fixedLaunchModeKey].enabled
              }))
            : [],
        key,
        title: CLI_DEFAULT_TITLES[key],
        displayName: displayNames[key],
        enabled: toggles[key],
        detected: statuses[key],
        hint: installHints[key]
      })),
    [orderedCliKeys, displayNames, toggles, fixedLaunchModes, statuses, installHints]
  );

  const focusMode = focusedCliKey !== null;
  const visibleRows = useMemo(() => {
    if (!focusedCliKey) {
      return rows;
    }
    return rows.filter((row) => row.key === focusedCliKey);
  }, [focusedCliKey, rows]);
  const rowIds = useMemo(() => visibleRows.map((row) => row.key), [visibleRows]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;

    if (!overId || activeId === overId || !isCliKey(activeId) || !isCliKey(overId)) {
      return;
    }

    const oldIndex = orderedCliKeys.indexOf(activeId);
    const newIndex = orderedCliKeys.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    onReorder(arrayMove(orderedCliKeys, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        {visibleRows.map((row) => (
          <SortableCliCard
            key={row.key}
            row={row}
            loading={loading}
            working={working}
            installingKey={installingKey}
            focusMode={focusMode}
            showTerminal={focusedCliKey === row.key && !suppressTerminal}
            terminalState={terminalState}
            terminalCountdown={terminalCountdown}
            installPrereq={installPrereq}
            cliUserPathStatus={cliUserPathStatuses[row.key]}
            onSetDisplayName={onSetDisplayName}
            onSetToggle={onSetToggle}
            onSetFixedLaunchModeDisplayName={onSetFixedLaunchModeDisplayName}
            onSetFixedLaunchModeEnabled={onSetFixedLaunchModeEnabled}
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
            onTerminalCloseSession={onTerminalCloseSession}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
