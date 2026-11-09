// A line diff (Myers' O(ND) algorithm) and its unified patch, for reviewing a
// code mod release against the one before it.

// Lines of context around each change, as `git diff` shows.
const CONTEXT = 3;
// The most lines that may differ before the two texts count as wholly
// replaced. Myers keeps one row per edit step, so memory grows with its square.
const MAX_EDITS = 2000;

type Op = { kind: " " | "-" | "+"; line: number };

type Lines = { text: string[]; keys: number[]; newlineAtEnd: boolean };

/** `text` split into lines, each interned to a number so comparing is cheap. */
function splitLines(text: string, intern: Map<string, number>): Lines {
  const lines = text.split("\n");
  const newlineAtEnd = lines.at(-1) === "";
  if (newlineAtEnd) lines.pop();
  const keys = lines.map((line, i) => {
    // A last line without a newline differs from the same line with one.
    const key = !newlineAtEnd && i === lines.length - 1 ? `${line}\0` : line;
    let id = intern.get(key);
    if (id === undefined) {
      id = intern.size;
      intern.set(key, id);
    }
    return id;
  });
  return { text: lines, keys, newlineAtEnd };
}

/**
 * The edit script turning `a[from..]` into `b[from..]` with the fewest
 * deletions and insertions, or null past MAX_EDITS.
 */
function myers(a: number[], b: number[], aEnd: number, bEnd: number, from: number): Op[] | null {
  const n = aEnd - from;
  const m = bEnd - from;
  const max = Math.min(n + m, MAX_EDITS);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // rows[d] is v after step d, for diagonals -d..d.
  const rows: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
          ? v[offset + k + 1]
          : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[from + x] === b[from + y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) found = d;
    }
    rows.push(v.slice(offset - d, offset + d + 1));
  }
  if (found < 0) return null;

  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const prev = rows[d - 1];
    const at = (k: number) => prev[k + d - 1];
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ kind: " ", line: from + --x });
      y--;
    }
    if (down) ops.push({ kind: "+", line: from + prevY });
    else ops.push({ kind: "-", line: from + prevX });
    x = prevX;
    y = prevY;
  }
  while (x > 0) {
    ops.push({ kind: " ", line: from + --x });
  }
  return ops.reverse();
}

/** Every line of `a` and `b` as kept, deleted or inserted, in order. */
function editScript(a: number[], b: number[]): Op[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let aEnd = a.length;
  let bEnd = b.length;
  while (aEnd > start && bEnd > start && a[aEnd - 1] === b[bEnd - 1]) {
    aEnd--;
    bEnd--;
  }
  const head: Op[] = Array.from({ length: start }, (_, line) => ({ kind: " ", line }));
  const tail: Op[] = Array.from({ length: a.length - aEnd }, (_, i) => ({
    kind: " ",
    line: aEnd + i,
  }));
  const middle = myers(a, b, aEnd, bEnd, start) ?? [
    ...Array.from({ length: aEnd - start }, (_, i): Op => ({ kind: "-", line: start + i })),
    ...Array.from({ length: bEnd - start }, (_, i): Op => ({ kind: "+", line: start + i })),
  ];
  return [...head, ...middle, ...tail];
}

const NO_NEWLINE = "\\ No newline at end of file";

/**
 * The unified diff from `before` to `after` (null: the file doesn't exist on
 * that side), under `--- a/<path>` and `+++ b/<path>` headers with three
 * lines of context, and how many lines it adds and deletes. The patch is
 * empty when the texts are equal.
 */
export function unifiedPatch(
  before: string | null,
  after: string | null,
  paths: { before: string; after: string }
): { patch: string; additions: number; deletions: number } {
  const intern = new Map<string, number>();
  const a = splitLines(before ?? "", intern);
  const b = splitLines(after ?? "", intern);
  const ops = editScript(a.keys, b.keys);
  const additions = ops.filter((op) => op.kind === "+").length;
  const deletions = ops.filter((op) => op.kind === "-").length;
  if (additions === 0 && deletions === 0) return { patch: "", additions, deletions };

  // Each op's line number on both sides, counting from 1.
  const positions: { a: number; b: number }[] = [];
  let ai = 0;
  let bi = 0;
  for (const op of ops) {
    positions.push({ a: ai, b: bi });
    if (op.kind !== "+") ai++;
    if (op.kind !== "-") bi++;
  }

  const out = [
    `--- ${before === null ? "/dev/null" : `a/${paths.before}`}`,
    `+++ ${after === null ? "/dev/null" : `b/${paths.after}`}`,
  ];
  let i = 0;
  while (i < ops.length) {
    while (i < ops.length && ops[i].kind === " ") i++;
    if (i === ops.length) break;
    // A hunk runs from CONTEXT lines before a change to CONTEXT lines after
    // the last change closer than 2 * CONTEXT kept lines to the one before.
    const start = Math.max(0, i - CONTEXT);
    let end = i;
    let kept = 0;
    for (let j = i; j < ops.length; j++) {
      if (ops[j].kind === " ") {
        if (++kept > 2 * CONTEXT) break;
      } else {
        kept = 0;
        end = j;
      }
    }
    const stop = Math.min(ops.length, end + CONTEXT + 1);
    const hunk = ops.slice(start, stop);
    const aCount = hunk.filter((op) => op.kind !== "+").length;
    const bCount = hunk.filter((op) => op.kind !== "-").length;
    const aStart = aCount ? positions[start].a + 1 : positions[start].a;
    const bStart = bCount ? positions[start].b + 1 : positions[start].b;
    out.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`);
    for (const op of hunk) {
      const side = op.kind === "+" ? b : a;
      out.push(`${op.kind}${side.text[op.line]}`);
      if (!side.newlineAtEnd && op.line === side.text.length - 1) out.push(NO_NEWLINE);
    }
    i = stop;
  }
  return { patch: `${out.join("\n")}\n`, additions, deletions };
}
