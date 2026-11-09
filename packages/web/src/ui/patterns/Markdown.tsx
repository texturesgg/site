import * as stylex from "@stylexjs/stylex";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { color, font, radius, space, text, tracking } from "../tokens.stylex";

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    maxWidth: "72ch",
    fontSize: text.md,
    lineHeight: 1.6,
    overflowWrap: "anywhere",
  },
  h2: {
    margin: 0,
    marginTop: space.sm,
    fontSize: text.h3,
    fontWeight: 800,
    letterSpacing: tracking.tight,
  },
  h3: { margin: 0, marginTop: space.sm, fontSize: text.lg, fontWeight: 700 },
  h4: { margin: 0, fontSize: text.md, fontWeight: 700 },
  p: { margin: 0 },
  list: {
    margin: 0,
    paddingLeft: space.lg,
    listStyle: "revert",
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
  },
  link: {
    color: color.accentText,
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  code: {
    padding: "0.1em 0.35em",
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    fontFamily: font.mono,
    fontSize: "0.9em",
  },
  pre: {
    margin: 0,
    padding: space.md,
    overflowX: "auto",
    borderRadius: radius.md,
    backgroundColor: color.surface,
    fontFamily: font.mono,
    fontSize: text.sm,
    lineHeight: 1.5,
  },
  quote: {
    margin: 0,
    paddingLeft: space.md,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: color.line,
    color: color.muted,
  },
  table: { borderCollapse: "collapse", fontSize: text.sm },
  cell: {
    padding: `${space.xxs} ${space.sm}`,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.line,
    textAlign: "left",
  },
  hr: { width: "100%", margin: 0, border: "none", borderTop: `1px solid ${color.line}` },
});

type Node = { type: string; value?: string; children?: Node[] };
/** The text inside a markdown element. */
function textOf(node: Node): string {
  if (node.type === "text") return node.value ?? "";
  return node.children?.map(textOf).join("") ?? "";
}

// Headings sit under the page's own title, so a README's # is a section.
const components: Components = {
  h1: ({ children }) => <h2 {...stylex.props(styles.h2)}>{children}</h2>,
  h2: ({ children }) => <h2 {...stylex.props(styles.h2)}>{children}</h2>,
  h3: ({ children }) => <h3 {...stylex.props(styles.h3)}>{children}</h3>,
  h4: ({ children }) => <h4 {...stylex.props(styles.h4)}>{children}</h4>,
  h5: ({ children }) => <h4 {...stylex.props(styles.h4)}>{children}</h4>,
  h6: ({ children }) => <h4 {...stylex.props(styles.h4)}>{children}</h4>,
  p: ({ children }) => <p {...stylex.props(styles.p)}>{children}</p>,
  ul: ({ children }) => <ul {...stylex.props(styles.list)}>{children}</ul>,
  ol: ({ children }) => <ol {...stylex.props(styles.list)}>{children}</ol>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      {...stylex.props(styles.link)}
    >
      {children}
    </a>
  ),
  code: ({ children }) => <code {...stylex.props(styles.code)}>{children}</code>,
  // A fenced block, as its plain text: the inline chip style is for `code` alone.
  pre: ({ node }) => (
    <pre {...stylex.props(styles.pre)}>
      <code>{node ? textOf(node) : null}</code>
    </pre>
  ),
  blockquote: ({ children }) => <blockquote {...stylex.props(styles.quote)}>{children}</blockquote>,
  table: ({ children }) => <table {...stylex.props(styles.table)}>{children}</table>,
  th: ({ children }) => <th {...stylex.props(styles.cell)}>{children}</th>,
  td: ({ children }) => <td {...stylex.props(styles.cell)}>{children}</td>,
  hr: () => <hr {...stylex.props(styles.hr)} />,
  // Images in a README would load from anywhere; the listing's screenshots
  // are where a mod shows itself, so an image is its alt text.
  img: ({ alt }) => (alt ? <span>{alt}</span> : null),
};

/** Markdown a mod maker wrote (a README or changelog), without raw HTML. */
export function Markdown({ children }: { children: string }) {
  return (
    <div {...stylex.props(styles.root)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
