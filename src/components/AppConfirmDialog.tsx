import { useEffect } from "react";
import { createPortal } from "react-dom";

interface AppConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AppConfirmDialog({
  open,
  title,
  message,
  confirmText = "确认",
  cancelText = "取消",
  danger = false,
  onConfirm,
  onCancel
}: AppConfirmDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        onConfirm();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel, onConfirm, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#2f2b25]/26 backdrop-blur-[2px]"
        onClick={onCancel}
        aria-label="关闭确认弹窗"
      />
      <section
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-[min(520px,calc(100vw-32px))] rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[var(--ui-base)] p-4 shadow-[6px_6px_12px_#d5d0c4,-6px_-6px_12px_#ffffff] max-[420px]:w-[calc(100vw-18px)] max-[420px]:p-3"
      >
        <h2 className="m-0 text-base font-semibold text-[var(--ui-text)]">{title}</h2>
        <pre className="mt-2 max-h-[52vh] overflow-auto rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] p-3 text-xs leading-[1.45] text-[var(--ui-muted)] shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff]">
          {message}
        </pre>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[#665a4f] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`rounded-[var(--radius-md)] border border-[#ddd5c9] px-3 py-1.5 text-xs font-medium shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] outline-none transition-[box-shadow,transform,color] duration-150 focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff] ${
              danger
                ? "bg-[#ecddd8] text-[#8a4f45] hover:text-[#7d473e]"
                : "bg-[#e8e1d7] text-[var(--ui-text)] hover:text-[#665a4f]"
            }`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
