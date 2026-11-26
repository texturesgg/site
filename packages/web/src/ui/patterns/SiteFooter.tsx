import * as stylex from "@stylexjs/stylex";
import { DISCORD_URL, GITHUB_URL } from "@/lib/config";
import { useFeatureFlag } from "@/lib/feature-flags";
import { createLink } from "@tanstack/react-router";
import type { ComponentProps, Ref } from "react";
import { color, radius, space, text } from "../tokens.stylex";
import { layout } from "./layout";

const styles = stylex.create({
  footer: {
    marginTop: space.xxxl,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
  inner: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingBlock: space.lg,
    fontSize: text.sm,
    color: color.muted,
  },
  nav: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  company: { paddingInline: space.xs, whiteSpace: "nowrap" },
  link: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "44px",
    paddingInline: space.xs,
    color: { default: color.muted, ":hover": color.text },
    textDecoration: "none",
    borderRadius: radius.sm,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accentText}` },
  },
});

function FooterAnchor({
  ref,
  children,
  ...props
}: Omit<ComponentProps<"a">, "className" | "style"> & { ref?: Ref<HTMLAnchorElement> }) {
  return (
    <a ref={ref} {...props} {...stylex.props(styles.link)}>
      {children}
    </a>
  );
}
const FooterLink = createLink(FooterAnchor);

export function SiteFooter() {
  // The legal pages are drafts behind the code-mods flag until they're approved.
  const codeMods = useFeatureFlag("codeMods");
  return (
    <footer {...stylex.props(styles.footer)}>
      <div {...stylex.props(layout.container, styles.inner)}>
        <p>
          {codeMods
            ? "textures.gg, a community archive of Melee skins and mods"
            : "textures.gg, a community archive of Super Smash Bros. Melee textures"}
        </p>
        <nav aria-label="Footer" {...stylex.props(styles.nav)}>
          <FooterLink to="/docs/mods">Docs</FooterLink>
          <FooterLink to="/about">About</FooterLink>
          <FooterAnchor href={DISCORD_URL}>Discord</FooterAnchor>
          <FooterAnchor href={GITHUB_URL}>GitHub</FooterAnchor>
          {codeMods && (
            <>
              <FooterLink to="/legal/terms">Terms</FooterLink>
              <FooterLink to="/legal/privacy">Privacy</FooterLink>
              <FooterLink to="/legal/copyright">Copyright</FooterLink>
              <span {...stylex.props(styles.company)}>© 2026 Saavylab LLC</span>
            </>
          )}
        </nav>
      </div>
    </footer>
  );
}
