import * as stylex from "@stylexjs/stylex";
import { Button } from "../primitives";
import { color, font, space, text } from "../tokens.stylex";

const styles = stylex.create({
  nav: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
  gap: {
    minWidth: "32px",
    textAlign: "center",
    color: color.muted,
    fontFamily: font.mono,
    fontSize: text.sm,
  },
});

/** Page numbers to show: the first, last, and a window around the current page. */
export function pageWindow(page: number, totalPages: number): (number | "gap")[] {
  const pages = new Set(
    [1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages)
  );
  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  for (const [index, value] of sorted.entries()) {
    if (index > 0 && value - sorted[index - 1] > 1) result.push("gap");
    result.push(value);
  }
  return result;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" {...stylex.props(styles.nav)}>
      <Button variant="ghost" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </Button>
      {pageWindow(page, totalPages).map((entry, index) =>
        entry === "gap" ? (
          <span key={`gap-${index}`} aria-hidden="true" {...stylex.props(styles.gap)}>
            …
          </span>
        ) : (
          <Button
            key={entry}
            variant={entry === page ? "secondary" : "ghost"}
            aria-current={entry === page ? "page" : undefined}
            aria-label={`Page ${entry}`}
            onClick={() => onPageChange(entry)}
          >
            {entry}
          </Button>
        )
      )}
      <Button variant="ghost" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
      </Button>
    </nav>
  );
}
