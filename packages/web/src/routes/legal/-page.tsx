import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { Article } from "@/ui/patterns/Article";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { color, radius, space, text } from "@/ui/tokens.stylex";

// The terms, privacy and copyright pages share this frame. They are drafts:
// behind the code-mods flag, kept out of search, and marked as drafts until
// the owner approves the text.

/** When the current text took effect; shown under each page's title. */
export const LEGAL_UPDATED = "Draft, not in effect";

/** The meta tags of a legal page. */
export function legalHead(title: string, description: string) {
  return {
    meta: [
      { title: `${title} - textures.gg` },
      { name: "description", content: description },
      { name: "robots", content: "noindex" },
    ],
  };
}

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  draft: {
    margin: 0,
    padding: `${space.sm} ${space.md}`,
    borderRadius: radius.md,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    fontSize: text.sm,
    color: color.text,
  },
});

/** A legal page: its title, the draft notice, and its sections. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader title={title} description={`Saavylab LLC · ${LEGAL_UPDATED}`} />
      <div {...stylex.props(layout.narrow)}>
        <Article>
          <p {...stylex.props(styles.draft)}>
            <strong>Draft.</strong> This page is waiting for review and isn&apos;t in effect yet.
          </p>
          {children}
        </Article>
      </div>
    </div>
  );
}
