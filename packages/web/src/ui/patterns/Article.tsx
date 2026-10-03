import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { color, font, radius, space, text, tracking } from "../tokens.stylex";

// Building blocks for prose pages (guides, about, download): titled sections,
// numbered steps, and tips, at a readable measure.

const styles = stylex.create({
  article: { display: "flex", flexDirection: "column", gap: space.xl },
  section: { display: "flex", flexDirection: "column", gap: space.sm },
  title: { margin: 0, fontSize: text.h3, fontWeight: 800, letterSpacing: tracking.tight },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    fontSize: text.lg,
    lineHeight: 1.6,
    color: color.text,
    maxWidth: "68ch",
  },
  steps: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  step: { display: "flex", gap: space.sm },
  number: {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    borderRadius: radius.pill,
    backgroundColor: color.raise,
    fontFamily: font.mono,
    fontSize: text.sm,
    color: color.text,
  },
  stepBody: {
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
    minWidth: 0,
    paddingTop: "2px",
  },
  tip: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    fontSize: text.md,
    lineHeight: 1.5,
    color: color.muted,
  },
  tipLabel: { fontSize: text.sm, fontWeight: 700, color: color.accentText },
  list: {
    margin: 0,
    paddingInlineStart: space.lg,
    listStyleType: "disc",
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
  },
  code: {
    fontFamily: font.mono,
    fontSize: "0.9em",
    paddingInline: space.xxs,
    borderRadius: radius.sm,
    backgroundColor: color.raise,
  },
  strong: { fontWeight: 700 },
});

export function Article({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.article)}>{children}</div>;
}

/** A titled part of a prose page; the title becomes an h2. */
export function ArticleSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section {...stylex.props(styles.section)}>
      <h2 {...stylex.props(styles.title)}>{title}</h2>
      <div {...stylex.props(styles.body)}>{children}</div>
    </section>
  );
}

/** Numbered instructions; `start` continues numbering across sections. */
export function Steps({ start = 1, children }: { start?: number; children: ReactNode }) {
  return (
    <ol start={start} {...stylex.props(styles.steps)}>
      {children}
    </ol>
  );
}

export function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <li {...stylex.props(styles.step)}>
      <span aria-hidden="true" {...stylex.props(styles.number)}>
        {number}
      </span>
      <div {...stylex.props(styles.stepBody)}>{children}</div>
    </li>
  );
}

export function Tip({ children }: { children: ReactNode }) {
  return (
    <aside {...stylex.props(styles.tip)}>
      <span {...stylex.props(styles.tipLabel)}>Tip</span>
      <span>{children}</span>
    </aside>
  );
}

export function BulletList({ children }: { children: ReactNode }) {
  return <ul {...stylex.props(styles.list)}>{children}</ul>;
}

export function Code({ children }: { children: ReactNode }) {
  return <code {...stylex.props(styles.code)}>{children}</code>;
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong {...stylex.props(styles.strong)}>{children}</strong>;
}
