import { type QuickSetupPhase, type QuickSetupStatus, CLI_DEFAULT_TITLES } from "../types/config";

const DEFAULT_PHASES: QuickSetupPhase[] = [
  "precheck",
  "install",
  "detect",
  "auth",
  "apply_menu",
  "fallback",
  "done"
];

const KIMI_PHASES: QuickSetupPhase[] = [
  "precheck_uv",
  "install_uv",
  "verify_uv",
  "choose_source",
  "install_kimi",
  "verify_kimi",
  "apply_menu",
  "fallback",
  "auth",
  "done"
];

const PHASE_LABELS: Record<QuickSetupPhase, string> = {
  idle: "待开始",
  precheck: "前置检查",
  precheck_uv: "检查 uv",
  install: "执行安装",
  install_uv: "安装 uv",
  verify_uv: "检测 uv",
  choose_source: "选择安装源",
  install_kimi: "安装 Kimi",
  verify_kimi: "检测 Kimi",
  detect: "安装检测",
  auth: "授权登录",
  apply_menu: "应用菜单",
  fallback: "兜底修复",
  done: "完成",
  failed: "失败"
};

interface Props {
  status: QuickSetupStatus;
  onClose: () => void;
  onRetry: () => void;
}

export function QuickSetupWizard({ status, onClose, onRetry }: Props) {
  if (!status.key) {
    return null;
  }

  const targetTitle = CLI_DEFAULT_TITLES[status.key];
  const phases = status.key === "kimi" || status.key === "kimi_web" ? KIMI_PHASES : DEFAULT_PHASES;
  const activeIndex = phases.indexOf(status.phase);

  return (
    <section className="grid gap-3 rounded-[1.5rem] border border-[#ddd5c9] bg-[var(--ui-base)] p-4 shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--ui-text)]">快速安装向导 · {targetTitle}</h3>
        <div className="flex items-center gap-2">
          {!status.running && status.phase === "failed" ? (
            <button
              type="button"
              className="rounded-xl border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] transition-[box-shadow,transform,color] duration-150 hover:text-[#6a5e52] active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]"
              onClick={onRetry}
            >
              重试
            </button>
          ) : null}
          {!status.running ? (
            <button
              type="button"
              className="rounded-xl border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-1.5 text-xs font-medium text-[var(--ui-muted)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] transition-[box-shadow,transform,color] duration-150 hover:text-[var(--ui-text)] active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]"
              onClick={onClose}
            >
              关闭
            </button>
          ) : null}
        </div>
      </div>

      <ol className="grid gap-1.5 text-xs">
        {phases.map((phase, index) => {
          const done = activeIndex >= 0 && index < activeIndex;
          const active = status.phase === phase;
          return (
            <li
              key={phase}
              className={[
                "rounded-xl border border-[#ddd5c9] px-2.5 py-1.5",
                done ? "bg-[#e8e1d7] text-[#5f564d]" : "",
                active ? "bg-[#e4ded4] text-[var(--ui-text)] font-semibold" : "",
                !done && !active ? "bg-[var(--ui-base)] text-[var(--ui-muted)]" : ""
              ]
                .join(" ")
                .trim()}
            >
              {PHASE_LABELS[phase]}
            </li>
          );
        })}
      </ol>

      <div className="rounded-xl border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-2 text-xs text-[var(--ui-text)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff]">
        <div className="font-semibold">{PHASE_LABELS[status.phase] ?? status.phase}</div>
        <div className="mt-1 text-[var(--ui-muted)]">{status.message}</div>
        {status.detail ? (
          <details className="mt-1.5 text-[11px]">
            <summary className="cursor-pointer select-none text-[var(--ui-text)]">详情</summary>
            <pre className="mt-1 whitespace-pre-wrap break-all">{status.detail}</pre>
          </details>
        ) : null}
      </div>
    </section>
  );
}
