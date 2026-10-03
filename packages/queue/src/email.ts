import { logger } from "@vgskins/logger";

export interface EmailSender {
  send(message: EmailMessageBuilder): Promise<EmailSendResult>;
}

export async function sendModeratorNotifications(
  sender: EmailSender | undefined,
  recipients: string[],
  message: { subject: string; html: string }
): Promise<void> {
  if (!sender || recipients.length === 0) return;

  await Promise.all(
    recipients.map(async (recipient) => {
      try {
        const result = await sender.send({
          from: { email: "notifications@textures.gg", name: "textures.gg" },
          to: recipient,
          subject: message.subject,
          html: message.html,
        });
        logger.info({ emailId: result.messageId }, "Moderator notification sent");
      } catch (error) {
        logger.error({ error }, "Moderator notification failed");
      }
    })
  );
}
