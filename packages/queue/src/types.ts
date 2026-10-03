// Wrangler generates the platform bindings and configured variables in
// worker-configuration.d.ts. Preview intentionally omits outbound integrations.
export type Env = QueueEnv & {
  DISCORD_WEBHOOK_MOD?: string;
  DISCORD_WEBHOOK_ALERTS?: string;
};
