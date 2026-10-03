import * as stylex from "@stylexjs/stylex";
import { color, shadow } from "./tokens.stylex";

// Alternative palettes over the Gallery tokens. See docs/DESIGN_SYSTEM.md.
// Apply a theme to <html>, never to a wrapper, so portals receive it too.

/** Paper: the light palette. Surfaces lighten toward the viewer. */
export const paper = stylex.createTheme(color, {
  bg: "#F3EFE6",
  surface: "#FAF7F0",
  raise: "#FFFDF8",
  text: "#1C1B19",
  muted: "#5C574E",
  line: "#E0D9CA",
  lineStrong: "#B8AF9C",
  accent: "#F5C84B",
  accentText: "#7A5A00",
  onAccent: "#1C1B19",
  danger: "#B42E24",
  onDanger: "#FFFDF8",
  success: "#27713B",
  scrim: "rgba(28, 27, 25, 0.35)",
});

/** Paper's popover shadow; the Gallery one is too heavy on a light ground. */
export const paperShadow = stylex.createTheme(shadow, {
  popover: "0 24px 60px rgba(28, 27, 25, 0.18)",
});
