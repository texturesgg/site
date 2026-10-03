import * as stylex from "@stylexjs/stylex";
import { color, font, space } from "../tokens.stylex";

const PHONE = "@media (max-width: 640px)";

/** Apply the root styles (and later a theme) to <html>, so portals inherit them too. */
export function applyDocumentStyles() {
  const { className } = stylex.props(layout.html);
  if (className) document.documentElement.classList.add(...className.split(" "));
  // The browser chrome takes the page ground from its token, not a copy of it.
  const themeColor = document.createElement("meta");
  themeColor.name = "theme-color";
  themeColor.content = getComputedStyle(document.documentElement).backgroundColor;
  document.head.appendChild(themeColor);
}

/** Page-level layout shared by the shell and pages. */
export const layout = stylex.create({
  /** Styles for <html>: the page ground, text color, and font. Themes apply here too. */
  html: {
    backgroundColor: color.bg,
    color: color.text,
    fontFamily: font.sans,
    colorScheme: "dark",
  },
  /** Centered content column with the standard side padding. */
  container: {
    width: "100%",
    maxWidth: "1440px",
    marginInline: "auto",
    boxSizing: "border-box",
    paddingInline: { default: space.xxl, [PHONE]: space.md },
  },
  /** A single column for forms and short pages (settings, onboarding, password reset). */
  narrow: { width: "100%", maxWidth: "640px" },
  /** Vertical rhythm for a page body, so every page's header starts at the same point. */
  page: {
    paddingTop: { default: space.xxl, [PHONE]: space.xl },
    paddingBottom: space.xxxl,
  },
});
