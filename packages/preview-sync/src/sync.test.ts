import { describe, expect, it } from "vitest";
import { sanitizeUser, SNAPSHOT_TABLES } from "./sync";

describe("preview snapshot sanitization", () => {
  it("removes private auth fields while preserving the public profile", () => {
    expect(
      sanitizeUser({
        id: "user-1",
        name: "Player",
        email: "player@example.com",
        email_verified: 1,
        image: "https://example.com/avatar.png",
        role: "admin",
        banned: 1,
        ban_reason: "reason",
        ban_expires: 123,
        bio: "Public profile",
        show_twitter: 1,
        twitter_handle: "player",
        source: null,
      })
    ).toEqual({
      id: "user-1",
      name: "⟦production⟧ Player",
      email: "preview+757365722d31@example.invalid",
      email_verified: 0,
      image: "https://example.com/avatar.png",
      role: "user",
      banned: 0,
      ban_reason: null,
      ban_expires: null,
      bio: "Public profile",
      show_twitter: 1,
      twitter_handle: "player",
      source: "preview-sync",
    });
  });

  it("keeps only public snapshot tables in foreign-key insertion order", () => {
    expect(SNAPSHOT_TABLES[0]).toBe("users");
    expect(SNAPSHOT_TABLES.indexOf("packs")).toBeLessThan(SNAPSHOT_TABLES.indexOf("mods"));
    expect(SNAPSHOT_TABLES.indexOf("collections")).toBeLessThan(
      SNAPSHOT_TABLES.indexOf("collection_items")
    );
    expect(SNAPSHOT_TABLES).not.toContain("favorites");
    expect(SNAPSHOT_TABLES).not.toContain("downloads");
  });
});
