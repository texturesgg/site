import * as stylex from "@stylexjs/stylex";
import { createLink } from "@tanstack/react-router";
import type { ComponentProps, ReactNode, Ref } from "react";
import { Badge } from "../primitives";
import { shared } from "../primitives/shared";
import { color, font, space, text } from "../tokens.stylex";

const styles = stylex.create({
  nav: {
    display: "flex",
    gap: space.lg,
    overflowX: "auto",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
    scrollbarWidth: "none",
  },
  link: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    flexShrink: 0,
    minHeight: "48px",
    marginBottom: "-1px",
    borderBottomWidth: "2px",
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    color: { default: color.muted, ":hover": color.text },
    fontFamily: font.sans,
    fontSize: text.lg,
    fontWeight: 700,
    textDecoration: "none",
  },
  active: {
    color: { default: color.text, ":hover": color.text },
    borderBottomColor: color.accentText,
  },
});

type AnchorProps = Omit<ComponentProps<"a">, "className" | "style"> & {
  ref?: Ref<HTMLAnchorElement>;
  /** Set by the router on the link to the current page. */
  "data-status"?: string;
  count?: number;
  /** Highlight the count, such as work waiting for a moderator. */
  urgent?: boolean;
};

function NavTabAnchor({ ref, count, urgent, children, ...props }: AnchorProps) {
  const active = props["data-status"] === "active";
  return (
    <a
      ref={ref}
      {...props}
      {...stylex.props(styles.link, shared.focusRing, active && styles.active)}
    >
      {children}
      {count !== undefined && <Badge tone={urgent ? "accent" : "neutral"}>{count}</Badge>}
    </a>
  );
}

/** A section switcher whose tabs are links, so each section has its own URL. */
export const NavTab = createLink(NavTabAnchor);

export function NavTabs({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label} {...stylex.props(styles.nav)}>
      {children}
    </nav>
  );
}
