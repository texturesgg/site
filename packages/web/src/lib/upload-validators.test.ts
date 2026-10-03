import { describe, expect, it } from "vitest";
import { fileSize, imageFileValidation, modFileValidation } from "./upload-validators";

function makeFile(name: string, size: number, type = "application/octet-stream"): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("fileSize", () => {
  it("formats sub-MB files with 2 decimal places", () => {
    expect(fileSize(makeFile("test.dat", 512 * 1024))).toBe("0.50 MB");
  });

  it("formats 1+ MB files with 1 decimal place", () => {
    expect(fileSize(makeFile("big.dat", 2 * 1024 * 1024))).toBe("2.0 MB");
  });
});

describe("modFileValidation", () => {
  it("returns null for a valid DAT file within size limit", () => {
    const file = makeFile("PlFcNr.dat", 1024);
    expect(modFileValidation(file)).toBeNull();
  });

  it("returns error for unsupported file extension", () => {
    const file = makeFile("texture.png", 1024);
    expect(modFileValidation(file)).toBe("texture.png is not a supported DAT file");
  });

  it("returns error for file exceeding size limit", () => {
    const file = makeFile("PlFcNr.dat", 200 * 1024 * 1024);
    expect(modFileValidation(file)).toContain("exceeds the");
    expect(modFileValidation(file)).toContain("MB limit");
  });
});

describe("imageFileValidation", () => {
  it("returns null for a valid PNG within size limit", () => {
    const file = makeFile("preview.png", 1024, "image/png");
    expect(imageFileValidation(file)).toBeNull();
  });

  it("returns null for a valid JPEG within size limit", () => {
    const file = makeFile("preview.jpg", 1024, "image/jpeg");
    expect(imageFileValidation(file)).toBeNull();
  });

  it("returns error for unsupported file type", () => {
    const file = makeFile("preview.bmp", 1024, "image/bmp");
    expect(imageFileValidation(file)).toBe("preview.bmp must be PNG, JPEG, WebP, or GIF");
  });

  it("returns error for file exceeding size limit", () => {
    const file = makeFile("preview.png", 50 * 1024 * 1024, "image/png");
    expect(imageFileValidation(file)).toContain("exceeds the");
    expect(imageFileValidation(file)).toContain("MB limit");
  });
});
