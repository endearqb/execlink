interface PrimaryActionsBarProps {
  loading: boolean;
  working: boolean;
  canOperate: boolean;
  detectedCliCount: number;
  enabledCliCount: number;
  totalCliCount: number;
  installMessage: string;
  onDetect: () => void | Promise<void>;
  onApply: () => void | Promise<void>;
}

export function PrimaryActionsBar({
  loading,
  working,
  canOperate,
  detectedCliCount,
  enabledCliCount,
  totalCliCount,
  installMessage,
  onDetect,
  onApply
}: PrimaryActionsBarProps) {
  const buttonClass =
    "rounded-2xl border border-[#ddd5c9] bg-[var(--ui-base)] px-4 py-2.5 text-sm font-semibold text-[var(--ui-text)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] transition-[box-shadow,transform,color] duration-150 outline-none hover:text-[#665a4f] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff] disabled:cursor-not-allowed disabled:opacity-60";

  const chipClass =
    "rounded-full border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-1 text-[11px] font-semibold text-[var(--ui-muted)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff]";

  return (
    <section className="mb-4 grid gap-3 rounded-[1.8rem] border border-[#ddd5c9] bg-[var(--ui-base)] p-4 shadow-[6px_6px_12px_#d5d0c4,-6px_-6px_12px_#ffffff] max-[420px]:mb-3 max-[420px]:rounded-[1.35rem]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <h1 className="m-0 text-xl font-bold text-[var(--ui-text)]">ExecLink Workspace</h1>
          <p className="m-0 text-sm text-[var(--ui-muted)]">
            Windows 11 右键菜单 AI CLI 快捷入口，点击应用配置后自动执行生效。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className={chipClass}>
              已检测 CLI: {detectedCliCount}/{totalCliCount}
            </span>
            <span className={chipClass}>
              已启用菜单项: {enabledCliCount}/{totalCliCount}
            </span>
            <span className={chipClass}>Nilesoft: {canOperate ? "就绪" : "未就绪"}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <button type="button" className={buttonClass} onClick={() => void onDetect()} disabled={working || loading}>
            刷新 CLI 检测
          </button>
          <button
            type="button"
            className={`${buttonClass} bg-[#e8e1d7]`}
            onClick={() => void onApply()}
            disabled={working || loading || !canOperate}
          >
            应用配置
          </button>
        </div>
      </div>
      <div className="rounded-[1.2rem] border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-2 text-xs text-[var(--ui-muted)] shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff]">
        当前状态: {installMessage}
      </div>
    </section>
  );
}

