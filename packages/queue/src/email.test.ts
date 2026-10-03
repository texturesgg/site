import { describe, expect, it, vi } from "vitest";
import { type EmailSender, sendModeratorNotifications } from "./email";

function createSender() {
  const send: EmailSender["send"] = vi.fn(async () => ({ messageId: "message-1" }));
  return { sender: { send }, send };
}

describe("sendModeratorNotifications", () => {
  it("skips delivery without a production binding", async () => {
    await expect(
      sendModeratorNotifications(undefined, ["mod@example.com"], {
        subject: "Ready",
        html: "<p>Ready</p>",
      })
    ).resolves.toBeUndefined();
  });

  it("sends separately from the notification address", async () => {
    const { sender, send } = createSender();

    await sendModeratorNotifications(sender, ["first@example.com", "second@example.com"], {
      subject: "Ready",
      html: "<p>Ready</p>",
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, {
      from: { email: "notifications@textures.gg", name: "textures.gg" },
      to: "first@example.com",
      subject: "Ready",
      html: "<p>Ready</p>",
    });
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ to: "second@example.com" }));
  });

  it("settles delivery failures so Queue processing does not retry", async () => {
    const send: EmailSender["send"] = vi
      .fn<EmailSender["send"]>()
      .mockRejectedValueOnce(new Error("delivery failed"))
      .mockResolvedValueOnce({ messageId: "message-2" });

    await expect(
      sendModeratorNotifications({ send }, ["first@example.com", "second@example.com"], {
        subject: "Ready",
        html: "<p>Ready</p>",
      })
    ).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(2);
  });
});
