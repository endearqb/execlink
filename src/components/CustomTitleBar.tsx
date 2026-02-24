import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { getCurrentWindow, type Window as TauriWindow } from "@tauri-apps/api/window";

interface CustomTitleBarProps {
  logoSrc: string;
  title: string;
  subtitle: string;
}

function hasTauriRuntime() {
  if (typeof window === "undefined") {
    return false;
  }
  const candidate = window as Window & {
    __TAURI_INTERNALS__?: {
      invoke?: unknown;
    };
  };
  return typeof candidate.__TAURI_INTERNALS__?.invoke === "function";
}

export function CustomTitleBar({ logoSrc, title, subtitle }: CustomTitleBarProps) {
  const [maximized, setMaximized] = useState(false);
  const [busy, setBusy] = useState(false);
  const tauriWindow = useMemo(() => (hasTauriRuntime() ? getCurrentWindow() : null), []);

  useEffect(() => {
    if (!tauriWindow) {
      return;
    }
    void tauriWindow
      .isMaximized()
      .then((value) => setMaximized(value))
      .catch(() => {
        setMaximized(false);
      });
  }, [tauriWindow]);

  const runWindowAction = async (fn: (win: TauriWindow) => Promise<void>) => {
    if (!tauriWindow || busy) {
      return;
    }
    setBusy(true);
    try {
      await fn(tauriWindow);
      const next = await tauriWindow.isMaximized();
      setMaximized(next);
    } catch {
      // ignore non-critical window operation failure
    } finally {
      setBusy(false);
    }
  };

  const onDragMouseDown = async (event: MouseEvent<HTMLDivElement>) => {
    if (!tauriWindow || event.button !== 0) {
      return;
    }
    if (event.detail >= 2) {
      await runWindowAction((win) => win.toggleMaximize());
      return;
    }
    try {
      await tauriWindow.startDragging();
    } catch {
      // ignore drag failure
    }
  };

  const buttonClass =
    "grid h-10 w-11 place-items-center rounded-xl border border-[#ddd5c9] bg-[var(--ui-base)] text-[var(--ui-muted)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] transition-[box-shadow,transform,color,background-color] duration-150 outline-none hover:text-[var(--ui-text)] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff] disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <header className="mb-4 flex items-center gap-3 rounded-[1.65rem] border border-[#ddd5c9] bg-[var(--ui-base)] p-2.5 shadow-[6px_6px_12px_#d5d0c4,-6px_-6px_12px_#ffffff] max-[420px]:mb-3 max-[420px]:rounded-[1.35rem]">
      <div
        className="flex min-h-11 min-w-0 flex-1 cursor-default items-center gap-3 rounded-[1.25rem] border border-[#ddd5c9] bg-[var(--ui-base)] px-3 shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff] select-none"
        onMouseDown={(event) => void onDragMouseDown(event)}
      >
        <img src={logoSrc} alt="ExecLink logo" className="h-7 w-[92px] object-contain" />
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-bold text-[var(--ui-text)]">{title}</p>
          <p className="m-0 truncate text-[11px] text-[var(--ui-muted)]">{subtitle}</p>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          aria-label="最小化窗口"
          disabled={!tauriWindow || busy}
          onClick={() => void runWindowAction((win) => win.minimize())}
        >
          <span className="block h-[2px] w-3 rounded bg-current" />
        </button>
        <button
          type="button"
          className={buttonClass}
          aria-label={maximized ? "还原窗口" : "最大化窗口"}
          disabled={!tauriWindow || busy}
          onClick={() => void runWindowAction((win) => win.toggleMaximize())}
        >
          {maximized ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="6" y="8" width="10" height="10" />
              <path d="M8 6h10v10" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className={`${buttonClass} hover:bg-[#e9d7d2] hover:text-[#8a4f45]`}
          aria-label="关闭窗口"
          disabled={!tauriWindow || busy}
          onClick={() => void runWindowAction((win) => win.close())}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </header>
  );
}

