import * as stylex from "@stylexjs/stylex";
import { useId, useState } from "react";
import { Checkbox, CheckboxGroup, SearchField } from "../primitives";
import { color, font, space, text } from "../tokens.stylex";

export type PickerTarget = { slug: string; name: string; packCount: number };
export type PickerSection = { label: string; targets: readonly PickerTarget[] };

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: space.sm },
  // The filter stays in view while the list scrolls inside a popover or sheet.
  find: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    paddingBlock: space.xxs,
    backgroundColor: color.raise,
  },
  section: { display: "flex", flexDirection: "column", gap: space.xxs },
  sectionLabel: {
    margin: 0,
    paddingInline: space.xs,
    fontFamily: font.sans,
    fontSize: text.sm,
    fontWeight: 700,
    color: color.muted,
  },
  empty: {
    margin: 0,
    padding: space.md,
    fontSize: text.md,
    color: color.muted,
    textAlign: "center",
  },
});

/**
 * A searchable checklist of characters and stages with their pack counts. Used
 * inside the Browse filter popover and the mobile filter sheet.
 */
export function TargetPicker({
  sections,
  value,
  onValueChange,
  columns = 2,
}: {
  sections: readonly PickerSection[];
  value: string[];
  onValueChange: (value: string[]) => void;
  columns?: 1 | 2;
}) {
  const [query, setQuery] = useState("");
  const idPrefix = useId();
  const needle = query.trim().toLowerCase();
  const visible = sections
    .map((section) => ({
      ...section,
      targets: section.targets.filter((target) => target.name.toLowerCase().includes(needle)),
    }))
    .filter((section) => section.targets.length > 0);

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.find)}>
        <SearchField
          label="Find a character or stage"
          placeholder="Find a character or stage"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      {visible.length === 0 && <p {...stylex.props(styles.empty)}>No matches for “{query}”.</p>}
      {visible.map((section, index) => {
        const labelId = `${idPrefix}-section-${index}`;
        return (
          <div key={section.label} {...stylex.props(styles.section)}>
            <p id={labelId} {...stylex.props(styles.sectionLabel)}>
              {section.label}
            </p>
            <CheckboxGroup
              aria-labelledby={labelId}
              value={value}
              onValueChange={onValueChange}
              columns={columns}
            >
              {section.targets.map((target) => (
                <Checkbox
                  key={target.slug}
                  name="target"
                  value={target.slug}
                  label={target.name}
                  meta={target.packCount.toLocaleString("en-US")}
                />
              ))}
            </CheckboxGroup>
          </div>
        );
      })}
    </div>
  );
}
