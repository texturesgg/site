import { type createDb, users } from "@vgskins/db";
import { logger } from "@vgskins/logger";
import { inArray } from "drizzle-orm";

const FROM_EMAIL = { email: "noreply@textures.gg", name: "textures.gg" } as const;

export interface EmailSender {
  send(message: EmailMessageBuilder): Promise<EmailSendResult>;
}

export async function sendEmail(
  sender: EmailSender | undefined,
  params: { to: string; subject: string; html: string }
): Promise<void> {
  if (!sender) {
    throw new Error("Email Sending binding is not configured");
  }

  await sender.send({
    from: FROM_EMAIL,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}

// ── Email Templates ────────────────────────────────────────

function emailWrapper(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;padding:32px;background:#0c0c0e;border:1px solid rgba(6,182,212,0.12);">
    <div style="border-bottom:1px solid rgba(6,182,212,0.12);padding-bottom:16px;margin-bottom:24px;">
      <span style="font-family:monospace;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#06B6D4;">
        textures.gg
      </span>
    </div>
    ${content}
    <div style="border-top:1px solid rgba(6,182,212,0.12);padding-top:16px;margin-top:24px;">
      <p style="font-family:monospace;font-size:10px;color:#52525b;margin:0;">
        If you didn't request this email, you can safely ignore it.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function verificationEmailHtml(url: string): string {
  return emailWrapper(`
    <h2 style="font-family:monospace;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#e4e4e7;margin:0 0 12px;">
      Verify Your Email
    </h2>
    <p style="font-size:14px;color:#a1a1aa;line-height:1.6;margin:0 0 24px;">
      Click the button below to verify your email address and activate your account.
    </p>
    <a href="${url}" style="display:inline-block;padding:10px 24px;background:linear-gradient(135deg,#06B6D4,#0284C7);color:#fff;font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:bold;text-decoration:none;">
      Verify Email
    </a>
  `);
}

export function resetPasswordEmailHtml(url: string): string {
  return emailWrapper(`
    <h2 style="font-family:monospace;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#e4e4e7;margin:0 0 12px;">
      Reset Your Password
    </h2>
    <p style="font-size:14px;color:#a1a1aa;line-height:1.6;margin:0 0 24px;">
      Click the button below to reset your password. This link expires in 1 hour.
    </p>
    <a href="${url}" style="display:inline-block;padding:10px 24px;background:linear-gradient(135deg,#06B6D4,#0284C7);color:#fff;font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:bold;text-decoration:none;">
      Reset Password
    </a>
  `);
}

/** Sent instead of a reset email when the account has no password yet (OAuth-only or imported). */
export function setPasswordEmailHtml(url: string): string {
  return emailWrapper(`
    <h2 style="font-family:monospace;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#e4e4e7;margin:0 0 12px;">
      Set Your Password
    </h2>
    <p style="font-size:14px;color:#a1a1aa;line-height:1.6;margin:0 0 24px;">
      You already have a textures.gg account with this email, including any packs imported from the
      original archive. Set a password to sign in with your email. This link expires in 1 hour.
    </p>
    <a href="${url}" style="display:inline-block;padding:10px 24px;background:linear-gradient(135deg,#06B6D4,#0284C7);color:#fff;font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:bold;text-decoration:none;">
      Set Password
    </a>
  `);
}

// ── Notification Templates ────────────────────────────────

const SITE_URL = "https://textures.gg";

const buttonStyle =
  "display:inline-block;padding:10px 24px;background:linear-gradient(135deg,#06B6D4,#0284C7);color:#fff;font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:bold;text-decoration:none;";

export function commentNotificationHtml(opts: {
  skinTitle: string;
  commenterName: string;
  commentBody: string;
  skinUrl: string;
}): string {
  const truncatedBody =
    opts.commentBody.length > 200 ? `${opts.commentBody.slice(0, 200)}…` : opts.commentBody;

  return emailWrapper(`
    <h2 style="font-family:monospace;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#e4e4e7;margin:0 0 12px;">
      New Comment
    </h2>
    <p style="font-size:14px;color:#a1a1aa;line-height:1.6;margin:0 0 8px;">
      <strong style="color:#e4e4e7;">${escapeHtml(opts.commenterName)}</strong> commented on your skin
      <strong style="color:#e4e4e7;">${escapeHtml(opts.skinTitle)}</strong>:
    </p>
    <div style="background:#18181b;border-left:3px solid #06B6D4;padding:12px 16px;margin:16px 0;">
      <p style="font-size:13px;color:#a1a1aa;line-height:1.5;margin:0;white-space:pre-wrap;">${escapeHtml(truncatedBody)}</p>
    </div>
    <a href="${opts.skinUrl}" style="${buttonStyle}">
      View Skin
    </a>
  `);
}

export function reportNotificationHtml(opts: {
  targetType: string;
  reason: string;
  details?: string | null;
  reporterName: string;
}): string {
  return emailWrapper(`
    <h2 style="font-family:monospace;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#e4e4e7;margin:0 0 12px;">
      New Report
    </h2>
    <p style="font-size:14px;color:#a1a1aa;line-height:1.6;margin:0 0 8px;">
      <strong style="color:#e4e4e7;">${escapeHtml(opts.reporterName)}</strong> reported a
      <strong style="color:#e4e4e7;">${escapeHtml(opts.targetType)}</strong> for
      <strong style="color:#06B6D4;">${escapeHtml(opts.reason)}</strong>.
    </p>
    ${
      opts.details
        ? `<div style="background:#18181b;border-left:3px solid #06B6D4;padding:12px 16px;margin:16px 0;">
        <p style="font-size:13px;color:#a1a1aa;line-height:1.5;margin:0;white-space:pre-wrap;">${escapeHtml(opts.details)}</p>
      </div>`
        : ""
    }
    <a href="${SITE_URL}/admin/reports" style="${buttonStyle}">
      Review Reports
    </a>
  `);
}

export function moderationResultHtml(opts: {
  title: string;
  type: "pack";
  status: "approved" | "rejected";
  skinUrl?: string;
}): string {
  const isApproved = opts.status === "approved";
  const statusColor = isApproved ? "#22c55e" : "#ef4444";
  const statusLabel = isApproved ? "Approved" : "Rejected";

  return emailWrapper(`
    <h2 style="font-family:monospace;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#e4e4e7;margin:0 0 12px;">
      Pack ${statusLabel}
    </h2>
    <p style="font-size:14px;color:#a1a1aa;line-height:1.6;margin:0 0 8px;">
      Your pack <strong style="color:#e4e4e7;">${escapeHtml(opts.title)}</strong> has been
      <strong style="color:${statusColor};">${statusLabel.toLowerCase()}</strong>.
    </p>
    ${
      isApproved && opts.skinUrl
        ? `<p style="font-size:13px;color:#52525b;margin:8px 0 16px;">
        It's now live and visible to the community.
      </p>
      <a href="${opts.skinUrl}" style="${buttonStyle}">
        View Pack
      </a>`
        : opts.status === "rejected"
          ? `<p style="font-size:13px;color:#52525b;margin:8px 0 16px;">
        If you believe this was a mistake, please reach out on Discord.
      </p>`
          : ""
    }
  `);
}

// ── Helpers ───────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Get email addresses for all moderators and admins. */
export async function getModEmails(db: ReturnType<typeof createDb>): Promise<string[]> {
  const mods = await db
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.role, ["moderator", "admin"]))
    .all();

  const emails = mods.map((m) => m.email).filter((e): e is string => !!e);
  logger.info({ modCount: mods.length, emailCount: emails.length }, "getModEmails");
  return emails;
}

/** Fire-and-forget email send — logs errors but never throws. */
export async function sendNotification(
  sender: EmailSender | undefined,
  params: { to: string | string[]; subject: string; html: string }
): Promise<void> {
  const recipients = Array.isArray(params.to) ? params.to : [params.to];
  logger.info({ recipientCount: recipients.length, subject: params.subject }, "sendNotification");
  if (recipients.length === 0) return;
  if (!sender) {
    logger.info("Skipping notification because Email Sending is not configured");
    return;
  }

  for (const to of recipients) {
    try {
      const result = await sender.send({
        from: FROM_EMAIL,
        to,
        subject: params.subject,
        html: params.html,
      });
      logger.info({ emailId: result.messageId }, "Notification sent");
    } catch (err) {
      logger.error({ err }, "sendNotification failed");
    }
  }
}
