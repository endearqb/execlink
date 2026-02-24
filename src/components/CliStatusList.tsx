import { useMemo } from "react";
import { CLI_DEFAULT_ORDER, CLI_DEFAULT_TITLES, type CliStatusMap } from "../types/config";

const LABELS: Array<{ key: keyof CliStatusMap; title: string }> = [
  ...CLI_DEFAULT_ORDER.map((key) => ({ key, title: CLI_DEFAULT_TITLES[key] })),
  { key: "pwsh", title: "pwsh" }
];

interface Props {
  statuses: CliStatusMap;
}

export function CliStatusList({ statuses }: Props) {
  const rows = useMemo(
    () =>
      LABELS.map((item) => ({
        title: item.title,
        ok: statuses[item.key]
      })),
    [statuses]
  );

  return (
    <section className="rounded-[2rem] border border-[#ddd5c9] bg-[var(--ui-base)] p-4 shadow-[6px_6px_12px_#d5d0c4,-6px_-6px_12px_#ffffff]">
      <h2 className="mb-3 text-base font-semibold text-[var(--ui-text)]">CLI 可用性检测</h2>
      <ul className="grid gap-2">
        {rows.map((row) => (
          <li
            key={row.title}
            className="flex items-center justify-between gap-3 rounded-2xl border border-[#ddd5c9] bg-[var(--ui-base)] px-3 py-2 text-sm text-[var(--ui-muted)] shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff]"
          >
            <span>{row.title}</span>
            <strong className="text-base" aria-label={row.ok ? "available" : "missing"}>
              {row.ok ? "✅" : "❌"}
            </strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
