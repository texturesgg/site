import { Popover as BasePopover } from "@base-ui/react/popover";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";
import { color, space, text } from "../tokens.stylex";
import { shared } from "./shared";

const styles = stylex.create({
  panel: {
    display: "flex",
    flexDirection: "column",
    // Capped so a tall panel stays below its trigger instead of flipping over it.
    maxHeight: "min(var(--available-height), 560px)",
    overflow: "hidden",
  },
  title: {
    margin: 0,
    paddingTop: space.md,
    paddingInline: space.md,
    fontSize: text.lg,
    fontWeight: 700,
    color: color.text,
  },
});

export const PopoverRoot = BasePopover.Root;

/** Renders its child (usually a Button) as the popover's trigger. */
export function PopoverTrigger({
  children,
}: {
  children: ComponentProps<typeof BasePopover.Trigger>["render"];
}) {
  return <BasePopover.Trigger render={children} />;
}

type PopoverPanelProps = {
  /** Accessible title; shown unless `hideTitle` is set. */
  title: string;
  hideTitle?: boolean;
  width?: number;
  align?: "start" | "center" | "end";
  children: ReactNode;
};

const widthStyle = stylex.create({
  width: (width: number) => ({ width: `min(${width}px, calc(100vw - 32px))` }),
});

/** The floating panel: portal, positioning, and a titled surface. */
export function PopoverPanel({
  title,
  hideTitle,
  width = 360,
  align = "start",
  children,
}: PopoverPanelProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner sideOffset={8} align={align} collisionPadding={16}>
        <BasePopover.Popup
          {...stylex.props(shared.floatingPanel, styles.panel, widthStyle.width(width))}
        >
          <BasePopover.Title {...stylex.props(hideTitle ? shared.visuallyHidden : styles.title)}>
            {title}
          </BasePopover.Title>
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}
