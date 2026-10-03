import * as stylex from "@stylexjs/stylex";
import { color, font, motion, radius, shadow, space, text } from "../tokens.stylex";

/** Style fragments shared by primitives. Pages use primitives, not these. */
export const shared = stylex.create({
  focusRing: {
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${color.accentText}`,
    },
    outlineOffset: "2px",
  },
  visuallyHidden: {
    position: "absolute",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
  },
  control: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    minHeight: "44px",
    flexShrink: 0,
    whiteSpace: "nowrap",
    boxSizing: "border-box",
    fontFamily: font.sans,
    fontSize: text.md,
    fontWeight: 600,
    lineHeight: 1.2,
    borderWidth: "1px",
    borderStyle: "solid",
    // Anything pressed is a pill; fields you type in keep radius.md.
    borderRadius: radius.pill,
    cursor: {
      default: "pointer",
      ":disabled": "not-allowed",
    },
    opacity: {
      default: 1,
      ":disabled": 0.5,
    },
    transitionProperty: "background-color, border-color, color",
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.easing,
  },
  floatingPanel: {
    boxSizing: "border-box",
    backgroundColor: color.raise,
    color: color.text,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.lineStrong,
    borderRadius: radius.lg,
    boxShadow: shadow.popover,
    fontFamily: font.sans,
    outline: "none",
  },
});

/**
 * A Base UI `className` callback that picks StyleX styles from component state:
 * `className={stateStyles((state) => [styles.box, state.checked && styles.checked])}`.
 */
export function stateStyles<State>(
  pick: (state: State) => stylex.StyleXArray<stylex.CompiledStyles | boolean | null | undefined>
): (state: State) => string {
  return (state) => stylex.props(pick(state)).className ?? "";
}
