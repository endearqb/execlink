import { Switch } from "@base-ui/react";

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
    <label className="toggle-row">
      <div>
        <div className="toggle-title">{title}</div>
        {description ? <div className="toggle-desc">{description}</div> : null}
      </div>
      <Switch.Root
        className="switch-root"
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={`${title} 启用`}
      >
        <Switch.Thumb className="switch-thumb" />
      </Switch.Root>
    </label>
  );
}
