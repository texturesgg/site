import { Switch as BaseSwitch } from "@base-ui/react/switch";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";
import { color, radius, space, text } from "../tokens.stylex";
import { shared, stateStyles } from "./shared";

const styles = stylex.create({
  row: { display: "flex", alignItems: "center", gap: space.sm },
  label: { fontSize: text.md, color: color.text, cursor: "pointer" },
  root: {
    position: "relative",
    flexShrink: 0,
    width: "44px",
    height: "26px",
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.pill,
    backgroundColor: color.lineStrong,
    cursor: "pointer",
    transitionProperty: "background-color",
    transitionDuration: "120ms",
  },
  on: { backgroundColor: color.accent },
  thumb: {
    position: "absolute",
    top: "3px",
    left: "3px",
    width: "20px",
    height: "20px",
    borderRadius: radius.pill,
    backgroundColor: color.text,
    transitionProperty: "transform",
    transitionDuration: "120ms",
  },
  thumbOn: { transform: "translateX(18px)", backgroundColor: color.onAccent },
});

/** An on/off setting that applies as a form value, labeled beside the control. */
export function Switch({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <span {...stylex.props(styles.row)}>
      <BaseSwitch.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onCheckedChange(next)}
        className={stateStyles((state) => [
          styles.root,
          shared.focusRing,
          state.checked && styles.on,
        ])}
      >
        <BaseSwitch.Thumb
          className={stateStyles((state) => [styles.thumb, state.checked && styles.thumbOn])}
        />
      </BaseSwitch.Root>
      <label htmlFor={id} {...stylex.props(styles.label)}>
        {label}
      </label>
    </span>
  );
}
