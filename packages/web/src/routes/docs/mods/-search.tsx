import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type {
  ModDocsRelease,
  ModDocsSearchRecord,
  ModDocsSymbolKind,
} from "@vgskins/shared/mod-docs";
import { useEffect, useMemo, useRef, useState } from "react";
import { docsPagePath } from "@/lib/mod-docs-links";
import { modDocsSearchQuery } from "@/lib/mod-docs-queries";
import { createDocsSearchEngine } from "@/lib/mod-docs-search";
import { CloseIcon, SearchIcon } from "@/ui/icons";
import { Badge, Dialog, IconButton } from "@/ui/primitives";
import { color, font, motion, radius, space, text } from "@/ui/tokens.stylex";

const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";

const SYMBOL_KIND_LABELS: Record<ModDocsSymbolKind, string> = {
  function: "fn",
  method: "method",
  property: "prop",
  event: "event",
  type: "type",
  constant: "const",
  c_function: "C",
};

const QUICK_PAGES = [
  "start/quickstart",
  "guides/hud",
  "reference/events",
  "reference/fighter",
  "reference/draw",
  "reference/constants",
];

const styles = stylex.create({
  trigger: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
    width: "100%",
    minHeight: "36px",
    paddingBlock: "6px",
    paddingInline: space.sm,
    borderRadius: radius.sm,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: { default: color.line, ":hover": color.lineStrong },
    backgroundColor: { default: color.surface, ":hover": color.raise },
    color: { default: color.muted, ":hover": color.text },
    fontSize: text.sm,
    textAlign: "left",
    cursor: "pointer",
    transitionProperty: "color, background-color, border-color",
    transitionDuration: { default: motion.fast, [REDUCED_MOTION]: "0ms" },
    transitionTimingFunction: motion.easing,
  },
  triggerLeft: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    minWidth: 0,
  },
  kbd: {
    display: "inline-flex",
    alignItems: "center",
    paddingBlock: "2px",
    paddingInline: "6px",
    borderRadius: radius.sm,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
    backgroundColor: color.bg,
    color: color.muted,
    fontFamily: font.mono,
    fontSize: "11px",
    lineHeight: 1.2,
    flexShrink: 0,
  },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    paddingInline: space.sm,
    minHeight: "44px",
    borderRadius: radius.md,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: { default: color.lineStrong, ":focus-within": color.accent },
    backgroundColor: color.bg,
  },
  input: {
    flexGrow: 1,
    minWidth: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: color.text,
    fontFamily: font.sans,
    fontSize: text.md,
    outline: "none",
    paddingBlock: space.xs,
  },
  results: {
    marginTop: space.md,
    maxHeight: "min(56dvh, 460px)",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: space.md,
  },
  group: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  groupLabel: {
    margin: 0,
    paddingInline: space.xs,
    paddingBottom: space.xxs,
    fontSize: text.xs,
    fontWeight: 700,
    color: color.muted,
  },
  resultRow: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    width: "100%",
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderRadius: radius.md,
    borderWidth: 0,
    backgroundColor: { default: "transparent", ":hover": color.surface },
    color: color.text,
    textAlign: "left",
    cursor: "pointer",
    transitionProperty: "background-color",
    transitionDuration: { default: motion.fast, [REDUCED_MOTION]: "0ms" },
    transitionTimingFunction: motion.easing,
  },
  resultActive: {
    backgroundColor: color.surface,
  },
  rowTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
    flexWrap: "wrap",
  },
  rowTitleGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: text.sm,
    fontWeight: 600,
    color: color.text,
    overflowWrap: "anywhere",
  },
  rowTitleMono: {
    fontFamily: font.mono,
    fontSize: text.sm,
    fontWeight: 600,
    color: color.text,
    overflowWrap: "anywhere",
  },
  rowMeta: {
    fontSize: text.xs,
    color: color.muted,
    fontFamily: font.mono,
    overflowWrap: "anywhere",
  },
  rowBreadcrumb: {
    fontSize: text.xs,
    color: color.muted,
  },
  signature: {
    fontFamily: font.mono,
    fontSize: text.xs,
    color: color.accent,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  excerpt: {
    fontSize: text.xs,
    lineHeight: 1.45,
    color: color.muted,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  empty: {
    margin: 0,
    paddingBlock: space.lg,
    textAlign: "center",
    fontSize: text.sm,
    color: color.muted,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: color.line,
    fontSize: text.xs,
    color: color.muted,
    flexWrap: "wrap",
  },
  hints: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.sm,
  },
  hintItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  },
});

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

/** Hook that manages the docs search dialog state and Ctrl+K / `/` shortcuts. */
export function useDocsSearchShortcut() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open, setOpen };
}

/** Desktop sidebar button that opens the search dialog. */
export function DocsSearchTrigger({ onClick }: { onClick: () => void }) {
  const [shortcut, setShortcut] = useState("Ctrl K");

  useEffect(() => {
    if (typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform)) {
      setShortcut("⌘K");
    }
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search docs"
      {...stylex.props(styles.trigger)}
    >
      <span {...stylex.props(styles.triggerLeft)}>
        <SearchIcon size={15} />
        <span>Search</span>
      </span>
      <kbd {...stylex.props(styles.kbd)}>{shortcut}</kbd>
    </button>
  );
}

/** Compact mobile icon button that opens the search dialog. */
export function DocsSearchMobileButton({ onClick }: { onClick: () => void }) {
  return <IconButton label="Search docs" icon={<SearchIcon size={18} />} onClick={onClick} />;
}

/** Modal search dialog lazy-loading the version's search.json and querying with MiniSearch. */
export function DocsSearchDialog({
  open,
  onOpenChange,
  version,
  release,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
  release: ModDocsRelease;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const {
    data: searchIndex,
    isPending,
    isError,
  } = useQuery({
    ...modDocsSearchQuery(version),
    enabled: open,
  });

  const engine = useMemo(
    () => (searchIndex ? createDocsSearchEngine(searchIndex) : null),
    [searchIndex]
  );

  const groups = useMemo(() => {
    if (!engine) return [];
    return engine.search(query);
  }, [engine, query]);

  const quickItems: ModDocsSearchRecord[] = useMemo(
    () =>
      QUICK_PAGES.filter((pid) => pid in release.pages).map((pid) => {
        const meta = release.pages[pid];
        return {
          id: `quick:${pid}`,
          kind: "page",
          page: pid,
          section: "Quick links",
          title: meta.title,
          pageTitle: meta.title,
          text: meta.description,
        };
      }),
    [release.pages]
  );

  const trimmed = query.trim();
  const displayedGroups = useMemo(
    () => (trimmed ? groups : [{ label: "Jump to", items: quickItems }]),
    [trimmed, groups, quickItems]
  );

  const flatItems = useMemo(
    () => displayedGroups.flatMap((group) => group.items),
    [displayedGroups]
  );

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const el = itemRefs.current[activeIndex];
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const openRecord = (record: ModDocsSearchRecord) => {
    const base = docsPagePath(version, record.page);
    const href = record.anchor ? `${base}#${record.anchor}` : base;
    onOpenChange(false);
    void navigate({ href });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
      return;
    }
    if (flatItems.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((idx) => (idx + 1) % flatItems.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((idx) => (idx - 1 + flatItems.length) % flatItems.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = flatItems[activeIndex];
      if (target) openRecord(target);
    }
  };

  let runningIndex = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Search docs" wide>
      <div {...stylex.props(styles.searchBox)}>
        <SearchIcon size={16} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search Luau or C API, events, constants, guides..."
          aria-label="Search mod docs"
          autoComplete="off"
          spellCheck={false}
          {...stylex.props(styles.input)}
        />
        {query && (
          <IconButton
            label="Clear search"
            icon={<CloseIcon size={14} />}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          />
        )}
      </div>

      <div aria-label="Search results" {...stylex.props(styles.results)}>
        {trimmed && isPending && <p {...stylex.props(styles.empty)}>Loading search index...</p>}
        {trimmed && isError && (
          <p {...stylex.props(styles.empty)}>Search index is unavailable for this version.</p>
        )}
        {trimmed && !isPending && !isError && flatItems.length === 0 && (
          <p {...stylex.props(styles.empty)}>No matches for "{trimmed}".</p>
        )}

        {(!trimmed || (!isPending && !isError && flatItems.length > 0)) &&
          displayedGroups.map((group) => (
            <div key={group.label} {...stylex.props(styles.group)}>
              <h3 {...stylex.props(styles.groupLabel)}>{group.label}</h3>
              {group.items.map((item) => {
                const index = runningIndex++;
                const isActive = index === activeIndex;
                const isSymbol = item.kind === "symbol";
                const showCName =
                  isSymbol && item.cName && item.cName !== item.title && !item.cName.includes(" ");
                return (
                  <button
                    key={item.id}
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    type="button"
                    aria-current={isActive ? "true" : undefined}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => openRecord(item)}
                    {...stylex.props(styles.resultRow, isActive && styles.resultActive)}
                  >
                    <div {...stylex.props(styles.rowTop)}>
                      <span {...stylex.props(styles.rowTitleGroup)}>
                        <span {...stylex.props(isSymbol ? styles.rowTitleMono : styles.rowTitle)}>
                          {item.title}
                        </span>
                        {isSymbol && item.symbolKind && (
                          <Badge>{SYMBOL_KIND_LABELS[item.symbolKind]}</Badge>
                        )}
                      </span>
                      {showCName ? (
                        <span {...stylex.props(styles.rowMeta)}>{item.cName}</span>
                      ) : item.kind === "heading" ? (
                        <span {...stylex.props(styles.rowBreadcrumb)}>{item.pageTitle}</span>
                      ) : null}
                    </div>
                    {isSymbol && item.signature && (
                      <div {...stylex.props(styles.signature)}>{item.signature}</div>
                    )}
                    {item.text && <div {...stylex.props(styles.excerpt)}>{item.text}</div>}
                  </button>
                );
              })}
            </div>
          ))}
      </div>

      <div {...stylex.props(styles.footer)}>
        <span {...stylex.props(styles.hints)}>
          <span {...stylex.props(styles.hintItem)}>
            <kbd {...stylex.props(styles.kbd)}>↑↓</kbd> navigate
          </span>
          <span {...stylex.props(styles.hintItem)}>
            <kbd {...stylex.props(styles.kbd)}>↵</kbd> open
          </span>
          <span {...stylex.props(styles.hintItem)}>
            <kbd {...stylex.props(styles.kbd)}>Esc</kbd> close
          </span>
        </span>
        {searchIndex && <span>{searchIndex.records.length.toLocaleString()} entries</span>}
      </div>
    </Dialog>
  );
}
