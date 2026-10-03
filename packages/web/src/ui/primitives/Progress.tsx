import { Progress as BaseProgress } from "@base-ui/react/progress";
import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space, text } from "../tokens.stylex";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: space.xs },
  head: { display: "flex", justifyContent: "space-between", gap: space.sm },
  label: { fontSize: text.sm, fontWeight: 600, color: color.text },
  value: { fontFamily: font.mono, fontSize: text.sm, color: color.muted },
  track: {
    height: "8px",
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: color.raise,
  },
  indicator: {
    display: "block",
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    transitionProperty: "width",
    transitionDuration: "200ms",
  },
});

/** A labeled progress bar for a long task such as an upload; `value` is 0–100. */
export function Progress({ label, value }: { label: string; value: number }) {
  return (
    <BaseProgress.Root value={value} {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.head)}>
        <BaseProgress.Label {...stylex.props(styles.label)}>{label}</BaseProgress.Label>
        <BaseProgress.Value {...stylex.props(styles.value)} />
      </div>
      <BaseProgress.Track {...stylex.props(styles.track)}>
        <BaseProgress.Indicator {...stylex.props(styles.indicator)} />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
