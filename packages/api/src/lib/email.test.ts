import { describe, expect, it, vi } from "vitest";
import { type EmailSender, sendEmail, sendNotification } from "./email";

function createSender() {
  const send: EmailSender["send"] = vi.fn(async () => ({ messageId: "message-1" }));
  return { sender: { send }, send };
}

describe("Cloudflare Email Sending", () => {
  it("sends required authentication email through the native binding", async () => {
    const { sender, send } = createSender();

    await sendEmail(sender, {
      to: "user@example.com",
      subject: "Verify",
      html: "<p>Verify</p>",
    });

    expect(send).toHaveBeenCalledWith({
      from: { email: "noreply@textures.gg", name: "textures.gg" },
      to: "user@example.com",
      subject: "Verify",
      html: "<p>Verify</p>",
    });
  });

  it("fails required email when the binding is unavailable", async () => {
    await expect(
      sendEmail(undefined, {
        to: "user@example.com",
        subject: "Verify",
        html: "<p>Verify</p>",
      })
    ).rejects.toThrow("Email Sending binding is not configured");
  });

  it("propagates required email delivery failures", async () => {
    const send: EmailSender["send"] = vi.fn(async () => {
      throw new Error("delivery failed");
    });

    await expect(
      sendEmail({ send }, { to: "user@example.com", subject: "Verify", html: "<p>Verify</p>" })
    ).rejects.toThrow("delivery failed");
  });

  it("skips optional notifications when the binding is unavailable", async () => {
    await expect(
      sendNotification(undefined, {
        to: "user@example.com",
        subject: "Update",
        html: "<p>Update</p>",
      })
    ).resolves.toBeUndefined();
  });

  it("isolates recipients and settles individual notification failures", async () => {
    const send: EmailSender["send"] = vi
      .fn<EmailSender["send"]>()
      .mockRejectedValueOnce(new Error("first failed"))
      .mockResolvedValueOnce({ messageId: "message-2" });

    await expect(
      sendNotification(
        { send },
        {
          to: ["first@example.com", "second@example.com"],
          subject: "Update",
          html: "<p>Update</p>",
        }
      )
    ).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ to: "first@example.com" }));
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ to: "second@example.com" }));
  });
});
