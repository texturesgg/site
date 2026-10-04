import * as stylex from "@stylexjs/stylex";
import { DISCORD_URL, GITHUB_URL } from "@/lib/config";
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
  nav: { display: "flex", flexWrap: "wrap", gap: space.xs },
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
  return (
    <footer {...stylex.props(styles.footer)}>
      <div {...stylex.props(layout.container, styles.inner)}>
        <p>textures.gg — a community archive of Super Smash Bros. Melee textures</p>
        <nav aria-label="Footer" {...stylex.props(styles.nav)}>
          <FooterLink to="/guides">Install guide</FooterLink>
          <FooterLink to="/download">App</FooterLink>
          <FooterLink to="/about">About</FooterLink>
          <FooterAnchor href={DISCORD_URL}>Discord</FooterAnchor>
          <FooterAnchor href={GITHUB_URL}>GitHub</FooterAnchor>
        </nav>
      </div>
    </footer>
  );
}
