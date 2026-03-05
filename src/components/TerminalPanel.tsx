import { useEffect, useRef, useState } from "react";
import { type InstallCountdownState } from "../types/config";

interface Props {
  state: string;
  countdown: InstallCountdownState | null;
  onRunScript: (script: string) => void | Promise<void>;
  onEnsureReady: () => void | Promise<void>;
  onResize: (cols: number, rows: number) => void | Promise<void>;
  onCloseSession: () => void | Promise<void>;
}

const ANSI_CSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const ANSI_C1_CSI_PATTERN = /\u009b[0-?]*[ -/]*[@-~]/g;
const ANSI_OSC_PATTERN = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;
const RESIDUAL_CSI_FRAGMENT_PATTERN = /\[[0-9;?]*[A-Za-z]/g;
const NPM_UNINSTALL_RUNNING_PATTERN = /Running npm uninstall -g\b/i;

function collapseProgressLines(text: string): string {
  const lines = text.split("\n");
  const collapsed: string[] = [];
  for (const line of lines) {
    if (
      collapsed.length > 0 &&
      NPM_UNINSTALL_RUNNING_PATTERN.test(line) &&
      NPM_UNINSTALL_RUNNING_PATTERN.test(collapsed[collapsed.length - 1])
    ) {
      collapsed[collapsed.length - 1] = line;
      continue;
    }
    collapsed.push(line);
  }
  return collapsed.join("\n");
}

function appendTerminalOutput(prev: string, incoming: string): string {
  const sanitized = incoming
    .replace(ANSI_OSC_PATTERN, "")
    .replace(ANSI_CSI_PATTERN, "")
    .replace(ANSI_C1_CSI_PATTERN, "")
    .replace(RESIDUAL_CSI_FRAGMENT_PATTERN, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, "");

  let next = prev;
  for (const ch of sanitized) {
    if (ch === "\r") {
      const lastNewline = next.lastIndexOf("\n");
      next = lastNewline >= 0 ? next.slice(0, lastNewline + 1) : "";
      continue;
    }
    next += ch;
  }
  const collapsed = collapseProgressLines(next);
  return collapsed.length > 120000 ? collapsed.slice(collapsed.length - 120000) : collapsed;
}

export function TerminalPanel({
  state,
  countdown,
  onRunScript,
  onEnsureReady,
  onResize,
  onCloseSession
}: Props) {
  const outputRef = useRef<HTMLPreElement | null>(null);
  const [output, setOutput] = useState("[ExecLink] Embedded terminal panel ready.\n");
  const [scriptInput, setScriptInput] = useState("");

  useEffect(() => {
    const host = window as Window & {
      __EXECLINK_TERMINAL_WRITE__?: (text: string) => void;
      __EXECLINK_TERMINAL_BUFFER__?: string;
    };
    host.__EXECLINK_TERMINAL_WRITE__ = (text: string) => {
      setOutput((prev) => appendTerminalOutput(prev, text));
    };
    const buffered = host.__EXECLINK_TERMINAL_BUFFER__;
    if (buffered) {
      setOutput((prev) => appendTerminalOutput(prev, buffered));
      host.__EXECLINK_TERMINAL_BUFFER__ = "";
    }
    return () => {
      delete host.__EXECLINK_TERMINAL_WRITE__;
    };
  }, []);

  useEffect(() => {
    if (!outputRef.current) {
      return;
    }
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  useEffect(() => {
    void onEnsureReady();
    void onResize(120, 30);
  }, [onEnsureReady, onResize]);

  const formatCountdown = (remainingMs: number, totalMs: number) => {
    const toClock = (valueMs: number) => {
      const seconds = Math.max(0, Math.ceil(valueMs / 1000));
      const minutes = Math.floor(seconds / 60);
      const rest = seconds % 60;
      return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
    };
    return `${toClock(remainingMs)} / ${toClock(totalMs)}`;
  };

  return (
    <section className="grid gap-2 rounded-[1.5rem] border border-[#ddd5c9] bg-[var(--ui-base)] p-3 shadow-[6px_6px_12px_#d5d0c4,-6px_-6px_12px_#ffffff]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--ui-text)]">内置终端</h3>
        <div className="flex items-center gap-2 text-[11px] text-[var(--ui-muted)]">
          <span>状态: {state}</span>
          <button
            type="button"
            className="rounded-xl border border-[#ddd5c9] bg-[var(--ui-base)] px-2.5 py-1 shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] transition-[box-shadow,transform,color] duration-150 hover:text-[var(--ui-text)] active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]"
            onClick={() => void onEnsureReady()}
          >
            重连
          </button>
          <button
            type="button"
            className="rounded-xl border border-[#ddd5c9] bg-[var(--ui-base)] px-2.5 py-1 shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] transition-[box-shadow,transform,color] duration-150 hover:text-[var(--ui-text)] active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]"
            onClick={() => void onCloseSession()}
          >
            关闭
          </button>
          <button
            type="button"
            className="rounded-xl border border-[#ddd5c9] bg-[var(--ui-base)] px-2.5 py-1 shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] transition-[box-shadow,transform,color] duration-150 hover:text-[var(--ui-text)] active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]"
            onClick={() => setOutput("")}
          >
            清屏
          </button>
        </div>
      </div>

      {countdown?.active ? (
        <div className="rounded-xl border border-[#ddd5c9] bg-[#efe8dd] px-2.5 py-1.5 text-[11px] text-[#5f564d]">
          <span className="font-semibold">{countdown.label}</span>
          {" · "}
          <span>倒计时 {formatCountdown(countdown.remaining_ms, countdown.total_ms)}</span>
        </div>
      ) : null}

      <pre
        ref={outputRef}
        className="h-[260px] overflow-auto rounded-[1.25rem] border border-[#ddd5c9] bg-[#f1ebe1] p-2 text-[12px] leading-[1.35] text-[#33312e] shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff]"
      >
        {output || " "}
      </pre>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const value = scriptInput.trim();
          if (!value) {
            return;
          }
          void onRunScript(value);
          setScriptInput("");
        }}
      >
        <input
          className="min-w-[220px] flex-1 rounded-xl border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-1.5 text-xs text-[var(--ui-text)] shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff] outline-none focus-visible:ring-2 focus-visible:ring-[#8f8072]/35"
          placeholder="在内置终端执行命令，如 kimi login"
          value={scriptInput}
          onChange={(event) => setScriptInput(event.target.value)}
        />
        <button
          type="submit"
          className="rounded-xl border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] transition-[box-shadow,transform,color] duration-150 hover:text-[#6a5e52] active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]"
        >
          执行
        </button>
      </form>
    </section>
  );
}
