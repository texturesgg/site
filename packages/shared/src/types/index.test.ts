import { describe, expect, test } from "vitest";
import {
  canonicalDatFileName,
  CommentInput,
  isModFileName,
  parseCostumeFileName,
  LIMITS,
  OnboardingInput,
  UpdateProfileInput,
  UploadPackForm,
} from "./index";

describe("DAT filenames", () => {
  test("accepts only canonical DAT uploads", () => {
    expect(isModFileName("GrPs.dat")).toBe(true);
    expect(isModFileName("GrPs.DAT")).toBe(true);
    expect(isModFileName("GrPs.usd")).toBe(false);
    expect(isModFileName("GrPs.lat")).toBe(false);
    expect(isModFileName("preview.png")).toBe(false);
  });

  test("canonicalizes legacy DAT aliases", () => {
    expect(canonicalDatFileName("GrPs.usd")).toBe("GrPs.dat");
    expect(canonicalDatFileName("GrIz.1at")).toBe("GrIz.dat");
    expect(canonicalDatFileName("GrPs.dat")).toBe("GrPs.dat");
    expect(canonicalDatFileName("GrPs.DAT")).toBe("GrPs.dat");
  });

  test("reduces an uploaded name to a bare file name", () => {
    expect(canonicalDatFileName("../../PlFxNr.dat")).toBe("PlFxNr.dat");
    expect(canonicalDatFileName("mods\\PlPeYe - Daisy.dat")).toBe("PlPeYe - Daisy.dat");
    expect(canonicalDatFileName("x\"; filename*=UTF-8''y.exe; z=\".dat")).toBe(
      "x; filename=UTF-8''y.exe; z=.dat"
    );
    expect(canonicalDatFileName("PlFx\r\nNr.dat")).toBe("PlFxNr.dat");
    expect(canonicalDatFileName("ピカチュウ.dat")).toBe("ピカチュウ.dat");
    expect(canonicalDatFileName(".dat")).toBe("mod.dat");
    expect(canonicalDatFileName("..")).toBe("mod.dat");
  });
});

describe("costume filenames", () => {
  test.each([
    ["PlFxLa.dat", { characterCode: "Fx", costumeCode: "La" }],
    ["PlFxOr_SpecOp.dat", { characterCode: "Fx", costumeCode: "Or" }],
    ["plcanr.dat", { characterCode: "Ca", costumeCode: "Nr" }],
    ["mods/PlPeYe - Daisy.dat", { characterCode: "Pe", costumeCode: "Ye" }],
  ])("parses %s", (fileName, expected) => {
    expect(parseCostumeFileName(fileName)).toEqual(expected);
  });

  test.each([
    "PlFx.dat",
    "PlFx_Pistol.dat",
    "PlFxLaser.dat",
    "GrNBa.dat",
    "Drag your ISO here.dat",
  ])("rejects %s", (fileName) => {
    expect(parseCostumeFileName(fileName)).toBeNull();
  });
});

describe("shared request schemas", () => {
  test("normalizes optional upload fields", () => {
    const result = UploadPackForm.parse({
      title: "Tournament Falco",
      gameId: "melee",
      targetId: "falco",
      description: "",
      tags: "",
    });

    expect(result.description).toBeNull();
    expect(result.tags).toBeNull();
  });

  test("enforces upload length limits", () => {
    const result = UploadPackForm.safeParse({
      title: "x".repeat(LIMITS.PACK_TITLE_MAX + 1),
      gameId: "melee",
      targetId: "falco",
    });

    expect(result.success).toBe(false);
  });

  test("normalizes empty profile URLs and rejects unsafe schemes", () => {
    expect(UpdateProfileInput.parse({ websiteUrl: "" }).websiteUrl).toBeNull();
    expect(UpdateProfileInput.safeParse({ websiteUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  // The API returns the first issue's message to the user, so it must name the field.
  test.each([
    // Onboarding checks bounds only; the API applies the username rules to a changed name.
    [OnboardingInput, { name: "" }, "Choose a username"],
    [
      UpdateProfileInput,
      { bio: "x".repeat(LIMITS.BIO_MAX + 1) },
      "Bio must be 500 characters or fewer",
    ],
    [
      UpdateProfileInput,
      { websiteUrl: "not a url" },
      "Website must be a full URL starting with http:// or https://",
    ],
    [CommentInput, { body: "   " }, "Comment can't be empty"],
    [UploadPackForm, { title: "", gameId: "melee", targetId: "falco" }, "Title is required"],
    [UploadPackForm, { title: "Falco", gameId: "", targetId: "falco" }, "Choose a game"],
  ] as const)("returns a readable message (%#)", (schema, input, message) => {
    const result = schema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });
});
