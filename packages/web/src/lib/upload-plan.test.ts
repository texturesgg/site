import { describe, expect, it } from "vitest";
import {
  blockingProblems,
  detectTarget,
  draftMods,
  modIssues,
  modLabel,
  reassignSlots,
  sortDroppedFiles,
  suggestTitle,
  variantFromFileName,
  type UploadTarget,
} from "./upload-plan";

const fox: UploadTarget = {
  id: "fox",
  name: "Fox",
  category: "character",
  fileCode: "Fx",
  slots: [
    { id: "fox-nr", name: "Neutral", fileCode: "Nr" },
    { id: "fox-or", name: "Orange", fileCode: "Or" },
    { id: "fox-la", name: "Lavender", fileCode: "La" },
  ],
};
const falco: UploadTarget = { ...fox, id: "falco", name: "Falco", fileCode: "Fc", slots: [] };
const battlefield: UploadTarget = {
  id: "bf",
  name: "Battlefield",
  category: "stage",
  fileCode: null,
  slots: [{ id: "bf-default", name: "Default", fileCode: null }],
};
const targets = [fox, falco, battlefield];

const file = (name: string, type = "application/octet-stream") =>
  new File([new Uint8Array(8)], name, { type });
let counter = 0;
const key = () => `k${++counter}`;

describe("sortDroppedFiles", () => {
  it("separates mod files, screenshots, and anything else", () => {
    const result = sortDroppedFiles([
      file("PlFxNr.dat"),
      file("shot.png", "image/png"),
      file("readme.txt", "text/plain"),
    ]);
    expect(result.mods.map((f) => f.name)).toEqual(["PlFxNr.dat"]);
    expect(result.images.map((f) => f.name)).toEqual(["shot.png"]);
    expect(result.rejected).toEqual(["readme.txt isn't a .dat file or an image"]);
  });
});

describe("detectTarget", () => {
  it("finds the character from the files' names", () => {
    expect(detectTarget([file("PlFxNr.dat"), file("PlFxLa_Spec.dat")], targets)).toEqual({
      target: fox,
      mixed: false,
    });
  });

  it("reports files for different characters", () => {
    expect(detectTarget([file("PlFxNr.dat"), file("PlFcNr.dat")], targets).mixed).toBe(true);
  });

  it("leaves stages and unknown names to the uploader", () => {
    expect(detectTarget([file("GrNBa.dat")], targets).target).toBeUndefined();
  });
});

describe("draftMods and reassignSlots", () => {
  it("fills each file's named costume once, leaving a repeat unassigned", () => {
    const mods = draftMods([file("PlFxNr.dat"), file("PlFxNr_B.dat"), file("x.dat")], fox, [], key);
    expect(mods.map((mod) => mod.slotId)).toEqual(["fox-nr", "", ""]);
  });

  it("uses a stage's only slot for any file", () => {
    expect(draftMods([file("GrNBa.dat")], battlefield, [], key)[0].slotId).toBe("bf-default");
  });

  it("re-infers slots and keeps keys when the target changes", () => {
    const mods = draftMods([file("PlFxOr.dat")], undefined, [], key);
    const reassigned = reassignSlots(mods, fox);
    expect(reassigned[0]).toMatchObject({ key: mods[0].key, slotId: "fox-or" });
  });
});

describe("names", () => {
  it("reads a version name from a costume file name", () => {
    expect(variantFromFileName("PlFxNr_SpecOp.dat")).toBe("SpecOp");
    expect(variantFromFileName("PlFxNr.dat")).toBeNull();
  });

  it("labels a mod by version, else by costume", () => {
    const [named, plain] = draftMods([file("PlFxNr_SpecOp.dat"), file("PlFxLa.dat")], fox, [], key);
    expect(modLabel(named, fox)).toBe("SpecOp");
    expect(modLabel(plain, fox)).toBe("Lavender");
  });

  it("suggests a title only when every file shares a version", () => {
    const shared = draftMods([file("PlFxNr_SpecOp.dat"), file("PlFxLa_SpecOp.dat")], fox, [], key);
    expect(suggestTitle(shared, fox)).toBe("SpecOp Fox");
    const mixed = draftMods([file("PlFxNr_A.dat"), file("PlFxLa_B.dat")], fox, [], key);
    expect(suggestTitle(mixed, fox)).toBe("");
  });
});

describe("problems", () => {
  it("blocks missing and repeated costumes and warns about another character's file", () => {
    const mods = [
      { key: "a", file: file("PlFxNr.dat"), slotId: "fox-nr" },
      { key: "b", file: file("PlFxNr_2.dat"), slotId: "fox-nr" },
      { key: "c", file: file("custom.dat"), slotId: "" },
      { key: "d", file: file("PlFcOr.dat"), slotId: "fox-or" },
    ];
    const issues = modIssues(mods, fox, targets);
    expect(issues.get("a")).toBeUndefined();
    expect(issues.get("b")).toEqual({
      kind: "error",
      message: "PlFxNr.dat already uses this costume",
    });
    expect(issues.get("c")?.kind).toBe("error");
    expect(issues.get("d")).toEqual({ kind: "warning", message: "This file is named for Falco" });
    expect(blockingProblems({ mods, images: [], target: fox, title: " ", issues })).toEqual([
      "2 files need attention",
      "Give the pack a title",
    ]);
  });

  it("names the file holding the costume another file is named for", () => {
    const mods = draftMods([file("PlFxNr.dat"), file("PlFxNr_Alt.dat")], fox, [], key);
    expect(modIssues(mods, fox, targets).get(mods[1].key)?.message).toBe(
      "PlFxNr.dat already uses Neutral; choose another costume or remove one"
    );
  });

  it("tells the uploader a single-slot target takes one file", () => {
    const mods = draftMods([file("GrNBa.dat"), file("GrNBa2.dat")], battlefield, [], key);
    expect(modIssues(mods, battlefield, targets).get(mods[1].key)?.message).toBe(
      "Battlefield takes one file; remove the extras"
    );
  });

  it("asks for files and a target on an empty form", () => {
    expect(
      blockingProblems({ mods: [], images: [], target: undefined, title: "", issues: new Map() })
    ).toEqual([
      "Add at least one .dat file",
      "Choose the character or stage these files are for",
      "Give the pack a title",
    ]);
  });
});
