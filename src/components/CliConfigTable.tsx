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
  type CliInstallHint,
  type CliInstallHintMap,
  type CliKey,
  type CliStatusMap,
  type InstallPrereqStatus
} from "../types/config";
import { TerminalPanel } from "./TerminalPanel";

const OUTSET_LARGE = "shadow-[10px_10px_20px_#d5d0c4,-10px_-10px_20px_#ffffff]";
const OUTSET_SMALL = "shadow-[5px_5px_10px_#d5d0c4,-5px_-5px_10px_#ffffff]";
const INSET_SMALL = "shadow-[inset_4px_4px_8px_#d5d0c4,inset_-4px_-4px_8px_#ffffff]";
const BUTTON_BASE_CLASS = `rounded-xl border border-[#ddd5c9] bg-[var(--ui-base)] text-[var(--ui-text)] ${OUTSET_SMALL} px-3 py-1.5 text-xs font-medium outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[#6a5e52] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_2px_2px_5px_#d5d0c4,inset_-2px_-2px_5px_#ffffff] disabled:cursor-not-allowed disabled:opacity-60`;
const ICON_BUTTON_CLASS = `inline-flex size-9 items-center justify-center rounded-xl border border-[#ddd5c9] bg-[var(--ui-base)] text-[var(--ui-muted)] ${OUTSET_SMALL} outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[#8a4f45] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_2px_2px_5px_#d5d0c4,inset_-2px_-2px_5px_#ffffff] disabled:cursor-not-allowed disabled:opacity-60`;
const INPUT_CLASS = `w-full rounded-2xl border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-2.5 text-sm text-[var(--ui-text)] outline-none ${INSET_SMALL} transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#8f8072]/35 disabled:cursor-not-allowed disabled:opacity-60`;
const SWITCH_ROOT_CLASS = `group relative inline-flex h-7 w-12 cursor-pointer items-center rounded-full border-0 bg-[var(--ui-base)] p-1 ${OUTSET_SMALL} transition-[box-shadow,background-color,transform] duration-150 before:pointer-events-none before:absolute before:rounded-full before:outline-2 before:outline-offset-2 before:outline-transparent data-[checked]:bg-[#d7cec0] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60 focus-visible:outline-none focus-visible:before:inset-0 focus-visible:before:outline-[#8f8072] active:scale-[0.98] active:shadow-[inset_2px_2px_5px_#d5d0c4,inset_-2px_-2px_5px_#ffffff] data-[checked]:active:bg-[#cec2b2]`;
const SWITCH_THUMB_CLASS = `block size-5 rounded-full bg-[var(--ui-base)] ${OUTSET_SMALL} transition-transform duration-150 group-data-[checked]:translate-x-5`;
const DESKTOP_CARD_GRID_CLASS =
  "grid items-center gap-2 min-[681px]:grid-cols-[minmax(170px,1fr)_minmax(80px,0.45fr)_auto] max-[680px]:grid-cols-1";
const HOVER_BUBBLE_BASE_CLASS =
  "pointer-events-none absolute -top-8 translate-y-0.5 whitespace-nowrap rounded-full bg-[#8f8072] px-2 py-1 text-[10px] text-[#f6f0e7] opacity-0 shadow-[5px_5px_10px_#d5d0c4,-5px_-5px_10px_#ffffff] transition-[opacity,transform] duration-100";

interface IconActionButtonProps {
  label: string;
  disabled?: boolean;
  className?: string;
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
}

interface CliConfigTableProps {
  orderedCliKeys: CliKey[];
  displayNames: Record<CliKey, string>;
  toggles: Record<CliKey, boolean>;
  statuses: CliStatusMap;
  installHints: CliInstallHintMap;
  installPrereq: InstallPrereqStatus;
  loading: boolean;
  working: boolean;
  installingKey: CliKey | null;
  focusedCliKey: CliKey | null;
  terminalState: string;
  onReorder: (nextOrder: CliKey[]) => void;
  onSetDisplayName: (key: CliKey, value: string) => void;
  onSetToggle: (key: CliKey, checked: boolean) => void;
  onCopyInstallCommand: (key: CliKey) => void | Promise<void>;
  onOpenInstallDocs: (key: CliKey) => void | Promise<void>;
  onOpenNodejsDownload: () => void | Promise<void>;
  onLaunchInstall: (key: CliKey) => void | Promise<void>;
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
  installPrereq: InstallPrereqStatus;
  onSetDisplayName: (key: CliKey, value: string) => void;
  onSetToggle: (key: CliKey, checked: boolean) => void;
  onCopyInstallCommand: (key: CliKey) => void | Promise<void>;
  onOpenInstallDocs: (key: CliKey) => void | Promise<void>;
  onOpenNodejsDownload: () => void | Promise<void>;
  onLaunchInstall: (key: CliKey) => void | Promise<void>;
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

function IconActionButton({ label, disabled, className = "", onClick, children }: IconActionButtonProps) {
  return (
    <span className={`group/action relative inline-flex ${className}`.trim()}>
      <button
        type="button"
        className={ICON_BUTTON_CLASS}
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
  installPrereq,
  onSetDisplayName,
  onSetToggle,
  onCopyInstallCommand,
  onOpenInstallDocs,
  onOpenNodejsDownload,
  onLaunchInstall,
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
    `rounded-[2rem] border border-[#e3dacd] bg-[var(--ui-base)] p-4 ${OUTSET_LARGE} transition-[box-shadow,transform,opacity] duration-150 max-[540px]:rounded-[1.5rem] max-[540px]:p-3`,
    rowDisabled ? "opacity-85" : "",
    isDragging ? "scale-[1.01] shadow-[14px_14px_28px_#d5d0c4,-14px_-14px_28px_#ffffff]" : ""
  ]
    .join(" ")
    .trim();
  const dragTitleClass = [
    `group/drag relative inline-flex max-w-full select-none items-center gap-2 rounded-2xl border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-2 ${OUTSET_SMALL}`,
    dragDisabled
      ? "cursor-not-allowed text-[var(--ui-light)]"
      : "cursor-grab text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-[0.98] active:cursor-grabbing active:shadow-[inset_2px_2px_5px_#d5d0c4,inset_-2px_-2px_5px_#ffffff]",
    "max-[680px]:max-w-none"
  ].join(" ");
  const titleClass = [
    "truncate text-base font-bold max-[540px]:max-w-full",
    isInstalled ? "max-w-[180px]" : "max-w-none"
  ].join(" ");
  const statusClass = [
    "rounded-full border border-[#ddd5c9] px-2.5 py-0.5 text-[10px] font-semibold",
    row.detected ? "bg-[#e4ded4] text-[#5f564d]" : "bg-[#efe8dd] text-[#877a6e]"
  ].join(" ");
  const nodeTagClass = `rounded-full border border-[#ddd5c9] bg-[#e8e1d6] px-2.5 py-0.5 text-[10px] text-[#5f564d] ${OUTSET_SMALL}`;
  const quickSetupLabel = "快速安装向导";
  const installOnlyLabel = installingKey === row.key ? "安装中..." : "仅执行安装";
  const uninstallLabel = `卸载 ${row.title}`;
  const copyLabel = `复制 ${row.title} 安装命令`;
  const docsLabel = `打开 ${row.title} 安装说明`;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <article ref={setNodeRef} style={style} className={cardClass} aria-disabled={rowDisabled}>
      <div className="grid gap-3">
        {isInstalled ? (
          <div className={DESKTOP_CARD_GRID_CLASS}>
            <div
              ref={setActivatorNodeRef}
              tabIndex={dragDisabled ? -1 : 0}
              {...(dragDisabled ? {} : { ...attributes, ...listeners })}
              className={`${dragTitleClass} min-w-0`}
              aria-label={`${row.title} 拖拽排序`}
              aria-disabled={dragDisabled}
            >
              <span className={titleClass}>{row.title}</span>
              <span className={statusClass}>{row.detected ? "已检测到" : "未检测到"}</span>
              <span
                className="ml-auto"
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <Switch.Root
                  className={SWITCH_ROOT_CLASS}
                  checked={row.enabled}
                  onCheckedChange={(checked) => onSetToggle(row.key, checked)}
                  disabled={working || loading}
                  aria-label={`${row.title} 启用开关`}
                >
                  <Switch.Thumb className={SWITCH_THUMB_CLASS} />
                </Switch.Root>
              </span>
              <span
                className={`${HOVER_BUBBLE_BASE_CLASS} left-3 group-hover/drag:translate-y-0 group-hover/drag:opacity-100 group-focus-visible/drag:translate-y-0 group-focus-visible/drag:opacity-100`}
              >
                拖拽可排序
              </span>
            </div>
            <label className="block min-w-0">
              <input
                className={INPUT_CLASS}
                value={row.displayName}
                onChange={(event) => onSetDisplayName(row.key, event.target.value)}
                disabled={working || loading}
                aria-label={`${row.title} 自定义名称`}
              />
            </label>
            <IconActionButton
              label={uninstallLabel}
              disabled={working || loading || !!installingKey}
              onClick={() => onLaunchUninstall(row.key)}
              className="min-[681px]:justify-self-end max-[680px]:justify-self-start"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="M4 7h16" strokeLinecap="round" />
                <path d="M9 7V5h6v2" strokeLinecap="round" />
                <path d="M8 7l1 12h6l1-12" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 11v5M14 11v5" strokeLinecap="round" />
              </svg>
            </IconActionButton>
          </div>
        ) : (
          <div className={DESKTOP_CARD_GRID_CLASS}>
            <div
              ref={setActivatorNodeRef}
              tabIndex={dragDisabled ? -1 : 0}
              {...(dragDisabled ? {} : { ...attributes, ...listeners })}
              className={`${dragTitleClass} min-w-0`}
              aria-label={`${row.title} 拖拽排序`}
              aria-disabled={dragDisabled}
            >
              <span className={titleClass}>{row.title}</span>
              <span className={statusClass}>{row.detected ? "已检测到" : "未检测到"}</span>
              {hint?.requires_node ? <span className={nodeTagClass}>Node.js 依赖</span> : null}
              {hint?.wsl_recommended ? <span className={nodeTagClass}>建议 WSL</span> : null}
              <span
                className={`${HOVER_BUBBLE_BASE_CLASS} left-3 group-hover/drag:translate-y-0 group-hover/drag:opacity-100 group-focus-visible/drag:translate-y-0 group-focus-visible/drag:opacity-100`}
              >
                拖拽可排序
              </span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 min-[681px]:col-start-2 min-[681px]:col-end-4 min-[681px]:justify-end max-[680px]:justify-start">
              <IconActionButton
                label={quickSetupLabel}
                disabled={loading || working || !!installingKey}
                onClick={() => onQuickSetup(row.key)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
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
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path d="M12 4v10" strokeLinecap="round" />
                  <path d="m8 10 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 19h16" strokeLinecap="round" />
                </svg>
              </IconActionButton>
              {showNodeDownload ? (
                <button
                  type="button"
                  className={`${BUTTON_BASE_CLASS} px-2.5 py-1 text-[11px]`}
                  disabled={loading || working}
                  onClick={() => void onOpenNodejsDownload()}
                >
                  下载 Node.js
                </button>
              ) : null}
              <IconActionButton
                label={copyLabel}
                disabled={loading || !hint?.install_command}
                onClick={() => onCopyInstallCommand(row.key)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
                </svg>
              </IconActionButton>
              <IconActionButton
                label={docsLabel}
                disabled={loading || !hint?.docs_url}
                onClick={() => onOpenInstallDocs(row.key)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path d="M14 4h6v6" strokeLinecap="round" />
                  <path d="M10 14L20 4" strokeLinecap="round" />
                  <path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" strokeLinecap="round" />
                </svg>
              </IconActionButton>
            </div>
          </div>
        )}

        {showTerminal ? (
          <TerminalPanel
            state={terminalState}
            onEnsureReady={onTerminalEnsureReady}
            onRunScript={onTerminalRunScript}
            onResize={onTerminalResize}
            onCloseSession={onTerminalCloseSession}
          />
        ) : null}
      </div>
    </article>
  );
}

export function CliConfigTable({
  orderedCliKeys,
  displayNames,
  toggles,
  statuses,
  installHints,
  installPrereq,
  loading,
  working,
  installingKey,
  focusedCliKey,
  terminalState,
  onReorder,
  onSetDisplayName,
  onSetToggle,
  onCopyInstallCommand,
  onOpenInstallDocs,
  onOpenNodejsDownload,
  onLaunchInstall,
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
        key,
        title: CLI_DEFAULT_TITLES[key],
        displayName: displayNames[key],
        enabled: toggles[key],
        detected: statuses[key],
        hint: installHints[key]
      })),
    [orderedCliKeys, displayNames, toggles, statuses, installHints]
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
    <div className="grid gap-4">
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
              showTerminal={focusedCliKey === row.key}
              terminalState={terminalState}
              installPrereq={installPrereq}
              onSetDisplayName={onSetDisplayName}
              onSetToggle={onSetToggle}
              onCopyInstallCommand={onCopyInstallCommand}
              onOpenInstallDocs={onOpenInstallDocs}
              onOpenNodejsDownload={onOpenNodejsDownload}
              onLaunchInstall={onLaunchInstall}
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
    </div>
  );
}
