// Plan the legacy catalog backfill. Reads the database, changes nothing, and
// writes legacy-backfill.sql plus a report to review before applying the SQL.
//
//   pnpm --filter @vgskins/db legacy-backfill                    # local dev database
//   pnpm --filter @vgskins/db legacy-backfill --remote --env preview
//   pnpm --filter @vgskins/db legacy-backfill --remote           # production
//
// It fixes two things in packs imported from the original archive
// (source = 'ssbmtextures'):
//   - costume files in the wrong slot, using the Melee file codes on slots;
//   - HTML entities stored as text in titles, descriptions, and comments.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { planSlotFixes, planTextFixes, toSql } from "./legacy-backfill-plan.mjs";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values: args } = parseArgs({
  options: {
    remote: { type: "boolean", default: false },
    env: { type: "string" },
    out: { type: "string", default: "legacy-backfill-output" },
  },
});

const database = args.env === "preview" ? "DB" : "vgskins-db";
const target = args.remote
  ? ["--remote", ...(args.env ? ["--env", args.env] : [])]
  : ["--local", "--persist-to", "../api/.wrangler/state"];
const targetLabel = args.remote ? `remote ${args.env ?? "production"}` : "local";

/** Run a read-only query through Wrangler and return its rows. */
function query(sql) {
  const output = execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", database, ...target, "--json", "--command", sql],
    {
      cwd: packageDir,
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "inherit"],
    }
  );
  const [result] = JSON.parse(output);
  if (!result?.success) throw new Error(`Query failed: ${sql}`);
  return result.results;
}

console.error(`Reading the ${targetLabel} database...`);
const slots = query(
  "SELECT id, target_id, file_code FROM target_slots WHERE file_code IS NOT NULL"
);
const mods = query(`
  SELECT m.id, m.pack_id, m.slot_id, m.file_name, p.target_id, t.file_code AS target_file_code
  FROM mods m
  JOIN packs p ON p.id = m.pack_id
  JOIN targets t ON t.id = p.target_id
  WHERE p.source = 'ssbmtextures' AND p.deleted_at IS NULL AND t.file_code IS NOT NULL`);
const hasEntity = (column) => `${column} LIKE '%&%;%'`;
const packTexts = query(`
  SELECT id, title, description FROM packs
  WHERE source = 'ssbmtextures' AND (${hasEntity("title")} OR ${hasEntity("description")})`);
const commentTexts = query(
  `SELECT id, body FROM comments WHERE source = 'ssbmtextures' AND ${hasEntity("body")}`
);

if (slots.length === 0) {
  throw new Error("No slot file codes found. Apply migration 0010_costume_file_codes first.");
}

const slotFixes = planSlotFixes(mods, slots);
const textFixes = planTextFixes([
  ...packTexts.flatMap((row) => [
    { table: "packs", id: row.id, column: "title", value: row.title },
    ...(row.description
      ? [{ table: "packs", id: row.id, column: "description", value: row.description }]
      : []),
  ]),
  ...commentTexts.map((row) => ({
    table: "comments",
    id: row.id,
    column: "body",
    value: row.body,
  })),
]);

const moves = new Map();
for (const fix of slotFixes) {
  const key = `${fix.from} -> ${fix.to}`;
  moves.set(key, (moves.get(key) ?? 0) + 1);
}
const excerpt = (text) => JSON.stringify(text.length > 120 ? `${text.slice(0, 120)}…` : text);
const report = [
  `# Legacy catalog backfill (${targetLabel})`,
  "",
  `Generated ${new Date().toISOString()}. Nothing has been changed.`,
  "",
  "## Summary",
  "",
  `- Imported character mods checked: ${mods.length}`,
  `- Mods moved to the slot their filename names: ${slotFixes.length} (in ${new Set(slotFixes.map((fix) => fix.packId)).size} packs)`,
  `- Text values with HTML entities decoded: ${textFixes.length}`,
  "",
  "## Slot moves",
  "",
  "| From | To | Mods |",
  "| --- | --- | --- |",
  ...[...moves]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `| ${key.replace(" -> ", " | ")} | ${count} |`),
  "",
  "### Sample",
  "",
  ...slotFixes
    .slice(0, 25)
    .map((fix) => `- \`${fix.fileName}\` (pack ${fix.packId}): ${fix.from} → ${fix.to}`),
  "",
  "## Text changes (sample)",
  "",
  ...textFixes
    .slice(0, 25)
    .map(
      (fix) =>
        `- ${fix.table}.${fix.column} ${fix.id}: ${excerpt(fix.value)} → ${excerpt(fix.decoded)}`
    ),
  "",
  "## Applying",
  "",
  "Every statement only applies while the row still holds the planned value, so the file is safe to re-run.",
  "",
  "```sh",
  `cd packages/db && pnpm exec wrangler d1 execute ${database} ${target.join(" ")} --file ${join(args.out, "legacy-backfill.sql")}`,
  "```",
  "",
].join("\n");

const outDir = resolve(packageDir, args.out);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "legacy-backfill.sql"), toSql(slotFixes, textFixes));
writeFileSync(join(outDir, "legacy-backfill-report.md"), report);
console.error(`${slotFixes.length} slot moves, ${textFixes.length} text fixes. Wrote ${outDir}`);
