// Simple structured logger for Cloudflare Workers
// Outputs JSON that can be viewed with `wrangler tail`
import pino, { type Logger } from "pino";

export const logger: Logger = pino({
  level: "info",
  redact: ["password", "token"],
  formatters: {
    level: (label) => ({ level: label }),
  },
});
