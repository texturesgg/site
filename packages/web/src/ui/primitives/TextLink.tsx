import * as stylex from "@stylexjs/stylex";
import { createLink } from "@tanstack/react-router";
import type { ComponentProps, Ref } from "react";
import { color } from "../tokens.stylex";
import { shared } from "./shared";

const styles = stylex.create({
  link: {
    color: color.accentText,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
    textDecorationThickness: { default: "1px", ":hover": "2px" },
    borderRadius: "2px",
  },
});

type AnchorProps = Omit<ComponentProps<"a">, "className" | "style"> & {
  ref?: Ref<HTMLAnchorElement>;
};

/** A link inside running text. External destinations open in a new tab. */
export function TextAnchor({ ref, children, ...props }: AnchorProps) {
  const external = typeof props.href === "string" && /^https?:\/\//.test(props.href);
  return (
    <a
      ref={ref}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...props}
      {...stylex.props(styles.link, shared.focusRing)}
    >
      {children}
    </a>
  );
}

/** An in-app link inside running text, with TanStack Router's typed `to`/`params`. */
export const TextLink = createLink(TextAnchor);
