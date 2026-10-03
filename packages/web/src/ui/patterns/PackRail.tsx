import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { space } from "../tokens.stylex";
import { PackTile, type PackTileData } from "./PackTile";

const WIDE = "@media (min-width: 768px)";
const DESKTOP_COUNT = 4;

const styles = stylex.create({
  // Phones swipe through every item; wider screens show one row of four.
  rail: {
    display: { default: "flex", [WIDE]: "grid" },
    gridTemplateColumns: `repeat(${DESKTOP_COUNT}, minmax(0, 1fr))`,
    gap: { default: space.sm, [WIDE]: space.lg },
    margin: 0,
    padding: 0,
    listStyle: "none",
    overflowX: { default: "auto", [WIDE]: "visible" },
    scrollSnapType: "x mandatory",
    scrollbarWidth: "none",
  },
  item: {
    flexShrink: 0,
    width: { default: "72%", [WIDE]: "auto" },
    scrollSnapAlign: "start",
    minWidth: 0,
  },
  // Items past the first row only appear in the phone carousel.
  extra: { display: { default: "block", [WIDE]: "none" } },
});

/** A single row of cards: four across on wide screens, a swipeable strip on phones. */
export function Rail<T>({
  items,
  label,
  itemKey,
  children,
}: {
  items: readonly T[];
  label: string;
  itemKey: (item: T) => string;
  children: (item: T) => ReactNode;
}) {
  return (
    <ul aria-label={label} {...stylex.props(styles.rail)}>
      {items.map((item, index) => (
        <li
          key={itemKey(item)}
          {...stylex.props(styles.item, index >= DESKTOP_COUNT && styles.extra)}
        >
          {children(item)}
        </li>
      ))}
    </ul>
  );
}

export function PackRail({ packs, label }: { packs: readonly PackTileData[]; label: string }) {
  return (
    <Rail items={packs} label={label} itemKey={(pack) => pack.slug}>
      {(pack) => <PackTile pack={pack} />}
    </Rail>
  );
}
