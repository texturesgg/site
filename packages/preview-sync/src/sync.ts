export type DatabaseRow = Record<string, unknown>;

export const SNAPSHOT_TABLES = [
  "users",
  "games",
  "targets",
  "target_slots",
  "packs",
  "mods",
  "pack_images",
  "tags",
  "pack_tags",
  "collections",
  "collection_items",
  "votes",
  "comments",
] as const;

export type SnapshotTable = (typeof SNAPSHOT_TABLES)[number];

const RESET_TABLES = [
  "users",
  "games",
  "targets",
  "target_slots",
  "packs",
  "mods",
  "pack_images",
  "tags",
  "pack_tags",
  "collections",
  "collection_items",
  "votes",
  "favorites",
  "downloads",
  "comments",
] as const;

const SOURCE_FILTERS: Partial<Record<SnapshotTable, string>> = {
  packs: "status = 'approved' AND deleted_at IS NULL",
  mods: "EXISTS (SELECT 1 FROM packs AS visible_pack WHERE visible_pack.id = mods.pack_id AND visible_pack.status = 'approved' AND visible_pack.deleted_at IS NULL)",
  pack_images:
    "EXISTS (SELECT 1 FROM packs AS visible_pack WHERE visible_pack.id = pack_images.pack_id AND visible_pack.status = 'approved' AND visible_pack.deleted_at IS NULL)",
  pack_tags:
    "EXISTS (SELECT 1 FROM packs AS visible_pack WHERE visible_pack.id = pack_tags.pack_id AND visible_pack.status = 'approved' AND visible_pack.deleted_at IS NULL)",
  collection_items:
    "EXISTS (SELECT 1 FROM packs AS visible_pack WHERE visible_pack.id = collection_items.pack_id AND visible_pack.status = 'approved' AND visible_pack.deleted_at IS NULL)",
  votes:
    "EXISTS (SELECT 1 FROM packs AS visible_pack WHERE visible_pack.id = votes.pack_id AND visible_pack.status = 'approved' AND visible_pack.deleted_at IS NULL)",
  comments:
    "EXISTS (SELECT 1 FROM packs AS visible_pack WHERE visible_pack.id = comments.pack_id AND visible_pack.status = 'approved' AND visible_pack.deleted_at IS NULL)",
};

export const SYNC_SOURCE = "preview-sync";
export const SYNC_EMAIL_SUFFIX = "@example.invalid";

const PAGE_SIZE = 500;
const MAX_BIND_PARAMETERS = 100;
const STAGING_PREFIX = "_preview_sync_";

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function hexEncode(value: string): string {
  return [...new TextEncoder().encode(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function sanitizeUser(row: DatabaseRow): DatabaseRow {
  return {
    ...row,
    name: `⟦production⟧ ${String(row.name)}`,
    email: `preview+${hexEncode(String(row.id)).toLowerCase()}${SYNC_EMAIL_SUFFIX}`,
    email_verified: 0,
    role: "user",
    banned: 0,
    ban_reason: null,
    ban_expires: null,
    source: SYNC_SOURCE,
  };
}

function stagingTable(table: SnapshotTable): string {
  return `${STAGING_PREFIX}${table}`;
}

function insertStatements(db: D1Database, table: string, rows: DatabaseRow[]) {
  if (rows.length === 0) return [];

  const columns = Object.keys(rows[0]);
  const rowsPerStatement = Math.max(1, Math.floor(MAX_BIND_PARAMETERS / columns.length));
  const columnList = columns.map(quoteIdentifier).join(", ");

  return Array.from({ length: Math.ceil(rows.length / rowsPerStatement) }, (_, index) => {
    const chunk = rows.slice(index * rowsPerStatement, (index + 1) * rowsPerStatement);
    const rowPlaceholders = `(${columns.map(() => "?").join(", ")})`;
    const placeholders = chunk.map(() => rowPlaceholders).join(", ");
    const values = chunk.flatMap((row) => columns.map((column) => row[column]));
    return db
      .prepare(`INSERT INTO ${quoteIdentifier(table)} (${columnList}) VALUES ${placeholders}`)
      .bind(...values);
  });
}

export async function prepareStaging(db: D1Database): Promise<void> {
  const statements = SNAPSHOT_TABLES.flatMap((table) => [
    db.prepare(`DROP TABLE IF EXISTS ${quoteIdentifier(stagingTable(table))}`),
    db.prepare(
      `CREATE TABLE ${quoteIdentifier(stagingTable(table))}
       AS SELECT * FROM ${quoteIdentifier(table)} WHERE 0`
    ),
  ]);
  await db.batch(statements);
}

export async function copyTable(
  source: D1Database,
  target: D1Database,
  table: SnapshotTable,
  heartbeat: () => Promise<void>
): Promise<number> {
  const staging = stagingTable(table);
  await target.prepare(`DELETE FROM ${quoteIdentifier(staging)}`).run();

  let copied = 0;
  let lastRowId = 0;
  const sourceFilter = SOURCE_FILTERS[table] ?? "1";

  while (true) {
    const page = await source
      .prepare(
        `SELECT rowid AS __sync_rowid, *
         FROM ${quoteIdentifier(table)}
         WHERE rowid > ? AND (${sourceFilter})
         ORDER BY rowid
         LIMIT ?`
      )
      .bind(lastRowId, PAGE_SIZE)
      .all<DatabaseRow>();

    if (page.results.length === 0) return copied;

    const rows = page.results.map((result) => {
      const { __sync_rowid, ...row } = result;
      lastRowId = Number(__sync_rowid);
      return table === "users" ? sanitizeUser(row) : row;
    });
    await target.batch(insertStatements(target, staging, rows));
    await heartbeat();

    copied += page.results.length;
  }
}

export async function verifyStaging(
  db: D1Database,
  expectedCounts: Record<string, number>
): Promise<void> {
  for (const table of SNAPSHOT_TABLES) {
    const result = await db
      .prepare(`SELECT count(*) AS count FROM ${quoteIdentifier(stagingTable(table))}`)
      .first<{ count: number }>();
    if (result?.count !== expectedCounts[table]) {
      throw new Error(
        `${table} staging count mismatch: copied=${expectedCounts[table]}, staged=${result?.count}`
      );
    }
  }

  const unsafeUsers = await db
    .prepare(
      `SELECT count(*) AS count
       FROM ${quoteIdentifier(stagingTable("users"))}
       WHERE email NOT LIKE ? OR role != 'user' OR banned != 0 OR source != ?`
    )
    .bind(`%${SYNC_EMAIL_SUFFIX}`, SYNC_SOURCE)
    .first<{ count: number }>();
  const collisions = await db
    .prepare(
      `SELECT count(*) AS count
       FROM ${quoteIdentifier(stagingTable("users"))} AS synced
       INNER JOIN users AS existing
         ON existing.id = synced.id OR existing.name = synced.name OR existing.email = synced.email
       WHERE existing.source IS NULL OR existing.source != ?`
    )
    .bind(SYNC_SOURCE)
    .first<{ count: number }>();

  if (unsafeUsers?.count !== 0 || collisions?.count !== 0) {
    throw new Error(
      `Staging invariant failed: unsafeUsers=${unsafeUsers?.count}, userCollisions=${collisions?.count}`
    );
  }
}

export async function promoteStaging(db: D1Database): Promise<void> {
  const statements = [
    db.prepare("DELETE FROM reports"),
    ...RESET_TABLES.slice(1)
      .reverse()
      .map((table) => db.prepare(`DELETE FROM ${quoteIdentifier(table)}`)),
    db.prepare("DELETE FROM users WHERE source = ?").bind(SYNC_SOURCE),
    ...SNAPSHOT_TABLES.map((table) =>
      db.prepare(
        `INSERT INTO ${quoteIdentifier(table)}
         SELECT * FROM ${quoteIdentifier(stagingTable(table))}`
      )
    ),
  ];
  await db.batch(statements);
}

export async function dropStaging(db: D1Database): Promise<void> {
  await db.batch(
    SNAPSHOT_TABLES.map((table) =>
      db.prepare(`DROP TABLE IF EXISTS ${quoteIdentifier(stagingTable(table))}`)
    )
  );
}
