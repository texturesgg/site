import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import {
  copyTable,
  dropStaging,
  prepareStaging,
  promoteStaging,
  SNAPSHOT_TABLES,
  verifyStaging,
} from "./sync";

type PreviewSyncExecutionEnv = Pick<PreviewSyncEnv, "SOURCE_DB" | "TARGET_DB">;

interface SyncResult {
  tables: Record<string, number>;
  completedAt: string;
}

const STEP_CONFIG = {
  retries: {
    limit: 3,
    delay: "10 seconds",
    backoff: "exponential",
  },
  timeout: "15 minutes",
} as const;

const LOCK_MAX_AGE_MS = 60 * 60 * 1000;

// Created by hand in the preview database only (docs/PREVIEW_ENVIRONMENT.md).
const PREVIEW_MARKER = "_preview_marker";

async function hasPreviewMarker(db: D1Database): Promise<boolean> {
  const table = await db
    .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(PREVIEW_MARKER)
    .first<{ found: number }>();
  return table !== null;
}

/**
 * The refresh deletes every catalog table in TARGET_DB, so it runs only when
 * TARGET_DB carries the preview marker and SOURCE_DB does not. A swapped or
 * mistyped binding stops here, before anything is written.
 */
async function confirmPreviewTarget(source: D1Database, target: D1Database): Promise<void> {
  if (!(await hasPreviewMarker(target)) || (await hasPreviewMarker(source))) {
    throw new NonRetryableError(
      `Refusing to refresh: TARGET_DB must be the preview database (it has ${PREVIEW_MARKER}) and SOURCE_DB must not be`
    );
  }
}

async function acquireLock(db: D1Database, instanceId: string): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _preview_sync_lock (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      instance_id TEXT NOT NULL,
      acquired_at INTEGER NOT NULL
    )
  `);

  const lock = await db
    .prepare(
      `INSERT INTO _preview_sync_lock (id, instance_id, acquired_at)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         instance_id = excluded.instance_id,
         acquired_at = excluded.acquired_at
       WHERE _preview_sync_lock.acquired_at < ?
       RETURNING instance_id`
    )
    .bind(instanceId, Date.now(), Date.now() - LOCK_MAX_AGE_MS)
    .first<{ instance_id: string }>();

  if (lock?.instance_id !== instanceId) {
    throw new NonRetryableError("Another preview refresh is already running");
  }
}

async function releaseLock(db: D1Database, instanceId: string): Promise<void> {
  await db.prepare("DELETE FROM _preview_sync_lock WHERE instance_id = ?").bind(instanceId).run();
}

async function renewLock(db: D1Database, instanceId: string): Promise<void> {
  const result = await db
    .prepare("UPDATE _preview_sync_lock SET acquired_at = ? WHERE instance_id = ?")
    .bind(Date.now(), instanceId)
    .run();
  if (result.meta.changes !== 1) {
    throw new NonRetryableError("Preview refresh lock ownership was lost");
  }
}

export class PreviewSyncWorkflow extends WorkflowEntrypoint<PreviewSyncExecutionEnv> {
  async run(event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep): Promise<SyncResult> {
    let acquired = false;

    try {
      await step.do("confirm the target is preview", STEP_CONFIG, async () => {
        await confirmPreviewTarget(this.env.SOURCE_DB, this.env.TARGET_DB);
      });
      await step.do("acquire refresh lock", STEP_CONFIG, async () => {
        await acquireLock(this.env.TARGET_DB, event.instanceId);
      });
      acquired = true;
      await step.do("prepare staging tables", STEP_CONFIG, async () => {
        await prepareStaging(this.env.TARGET_DB);
      });

      const tables: Record<string, number> = {};
      for (const table of SNAPSHOT_TABLES) {
        tables[table] = await step.do(`copy ${table}`, STEP_CONFIG, async () =>
          copyTable(this.env.SOURCE_DB, this.env.TARGET_DB, table, () =>
            renewLock(this.env.TARGET_DB, event.instanceId)
          )
        );
      }

      await step.do("verify staged snapshot", STEP_CONFIG, async () => {
        await verifyStaging(this.env.TARGET_DB, tables);
        await renewLock(this.env.TARGET_DB, event.instanceId);
      });

      await step.do("promote staged snapshot", STEP_CONFIG, async () => {
        await renewLock(this.env.TARGET_DB, event.instanceId);
        await promoteStaging(this.env.TARGET_DB);
      });

      await step.do("remove staging tables", STEP_CONFIG, async () => {
        await dropStaging(this.env.TARGET_DB);
      });

      return { tables, completedAt: new Date().toISOString() };
    } finally {
      if (acquired) {
        await step.do("release refresh lock", STEP_CONFIG, async () => {
          await releaseLock(this.env.TARGET_DB, event.instanceId);
        });
      }
    }
  }
}

export default {
  fetch(): Response {
    return new Response("Not found", { status: 404 });
  },
};
