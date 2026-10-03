import * as stylex from "@stylexjs/stylex";

// Gallery design tokens. See docs/DESIGN_SYSTEM.md. StyleX requires this file to
// export only defineVars groups. Components reference these, never raw values.

/** Color. These are the Gallery palette; other palettes override them (themes.ts). */
export const color = stylex.defineVars({
  bg: "#111110",
  surface: "#1B1B19",
  raise: "#262522",
  text: "#F2EFE8",
  muted: "#A8A39A",
  line: "#2F2E2A",
  lineStrong: "#3A3934",
  /** A fill: buttons, checked controls, progress. Never text or a line on its own. */
  accent: "#F5C84B",
  /** Accent-colored text and lines (links, focus rings, active underlines). */
  accentText: "#F5C84B",
  onAccent: "#111110",
  danger: "#F07167",
  /** Text and icons on a danger fill. */
  onDanger: "#111110",
  success: "#7BD88F",
  scrim: "rgba(0, 0, 0, 0.6)",
});

export const space = stylex.defineVars({
  xxs: "4px",
  xs: "8px",
  sm: "12px",
  md: "16px",
  lg: "24px",
  xl: "32px",
  xxl: "48px",
  xxxl: "64px",
});

export const radius = stylex.defineVars({
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  pill: "999px",
});

export const font = stylex.defineVars({
  sans: "'Schibsted Grotesk', ui-sans-serif, system-ui, sans-serif",
  mono: "'DM Mono', ui-monospace, 'SF Mono', monospace",
});

export const text = stylex.defineVars({
  xs: "13px",
  sm: "14px",
  md: "15px",
  lg: "16px",
  xl: "18px",
  h3: "24px",
  h2: "28px",
  h1: "40px",
  display: "56px",
  hero: "96px",
});

export const tracking = stylex.defineVars({
  normal: "0",
  tight: "-0.02em",
  tighter: "-0.045em",
});

export const shadow = stylex.defineVars({
  popover: "0 24px 60px rgba(0, 0, 0, 0.55)",
});

export const motion = stylex.defineVars({
  fast: "120ms",
  normal: "200ms",
  easing: "cubic-bezier(0.2, 0, 0, 1)",
});
