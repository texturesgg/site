import * as stylex from "@stylexjs/stylex";
import { useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { useFeatureFlag } from "@/lib/feature-flags";
import { CloseIcon } from "../icons";
import { IconButton, TextLink } from "../primitives";
import { color, space, text } from "../tokens.stylex";
import { layout } from "./layout";

/**
 * The current announcement, and the one for viewers with code mods on. A new
 * id shows again to people who closed the last one.
 */
const ANNOUNCEMENTS = {
  current: {
    id: "app-0.2.0",
    message:
      "textures.gg 0.2.0 installs lasers, shines and other fighter effects, and shows them on your fighter.",
    link: { to: "/download", label: "Get the app" },
  },
  codeMods: {
    id: "app-0.3.0",
    message: "The textures.gg app now plays tgg-melee with mods, and it's on Windows too.",
    link: { to: "/download", label: "Get the app" },
  },
} as const;

const storageKey = (id: string) => `announcement-dismissed:${id}`;

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

function wasDismissed(id: string): boolean {
  try {
    return localStorage.getItem(storageKey(id)) !== null;
  } catch {
    return false;
  }
}

export function Announcement() {
  const { pathname } = useLocation();
  const announcement = useFeatureFlag("codeMods") ? ANNOUNCEMENTS.codeMods : ANNOUNCEMENTS.current;
  const [dismissed, setDismissed] = useState<string[]>([]);
  if (
    dismissed.includes(announcement.id) ||
    wasDismissed(announcement.id) ||
    pathname === announcement.link.to
  ) {
    return null;
  }

  const dismiss = () => {
    setDismissed((ids) => [...ids, announcement.id]);
    try {
      localStorage.setItem(storageKey(announcement.id), "1");
    } catch {
      // Storage can be unavailable; it stays closed for this visit.
    }
  };

  return (
    <section aria-label="Announcement" {...stylex.props(styles.bar)}>
      <div {...stylex.props(layout.container, styles.inner)}>
        <p {...stylex.props(styles.message)}>
          {announcement.message}{" "}
          <TextLink to={announcement.link.to}>{announcement.link.label}</TextLink>
        </p>
        <IconButton label="Dismiss" icon={<CloseIcon />} onClick={dismiss} />
      </div>
    </section>
  );
}
