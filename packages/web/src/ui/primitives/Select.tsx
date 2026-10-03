import { Select as BaseSelect } from "@base-ui/react/select";
import * as stylex from "@stylexjs/stylex";
import { Fragment } from "react";
import { CheckIcon, ChevronDownIcon } from "../icons";
import { color, font, radius, space, text } from "../tokens.stylex";
import { shared, stateStyles } from "./shared";

const styles = stylex.create({
  root: { display: "inline-flex", alignItems: "center", gap: space.xs },
  rootFull: { display: "flex", flexGrow: 1, minWidth: 0 },
  label: { fontSize: text.md, color: color.muted, fontFamily: font.sans },
  trigger: {
    paddingInline: space.md,
    backgroundColor: { default: color.surface, ":hover": color.raise },
    borderColor: color.line,
    color: color.text,
  },
  triggerFull: { flexGrow: 1, justifyContent: "space-between" },
  panel: {
    padding: space.xxs,
    minWidth: "var(--anchor-width)",
    maxHeight: "min(var(--available-height), 360px)",
    overflowY: "auto",
  },
  placeholder: { color: color.muted },
  groupLabel: {
    paddingInline: space.sm,
    paddingTop: space.sm,
    paddingBottom: space.xxs,
    fontSize: text.sm,
    fontWeight: 700,
    color: color.muted,
  },
  itemDisabled: { color: color.muted, cursor: "not-allowed" },
  itemMeta: { marginInlineStart: "auto", fontSize: text.sm, color: color.muted },
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.lg,
    minHeight: "40px",
    paddingInline: space.sm,
    borderRadius: radius.sm,
    fontFamily: font.sans,
    fontSize: text.md,
    color: color.text,
    cursor: "pointer",
    outline: "none",
  },
  highlighted: { backgroundColor: color.surface },
  indicator: { color: color.accentText, display: "inline-flex" },
});

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  /** Options sharing a group are listed under that heading, in order. */
  group?: string;
  disabled?: boolean;
  /** Secondary text after the label, such as why an option is disabled. */
  meta?: string;
};

type SelectProps<T extends string> = {
  label: string;
  hideLabel?: boolean;
  /** Stretch to fill the row, as in a phone toolbar. */
  fullWidth?: boolean;
  /** `null` shows the placeholder until the user chooses. */
  value: T | null;
  placeholder?: string;
  disabled?: boolean;
  options: readonly SelectOption<T>[];
  onValueChange: (value: T) => void;
};

/** A single-choice dropdown, such as sort order. */
export function Select<T extends string>({
  label,
  hideLabel,
  fullWidth,
  value,
  placeholder,
  disabled,
  options,
  onValueChange,
}: SelectProps<T>) {
  const groups = groupOptions(options);
  return (
    <BaseSelect.Root
      value={value}
      disabled={disabled}
      items={options}
      onValueChange={(next) => {
        const picked = options.find((option) => option.value === next);
        if (picked) onValueChange(picked.value);
      }}
    >
      <div {...stylex.props(styles.root, fullWidth && styles.rootFull)}>
        <BaseSelect.Label {...stylex.props(hideLabel ? shared.visuallyHidden : styles.label)}>
          {label}
        </BaseSelect.Label>
        <BaseSelect.Trigger
          {...stylex.props(
            shared.control,
            shared.focusRing,
            styles.trigger,
            fullWidth && styles.triggerFull
          )}
        >
          <BaseSelect.Value
            placeholder={placeholder}
            className={stateStyles((state) => [state.placeholder && styles.placeholder])}
          />
          <BaseSelect.Icon render={<ChevronDownIcon size={14} />} />
        </BaseSelect.Trigger>
      </div>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={8} alignItemWithTrigger={false} collisionPadding={16}>
          <BaseSelect.Popup {...stylex.props(shared.floatingPanel, styles.panel)}>
            <BaseSelect.List>
              {groups.map(({ group, options: groupItems }) => {
                const items = groupItems.map((option) => (
                  <BaseSelect.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className={stateStyles((state) => [
                      styles.item,
                      state.highlighted && styles.highlighted,
                      state.disabled && styles.itemDisabled,
                    ])}
                  >
                    <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                    {option.meta && <span {...stylex.props(styles.itemMeta)}>{option.meta}</span>}
                    <BaseSelect.ItemIndicator {...stylex.props(styles.indicator)}>
                      <CheckIcon size={16} />
                    </BaseSelect.ItemIndicator>
                  </BaseSelect.Item>
                ));
                return group ? (
                  <BaseSelect.Group key={group}>
                    <BaseSelect.GroupLabel {...stylex.props(styles.groupLabel)}>
                      {group}
                    </BaseSelect.GroupLabel>
                    {items}
                  </BaseSelect.Group>
                ) : (
                  <Fragment key="ungrouped">{items}</Fragment>
                );
              })}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

function groupOptions<T extends string>(options: readonly SelectOption<T>[]) {
  const groups: { group: string | undefined; options: SelectOption<T>[] }[] = [];
  for (const option of options) {
    const last = groups.at(-1);
    if (last && last.group === option.group) last.options.push(option);
    else groups.push({ group: option.group, options: [option] });
  }
  return groups;
}
