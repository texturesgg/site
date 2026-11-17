import * as stylex from "@stylexjs/stylex";
import { DownloadIcon } from "../icons";
import { AnchorButton, TextLink } from "../primitives";
import { color, font, space, text } from "../tokens.stylex";

const styles = stylex.create({
  install: { display: "flex", flexDirection: "column", gap: space.sm },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.md },
  hint: { margin: 0, fontSize: text.sm, color: color.muted },
  command: { fontFamily: font.mono, color: color.text, overflowWrap: "anywhere" },
});

/**
 * Install, which opens the textures.gg app on a mod or set, the way to get
 * the app for anyone who doesn't have it yet, and the same with tgg.
 */
export function InstallActions({
  href,
  label,
  command,
}: {
  href: string;
  label: string;
  /** The tgg command that installs it. */
  command: string;
}) {
  return (
    <div {...stylex.props(styles.install)}>
      <div {...stylex.props(styles.row)}>
        <AnchorButton href={href} variant="primary" icon={<DownloadIcon />} aria-label={label}>
          Install
        </AnchorButton>
        <span {...stylex.props(styles.hint)}>
          Needs the <TextLink to="/download">textures.gg app</TextLink>
        </span>
      </div>
      <p {...stylex.props(styles.hint)}>
        Or with tgg: <code {...stylex.props(styles.command)}>{command}</code>
      </p>
    </div>
  );
}
