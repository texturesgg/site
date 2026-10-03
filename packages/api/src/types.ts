// oxlint-disable-next-line typescript/triple-slash-reference -- Wrangler emits an ambient declaration that API RPC callers also need.
/// <reference path="./worker-configuration.d.ts" />

import type { QueueMessage } from "@vgskins/shared";
import type { AuthUser } from "./lib/auth";

// Wrangler generates the platform bindings and configured variables in
// worker-configuration.d.ts. Keep only application-level refinements here.
export type Env = Omit<ApiEnv, "EMAIL" | "PROCESSING_QUEUE"> & {
  PROCESSING_QUEUE: Queue<QueueMessage>;

  // Preview intentionally omits outbound integrations.
  EMAIL?: SendEmail;
  DISCORD_WEBHOOK_REPORTS?: string;
  DISCORD_WEBHOOK_UPLOADS?: string;
};

export type HonoEnv = {
  Bindings: Env;
  Variables: {
    user: AuthUser | null;
    session: unknown;
  };
};
