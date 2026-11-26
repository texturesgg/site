import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "@/ui/icons";
import { color, font, motion, radius, space, syntax, text } from "@/ui/tokens.stylex";
import {
  type HighlightToken,
  highlightCode,
  normalizeDocsLang,
  type SyntaxKind,
} from "./-highlight";

export type CodeTabSpec = {
  label: string;
  title?: string;
  lang?: string;
  code: string;
};

const OS_STORAGE_KEY = "tgg-docs-os";
const OS_SYNC_EVENT = "tgg-docs-os-change";
const OS_PATTERN = /^(linux|macos|linux\s*\/\s*macos|windows|unix|posix)$/i;

function isOsTabGroup(tabs: readonly CodeTabSpec[]): boolean {
  return tabs.length >= 2 && tabs.every((tab) => OS_PATTERN.test(tab.label.trim()));
}

function readStoredOs(): string | null {
  try {
    return window.localStorage.getItem(OS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredOs(label: string) {
  try {
    window.localStorage.setItem(OS_STORAGE_KEY, label);
    window.dispatchEvent(new CustomEvent(OS_SYNC_EVENT, { detail: label }));
  } catch {
    // Ignore storage failures in private browsing modes.
  }
}

const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";

const styles = stylex.create({
  frame: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    overflow: "hidden",
  },
  terminalFrame: {
    backgroundColor: color.bg,
    borderColor: color.line,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
    backgroundColor: color.bg,
  },
  title: {
    fontFamily: font.mono,
    fontSize: text.xs,
    color: color.muted,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tabList: {
    display: "flex",
    alignItems: "center",
    gap: space.xxs,
    overflowX: "auto",
    minWidth: 0,
  },
  tab: {
    paddingBlock: space.xxs,
    paddingInline: space.sm,
    borderRadius: radius.pill,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "transparent",
    fontFamily: font.mono,
    fontSize: text.xs,
    fontWeight: 500,
    color: { default: color.muted, ":hover": color.text },
    backgroundColor: "transparent",
    whiteSpace: "nowrap",
    transitionProperty: "color, background-color, border-color",
    transitionDuration: { default: motion.fast, [REDUCED_MOTION]: "0ms" },
    transitionTimingFunction: motion.easing,
    ":focus-visible": {
      outline: `2px solid ${color.accentText}`,
      outlineOffset: "2px",
    },
  },
  tabActive: {
    color: color.text,
    fontWeight: 600,
    backgroundColor: color.raise,
    borderColor: color.lineStrong,
  },
  body: {
    position: "relative",
  },
  copyFloating: {
    position: "absolute",
    top: space.xs,
    right: space.xs,
  },
  copyBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xxs,
    minHeight: "28px",
    paddingBlock: "3px",
    paddingInline: space.xs,
    borderRadius: radius.pill,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: { default: color.line, ":hover": color.lineStrong },
    backgroundColor: { default: color.surface, ":hover": color.raise },
    color: { default: color.muted, ":hover": color.text },
    fontFamily: font.sans,
    fontSize: text.xs,
    fontWeight: 500,
    flexShrink: 0,
    transitionProperty: "color, background-color, border-color",
    transitionDuration: { default: motion.fast, [REDUCED_MOTION]: "0ms" },
    transitionTimingFunction: motion.easing,
    ":focus-visible": {
      outline: `2px solid ${color.accentText}`,
      outlineOffset: "2px",
    },
  },
  copyDone: {
    color: color.success,
    borderColor: color.lineStrong,
  },
  pre: {
    margin: 0,
    padding: space.md,
    overflowX: "auto",
    fontFamily: font.mono,
    fontSize: text.sm,
    lineHeight: 1.55,
    color: color.text,
    tabSize: 2,
  },
  preWithFloatingCopy: {
    paddingRight: "80px",
  },
  preTerminal: {
    color: color.muted,
  },
});

const synStyles = stylex.create({
  comment: { color: syntax.comment, fontStyle: "italic" },
  keyword: { color: syntax.keyword },
  string: { color: syntax.string },
  number: { color: syntax.number },
  fn: { color: syntax.fn },
  type: { color: syntax.type },
  operator: { color: syntax.operator },
  punctuation: { color: syntax.punctuation },
  property: { color: syntax.property },
});

function tokenStyle(kind: SyntaxKind | undefined) {
  return kind ? synStyles[kind] : null;
}

function CopyButton({ text: source, floating = false }: { text: string; floating?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(source).then(() => {
      setCopied(true);
    });
  };

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied code" : "Copy code"}
      {...stylex.props(styles.copyBtn, copied && styles.copyDone, floating && styles.copyFloating)}
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

function HighlightedPre({
  code,
  lang,
  floatingCopy = false,
}: {
  code: string;
  lang?: string;
  floatingCopy?: boolean;
}) {
  const trimmed = code.replace(/\n$/, "");
  const supported = normalizeDocsLang(lang);
  const isTerminal = supported === null;
  const [tokens, setTokens] = useState<HighlightToken[][] | null>(null);

  useEffect(() => {
    if (!supported) {
      setTokens(null);
      return;
    }
    let canceled = false;
    void highlightCode(trimmed, supported)
      .then((next) => {
        if (!canceled) setTokens(next);
      })
      .catch(() => {
        if (!canceled) setTokens(null);
      });
    return () => {
      canceled = true;
    };
  }, [trimmed, supported]);

  return (
    <pre
      {...stylex.props(
        styles.pre,
        isTerminal && styles.preTerminal,
        floatingCopy && styles.preWithFloatingCopy
      )}
    >
      <code>
        {tokens
          ? tokens.map((line, lineIdx) => (
              <span key={lineIdx}>
                {line.map((token, tokIdx) => (
                  <span key={tokIdx} {...stylex.props(tokenStyle(token.kind))}>
                    {token.content}
                  </span>
                ))}
                {lineIdx + 1 < tokens.length ? "\n" : null}
              </span>
            ))
          : trimmed}
      </code>
    </pre>
  );
}

export function CodeBlock({ code, lang, title }: { code: string; lang?: string; title?: string }) {
  const isTerminal = normalizeDocsLang(lang) === null;
  const trimmed = code.replace(/\n$/, "");

  return (
    <div {...stylex.props(styles.frame, isTerminal && styles.terminalFrame)}>
      {title && (
        <div {...stylex.props(styles.header)}>
          <span {...stylex.props(styles.title)}>{title}</span>
          <CopyButton text={trimmed} />
        </div>
      )}
      <div {...stylex.props(styles.body)}>
        {!title && <CopyButton text={trimmed} floating />}
        <HighlightedPre code={trimmed} lang={lang} floatingCopy={!title} />
      </div>
    </div>
  );
}

export function CodeTabs({ tabs }: { tabs: readonly CodeTabSpec[] }) {
  const osGroup = isOsTabGroup(tabs);
  const [active, setActive] = useState(() => {
    if (osGroup) {
      const saved = readStoredOs();
      if (saved) {
        const idx = tabs.findIndex((t) => t.label === saved);
        if (idx !== -1) return idx;
      }
    }
    return 0;
  });

  useEffect(() => {
    if (!osGroup) return;
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      const idx = tabs.findIndex((t) => t.label === detail);
      if (idx !== -1) setActive(idx);
    };
    window.addEventListener(OS_SYNC_EVENT, onSync);
    return () => window.removeEventListener(OS_SYNC_EVENT, onSync);
  }, [osGroup, tabs]);

  const current = tabs[active] ?? tabs[0];
  if (!current) return null;

  const isTerminal = normalizeDocsLang(current.lang) === null;
  const trimmed = current.code.replace(/\n$/, "");

  const pick = (idx: number) => {
    setActive(idx);
    if (osGroup && tabs[idx]) {
      writeStoredOs(tabs[idx].label);
    }
  };

  return (
    <div {...stylex.props(styles.frame, isTerminal && styles.terminalFrame)}>
      <div {...stylex.props(styles.header)}>
        <div role="tablist" aria-label="Code files" {...stylex.props(styles.tabList)}>
          {tabs.map((tab, idx) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={idx === active}
              onClick={() => pick(idx)}
              {...stylex.props(styles.tab, idx === active && styles.tabActive)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <CopyButton text={trimmed} />
      </div>
      <div role="tabpanel" {...stylex.props(styles.body)}>
        <HighlightedPre code={trimmed} lang={current.lang} />
      </div>
    </div>
  );
}
