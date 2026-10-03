import { Field } from "@base-ui/react/field";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";
import { SearchIcon } from "../icons";
import { color, font, radius, space, text } from "../tokens.stylex";
import { shared } from "./shared";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: space.xs, minWidth: 0 },
  label: { fontSize: text.sm, fontWeight: 600, color: color.text },
  description: { margin: 0, fontSize: text.xs, color: color.muted },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
  box: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    minHeight: "48px",
    boxSizing: "border-box",
    paddingInline: space.md,
    backgroundColor: color.surface,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: { default: color.line, ":focus-within": color.muted },
    borderRadius: radius.md,
    color: color.muted,
  },
  input: {
    flexGrow: 1,
    minWidth: 0,
    height: "46px",
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: color.text,
    fontFamily: font.sans,
    fontSize: text.lg,
    outline: "none",
    "::placeholder": { color: color.muted },
  },
  invalid: { borderColor: color.danger },
});

type TextFieldProps = Omit<ComponentProps<typeof Field.Control>, "className" | "style"> & {
  label: string;
  /** Hide the label visually; it still names the input for assistive technology. */
  hideLabel?: boolean;
  description?: ReactNode;
  error?: ReactNode;
  icon?: ReactNode;
};

export function TextField({
  label,
  hideLabel,
  description,
  error,
  icon,
  ...props
}: TextFieldProps) {
  return (
    <Field.Root invalid={Boolean(error)} {...stylex.props(styles.root)}>
      <Field.Label {...stylex.props(hideLabel ? shared.visuallyHidden : styles.label)}>
        {label}
      </Field.Label>
      <div {...stylex.props(styles.box, Boolean(error) && styles.invalid)}>
        {icon}
        <Field.Control {...props} {...stylex.props(styles.input)} />
      </div>
      {description && (
        <Field.Description {...stylex.props(styles.description)}>{description}</Field.Description>
      )}
      {error && (
        <Field.Error match {...stylex.props(styles.error)}>
          {error}
        </Field.Error>
      )}
    </Field.Root>
  );
}

type SearchFieldProps = Omit<TextFieldProps, "icon" | "hideLabel" | "type">;

/** A search input with a leading icon and a visually hidden label. */
export function SearchField(props: SearchFieldProps) {
  return <TextField type="search" hideLabel icon={<SearchIcon />} {...props} />;
}

const areaStyles = stylex.create({
  box: { alignItems: "stretch", paddingBlock: space.sm },
  input: {
    height: "auto",
    minHeight: "72px",
    resize: "vertical",
    fontSize: text.md,
    lineHeight: 1.5,
  },
  footer: { display: "flex", justifyContent: "space-between", gap: space.sm },
  count: { fontFamily: font.mono, fontSize: text.xs, color: color.muted },
});

type TextAreaProps = Omit<ComponentProps<"textarea">, "className" | "style"> & {
  label: string;
  hideLabel?: boolean;
  error?: ReactNode;
};

/** Multi-line text, with a character count when `maxLength` is set. */
export function TextArea({ label, hideLabel, error, maxLength, ...props }: TextAreaProps) {
  const length = typeof props.value === "string" ? props.value.length : 0;
  return (
    <Field.Root invalid={Boolean(error)} {...stylex.props(styles.root)}>
      <Field.Label {...stylex.props(hideLabel ? shared.visuallyHidden : styles.label)}>
        {label}
      </Field.Label>
      <div {...stylex.props(styles.box, areaStyles.box, Boolean(error) && styles.invalid)}>
        <Field.Control
          render={<textarea maxLength={maxLength} {...props} />}
          {...stylex.props(styles.input, areaStyles.input)}
        />
      </div>
      {(error || maxLength) && (
        <div {...stylex.props(areaStyles.footer)}>
          <Field.Error match {...stylex.props(styles.error)}>
            {error}
          </Field.Error>
          {maxLength && (
            <span {...stylex.props(areaStyles.count)}>
              {length}/{maxLength}
            </span>
          )}
        </div>
      )}
    </Field.Root>
  );
}
