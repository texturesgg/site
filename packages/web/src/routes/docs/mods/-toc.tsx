import * as stylex from "@stylexjs/stylex";
import type { ModDocsHeading } from "@vgskins/shared/mod-docs";
import { useEffect, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@/ui/icons";
import { color, motion, radius, space, text } from "@/ui/tokens.stylex";

const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";

const styles = stylex.create({
  sidebar: {
    position: "sticky",
    top: space.lg,
    maxHeight: "calc(100vh - 48px)",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
  },
  heading: {
    margin: 0,
    fontSize: text.xs,
    fontWeight: 700,
    color: color.text,
  },
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  link: {
    display: "block",
    paddingBlock: "4px",
    fontSize: text.xs,
    lineHeight: 1.45,
    color: { default: color.muted, ":hover": color.text },
    fontWeight: 400,
    textDecoration: "none",
    transitionProperty: "color",
    transitionDuration: { default: motion.fast, [REDUCED_MOTION]: "0ms" },
    transitionTimingFunction: motion.easing,
  },
  nested: {
    paddingLeft: space.sm,
  },
  active: {
    color: color.text,
    fontWeight: 600,
  },
  disclosure: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    padding: `${space.xs} ${space.sm}`,
  },
  disclosureBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    minHeight: "36px",
    fontSize: text.sm,
    fontWeight: 600,
    color: color.text,
  },
  disclosureBody: {
    paddingTop: space.xs,
    marginTop: space.xs,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
});

function useActiveHeading(headings: readonly ModDocsHeading[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(headings[0]?.id ?? null);

  useEffect(() => {
    setActiveId(headings[0]?.id ?? null);
    if (headings.length === 0) return;

    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [headings]);

  return activeId;
}

export function OnThisPageSidebar({ headings }: { headings: readonly ModDocsHeading[] }) {
  const items = headings.filter((h) => h.depth === 2 || h.depth === 3);
  const activeId = useActiveHeading(items);
  if (items.length === 0) return null;

  return (
    <nav aria-label="On this page" {...stylex.props(styles.sidebar)}>
      <h2 {...stylex.props(styles.heading)}>On this page</h2>
      <ul {...stylex.props(styles.list)}>
        {items.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              {...stylex.props(
                styles.link,
                h.depth === 3 && styles.nested,
                activeId === h.id && styles.active
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function OnThisPageDisclosure({ headings }: { headings: readonly ModDocsHeading[] }) {
  const items = headings.filter((h) => h.depth === 2 || h.depth === 3);
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <div {...stylex.props(styles.disclosure)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        {...stylex.props(styles.disclosureBtn)}
      >
        <span>On this page</span>
        {open ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
      </button>
      {open && (
        <div {...stylex.props(styles.disclosureBody)}>
          <ul {...stylex.props(styles.list)}>
            {items.map((h) => (
              <li key={h.id}>
                <a
                  href={`#${h.id}`}
                  onClick={() => setOpen(false)}
                  {...stylex.props(styles.link, h.depth === 3 && styles.nested)}
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
