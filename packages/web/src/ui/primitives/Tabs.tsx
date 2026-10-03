import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { color, font, space, text } from "../tokens.stylex";
import { shared, stateStyles } from "./shared";

const styles = stylex.create({
  list: {
    position: "relative",
    display: "flex",
    gap: space.lg,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
  },
  tab: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    minHeight: "48px",
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: { default: color.muted, ":hover": color.text },
    fontFamily: font.sans,
    fontSize: text.lg,
    fontWeight: 700,
    cursor: "pointer",
  },
  selected: { color: { default: color.text, ":hover": color.text } },
  count: { fontFamily: font.mono, fontSize: text.sm, fontWeight: 500, color: color.muted },
  indicator: {
    position: "absolute",
    bottom: "-1px",
    left: "var(--active-tab-left)",
    width: "var(--active-tab-width)",
    height: "2px",
    backgroundColor: color.accent,
    transitionProperty: "left, width",
    transitionDuration: "150ms",
  },
  panel: { paddingTop: space.lg, outline: "none" },
});

export type TabItem<T extends string> = {
  value: T;
  label: string;
  count?: number;
  panel: ReactNode;
};

/** Switch between views of one thing, such as a creator's packs and likes. */
export function Tabs<T extends string>({
  label,
  value,
  items,
  onValueChange,
}: {
  label: string;
  value: T;
  items: readonly TabItem<T>[];
  onValueChange: (value: T) => void;
}) {
  return (
    <BaseTabs.Root
      value={value}
      onValueChange={(next) => {
        const picked = items.find((item) => item.value === next);
        if (picked) onValueChange(picked.value);
      }}
    >
      <BaseTabs.List aria-label={label} {...stylex.props(styles.list)}>
        {items.map((item) => (
          <BaseTabs.Tab
            key={item.value}
            value={item.value}
            className={stateStyles((state) => [
              styles.tab,
              shared.focusRing,
              state.active && styles.selected,
            ])}
          >
            {item.label}
            {item.count !== undefined && (
              <span {...stylex.props(styles.count)}>{item.count.toLocaleString("en-US")}</span>
            )}
          </BaseTabs.Tab>
        ))}
        <BaseTabs.Indicator {...stylex.props(styles.indicator)} />
      </BaseTabs.List>
      {items.map((item) => (
        <BaseTabs.Panel key={item.value} value={item.value} {...stylex.props(styles.panel)}>
          {item.panel}
        </BaseTabs.Panel>
      ))}
    </BaseTabs.Root>
  );
}
