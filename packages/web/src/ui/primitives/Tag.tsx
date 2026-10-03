import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { CloseIcon } from "../icons";
import { color, font, radius, space, text } from "../tokens.stylex";
import { shared } from "./shared";

const styles = stylex.create({
  tag: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xxs,
    minHeight: "36px",
    paddingInlineStart: space.sm,
    paddingInlineEnd: space.xs,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
    borderRadius: radius.pill,
    backgroundColor: { default: "transparent", ":hover": color.surface },
    color: color.text,
    fontFamily: font.sans,
    fontSize: text.sm,
    fontWeight: 600,
    cursor: "pointer",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    minWidth: "22px",
    justifyContent: "center",
    paddingInline: "7px",
    paddingBlock: "1px",
    borderRadius: radius.pill,
    fontFamily: font.mono,
    fontSize: text.xs,
    fontWeight: 500,
    lineHeight: 1.5,
  },
  accent: { backgroundColor: color.accent, color: color.onAccent },
  neutral: { backgroundColor: color.raise, color: color.text },
});

/** A removable filter token. The whole tag is the remove button. */
export function Tag({ children, onRemove }: { children: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Remove ${children}`}
      onClick={onRemove}
      {...stylex.props(styles.tag, shared.focusRing)}
    >
      {children}
      <CloseIcon size={14} />
    </button>
  );
}

/** A small count or status. */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "accent" | "neutral";
}) {
  return <span {...stylex.props(styles.badge, styles[tone])}>{children}</span>;
}
