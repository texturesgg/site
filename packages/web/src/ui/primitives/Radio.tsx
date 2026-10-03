import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import * as stylex from "@stylexjs/stylex";
import { useId, type ReactNode } from "react";
import { color, font, radius, space, text } from "../tokens.stylex";
import { shared, stateStyles } from "./shared";

const styles = stylex.create({
  group: { display: "flex", flexDirection: "column", gap: space.xs },
  legend: { fontSize: text.sm, fontWeight: 600, color: color.text },
  row: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    minHeight: "48px",
    paddingInline: space.md,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: text.md,
    color: color.text,
    cursor: "pointer",
    backgroundColor: { default: "transparent", ":hover": color.surface },
  },
  rowChecked: { borderColor: color.accentText, backgroundColor: color.surface },
  dot: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: "20px",
    height: "20px",
    padding: 0,
    boxSizing: "border-box",
    borderWidth: "1.5px",
    borderStyle: "solid",
    borderColor: color.muted,
    borderRadius: radius.pill,
    backgroundColor: "transparent",
  },
  dotChecked: { borderColor: color.accent },
  indicator: {
    width: "10px",
    height: "10px",
    borderRadius: radius.pill,
    backgroundColor: color.accent,
  },
});

export type RadioOption<T extends string> = { value: T; label: ReactNode };

/** A single choice from a short list, shown as selectable rows (report reasons, for example). */
export function RadioGroup<T extends string>({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: T | null;
  options: readonly RadioOption<T>[];
  onValueChange: (value: T) => void;
}) {
  const labelId = useId();
  return (
    <BaseRadioGroup
      aria-labelledby={labelId}
      value={value}
      onValueChange={(next) => {
        const picked = options.find((option) => option.value === next);
        if (picked) onValueChange(picked.value);
      }}
      {...stylex.props(styles.group)}
    >
      <span id={labelId} {...stylex.props(styles.legend)}>
        {label}
      </span>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label key={option.value} {...stylex.props(styles.row, checked && styles.rowChecked)}>
            <BaseRadio.Root
              value={option.value}
              className={stateStyles((state) => [
                styles.dot,
                shared.focusRing,
                state.checked && styles.dotChecked,
              ])}
            >
              <BaseRadio.Indicator {...stylex.props(styles.indicator)} />
            </BaseRadio.Root>
            {option.label}
          </label>
        );
      })}
    </BaseRadioGroup>
  );
}
