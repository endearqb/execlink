import { useEffect } from "react";
import { createPortal } from "react-dom";

const GIT_OFFICIAL_INSTALL_COMMAND = "winget install --id Git.Git -e --source winget";
const GIT_TUNA_INSTALL_PREVIEW = [
  "$latestReleaseUrl = \"https://mirrors.tuna.tsinghua.edu.cn/github-release/git-for-windows/git/LatestRelease/\"",
  "$page = Invoke-WebRequest -Uri $latestReleaseUrl",
  "$installerHref = ($page.Links | Where-Object { $_.href -match \"(?i)Git-[^/]*-64-bit\\\\.exe$\" } | Select-Object -First 1).href",
  "$tunaUrl = [System.Uri]::new([System.Uri]$latestReleaseUrl, $installerHref).AbsoluteUri",
  "Invoke-WebRequest -Uri $tunaUrl -OutFile \"Git-Installer.exe\""
].join("\n");

interface GitInstallSourceDialogProps {
  open: boolean;
  onSelectOfficial: () => void;
  onSelectTuna: () => void;
  onCancel: () => void;
}

export function GitInstallSourceDialog({
  open,
  onSelectOfficial,
  onSelectTuna,
  onCancel
}: GitInstallSourceDialogProps) {
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
        aria-label="关闭 Git 安装源选择弹窗"
      />
      <section
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-[min(560px,calc(100vw-32px))] rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[var(--ui-base)] p-4 shadow-[6px_6px_12px_#d5d0c4,-6px_-6px_12px_#ffffff] max-[420px]:w-[calc(100vw-18px)] max-[420px]:p-3"
      >
        <h2 className="m-0 text-base font-semibold text-[var(--ui-text)]">选择 Git 安装源</h2>
        <p className="mt-2 text-xs leading-[1.5] text-[var(--ui-muted)]">
          官方源将使用 winget 安装。清华源会从 GitHub Release 获取安装包地址并替换为清华镜像域名后下载执行。
        </p>
        <div className="mt-2 grid gap-2">
          <div className="rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] p-2 shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff]">
            <p className="m-0 text-xs font-semibold text-[var(--ui-text)]">官方源</p>
            <pre className="mt-1 text-[11px] leading-[1.45] text-[var(--ui-muted)]">{GIT_OFFICIAL_INSTALL_COMMAND}</pre>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] p-2 shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff]">
            <p className="m-0 text-xs font-semibold text-[var(--ui-text)]">清华源</p>
            <pre className="mt-1 text-[11px] leading-[1.45] text-[var(--ui-muted)]">{GIT_TUNA_INSTALL_PREVIEW}</pre>
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
            onClick={onSelectTuna}
          >
            使用清华源
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
