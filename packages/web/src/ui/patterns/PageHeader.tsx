import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { color, space, text, tracking } from "../tokens.stylex";

const WIDE = "@media (min-width: 768px)";

const styles = stylex.create({
  root: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    columnGap: space.xl,
    rowGap: space.md,
  },
  lead: {
    display: "flex",
    alignItems: "center",
    gap: { default: space.md, [WIDE]: space.lg },
    minWidth: 0,
  },
  text: { display: "flex", flexDirection: "column", gap: space.xs, minWidth: 0, maxWidth: "720px" },
  title: {
    margin: 0,
    fontSize: { default: text.h2, [WIDE]: text.h1 },
    fontWeight: 800,
    letterSpacing: tracking.tight,
    lineHeight: 1.1,
  },
  description: {
    margin: 0,
    maxWidth: "60ch",
    fontSize: text.lg,
    lineHeight: 1.5,
    color: color.muted,
  },
  actions: { flexGrow: { default: 1, [WIDE]: 0 }, flexBasis: { default: "100%", [WIDE]: "auto" } },
  below: { flexBasis: "100%" },
});

/**
 * The top of a page: its title, an optional line of description, optional
 * actions to the right (below on phones), and optional content underneath.
 * Every page uses it so titles start at the same place and size.
 */
export function PageHeader({
  leading,
  title,
  description,
  actions,
  children,
}: {
  /** Shown before the title, such as a profile's avatar. */
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.lead)}>
        {leading}
        <div {...stylex.props(styles.text)}>
          <h1 {...stylex.props(styles.title)}>{title}</h1>
          {description && <p {...stylex.props(styles.description)}>{description}</p>}
        </div>
      </div>
      {actions && <div {...stylex.props(styles.actions)}>{actions}</div>}
      {children && <div {...stylex.props(styles.below)}>{children}</div>}
    </header>
  );
}
