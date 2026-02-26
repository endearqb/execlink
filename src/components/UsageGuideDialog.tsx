import { useEffect } from "react";
import { createPortal } from "react-dom";

interface UsageGuideDialogProps {
  open: boolean;
  onClose: () => void;
}

const GUIDE_STEPS = [
  "首次使用先点击“一键安装修复”，完成 Nilesoft 的安装与注册。",
  "点击“刷新 CLI 检测”，确认已安装 CLI 的检测状态。",
  "未检测到的 CLI 先完成安装；若需要授权，点击对应 CLI 的登录按钮。",
  "按需设置 CLI 显示开关、顺序、分组名称和自定义名称。",
  "点击“应用配置”，然后在资源管理器空白处右键确认菜单生效。"
];

export function UsageGuideDialog({ open, onClose }: UsageGuideDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[2150] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#2f2b25]/26 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="关闭使用说明向导"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="使用说明向导"
        className="relative z-10 w-[min(560px,calc(100vw-30px))] rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[var(--ui-base)] p-4 shadow-[6px_6px_12px_#d5d0c4,-6px_-6px_12px_#ffffff] max-[420px]:w-[calc(100vw-16px)] max-[420px]:p-3"
      >
        <h2 className="m-0 text-base font-semibold text-[var(--ui-text)]">使用说明向导</h2>
        <p className="mt-1.5 text-xs text-[var(--ui-muted)]">建议按以下顺序完成首次配置：</p>
        <ol className="mt-2 grid gap-1.5 rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] p-3 text-xs text-[var(--ui-text)] shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff]">
          {GUIDE_STEPS.map((step, index) => (
            <li key={step} className="leading-[1.45]">
              <span className="mr-1.5 font-semibold text-[var(--ui-muted)]">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] text-[var(--ui-muted)]">
          如遇注册或生效异常，请优先在“安装/生效”页使用“一键安装修复”和“提权重试注册”。
        </p>
        <div className="mt-3 flex items-center justify-end">
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[#e8e1d7] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[#665a4f] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]"
            onClick={onClose}
          >
            我知道了
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

