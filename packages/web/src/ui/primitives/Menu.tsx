import { Menu as BaseMenu } from "@base-ui/react/menu";
import * as stylex from "@stylexjs/stylex";
import { createLink } from "@tanstack/react-router";
import type { ComponentProps, ReactNode, Ref } from "react";
import { color, font, radius, space, text } from "../tokens.stylex";
import { shared, stateStyles } from "./shared";

const styles = stylex.create({
  panel: { minWidth: "200px", padding: space.xxs },
  item: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    minHeight: "40px",
    paddingInline: space.sm,
    borderRadius: radius.sm,
    fontFamily: font.sans,
    fontSize: text.md,
    color: color.text,
    textDecoration: "none",
    cursor: "pointer",
    outline: "none",
  },
  highlighted: { backgroundColor: color.surface },
  danger: { color: color.danger },
  separator: { height: "1px", marginBlock: space.xxs, backgroundColor: color.line },
});

export const MenuRoot = BaseMenu.Root;

export function MenuTrigger({
  children,
}: {
  children: ComponentProps<typeof BaseMenu.Trigger>["render"];
}) {
  return <BaseMenu.Trigger render={children} />;
}

export function MenuPanel({
  children,
  align = "end",
}: {
  children: ReactNode;
  align?: "start" | "end";
}) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner sideOffset={8} align={align} collisionPadding={16}>
        <BaseMenu.Popup {...stylex.props(shared.floatingPanel, styles.panel)}>
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

type ItemProps = Omit<ComponentProps<typeof BaseMenu.Item>, "className" | "style"> & {
  tone?: "danger";
};

export function MenuItem({ tone, ...props }: ItemProps) {
  return (
    <BaseMenu.Item
      {...props}
      className={stateStyles((state) => [
        styles.item,
        state.highlighted && styles.highlighted,
        tone === "danger" && styles.danger,
      ])}
    />
  );
}

function MenuAnchor({
  ref,
  ...props
}: Omit<ComponentProps<"a">, "className" | "style"> & { ref?: Ref<HTMLAnchorElement> }) {
  return (
    <BaseMenu.LinkItem
      ref={ref}
      closeOnClick
      {...props}
      className={stateStyles((state) => [styles.item, state.highlighted && styles.highlighted])}
    />
  );
}

/** A menu item that navigates, with TanStack Router's typed `to`/`params`. */
export const MenuLink = createLink(MenuAnchor);

export function MenuSeparator() {
  return <BaseMenu.Separator {...stylex.props(styles.separator)} />;
}
