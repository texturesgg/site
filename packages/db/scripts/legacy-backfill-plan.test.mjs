import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeHtmlEntities,
  planSlotFixes,
  planTextFixes,
  toSql,
} from "./legacy-backfill-plan.mjs";

const slots = [
  { id: "melee-fox-slot-neutral", target_id: "melee-fox", file_code: "Nr" },
  { id: "melee-fox-slot-blue", target_id: "melee-fox", file_code: "La" },
  { id: "melee-falco-slot-red", target_id: "melee-falco", file_code: "Re" },
];
const mod = (id, fileName, slotId = "melee-fox-slot-neutral") => ({
  id,
  pack_id: "pack-1",
  slot_id: slotId,
  file_name: fileName,
  target_id: "melee-fox",
  target_file_code: "Fx",
});

test("moves a mislabeled costume to the slot its filename names", () => {
  assert.deepEqual(planSlotFixes([mod("m1", "PlFxLa_SpecOp.dat")], slots), [
    {
      modId: "m1",
      packId: "pack-1",
      fileName: "PlFxLa_SpecOp.dat",
      from: "melee-fox-slot-neutral",
      to: "melee-fox-slot-blue",
    },
  ]);
});

test("leaves correct, unparseable, and other-character files alone", () => {
  const mods = [
    mod("correct", "PlFxNr.dat"),
    mod("extra-model", "PlFx_Pistol.dat"),
    mod("common-file", "PlFx.dat"),
    mod("falco-file", "PlFcRe.dat"),
    mod("unknown-costume", "PlFxYe.dat"),
  ];
  assert.deepEqual(planSlotFixes(mods, slots), []);
});

test("decodes named, numeric, and double-escaped entities", () => {
  assert.equal(
    decodeHtmlEntities("Inuyasha (Animelee &amp; vanilla)"),
    "Inuyasha (Animelee & vanilla)"
  );
  assert.equal(decodeHtmlEntities("CSP &amp;amp; Stock icons"), "CSP & Stock icons");
  assert.equal(decodeHtmlEntities("it&#039;s &#x2014; &quot;fine&quot;"), `it's — "fine"`);
  assert.equal(decodeHtmlEntities("R&D &unknown; &#0;"), "R&D &unknown; &#0;");
});

test("plans only rows whose text changes", () => {
  const fixes = planTextFixes([
    { table: "packs", id: "p1", column: "title", value: "A &amp; B" },
    { table: "packs", id: "p2", column: "title", value: "Plain" },
  ]);
  assert.deepEqual(
    fixes.map((fix) => [fix.id, fix.decoded]),
    [["p1", "A & B"]]
  );
});

test("writes guarded, quoted SQL", () => {
  const sql = toSql(
    [{ modId: "m1", from: "old", to: "new" }],
    [{ table: "packs", id: "p1", column: "title", value: "Link's &amp;", decoded: "Link's &" }]
  );
  assert.match(sql, /UPDATE mods SET slot_id = 'new' WHERE id = 'm1' AND slot_id = 'old';/);
  assert.match(
    sql,
    /UPDATE packs SET title = 'Link''s &' WHERE id = 'p1' AND title = 'Link''s &amp;';/
  );
});
