import { useEffect } from "react";
import { createPortal } from "react-dom";

const UV_AUTO_PREVIEW = [
  "自动回退链：",
  "1) winget install --id astral-sh.uv",
  "2) https://astral.sh/uv/install.ps1",
  "3) 清华镜像（LatestRelease）",
  "4) 阿里镜像（LatestRelease）"
].join("\n");

const UV_OFFICIAL_PREVIEW = [
  "官方链路：",
  "1) winget install --id astral-sh.uv",
  "2) https://astral.sh/uv/install.ps1"
].join("\n");

const UV_TUNA_PREVIEW = [
  "清华镜像链路：",
  "1) 清华镜像（LatestRelease）",
  "2) 官方脚本回退"
].join("\n");

const UV_ALIYUN_PREVIEW = [
  "阿里镜像链路：",
  "1) 阿里镜像（LatestRelease）",
  "2) 官方脚本回退"
].join("\n");

interface UvInstallSourceDialogProps {
  open: boolean;
  onSelectAuto: () => void;
  onSelectOfficial: () => void;
  onSelectTuna: () => void;
  onSelectAliyun: () => void;
  onCancel: () => void;
}

export function UvInstallSourceDialog({
  open,
  onSelectAuto,
  onSelectOfficial,
  onSelectTuna,
  onSelectAliyun,
  onCancel
}: UvInstallSourceDialogProps) {
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
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#2f2b25]/26 backdrop-blur-[2px]"
        onClick={onCancel}
        aria-label="关闭 uv 安装源选择弹窗"
      />
      <section
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-[min(600px,calc(100vw-32px))] rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[var(--ui-base)] p-4 shadow-[6px_6px_12px_#d5d0c4,-6px_-6px_12px_#ffffff] max-[420px]:w-[calc(100vw-18px)] max-[420px]:p-3"
      >
        <h2 className="m-0 text-base font-semibold text-[var(--ui-text)]">选择 uv 安装源策略</h2>
        <p className="mt-2 text-xs leading-[1.5] text-[var(--ui-muted)]">
          推荐使用自动回退链路。网络受限时可直接选择清华或阿里镜像优先。
        </p>
        <div className="mt-2 grid gap-2">
          <PreviewCard title="自动（官方 + 清华 + 阿里）" content={UV_AUTO_PREVIEW} />
          <PreviewCard title="仅官方源" content={UV_OFFICIAL_PREVIEW} />
          <PreviewCard title="清华镜像优先" content={UV_TUNA_PREVIEW} />
          <PreviewCard title="阿里镜像优先" content={UV_ALIYUN_PREVIEW} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[#665a4f] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[#e8e1d7] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[#665a4f] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]"
            onClick={onSelectAuto}
          >
            自动回退
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[#e8e1d7] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[#665a4f] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]"
            onClick={onSelectOfficial}
          >
            官方优先
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[#e8e1d7] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[#665a4f] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]"
            onClick={onSelectTuna}
          >
            清华优先
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[#e8e1d7] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[#665a4f] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]"
            onClick={onSelectAliyun}
          >
            阿里优先
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function PreviewCard({ title, content }: { title: string; content: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] p-2 shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff]">
      <p className="m-0 text-xs font-semibold text-[var(--ui-text)]">{title}</p>
      <pre className="mt-1 text-[11px] leading-[1.45] text-[var(--ui-muted)]">{content}</pre>
    </div>
  );
}
