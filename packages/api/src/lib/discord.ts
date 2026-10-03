import { logger } from "@vgskins/logger";

const SITE_URL = "https://textures.gg";
const BRAND_COLOR = 0x06b6d4; // cyan-500
const RED = 0xef4444;
const YELLOW = 0xeab308;

interface DiscordEmbed {
  title: string;
  description?: string;
  url?: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  thumbnail?: { url: string };
  footer?: { text: string };
  timestamp?: string;
}

interface DiscordWebhookPayload {
  embeds: DiscordEmbed[];
}

// Nothing a webhook posts may ping anyone, whatever the text contains.
const NO_MENTIONS = { parse: [] };

/** Fire-and-forget Discord webhook — logs errors but never throws. */
export async function sendDiscordWebhook(
  webhookUrl: string | undefined,
  payload: DiscordWebhookPayload
): Promise<void> {
  if (!webhookUrl) return;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, allowed_mentions: NO_MENTIONS }),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, body: text }, "Discord webhook failed");
    }
  } catch (err) {
    logger.error({ err }, "Discord webhook request error");
  }
}

// ── Embed Builders ─────────────────────────────────────────

/** New report submitted — sent to reports channel. */
export function reportEmbed(opts: {
  reportId: string;
  targetType: string;
  reason: string;
  details?: string | null;
  reporterName: string;
}): DiscordWebhookPayload {
  const fields: DiscordEmbed["fields"] = [
    { name: "Type", value: opts.targetType, inline: true },
    { name: "Reason", value: opts.reason, inline: true },
    { name: "Reporter", value: codeSpan(opts.reporterName), inline: true },
  ];

  if (opts.details) {
    fields.push({ name: "Details", value: codeBlock(truncate(opts.details, 256)) });
  }

  return {
    embeds: [
      {
        title: "New Report",
        url: `${SITE_URL}/admin/reports`,
        color: RED,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * A problem report sent from the desktop editor, kept in R2 under its id.
 * Anyone can send one, so none of its text is repeated here.
 */
export function editorReportEmbed(opts: {
  reportId: string;
  chars: number;
}): DiscordWebhookPayload {
  return {
    embeds: [
      {
        title: "Editor problem report",
        color: YELLOW,
        fields: [
          { name: "Report", value: opts.reportId, inline: true },
          { name: "Characters", value: String(opts.chars), inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/** Pack approved — sent to public uploads channel. */
export function packApprovedEmbed(opts: {
  packTitle: string;
  packSlug: string;
  gameSlug: string;
  creatorName: string;
  thumbnailUrl?: string;
}): DiscordWebhookPayload {
  const packUrl = `${SITE_URL}/games/${opts.gameSlug}/packs/${opts.packSlug}`;

  const embed: DiscordEmbed = {
    title: opts.packTitle,
    description: `New skin by **${opts.creatorName}**`,
    url: packUrl,
    color: BRAND_COLOR,
    footer: { text: "textures.gg" },
    timestamp: new Date().toISOString(),
  };

  if (opts.thumbnailUrl) {
    embed.thumbnail = { url: opts.thumbnailUrl };
  }

  return { embeds: [embed] };
}

// ── Helpers ────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

// Discord renders no markdown inside code, so user text cannot become a link
// or a mention. A backtick would close the code, so it is swapped for a
// look-alike.
const literal = (text: string) => text.replaceAll("`", "\u02CB");
const codeSpan = (text: string) => `\`${literal(text)}\``;
const codeBlock = (text: string) => `\`\`\`\n${literal(text)}\n\`\`\``;

/** Build a public R2 thumbnail URL if a key exists. */
export function thumbnailUrl(assetsBaseUrl: string, key: string | null): string | undefined {
  if (!key) return undefined;
  return `${assetsBaseUrl.replace(/\/$/, "")}/${key}`;
}
