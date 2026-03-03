import { useEffect } from "react";
import { createPortal } from "react-dom";

const WINGET_OFFICIAL_INSTALL_PREVIEW = [
  "$wingetBootstrapUrl = \"https://aka.ms/getwinget\"",
  "$wingetBundlePath = Join-Path $env:TEMP \"Microsoft.DesktopAppInstaller.msixbundle\"",
  "Invoke-WebRequest -Uri $wingetBootstrapUrl -OutFile $wingetBundlePath",
  "Add-AppxPackage -Path $wingetBundlePath"
].join("\n");

const WINGET_STORE_INSTALL_PREVIEW = [
  "打开 Microsoft Store 安装页：",
  "https://apps.microsoft.com/detail/9NBLGGH4NNS1",
  "在页面中安装 App Installer 后返回本应用重试。"
].join("\n");

interface WingetInstallSourceDialogProps {
  open: boolean;
  onSelectOfficial: () => void;
  onSelectStore: () => void;
  onCancel: () => void;
}

export function WingetInstallSourceDialog({
  open,
  onSelectOfficial,
  onSelectStore,
  onCancel
}: WingetInstallSourceDialogProps) {
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
        aria-label="关闭 winget 安装源选择弹窗"
      />
      <section
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-[min(560px,calc(100vw-32px))] rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[var(--ui-base)] p-4 shadow-[6px_6px_12px_#d5d0c4,-6px_-6px_12px_#ffffff] max-[420px]:w-[calc(100vw-18px)] max-[420px]:p-3"
      >
        <h2 className="m-0 text-base font-semibold text-[var(--ui-text)]">选择 winget 安装源</h2>
        <p className="mt-2 text-xs leading-[1.5] text-[var(--ui-muted)]">
          可选择自动官方下载安装，或手动打开微软商店安装 App Installer。
        </p>
        <div className="mt-2 grid gap-2">
          <div className="rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] p-2 shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff]">
            <p className="m-0 text-xs font-semibold text-[var(--ui-text)]">官方源</p>
            <pre className="mt-1 text-[11px] leading-[1.45] text-[var(--ui-muted)]">{WINGET_OFFICIAL_INSTALL_PREVIEW}</pre>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] p-2 shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff]">
            <p className="m-0 text-xs font-semibold text-[var(--ui-text)]">微软商店手动下载</p>
            <pre className="mt-1 text-[11px] leading-[1.45] text-[var(--ui-muted)]">{WINGET_STORE_INSTALL_PREVIEW}</pre>
          </div>
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
            onClick={onSelectOfficial}
          >
            使用官方源
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[#e8e1d7] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[#665a4f] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]"
            onClick={onSelectStore}
          >
            手动微软商店下载
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
