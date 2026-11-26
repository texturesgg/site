import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import type { ModDocsHeading, ModDocsRelease } from "@vgskins/shared/mod-docs";
import { type ComponentProps, type ReactNode, useEffect, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { z } from "zod";
import { docsPagePath, resolveDocsImage, resolveDocsLink } from "@/lib/mod-docs-links";
import { CheckIcon, InfoIcon, LinkIcon, TipIcon, WarningIcon } from "@/ui/icons";
import { headingSlug, type MarkdownLink } from "@/ui/patterns/Markdown";
import { color, font, motion, radius, space, text, tracking } from "@/ui/tokens.stylex";
import { CodeBlock, CodeTabs, type CodeTabSpec } from "./-code";

type MdastNode = {
  type: string;
  depth?: number;
  value?: string;
  lang?: string | null;
  meta?: string | null;
  children?: MdastNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, string>;
  };
};

function mdastText(node: MdastNode): string {
  if (typeof node.value === "string") return node.value;
  return node.children?.map(mdastText).join("") ?? "";
}

const FENCE_ATTR = /\b(title|tab)="([^"]+)"/g;

function parseFenceMeta(meta: string | null | undefined): { title?: string; tab?: string } {
  if (!meta) return {};
  const result: { title?: string; tab?: string } = {};
  for (const match of meta.matchAll(FENCE_ATTR)) {
    const key = match[1];
    const value = match[2];
    if (key === "title") result.title = value;
    else if (key === "tab") result.tab = value;
  }
  return result;
}

const CALLOUT_MARKER = /^\[!(NOTE|TIP|WARNING)\]\s*/i;

/**
 * Remark plugin for docs markdown extensions:
 * - Assigns heading `id`s directly from the format 2 index in document order
 *   (outside React render so StrictMode double-rendering never shifts cursors).
 * - Parses `title="..."` and `tab="..."` on fenced code blocks.
 * - Groups adjacent `tab="..."` fences into one `tgg-code-tabs` node.
 * - Detects GitHub alert callouts (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`).
 */
function remarkDocsExtensions(headings: readonly ModDocsHeading[] = []) {
  return (tree: MdastNode) => {
    const state = { cursor: 0 };
    transformChildren(tree, headings, state);
  };
}

function transformChildren(
  parent: MdastNode,
  headings: readonly ModDocsHeading[],
  state: { cursor: number }
) {
  const children = parent.children;
  if (!children || children.length === 0) return;

  const next: MdastNode[] = [];
  let i = 0;
  while (i < children.length) {
    const node = children[i];

    if (node.type === "heading" && typeof node.depth === "number" && node.depth >= 2) {
      const expected = headings[state.cursor];
      let id: string | undefined;
      if (expected && expected.depth === node.depth) {
        state.cursor++;
        id = expected.id;
      } else {
        const label = mdastText(node).trim();
        id = label ? headingSlug(label) : undefined;
      }
      if (id) {
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            id,
          },
        };
      }
      next.push(node);
      i++;
      continue;
    }

    // Group adjacent fenced code blocks that carry tab="...".
    if (node.type === "code") {
      const meta = parseFenceMeta(node.meta);
      if (meta.tab) {
        const tabs: CodeTabSpec[] = [];
        let j = i;
        while (j < children.length && children[j].type === "code") {
          const item = children[j];
          const itemMeta = parseFenceMeta(item.meta);
          if (!itemMeta.tab) break;
          tabs.push({
            label: itemMeta.tab,
            title: itemMeta.title,
            lang: item.lang ?? undefined,
            code: item.value ?? "",
          });
          j++;
        }
        next.push({
          type: "tggCodeTabs",
          data: {
            hName: "tgg-code-tabs",
            hProperties: { "data-tabs": JSON.stringify(tabs) },
          },
        });
        i = j;
        continue;
      }

      // Single fenced code block: preserve lang and optional title.
      node.data = {
        ...node.data,
        hProperties: {
          ...node.data?.hProperties,
          ...(node.lang ? { "data-lang": node.lang } : {}),
          ...(meta.title ? { "data-title": meta.title } : {}),
        },
      };
      next.push(node);
      i++;
      continue;
    }

    // Detect GitHub alert callouts on blockquotes.
    if (node.type === "blockquote" && node.children && node.children.length > 0) {
      const first = node.children[0];
      const firstText = first?.type === "paragraph" ? first.children?.[0] : undefined;
      if (firstText?.type === "text" && typeof firstText.value === "string") {
        const match = CALLOUT_MARKER.exec(firstText.value);
        if (match) {
          const kind = match[1].toLowerCase();
          firstText.value = firstText.value.slice(match[0].length);
          if (firstText.value.startsWith("\n")) firstText.value = firstText.value.slice(1);
          if (firstText.value === "" && first.children && first.children.length > 1) {
            first.children.shift();
          }
          node.data = {
            ...node.data,
            hProperties: {
              ...node.data?.hProperties,
              "data-callout": kind,
            },
          };
        }
      }
    }

    transformChildren(node, headings, state);
    next.push(node);
    i++;
  }

  parent.children = next;
}

const CodeTabSchema = z.array(
  z.object({
    label: z.string(),
    title: z.string().optional(),
    lang: z.string().optional(),
    code: z.string(),
  })
);

const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    fontSize: text.md,
    lineHeight: 1.65,
    color: color.text,
    overflowWrap: "anywhere",
  },
  headingRow: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    scrollMarginTop: "84px",
  },
  h2: {
    margin: 0,
    marginTop: space.lg,
    fontSize: text.h3,
    fontWeight: 800,
    letterSpacing: tracking.tight,
    lineHeight: 1.25,
  },
  h3: {
    margin: 0,
    marginTop: space.md,
    fontSize: text.xl,
    fontWeight: 700,
    letterSpacing: tracking.tight,
    lineHeight: 1.3,
  },
  h4: {
    margin: 0,
    marginTop: space.sm,
    fontSize: text.md,
    fontWeight: 700,
    lineHeight: 1.4,
  },
  anchorBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "26px",
    height: "26px",
    borderRadius: radius.sm,
    color: { default: color.muted, ":hover": color.text },
    opacity: {
      default: 0,
      ":hover": 1,
      ":focus-visible": 1,
      [stylex.when.ancestor(":hover")]: 1,
    },
    transitionProperty: "opacity, color",
    transitionDuration: { default: motion.fast, [REDUCED_MOTION]: "0ms" },
    transitionTimingFunction: motion.easing,
    flexShrink: 0,
    ":focus-visible": {
      outline: `2px solid ${color.accentText}`,
      outlineOffset: "2px",
    },
  },
  anchorCopied: {
    opacity: 1,
    color: color.success,
  },
  p: { margin: 0 },
  list: {
    margin: 0,
    paddingLeft: space.lg,
    listStyle: "revert",
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
  },
  link: {
    color: color.accentText,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },
  inlineCode: {
    padding: "0.1em 0.35em",
    borderRadius: radius.sm,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
    backgroundColor: color.surface,
    fontFamily: font.mono,
    fontSize: "0.88em",
  },
  quote: {
    margin: 0,
    padding: `${space.sm} ${space.md}`,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    color: color.muted,
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
  },
  callout: {
    margin: 0,
    padding: `${space.sm} ${space.md}`,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
  },
  calloutHead: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    fontSize: text.sm,
    fontWeight: 700,
    color: color.text,
  },
  calloutNoteIcon: { color: color.muted },
  calloutTipIcon: { color: color.success },
  calloutWarnIcon: { color: color.accentText },
  calloutBody: {
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
    fontSize: text.sm,
    color: color.muted,
  },
  tableWrap: {
    width: "100%",
    overflowX: "auto",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
    borderRadius: radius.md,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: text.sm,
  },
  th: {
    padding: `${space.xs} ${space.sm}`,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.lineStrong,
    backgroundColor: color.surface,
    color: color.text,
    fontWeight: 700,
    textAlign: "left",
    whiteSpace: "nowrap",
  },
  td: {
    padding: `${space.xs} ${space.sm}`,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
    textAlign: "left",
    verticalAlign: "top",
  },
  hr: {
    width: "100%",
    margin: `${space.xs} 0`,
    border: "none",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
  figure: {
    margin: `${space.xs} 0`,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: color.surface,
  },
  img: {
    width: "100%",
    height: "auto",
    display: "block",
  },
});

type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function textOf(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return node.children?.map(textOf).join("") ?? "";
}

function HeadingWithCopy({
  tag,
  id,
  urlPath,
  children,
}: {
  tag: "h2" | "h3" | "h4";
  id?: string;
  urlPath: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyLink = () => {
    if (!id) return;
    const full = `${window.location.origin}${urlPath}#${id}`;
    void navigator.clipboard?.writeText(full).then(() => setCopied(true));
  };

  const Tag = tag;
  return (
    <Tag id={id} {...stylex.props(stylex.defaultMarker(), styles.headingRow, styles[tag])}>
      <span>{children}</span>
      {id && (
        <button
          type="button"
          onClick={copyLink}
          aria-label={copied ? "Link copied" : "Copy link to section"}
          {...stylex.props(styles.anchorBtn, copied && styles.anchorCopied)}
        >
          {copied ? <CheckIcon size={15} /> : <LinkIcon size={15} />}
        </button>
      )}
    </Tag>
  );
}

function Callout({ kind, children }: { kind: "note" | "tip" | "warning"; children: ReactNode }) {
  const meta =
    kind === "tip"
      ? { label: "Tip", icon: <TipIcon size={16} />, iconStyle: styles.calloutTipIcon }
      : kind === "warning"
        ? { label: "Warning", icon: <WarningIcon size={16} />, iconStyle: styles.calloutWarnIcon }
        : { label: "Note", icon: <InfoIcon size={16} />, iconStyle: styles.calloutNoteIcon };

  return (
    <aside {...stylex.props(styles.callout)}>
      <div {...stylex.props(styles.calloutHead)}>
        <span {...stylex.props(meta.iconStyle)}>{meta.icon}</span>
        <span>{meta.label}</span>
      </div>
      <div {...stylex.props(styles.calloutBody)}>{children}</div>
    </aside>
  );
}

type DocsMarkdownProps = {
  children: string;
  wanted: string;
  page: string;
  release: Pick<ModDocsRelease, "pages" | "headers">;
  headings: readonly ModDocsHeading[];
};

export function DocsMarkdown({ children, wanted, page, release, headings }: DocsMarkdownProps) {
  const navigate = useNavigate();
  const pageUrl = docsPagePath(wanted, page);
  const remarkPlugins = useMemo(
    () =>
      [remarkGfm, [remarkDocsExtensions, headings]] as ComponentProps<
        typeof ReactMarkdown
      >["remarkPlugins"],
    [headings]
  );

  const renderLink = (href: string | undefined, content: ReactNode) => {
    const target: MarkdownLink = href ? resolveDocsLink(href, wanted, page, release) : null;
    if (!target) return <span>{content}</span>;
    if (target.to === "external") {
      return (
        <a
          href={target.href}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          {...stylex.props(styles.link)}
        >
          {content}
        </a>
      );
    }
    return (
      <a
        href={target.href}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          void navigate({ href: target.href });
        }}
        {...stylex.props(styles.link)}
      >
        {content}
      </a>
    );
  };

  const components: Components & Record<string, unknown> = {
    h1: ({ id, children: c }) => (
      <HeadingWithCopy tag="h2" id={id} urlPath={pageUrl}>
        {c}
      </HeadingWithCopy>
    ),
    h2: ({ id, children: c }) => (
      <HeadingWithCopy tag="h2" id={id} urlPath={pageUrl}>
        {c}
      </HeadingWithCopy>
    ),
    h3: ({ id, children: c }) => (
      <HeadingWithCopy tag="h3" id={id} urlPath={pageUrl}>
        {c}
      </HeadingWithCopy>
    ),
    h4: ({ id, children: c }) => (
      <HeadingWithCopy tag="h4" id={id} urlPath={pageUrl}>
        {c}
      </HeadingWithCopy>
    ),
    h5: ({ id, children: c }) => (
      <HeadingWithCopy tag="h4" id={id} urlPath={pageUrl}>
        {c}
      </HeadingWithCopy>
    ),
    h6: ({ id, children: c }) => (
      <HeadingWithCopy tag="h4" id={id} urlPath={pageUrl}>
        {c}
      </HeadingWithCopy>
    ),
    p: ({ children: c }) => <p {...stylex.props(styles.p)}>{c}</p>,
    ul: ({ children: c }) => <ul {...stylex.props(styles.list)}>{c}</ul>,
    ol: ({ children: c }) => <ol {...stylex.props(styles.list)}>{c}</ol>,
    a: ({ href, children: c }) => renderLink(href, c),
    code: ({ children: c }) => <code {...stylex.props(styles.inlineCode)}>{c}</code>,
    pre: ({ node }) => {
      const hast = node as HastNode | undefined;
      const codeNode = hast?.children?.find((child) => child.tagName === "code");
      const props = codeNode?.properties ?? {};
      const lang = typeof props["data-lang"] === "string" ? props["data-lang"] : undefined;
      const title = typeof props["data-title"] === "string" ? props["data-title"] : undefined;
      const source = textOf(codeNode ?? hast);
      return <CodeBlock code={source} lang={lang} title={title} />;
    },
    "tgg-code-tabs": ({ node }: { node?: HastNode }) => {
      const raw = node?.properties?.["data-tabs"];
      if (typeof raw !== "string") return null;
      try {
        const parsed = CodeTabSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) return null;
        return <CodeTabs tabs={parsed.data} />;
      } catch {
        return null;
      }
    },
    blockquote: ({ node, children: c }) => {
      const kind = (node as HastNode | undefined)?.properties?.["data-callout"];
      if (kind === "note" || kind === "tip" || kind === "warning") {
        return <Callout kind={kind}>{c}</Callout>;
      }
      return <blockquote {...stylex.props(styles.quote)}>{c}</blockquote>;
    },
    table: ({ children: c }) => (
      <div {...stylex.props(styles.tableWrap)}>
        <table {...stylex.props(styles.table)}>{c}</table>
      </div>
    ),
    th: ({ children: c }) => <th {...stylex.props(styles.th)}>{c}</th>,
    td: ({ children: c }) => <td {...stylex.props(styles.td)}>{c}</td>,
    hr: () => <hr {...stylex.props(styles.hr)} />,
    img: ({ src, alt }) => {
      const resolved = src ? resolveDocsImage(src, wanted, page) : null;
      if (!resolved) return alt ? <span>{alt}</span> : null;
      return (
        <figure {...stylex.props(styles.figure)}>
          <img src={resolved} alt={alt ?? ""} loading="lazy" {...stylex.props(styles.img)} />
        </figure>
      );
    },
  };

  return (
    <div {...stylex.props(styles.root)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
