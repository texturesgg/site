import { Button as BaseButton } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { createLink } from "@tanstack/react-router";
import type { ComponentProps, ReactNode, Ref } from "react";
import { color, space, text } from "../tokens.stylex";
import { shared } from "./shared";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "text";
export type ButtonSize = "md" | "lg";

const styles = stylex.create({
  primary: {
    backgroundColor: color.accent,
    borderColor: color.accent,
    color: color.onAccent,
    filter: { default: "none", ":hover:not(:disabled)": "brightness(1.08)" },
  },
  secondary: {
    backgroundColor: { default: color.surface, ":hover:not(:disabled)": color.raise },
    borderColor: color.line,
    color: color.text,
  },
  ghost: {
    backgroundColor: { default: "transparent", ":hover:not(:disabled)": color.surface },
    borderColor: "transparent",
    color: color.text,
  },
  // Confirms a destructive action; the label names the action.
  danger: {
    backgroundColor: color.danger,
    borderColor: color.danger,
    color: color.onDanger,
    filter: { default: "none", ":hover:not(:disabled)": "brightness(1.08)" },
  },
  // An inline action under content (Reply, Show more): no box or side padding, so
  // the label lines up with the text around it; full height keeps the tap target.
  text: {
    paddingInline: 0,
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: color.text,
    textDecoration: { default: "none", ":hover:not(:disabled)": "underline" },
    textUnderlineOffset: "3px",
  },
  md: { paddingInline: space.md, fontSize: text.md },
  lg: { minHeight: "52px", paddingInline: space.lg, fontSize: text.lg, fontWeight: 700 },
  fullWidth: { width: "100%" },
  noDecoration: { textDecoration: "none" },
});

type StyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

function buttonStyles({ variant = "secondary", size = "md", fullWidth = false }: StyleOptions) {
  return [
    shared.control,
    shared.focusRing,
    styles[size],
    // After size, so a variant such as text can drop the side padding.
    styles[variant],
    fullWidth && styles.fullWidth,
  ];
}

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className" | "style"> &
  StyleOptions & { icon?: ReactNode };

export function Button({
  variant,
  size,
  fullWidth,
  icon,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      type={type}
      {...props}
      {...stylex.props(buttonStyles({ variant, size, fullWidth }))}
    >
      {icon}
      {children}
    </BaseButton>
  );
}

type AnchorProps = Omit<ComponentProps<"a">, "className" | "style"> &
  StyleOptions & { icon?: ReactNode; ref?: Ref<HTMLAnchorElement> };

function ButtonAnchor({ variant, size, fullWidth, icon, children, ...props }: AnchorProps) {
  return (
    <a
      {...props}
      {...stylex.props(buttonStyles({ variant, size, fullWidth }), styles.noDecoration)}
    >
      {icon}
      {children}
    </a>
  );
}

/** A router link that looks like a Button, with TanStack Router's typed `to`/`params`. */
/** A Button-styled plain anchor, for links that leave the site. */
export { ButtonAnchor as AnchorButton };

export const ButtonLink = createLink(ButtonAnchor);

type IconButtonProps = Omit<
  ComponentProps<typeof BaseButton>,
  "className" | "style" | "children"
> & {
  /** Accessible name; icon-only controls must have one. */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  /** `lg` matches a large Button beside it. */
  size?: ButtonSize;
};

const iconStyles = stylex.create({
  md: { width: "44px", paddingInline: 0 },
  lg: { width: "52px", minHeight: "52px", paddingInline: 0 },
});

export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <BaseButton
      type={type}
      aria-label={label}
      title={label}
      {...props}
      {...stylex.props(buttonStyles({ variant }), iconStyles[size])}
    >
      {icon}
    </BaseButton>
  );
}
