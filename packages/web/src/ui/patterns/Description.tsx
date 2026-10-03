import * as stylex from "@stylexjs/stylex";
import { Fragment, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "../primitives";
import { color, space, text } from "../tokens.stylex";

const LINES = 8;
const LINE_HEIGHT = 1.6;

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: space.xs },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    maxWidth: "68ch",
    fontSize: text.lg,
    lineHeight: LINE_HEIGHT,
    overflowWrap: "anywhere",
  },
  // The fade marks the cut as truncation; a hard edge through a line reads as a bug.
  clamped: { maxHeight: `${LINES * LINE_HEIGHT}em`, overflow: "hidden" },
  faded: {
    maskImage: `linear-gradient(to bottom, black calc(100% - ${2 * LINE_HEIGHT}em), transparent)`,
  },
  paragraph: { margin: 0, whiteSpace: "pre-line" },
  link: {
    color: color.accentText,
    textDecoration: "underline",
    textUnderlineOffset: "2px",
    ":hover": { textDecorationThickness: "2px" },
  },
});

// Only plain http(s) URLs become links; everything else stays text.
const URL_PATTERN = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

/** Splits text into plain runs and http(s) links. */
export function linkSegments(value: string): { text: string; href?: string }[] {
  return value
    .split(URL_PATTERN)
    .map((part, index) => (index % 2 === 1 ? { text: part, href: part } : { text: part }))
    .filter((segment) => segment.text !== "");
}

function Linkified({ text: value }: { text: string }) {
  return linkSegments(value).map((segment, index) =>
    segment.href ? (
      <a
        key={index}
        href={segment.href}
        target="_blank"
        rel="nofollow ugc noopener noreferrer"
        {...stylex.props(styles.link)}
      >
        {segment.text}
      </a>
    ) : (
      <Fragment key={index}>{segment.text}</Fragment>
    )
  );
}

/**
 * User-written text such as a pack description: paragraphs from blank lines,
 * clickable links, and a "Show more" toggle once it passes eight lines.
 */
export function Description({ text: value }: { text: string }) {
  const id = useId();
  const body = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  const paragraphs = value
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  // Measure while clamped; the toggle appears only when text is actually hidden.
  useLayoutEffect(() => {
    const element = body.current;
    if (!element || expanded) return;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, value]);

  return (
    <div {...stylex.props(styles.root)}>
      <div
        id={id}
        ref={body}
        {...stylex.props(
          styles.body,
          !expanded && styles.clamped,
          !expanded && overflows && styles.faded
        )}
      >
        {paragraphs.map((paragraph, index) => (
          <p key={index} {...stylex.props(styles.paragraph)}>
            <Linkified text={paragraph} />
          </p>
        ))}
      </div>
      {(overflows || expanded) && (
        <Button
          variant="text"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </div>
  );
}
