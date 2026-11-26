import * as stylex from "@stylexjs/stylex";
import { notFound, useLocation } from "@tanstack/react-router";
import type { ModDocsRelease } from "@vgskins/shared/mod-docs";
import { DetailedError } from "hono/client";
import { useEffect } from "react";
import { resolveDocsLink } from "@/lib/mod-docs-links";
import { Markdown } from "@/ui/patterns/Markdown";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

/** A docs loader's fetch: a version, page or header that isn't there is not found. */
export async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof DetailedError && error.statusCode < 500) throw notFound();
    throw error;
  }
}

/** Scrolls to the heading the URL's #anchor names once the page has drawn it. */
function useScrollToHash(ready: string) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash))?.scrollIntoView();
  }, [hash, ready]);
}

/** A docs page, its links pointing at this version's pages. */
export function DocsPage({
  text,
  wanted,
  page,
  release,
}: {
  text: string;
  wanted: string;
  page: string;
  release: ModDocsRelease;
}) {
  useScrollToHash(text);
  return (
    <Markdown headingIds resolveLink={(href) => resolveDocsLink(href, wanted, page, release)}>
      {text}
    </Markdown>
  );
}

const styles = stylex.create({
  head: { display: "flex", flexDirection: "column", gap: space.xxs },
  title: { margin: 0, fontFamily: font.mono, fontSize: text.h2, fontWeight: 800 },
  include: { margin: 0, fontFamily: font.mono, fontSize: text.sm, color: color.muted },
  code: {
    margin: 0,
    padding: space.md,
    overflowX: "auto",
    borderRadius: radius.md,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
    backgroundColor: color.surface,
    fontFamily: font.mono,
    fontSize: text.sm,
    lineHeight: 1.5,
    whiteSpace: "pre",
  },
  page: { display: "flex", flexDirection: "column", gap: space.md, minWidth: 0 },
});

/** An SDK header as the release shipped it. */
export function HeaderPage({ name, text: source }: { name: string; text: string }) {
  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.head)}>
        <h1 {...stylex.props(styles.title)}>{name}.h</h1>
        <p {...stylex.props(styles.include)}>#include &lt;tgg/{name}.h&gt;</p>
      </div>
      <pre {...stylex.props(styles.code)}>{source}</pre>
    </div>
  );
}
