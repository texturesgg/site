import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { color, radius, space, text, tracking } from "../tokens.stylex";

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: space.sm,
    paddingBlock: space.xxl,
    paddingInline: space.lg,
    borderRadius: radius.xl,
    borderWidth: "1px",
    borderStyle: "dashed",
    borderColor: color.line,
    textAlign: "center",
  },
  title: { margin: 0, fontSize: text.h3, fontWeight: 800, letterSpacing: tracking.tight },
  body: { margin: 0, maxWidth: "440px", fontSize: text.md, lineHeight: 1.5, color: color.muted },
  action: { marginTop: space.xs },
});

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- <output> takes phrasing content only; this holds paragraphs and an action.
    <div role="status" {...stylex.props(styles.root)}>
      <p {...stylex.props(styles.title)}>{title}</p>
      {body && <p {...stylex.props(styles.body)}>{body}</p>}
      {action && <div {...stylex.props(styles.action)}>{action}</div>}
    </div>
  );
}
