import * as stylex from "@stylexjs/stylex";
import { type ReactNode, useRef, useState } from "react";
import { UploadIcon } from "../icons";
import { Button } from "../primitives";
import { color, radius, space, text } from "../tokens.stylex";

const styles = stylex.create({
  zone: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingBlock: space.xxl,
    paddingInline: space.lg,
    borderWidth: "2px",
    borderStyle: "dashed",
    borderColor: color.lineStrong,
    borderRadius: radius.xl,
    backgroundColor: color.bg,
    textAlign: "center",
    transitionProperty: "border-color, background-color",
    transitionDuration: "120ms",
  },
  compact: { flexDirection: "row", paddingBlock: space.md, gap: space.md, flexWrap: "wrap" },
  active: { borderColor: color.accentText, backgroundColor: color.surface },
  icon: { color: color.muted },
  title: { margin: 0, fontSize: text.xl, fontWeight: 700 },
  hint: { margin: 0, maxWidth: "48ch", fontSize: text.md, lineHeight: 1.5, color: color.muted },
  input: { display: "none" },
});

/**
 * Drop files anywhere on the zone, or choose them with its button (the keyboard
 * and touch path). `compact` is the smaller form once some files are added.
 */
export function FileDropZone({
  accept,
  title,
  hint,
  buttonLabel,
  compact = false,
  disabled = false,
  onFiles,
}: {
  accept: string;
  title: string;
  hint?: ReactNode;
  buttonLabel: string;
  compact?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every child; count them to know when the pointer leaves.
  const depth = useRef(0);

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        depth.current += 1;
        if (!disabled) setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        depth.current -= 1;
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        if (!disabled) onFiles(Array.from(event.dataTransfer.files));
      }}
      {...stylex.props(styles.zone, compact && styles.compact, dragging && styles.active)}
    >
      {!compact && (
        <span {...stylex.props(styles.icon)}>
          <UploadIcon size={32} />
        </span>
      )}
      <p {...stylex.props(styles.title)}>{title}</p>
      {hint && !compact && <p {...stylex.props(styles.hint)}>{hint}</p>}
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onFiles(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
        {...stylex.props(styles.input)}
      />
      <Button
        variant={compact ? "secondary" : "primary"}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}
