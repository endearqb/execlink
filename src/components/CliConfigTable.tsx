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
import { useMemo } from "react";
import {
  CLI_DEFAULT_ORDER,
  CLI_DEFAULT_TITLES,
  type CliInstallHint,
  type CliInstallHintMap,
  type CliKey,
  type CliStatusMap,
  type InstallPrereqStatus
} from "../types/config";

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
  onReorder: (nextOrder: CliKey[]) => void;
  onSetDisplayName: (key: CliKey, value: string) => void;
  onSetToggle: (key: CliKey, checked: boolean) => void;
  onCopyInstallCommand: (key: CliKey) => void | Promise<void>;
  onOpenInstallDocs: (key: CliKey) => void | Promise<void>;
  onOpenNodejsDownload: () => void | Promise<void>;
  onLaunchInstall: (key: CliKey) => void | Promise<void>;
}

interface SortableCliCardProps {
  row: CliCardRow;
  loading: boolean;
  working: boolean;
  installingKey: CliKey | null;
  installPrereq: InstallPrereqStatus;
  onSetDisplayName: (key: CliKey, value: string) => void;
  onSetToggle: (key: CliKey, checked: boolean) => void;
  onCopyInstallCommand: (key: CliKey) => void | Promise<void>;
  onOpenInstallDocs: (key: CliKey) => void | Promise<void>;
  onOpenNodejsDownload: () => void | Promise<void>;
  onLaunchInstall: (key: CliKey) => void | Promise<void>;
}

function isCliKey(value: string): value is CliKey {
  return (CLI_DEFAULT_ORDER as string[]).includes(value);
}

function SortableCliCard({
  row,
  loading,
  working,
  installingKey,
  installPrereq,
  onSetDisplayName,
  onSetToggle,
  onCopyInstallCommand,
  onOpenInstallDocs,
  onOpenNodejsDownload,
  onLaunchInstall
}: SortableCliCardProps) {
  const rowDisabled = !row.detected;
  const isInstalled = row.detected;
  const dragDisabled = loading || working;
  const hint = row.hint;
  const nodeReady = installPrereq.node && installPrereq.npm;
  const showNodeDownload = Boolean(hint?.requires_node) && !nodeReady;

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
    disabled: dragDisabled
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={[
        "cli-card",
        rowDisabled ? "cli-card-disabled" : "",
        isDragging ? "cli-card-dragging" : ""
      ].join(" ")}
      aria-disabled={rowDisabled}
    >
      <div className="cli-card-scroll">
        <div className={`cli-card-row ${isInstalled ? "cli-card-row-installed" : "cli-card-row-missing"}`}>
          <div className="cli-card-title-wrap">
            <div
              ref={setActivatorNodeRef}
              tabIndex={dragDisabled ? -1 : 0}
              {...(dragDisabled ? {} : { ...attributes, ...listeners })}
              className={[
                "cli-card-drag-title",
                dragDisabled ? "cli-card-drag-title-disabled" : ""
              ].join(" ")}
              aria-label={`${row.title} 拖拽排序`}
              aria-disabled={dragDisabled}
            >
              <span className="cli-card-title">{row.title}</span>
              <span
                className={[
                  "cli-card-status",
                  row.detected ? "ok" : "warn"
                ].join(" ")}
              >
                {row.detected ? "已检测到" : "未检测到"}
              </span>
              <span className="cli-card-drag-bubble">
                拖拽可排序
              </span>
            </div>
          </div>

          {isInstalled ? (
            <>
              <label className="cli-card-name-field">
                <input
                  className="text-input cli-card-name-input"
                  value={row.displayName}
                  onChange={(event) => onSetDisplayName(row.key, event.target.value)}
                  disabled={working || loading}
                  aria-label={`${row.title} 自定义名称`}
                />
              </label>
              <div className="cli-card-toggle">
                <span>启用</span>
                <Switch.Root
                  className="switch-root"
                  checked={row.enabled}
                  onCheckedChange={(checked) => onSetToggle(row.key, checked)}
                  disabled={working || loading}
                  aria-label={`${row.title} 启用`}
                >
                  <Switch.Thumb className="switch-thumb" />
                </Switch.Root>
              </div>
            </>
          ) : (
            <>
              <div className="cli-install-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={loading || !hint?.install_command}
                  onClick={() => void onCopyInstallCommand(row.key)}
                >
                  复制命令
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={loading || !hint?.docs_url}
                  onClick={() => void onOpenInstallDocs(row.key)}
                >
                  打开说明
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={loading || working || !hint?.install_command || !!installingKey}
                  onClick={() => void onLaunchInstall(row.key)}
                >
                  {installingKey === row.key ? "安装中..." : "一键安装"}
                </button>
              </div>
              {hint ? (
                <div className="cli-card-notes">
                  {hint.requires_node ? (
                    showNodeDownload ? (
                      <button
                        type="button"
                        className="secondary cli-inline-action"
                        disabled={loading || working}
                        onClick={() => void onOpenNodejsDownload()}
                      >
                        下载 Node.js
                      </button>
                    ) : (
                      <span className="cli-note ok">Node.js 依赖</span>
                    )
                  ) : null}
                  {hint.wsl_recommended ? <span className="cli-note">建议 WSL</span> : null}
                  {hint.risk_remote_script ? <span className="cli-note warn">远程脚本双确认</span> : null}
                </div>
              ) : null}
            </>
          )}
        </div>
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
  onReorder,
  onSetDisplayName,
  onSetToggle,
  onCopyInstallCommand,
  onOpenInstallDocs,
  onOpenNodejsDownload,
  onLaunchInstall
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

  const rowIds = useMemo(() => rows.map((row) => row.key), [rows]);

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
    <div className="cli-table">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          {rows.map((row) => (
            <SortableCliCard
              key={row.key}
              row={row}
              loading={loading}
              working={working}
              installingKey={installingKey}
              installPrereq={installPrereq}
              onSetDisplayName={onSetDisplayName}
              onSetToggle={onSetToggle}
              onCopyInstallCommand={onCopyInstallCommand}
              onOpenInstallDocs={onOpenInstallDocs}
              onOpenNodejsDownload={onOpenNodejsDownload}
              onLaunchInstall={onLaunchInstall}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
