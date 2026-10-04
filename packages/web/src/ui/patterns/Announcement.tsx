import * as stylex from "@stylexjs/stylex";
import { useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { CloseIcon } from "../icons";
import { IconButton, TextLink } from "../primitives";
import { color, space, text } from "../tokens.stylex";
import { layout } from "./layout";

/** The current announcement. A new id shows again to people who closed the last one. */
const ANNOUNCEMENT = {
  id: "app-0.2.0",
  message:
    "textures.gg 0.2.0 installs lasers, shines and other fighter effects, and shows them on your fighter.",
  link: { to: "/download", label: "Get the app" },
} as const;

const storageKey = `announcement-dismissed:${ANNOUNCEMENT.id}`;

const styles = stylex.create({
  bar: {
    backgroundColor: color.surface,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
  },
  inner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    fontSize: text.sm,
  },
  message: { margin: 0, paddingBlock: space.xs, color: color.muted },
});

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(storageKey) !== null;
  } catch {
    return false;
  }
}

export function Announcement() {
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(wasDismissed);
  if (dismissed || pathname === ANNOUNCEMENT.link.to) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // Storage can be unavailable; it stays closed for this visit.
    }
  };

  return (
    <section aria-label="Announcement" {...stylex.props(styles.bar)}>
      <div {...stylex.props(layout.container, styles.inner)}>
        <p {...stylex.props(styles.message)}>
          {ANNOUNCEMENT.message}{" "}
          <TextLink to={ANNOUNCEMENT.link.to}>{ANNOUNCEMENT.link.label}</TextLink>
        </p>
        <IconButton label="Dismiss" icon={<CloseIcon />} onClick={dismiss} />
      </div>
    </section>
  );
}
