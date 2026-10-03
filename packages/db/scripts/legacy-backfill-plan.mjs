// Pure planning for the legacy catalog backfill. See legacy-backfill.mjs.
import { parseCostumeFileName } from "@vgskins/shared/constants";

/**
 * @typedef {{ id: string; target_id: string; file_code: string | null }} SlotRow
 * @typedef {{ id: string; pack_id: string; slot_id: string; file_name: string;
 *   target_id: string; target_file_code: string | null }} ModRow
 * @typedef {{ table: "packs" | "comments"; id: string; column: string; value: string }} TextRow
 */

/**
 * Move each legacy mod to the slot its filename names. A file for a different
 * character, or without a costume code, keeps its slot.
 * @param {ModRow[]} mods
 * @param {SlotRow[]} slots
 */
export function planSlotFixes(mods, slots) {
  const slotByCode = new Map(
    slots
      .filter((slot) => slot.file_code)
      .map((slot) => [`${slot.target_id}:${slot.file_code}`, slot])
  );
  const fixes = [];
  for (const mod of mods) {
    const codes = parseCostumeFileName(mod.file_name);
    if (!codes || codes.characterCode !== mod.target_file_code) continue;
    const slot = slotByCode.get(`${mod.target_id}:${codes.costumeCode}`);
    if (slot && slot.id !== mod.slot_id) {
      fixes.push({
        modId: mod.id,
        packId: mod.pack_id,
        fileName: mod.file_name,
        from: mod.slot_id,
        to: slot.id,
      });
    }
  }
  return fixes;
}

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * Decode the HTML entities the original archive stored as text. Repeated until
 * stable, because some values were escaped twice ("&amp;amp;").
 * @param {string} text
 */
export function decodeHtmlEntities(text) {
  let current = text;
  for (let pass = 0; pass < 3; pass++) {
    const next = current.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body) => {
      if (body[0] === "#") {
        const codePoint =
          body[1] === "x" || body[1] === "X"
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
        return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
    });
    if (next === current) break;
    current = next;
  }
  return current;
}

/** @param {TextRow[]} rows */
export function planTextFixes(rows) {
  return rows
    .map((row) => ({ ...row, decoded: decodeHtmlEntities(row.value) }))
    .filter((row) => row.decoded !== row.value);
}

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;

/**
 * Each statement only applies while the row still holds the value it was
 * planned from, so the file is safe to re-run and never clobbers a newer edit.
 */
export function toSql(slotFixes, textFixes) {
  const lines = [
    "-- Legacy catalog backfill. Review legacy-backfill-report.md before applying.",
    ...slotFixes.map(
      (fix) =>
        `UPDATE mods SET slot_id = ${sqlString(fix.to)} WHERE id = ${sqlString(fix.modId)} AND slot_id = ${sqlString(fix.from)};`
    ),
    ...textFixes.map(
      (fix) =>
        `UPDATE ${fix.table} SET ${fix.column} = ${sqlString(fix.decoded)} WHERE id = ${sqlString(fix.id)} AND ${fix.column} = ${sqlString(fix.value)};`
    ),
  ];
  return `${lines.join("\n")}\n`;
}
