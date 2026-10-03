import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space, text } from "../tokens.stylex";
import { shared, stateStyles } from "./shared";

const styles = stylex.create({
  group: { display: "flex", flexWrap: "wrap", gap: space.xs },
  toggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    minHeight: "40px",
    paddingInline: space.md,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
    borderRadius: radius.pill,
    backgroundColor: { default: "transparent", ":hover": color.surface },
    color: color.text,
    fontFamily: font.sans,
    fontSize: text.sm,
    fontWeight: 600,
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  pressed: {
    backgroundColor: { default: color.text, ":hover": color.text },
    borderColor: color.text,
    color: color.bg,
  },
  meta: { fontFamily: font.mono, fontSize: text.xs, opacity: 0.7 },
});

export type ToggleOption<T extends string> = { value: T; label: string; meta?: string };

/** Pick one of a few views, such as which costume the 3D preview shows. */
export function ToggleGroup<T extends string>({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: T;
  options: readonly ToggleOption<T>[];
  onValueChange: (value: T) => void;
}) {
  return (
    <BaseToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        // Pressing the current toggle would clear the group; keep one selected.
        const picked = options.find((option) => option.value === next[0]);
        if (picked) onValueChange(picked.value);
      }}
      {...stylex.props(styles.group)}
    >
      {options.map((option) => (
        <BaseToggle
          key={option.value}
          value={option.value}
          className={stateStyles((state) => [
            styles.toggle,
            shared.focusRing,
            state.pressed && styles.pressed,
          ])}
        >
          {option.label}
          {option.meta && <span {...stylex.props(styles.meta)}>{option.meta}</span>}
        </BaseToggle>
      ))}
    </BaseToggleGroup>
  );
}
