import { Combobox } from "@base-ui/react/combobox";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { LIMITS } from "@vgskins/shared";
import { parseResponse } from "hono/client";
import { useEffect, useId, useState } from "react";
import { api } from "@/lib/api";
import { CloseIcon } from "../icons";
import { shared, stateStyles } from "../primitives/shared";
import { color, font, radius, space, text } from "../tokens.stylex";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: space.xs },
  labelRow: { display: "flex", justifyContent: "space-between", gap: space.sm },
  label: { fontSize: text.sm, fontWeight: 600, color: color.text },
  count: { fontFamily: font.mono, fontSize: text.xs, color: color.muted },
  box: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.xs,
    minHeight: "48px",
    boxSizing: "border-box",
    paddingBlock: space.xxs,
    paddingInline: space.xs,
    backgroundColor: color.surface,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: { default: color.line, ":focus-within": color.muted },
    borderRadius: radius.md,
  },
  chips: { display: "contents" },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xxs,
    minHeight: "32px",
    paddingInlineStart: space.sm,
    paddingInlineEnd: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: { default: color.raise, ":focus": color.lineStrong },
    fontSize: text.sm,
    fontWeight: 600,
    color: color.text,
    outline: "none",
  },
  chipRemove: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.pill,
    backgroundColor: "transparent",
    color: color.muted,
    cursor: "pointer",
  },
  input: {
    flexGrow: 1,
    minWidth: "8rem",
    height: "38px",
    paddingInline: space.xs,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: color.text,
    fontFamily: font.sans,
    fontSize: text.lg,
    outline: "none",
    "::placeholder": { color: color.muted },
  },
  popup: {
    width: "var(--anchor-width)",
    maxHeight: "min(var(--available-height), 280px)",
    overflowY: "auto",
    padding: space.xxs,
  },
  item: {
    display: "flex",
    alignItems: "center",
    minHeight: "40px",
    paddingInline: space.sm,
    borderRadius: radius.sm,
    fontSize: text.md,
    color: color.text,
    cursor: "pointer",
  },
  highlighted: { backgroundColor: color.surface },
});

/**
 * Tags as removable chips, with suggestions from existing tags; typing a new
 * name offers to add it. Backspace from an empty input removes the last chip.
 */
export function TagInput({
  value,
  onValueChange,
  disabled,
}: {
  value: string[];
  onValueChange: (tags: string[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["tags", search],
    queryFn: () => parseResponse(api.tags.$get({ query: { search } })),
    enabled: search.length > 0,
  });

  const typed = query.trim();
  const has = (name: string) => value.some((tag) => tag.toLowerCase() === name.toLowerCase());
  const names = suggestions.map((tag) => tag.name).filter((name) => !has(name));
  const canCreate =
    typed.length > 0 && !has(typed) && !names.some((n) => n.toLowerCase() === typed.toLowerCase());
  const items = canCreate ? [...names, typed] : names;
  const full = value.length >= LIMITS.TAG_COUNT_MAX;

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.labelRow)}>
        <label htmlFor={id} {...stylex.props(styles.label)}>
          Tags
        </label>
        <span {...stylex.props(styles.count)}>
          {value.length}/{LIMITS.TAG_COUNT_MAX}
        </span>
      </div>
      <Combobox.Root
        items={items}
        multiple
        filter={null}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          const tags = (Array.isArray(next) ? next : []).map((tag) => String(tag).trim());
          if (tags.length <= LIMITS.TAG_COUNT_MAX) onValueChange(tags.filter(Boolean));
          setQuery("");
        }}
        inputValue={query}
        onInputValueChange={setQuery}
      >
        <Combobox.InputGroup {...stylex.props(styles.box)}>
          <Combobox.Chips
            aria-label={value.length > 0 ? "Selected tags" : undefined}
            {...stylex.props(styles.chips)}
          >
            {value.map((tag) => (
              <Combobox.Chip
                key={tag}
                aria-description="Press Backspace or Delete to remove"
                {...stylex.props(styles.chip)}
              >
                {tag}
                <Combobox.ChipRemove
                  aria-label={`Remove ${tag}`}
                  {...stylex.props(styles.chipRemove, shared.focusRing)}
                >
                  <CloseIcon size={14} />
                </Combobox.ChipRemove>
              </Combobox.Chip>
            ))}
          </Combobox.Chips>
          <Combobox.Input
            id={id}
            placeholder={
              full ? "" : value.length > 0 ? "Add another" : "Type a tag, such as Animelee"
            }
            maxLength={LIMITS.TAG_NAME_MAX}
            disabled={disabled || full}
            {...stylex.props(styles.input)}
          />
        </Combobox.InputGroup>
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={8} collisionPadding={16}>
            <Combobox.Popup {...stylex.props(shared.floatingPanel, styles.popup)}>
              <Combobox.List>
                {(item: string) => (
                  <Combobox.Item
                    key={item}
                    value={item}
                    className={stateStyles((state) => [
                      styles.item,
                      state.highlighted && styles.highlighted,
                    ])}
                  >
                    {canCreate && item === typed ? `Add “${item}”` : item}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  );
}
