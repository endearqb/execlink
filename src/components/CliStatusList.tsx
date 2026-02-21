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
    <section className="card">
      <h2>CLI 可用性检测</h2>
      <ul className="status-list">
        {rows.map((row) => (
          <li key={row.title}>
            <span>{row.title}</span>
            <strong aria-label={row.ok ? "available" : "missing"}>
              {row.ok ? "✅" : "❌"}
            </strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
