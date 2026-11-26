import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
import { CheckIcon, DownloadIcon } from "../icons";
import { AnchorButton, TextLink } from "../primitives";
import { color, font, radius, space, text } from "../tokens.stylex";

const styles = stylex.create({
  install: { display: "flex", flexDirection: "column", gap: space.sm },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.md },
  rowColumn: { flexDirection: "column", alignItems: "stretch", gap: space.xs },
  hint: { margin: 0, fontSize: text.sm, color: color.muted },
  commandBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderRadius: radius.md,
    backgroundColor: color.bg,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
  },
  commandBarSurface: {
    paddingBlock: space.sm,
    paddingInline: space.md,
    backgroundColor: color.surface,
  },
  command: {
    fontFamily: font.mono,
    fontSize: text.xs,
    color: color.text,
    overflowWrap: "anywhere",
  },
  commandSurface: {
    fontSize: text.sm,
  },
  copyButton: {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderRadius: radius.sm,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
    backgroundColor: { default: color.surface, ":hover": color.raise },
    color: color.text,
    fontFamily: font.sans,
    fontSize: text.xs,
    lineHeight: 1.2,
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
  },
});

/** A monospace command row with a one-click copy button. */
export function CommandBar({
  command,
  surface = "bg",
}: {
  command: string;
  /** Use "surface" when placed directly on the page background. */
  surface?: "bg" | "surface";
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(command).then(() => setCopied(true));
  };

  return (
    <div {...stylex.props(styles.commandBar, surface === "surface" && styles.commandBarSurface)}>
      <code {...stylex.props(styles.command, surface === "surface" && styles.commandSurface)}>
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${command}`}
        {...stylex.props(styles.copyButton)}
      >
        {copied ? (
          <>
            <CheckIcon size={12} />
            Copied
          </>
        ) : (
          "Copy"
        )}
      </button>
    </div>
  );
}

/**
 * Install, which opens the textures.gg app on a mod or set, the way to get
 * the app for anyone who doesn't have it yet, and a copyable tgg command.
 */
export function InstallActions({
  href,
  label,
  command,
  fullWidth = false,
}: {
  href: string;
  label: string;
  /** The tgg command that installs it. */
  command: string;
  /** Stretch the primary action to fill its container (for boxed panels). */
  fullWidth?: boolean;
}) {
  return (
    <div {...stylex.props(styles.install)}>
      <div {...stylex.props(styles.row, fullWidth && styles.rowColumn)}>
        <AnchorButton
          href={href}
          variant="primary"
          fullWidth={fullWidth}
          icon={<DownloadIcon />}
          aria-label={label}
        >
          Install in app
        </AnchorButton>
        <span {...stylex.props(styles.hint)}>
          Needs the <TextLink to="/download">textures.gg app</TextLink>
        </span>
      </div>
      <CommandBar command={command} />
    </div>
  );
}
