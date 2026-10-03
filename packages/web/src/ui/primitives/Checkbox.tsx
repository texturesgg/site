import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { CheckboxGroup as BaseCheckboxGroup } from "@base-ui/react/checkbox-group";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";
import { CheckIcon } from "../icons";
import { color, font, radius, space, text } from "../tokens.stylex";
import { shared, stateStyles } from "./shared";

const styles = stylex.create({
  row: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    minHeight: "44px",
    paddingInline: space.xs,
    borderRadius: radius.sm,
    fontFamily: font.sans,
    fontSize: text.md,
    color: color.text,
    cursor: "pointer",
    backgroundColor: { default: "transparent", ":hover": color.surface },
  },
  box: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: "20px",
    height: "20px",
    boxSizing: "border-box",
    borderWidth: "1.5px",
    borderStyle: "solid",
    borderColor: color.muted,
    borderRadius: "6px",
    backgroundColor: "transparent",
    color: color.onAccent,
  },
  checked: { backgroundColor: color.accent, borderColor: color.accent },
  label: { flexGrow: 1, minWidth: 0 },
  meta: { fontFamily: font.mono, fontSize: text.xs, color: color.muted },
  group: { display: "flex", flexDirection: "column" },
});

type CheckboxProps = Omit<
  ComponentProps<typeof BaseCheckbox.Root>,
  "className" | "style" | "children"
> & {
  label: ReactNode;
  /** Right-aligned secondary text, such as a count. */
  meta?: ReactNode;
};

export function Checkbox({ label, meta, ...props }: CheckboxProps) {
  return (
    <label {...stylex.props(styles.row)}>
      <BaseCheckbox.Root
        {...props}
        className={stateStyles((state) => [
          styles.box,
          shared.focusRing,
          state.checked && styles.checked,
        ])}
      >
        <BaseCheckbox.Indicator>
          <CheckIcon size={14} strokeWidth={3} />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span {...stylex.props(styles.label)}>{label}</span>
      {meta !== undefined && <span {...stylex.props(styles.meta)}>{meta}</span>}
    </label>
  );
}

type CheckboxGroupProps = Omit<ComponentProps<typeof BaseCheckboxGroup>, "className" | "style"> & {
  columns?: 1 | 2;
};

const groupStyles = stylex.create({
  two: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: space.xs },
});

export function CheckboxGroup({ columns = 1, ...props }: CheckboxGroupProps) {
  return (
    <BaseCheckboxGroup
      {...props}
      {...stylex.props(styles.group, columns === 2 && groupStyles.two)}
    />
  );
}
