import * as stylex from "@stylexjs/stylex";
import { createLink } from "@tanstack/react-router";
import type { ComponentProps, ReactNode, Ref } from "react";
import { color, space, text, tracking } from "@/ui/tokens.stylex";

const WIDE = "@media (min-width: 1024px)";

const styles = stylex.create({
  // First on phones, where a mod page reads top to bottom.
  head: { order: 1, display: "flex", flexDirection: "column", gap: space.md, minWidth: 0 },
  eyebrow: {
    margin: 0,
    fontSize: text.md,
    fontWeight: 600,
    color: color.accentText,
    textDecoration: { default: "none", ":hover": "underline" },
  },
  title: {
    margin: 0,
    fontSize: { default: text.h1, [WIDE]: text.display },
    fontWeight: 800,
    letterSpacing: tracking.tighter,
    lineHeight: 0.98,
    overflowWrap: "anywhere",
  },
  byline: { margin: 0, fontSize: text.lg, color: color.muted },
});

type AnchorProps = Omit<ComponentProps<"a">, "className" | "style"> & {
  ref?: Ref<HTMLAnchorElement>;
};

function EyebrowAnchor({ ref, children, ...props }: AnchorProps) {
  return (
    <a ref={ref} {...props} {...stylex.props(styles.eyebrow)}>
      {children}
    </a>
  );
}

/** The line above a mod's title: where it lives, as a link back there. */
export const ModEyebrow = createLink(EyebrowAnchor);

/**
 * The top of a mod's page, for texture packs and code mods alike: where it
 * lives, its title, who made it and when, then whatever the page puts under.
 */
export function ModHeader({
  eyebrow,
  title,
  byline,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  byline?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header {...stylex.props(styles.head)}>
      {eyebrow}
      <h1 {...stylex.props(styles.title)}>{title}</h1>
      {byline && <p {...stylex.props(styles.byline)}>{byline}</p>}
      {children}
    </header>
  );
}
