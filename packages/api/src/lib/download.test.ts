import { describe, expect, test } from "vitest";
import { attachmentDisposition, zipEntryNames } from "./download";

describe("download names", () => {
  test("a file name cannot add parameters to Content-Disposition", () => {
    expect(attachmentDisposition("a\"; filename*=UTF-8''b.exe; x=\".dat")).toBe(
      "attachment; filename=\"a_; filename*=UTF-8''b.exe; x=_.dat\"; " +
        "filename*=UTF-8''a%22%3B%20filename%2A%3DUTF-8%27%27b.exe%3B%20x%3D%22.dat"
    );
  });

  test("a name outside ASCII is sent encoded, with an ASCII fallback", () => {
    expect(attachmentDisposition("PlPkNr ピカ.dat")).toBe(
      "attachment; filename=\"PlPkNr __.dat\"; filename*=UTF-8''PlPkNr%20%E3%83%94%E3%82%AB.dat"
    );
  });

  test("zip entries are bare names, and mods sharing a name each keep their file", () => {
    expect(zipEntryNames(["PlFxNr.dat", "../plfxnr.dat", "PlFxNr.dat", "PlFxOr.dat"])).toEqual([
      "PlFxNr.dat",
      "plfxnr (2).dat",
      "PlFxNr (3).dat",
      "PlFxOr.dat",
    ]);
  });
});
