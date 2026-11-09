import * as stylex from "@stylexjs/stylex";
import { DownloadIcon } from "../icons";
import { AnchorButton, TextLink } from "../primitives";
import { color, space, text } from "../tokens.stylex";

const styles = stylex.create({
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.md },
  hint: { fontSize: text.sm, color: color.muted },
});

/**
 * Install, which opens the textures.gg app on a mod or set, and the way to
 * get the app for anyone who doesn't have it yet.
 */
export function InstallActions({ href, label }: { href: string; label: string }) {
  return (
    <div {...stylex.props(styles.row)}>
      <AnchorButton href={href} variant="primary" icon={<DownloadIcon />} aria-label={label}>
        Install
      </AnchorButton>
      <span {...stylex.props(styles.hint)}>
        Needs the <TextLink to="/download">textures.gg app</TextLink>
      </span>
    </div>
  );
}
