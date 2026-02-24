import { Switch } from "@base-ui/react";

const SWITCH_ROOT_CLASS =
  "group relative inline-flex h-8 w-14 cursor-pointer items-center rounded-full border-0 bg-[var(--ui-base)] p-1 shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] transition-[box-shadow,background-color,transform] duration-150 ease-[cubic-bezier(0.26,0.75,0.38,0.45)] before:pointer-events-none before:absolute before:rounded-full before:outline-2 before:outline-offset-2 before:outline-transparent data-[checked]:bg-[#d7cec0] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60 focus-visible:outline-none focus-visible:before:inset-0 focus-visible:before:outline-[#8f8072] active:scale-[0.98] active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff] data-[checked]:active:bg-[#cec2b2]";
const SWITCH_THUMB_CLASS =
  "block size-6 rounded-full bg-[var(--ui-base)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] transition-transform duration-150 group-data-[checked]:translate-x-6";

interface Props {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled
}: Props) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-[var(--radius-lg)] bg-[var(--ui-base)] p-3 shadow-[6px_6px_12px_#d5d0c4,-6px_-6px_12px_#ffffff] max-[420px]:grid-cols-1">
      <div className="min-w-0">
        <div className="font-semibold text-[var(--ui-text)]">{title}</div>
        {description ? <div className="mt-1 text-[0.85rem] text-[var(--ui-muted)]">{description}</div> : null}
      </div>
      <Switch.Root
        className={SWITCH_ROOT_CLASS}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={`${title} 启用`}
      >
        <Switch.Thumb className={SWITCH_THUMB_CLASS} />
      </Switch.Root>
    </label>
  );
}

