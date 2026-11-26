import * as stylex from "@stylexjs/stylex";
import { Link, notFound, useLocation } from "@tanstack/react-router";
import {
  docsPageLabel,
  docsPageSection,
  docsPrevNext,
  type ModDocsRelease,
} from "@vgskins/shared/mod-docs";
import { DetailedError } from "hono/client";
import { useEffect } from "react";
import { docsPagePath, stripDocsFrontmatter } from "@/lib/mod-docs-links";
import { ChevronLeftIcon, ChevronRightIcon } from "@/ui/icons";
import { color, font, motion, radius, space, text, tracking } from "@/ui/tokens.stylex";
import { CodeBlock } from "./-code";
import { DocsMarkdown } from "./-markdown";
import { OnThisPageDisclosure, OnThisPageSidebar } from "./-toc";

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
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    document.getElementById(id)?.scrollIntoView();
  }, [hash, ready]);
}

const COMPACT = "@media (max-width: 1199px)";
const PHONE = "@media (max-width: 640px)";
const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";

const styles = stylex.create({
  articleGrid: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 720px) 200px", [COMPACT]: "minmax(0, 720px)" },
    alignItems: "start",
    gap: { default: space.xxl, [COMPACT]: space.lg },
  },
  article: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
  },
  tocDesktop: {
    display: { default: "block", [COMPACT]: "none" },
    minWidth: 0,
  },
  tocCompact: {
    display: { default: "none", [COMPACT]: "block" },
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
    paddingBottom: space.md,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
  },
  eyebrow: {
    margin: 0,
    fontSize: text.sm,
    fontWeight: 600,
    color: color.muted,
  },
  title: {
    margin: 0,
    fontSize: { default: text.h1, [PHONE]: text.h2 },
    fontWeight: 800,
    letterSpacing: tracking.tighter,
    lineHeight: 1.12,
    color: color.text,
  },
  lead: {
    margin: 0,
    fontSize: text.lg,
    lineHeight: 1.55,
    color: color.muted,
  },
  prevNext: {
    display: "grid",
    gridTemplateColumns: { default: "1fr 1fr", [PHONE]: "1fr" },
    gap: space.sm,
    marginTop: space.lg,
    paddingTop: space.lg,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
  navCard: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: { default: color.line, ":hover": color.lineStrong },
    backgroundColor: { default: color.surface, ":hover": color.raise },
    textDecoration: "none",
    transitionProperty: "background-color, border-color",
    transitionDuration: { default: motion.fast, [REDUCED_MOTION]: "0ms" },
    transitionTimingFunction: motion.easing,
  },
  navCardNext: {
    alignItems: "flex-end",
    textAlign: "right",
  },
  navCardLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xxs,
    fontSize: text.xs,
    color: color.muted,
  },
  navCardTitle: {
    fontSize: text.md,
    fontWeight: 700,
    color: color.text,
  },
  headerPage: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    minWidth: 0,
    maxWidth: "820px",
  },
  headerTitle: {
    margin: 0,
    fontFamily: font.mono,
    fontSize: text.h2,
    fontWeight: 800,
    letterSpacing: tracking.tight,
  },
  headerInclude: {
    margin: 0,
    fontFamily: font.mono,
    fontSize: text.sm,
    color: color.muted,
  },
  landing: {
    display: "flex",
    flexDirection: "column",
    gap: space.xl,
    maxWidth: "920px",
    minWidth: 0,
  },
  heroCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: { default: color.lineStrong, ":hover": color.accentText },
    backgroundColor: { default: color.surface, ":hover": color.raise },
    textDecoration: "none",
    transitionProperty: "background-color, border-color",
    transitionDuration: { default: motion.fast, [REDUCED_MOTION]: "0ms" },
    transitionTimingFunction: motion.easing,
  },
  heroText: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
  },
  heroTitle: {
    margin: 0,
    fontSize: text.h3,
    fontWeight: 800,
    letterSpacing: tracking.tight,
    color: color.text,
  },
  heroDesc: {
    margin: 0,
    fontSize: text.md,
    color: color.muted,
  },
  sectionBlock: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
  },
  sectionHeading: {
    margin: 0,
    fontSize: text.h3,
    fontWeight: 800,
    letterSpacing: tracking.tight,
    color: color.text,
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: { default: "repeat(2, minmax(0, 1fr))", [PHONE]: "1fr" },
    gap: space.sm,
  },
  guideCard: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: { default: color.line, ":hover": color.lineStrong },
    backgroundColor: { default: color.surface, ":hover": color.raise },
    textDecoration: "none",
    transitionProperty: "background-color, border-color",
    transitionDuration: { default: motion.fast, [REDUCED_MOTION]: "0ms" },
    transitionTimingFunction: motion.easing,
  },
  guideCardTitle: {
    margin: 0,
    fontSize: text.lg,
    fontWeight: 700,
    color: color.text,
  },
  guideCardDesc: {
    margin: 0,
    fontSize: text.sm,
    lineHeight: 1.5,
    color: color.muted,
  },
});

/** A standard docs page with section eyebrow, title, lead, TOC, body, and prev/next. */
export function DocsPage({
  text: raw,
  wanted,
  page,
  release,
}: {
  text: string;
  wanted: string;
  page: string;
  release: ModDocsRelease;
}) {
  const meta = release.pages[page];
  const section = docsPageSection(page, release.nav);
  const { prev, next } = docsPrevNext(page, release.nav);
  const body = stripDocsFrontmatter(raw);
  const headings = meta?.headings ?? [];

  useScrollToHash(`${page}:${body.length}`);

  return (
    <div {...stylex.props(styles.articleGrid)}>
      <article {...stylex.props(styles.article)}>
        {meta && (
          <header {...stylex.props(styles.header)}>
            {section && <p {...stylex.props(styles.eyebrow)}>{section.title}</p>}
            <h1 {...stylex.props(styles.title)}>{meta.title}</h1>
            <p {...stylex.props(styles.lead)}>{meta.description}</p>
          </header>
        )}

        {headings.length > 0 && (
          <div {...stylex.props(styles.tocCompact)}>
            <OnThisPageDisclosure headings={headings} />
          </div>
        )}

        <DocsMarkdown wanted={wanted} page={page} release={release} headings={headings}>
          {body}
        </DocsMarkdown>

        {(prev || next) && (
          <nav aria-label="Adjacent pages" {...stylex.props(styles.prevNext)}>
            {prev ? (
              <Link to={docsPagePath(wanted, prev)} {...stylex.props(styles.navCard)}>
                <span {...stylex.props(styles.navCardLabel)}>
                  <ChevronLeftIcon size={14} />
                  Previous
                </span>
                <span {...stylex.props(styles.navCardTitle)}>
                  {docsPageLabel(prev, release.pages)}
                </span>
              </Link>
            ) : (
              <div />
            )}
            {next && (
              <Link
                to={docsPagePath(wanted, next)}
                {...stylex.props(styles.navCard, styles.navCardNext)}
              >
                <span {...stylex.props(styles.navCardLabel)}>
                  Next
                  <ChevronRightIcon size={14} />
                </span>
                <span {...stylex.props(styles.navCardTitle)}>
                  {docsPageLabel(next, release.pages)}
                </span>
              </Link>
            )}
          </nav>
        )}
      </article>

      <aside {...stylex.props(styles.tocDesktop)}>
        <OnThisPageSidebar headings={headings} />
      </aside>
    </div>
  );
}

/** Extract the intro paragraph(s) of index.md before the first ## heading. */
function landingIntro(raw: string): string {
  const body = stripDocsFrontmatter(raw);
  const nextHeading = body.search(/^##\s/m);
  return nextHeading === -1 ? body : body.slice(0, nextHeading).trim();
}

/** Landing page generated from index.md's intro plus the release's nav and page metadata. */
export function DocsLanding({
  text: raw,
  wanted,
  release,
}: {
  text: string;
  wanted: string;
  release: ModDocsRelease;
}) {
  const indexMeta = release.pages.index;
  const intro = landingIntro(raw);
  const quickstartId = release.pages["start/quickstart"]
    ? "start/quickstart"
    : release.nav[0]?.pages[0];
  const quickstartMeta = quickstartId ? release.pages[quickstartId] : undefined;
  const guidesSection = release.nav.find((section) => section.title === "Guides");
  const otherSections = release.nav.filter(
    (section) => section.title !== "Guides" && section.title !== "Start"
  );

  return (
    <div {...stylex.props(styles.landing)}>
      {indexMeta && (
        <header {...stylex.props(styles.header)}>
          <p {...stylex.props(styles.eyebrow)}>Mod docs</p>
          <h1 {...stylex.props(styles.title)}>{indexMeta.title}</h1>
          <p {...stylex.props(styles.lead)}>{indexMeta.description}</p>
        </header>
      )}

      {intro && (
        <DocsMarkdown wanted={wanted} page="index" release={release} headings={[]}>
          {intro}
        </DocsMarkdown>
      )}

      {quickstartId && quickstartMeta && (
        <Link to={docsPagePath(wanted, quickstartId)} {...stylex.props(styles.heroCard)}>
          <div {...stylex.props(styles.heroText)}>
            <span {...stylex.props(styles.eyebrow)}>Start here</span>
            <h2 {...stylex.props(styles.heroTitle)}>{quickstartMeta.title}</h2>
            <p {...stylex.props(styles.heroDesc)}>{quickstartMeta.description}</p>
          </div>
          <ChevronRightIcon size={20} />
        </Link>
      )}

      {guidesSection && guidesSection.pages.length > 0 && (
        <section {...stylex.props(styles.sectionBlock)}>
          <h2 {...stylex.props(styles.sectionHeading)}>Guides</h2>
          <div {...stylex.props(styles.cardGrid)}>
            {guidesSection.pages.map((pageId) => {
              const meta = release.pages[pageId];
              if (!meta) return null;
              return (
                <Link
                  key={pageId}
                  to={docsPagePath(wanted, pageId)}
                  {...stylex.props(styles.guideCard)}
                >
                  <h3 {...stylex.props(styles.guideCardTitle)}>{meta.title}</h3>
                  <p {...stylex.props(styles.guideCardDesc)}>{meta.description}</p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {otherSections.length > 0 && (
        <section {...stylex.props(styles.sectionBlock)}>
          <h2 {...stylex.props(styles.sectionHeading)}>More</h2>
          <div {...stylex.props(styles.cardGrid)}>
            {otherSections.map((section) => {
              const firstPage = section.pages[0];
              if (!firstPage) return null;
              const meta = release.pages[firstPage];
              return (
                <Link
                  key={section.title}
                  to={docsPagePath(wanted, firstPage)}
                  {...stylex.props(styles.guideCard)}
                >
                  <h3 {...stylex.props(styles.guideCardTitle)}>{section.title}</h3>
                  <p {...stylex.props(styles.guideCardDesc)}>
                    {meta?.description ?? `${section.pages.length} pages`}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/** An SDK C header as the release shipped it, syntax highlighted. */
export function HeaderPage({ name, text: source }: { name: string; text: string }) {
  return (
    <div {...stylex.props(styles.headerPage)}>
      <header {...stylex.props(styles.header)}>
        <p {...stylex.props(styles.eyebrow)}>Native C header</p>
        <h1 {...stylex.props(styles.headerTitle)}>{name}.h</h1>
        <p {...stylex.props(styles.headerInclude)}>#include &lt;tgg/{name}.h&gt;</p>
      </header>
      <CodeBlock code={source} lang="c" title={`tgg/${name}.h`} />
    </div>
  );
}
