import {
  IMAGE_TYPE_EXTENSIONS,
  isModFileName,
  LIMITS,
  parseCostumeFileName,
} from "@vgskins/shared";
import { imageFileValidation, modFileValidation } from "./upload-validators";

// The upload form's decisions, kept free of React so they can be tested: which
// dropped files are mods or screenshots, which character they are for, which
// costume slot each fills, and what still blocks a submission.

export type UploadSlot = { id: string; name: string; fileCode: string | null };
export type UploadTarget = {
  id: string;
  name: string;
  category: string;
  fileCode: string | null;
  slots: readonly UploadSlot[];
};

export type ModDraft = { key: string; file: File; slotId: string };

export const IMAGE_ACCEPT = Object.keys(IMAGE_TYPE_EXTENSIONS).join(",");

/** Splits a drop into mod files and screenshots, with a reason for anything refused. */
export function sortDroppedFiles(files: readonly File[]) {
  const mods: File[] = [];
  const images: File[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    if (isModFileName(file.name)) {
      const error = modFileValidation(file);
      if (error) rejected.push(error);
      else mods.push(file);
    } else if (file.type.startsWith("image/")) {
      const error = imageFileValidation(file);
      if (error) rejected.push(error);
      else images.push(file);
    } else {
      rejected.push(`${file.name} isn't a .dat file or an image`);
    }
  }
  return { mods, images, rejected };
}

/**
 * The target the files' Melee names point to: "PlFxLa.dat" is Fox. Undefined
 * when no file carries a code, a code matches no target, or files disagree.
 */
export function detectTarget(
  files: readonly File[],
  targets: readonly UploadTarget[]
): { target?: UploadTarget; mixed: boolean } {
  const codes = new Set(
    files.flatMap((file) => {
      const parsed = parseCostumeFileName(file.name);
      return parsed ? [parsed.characterCode] : [];
    })
  );
  if (codes.size > 1) return { mixed: true };
  const [code] = codes;
  return { target: targets.find((target) => target.fileCode === code), mixed: false };
}

/** The costume slot a file's name points to, or the only slot of a single-slot target. */
export function inferSlotId(file: File, target: UploadTarget): string {
  if (target.slots.length === 1) return target.slots[0].id;
  const parsed = parseCostumeFileName(file.name);
  if (!parsed || parsed.characterCode !== target.fileCode) return "";
  return target.slots.find((slot) => slot.fileCode === parsed.costumeCode)?.id ?? "";
}

/** New drafts for added files, each taking its inferred slot unless another file has it. */
export function draftMods(
  files: readonly File[],
  target: UploadTarget | undefined,
  existing: readonly ModDraft[],
  nextKey: () => string
): ModDraft[] {
  const used = new Set(existing.map((mod) => mod.slotId).filter(Boolean));
  return files.map((file) => {
    const inferred = target ? inferSlotId(file, target) : "";
    const slotId = inferred && !used.has(inferred) ? inferred : "";
    if (slotId) used.add(slotId);
    return { key: nextKey(), file, slotId };
  });
}

/** Re-infers every slot, as when the target changes; earlier files win a contested slot. */
export function reassignSlots(mods: readonly ModDraft[], target: UploadTarget): ModDraft[] {
  const used = new Set<string>();
  return mods.map((mod) => {
    const inferred = inferSlotId(mod.file, target);
    const slotId = inferred && !used.has(inferred) ? inferred : "";
    if (slotId) used.add(slotId);
    return { ...mod, slotId };
  });
}

/** The part of a costume file name after its code: "PlFxNr_SpecOp.dat" is "SpecOp". */
export function variantFromFileName(fileName: string): string | null {
  const rest = /^pl[a-z]{4}(.*)\.[a-z0-9]+$/i.exec(fileName)?.[1]?.replace(/^[\s_.-]+/, "");
  return rest ? rest.replace(/[_-]+/g, " ").trim() || null : null;
}

/** The label a mod is stored with: its version name, else its costume's name. */
export function modLabel(mod: ModDraft, target: UploadTarget | undefined): string {
  const slotName = target?.slots.find((slot) => slot.id === mod.slotId)?.name;
  const label =
    variantFromFileName(mod.file.name) ?? slotName ?? mod.file.name.replace(/\.[^.]+$/, "");
  return label.slice(0, LIMITS.MOD_LABEL_MAX);
}

/** "SpecOp Fox" when every file shares a version name; otherwise nothing to suggest. */
export function suggestTitle(mods: readonly ModDraft[], target: UploadTarget | undefined): string {
  if (!target || mods.length === 0) return "";
  const variants = new Set(mods.map((mod) => variantFromFileName(mod.file.name)));
  const [variant] = variants;
  if (variants.size !== 1 || !variant) return "";
  return `${variant} ${target.name}`.slice(0, LIMITS.PACK_TITLE_MAX);
}

export type ModIssue = { kind: "error" | "warning"; message: string };

/** Per-file problems: a missing or repeated slot blocks; a name for another character warns. */
export function modIssues(
  mods: readonly ModDraft[],
  target: UploadTarget | undefined,
  targets: readonly UploadTarget[]
): Map<string, ModIssue> {
  const issues = new Map<string, ModIssue>();
  const firstBySlot = new Map<string, ModDraft>();
  for (const mod of mods) {
    if (!target) continue;
    if (!mod.slotId) {
      const named = inferSlotId(mod.file, target);
      const holder = mods.find((other) => other !== mod && other.slotId === named);
      const slotName = target.slots.find((slot) => slot.id === named)?.name;
      const message =
        target.slots.length === 1
          ? `${target.name} takes one file; remove the extras`
          : holder && slotName
            ? `${holder.file.name} already uses ${slotName}; choose another costume or remove one`
            : "Choose which costume this file replaces";
      issues.set(mod.key, { kind: "error", message });
      continue;
    }
    const first = firstBySlot.get(mod.slotId);
    if (first) {
      issues.set(mod.key, {
        kind: "error",
        message: `${first.file.name} already uses this costume`,
      });
      continue;
    }
    firstBySlot.set(mod.slotId, mod);
    const parsed = parseCostumeFileName(mod.file.name);
    if (parsed && target.fileCode && parsed.characterCode !== target.fileCode) {
      const other = targets.find((candidate) => candidate.fileCode === parsed.characterCode);
      issues.set(mod.key, {
        kind: "warning",
        message: `This file is named for ${other?.name ?? "another character"}`,
      });
    }
  }
  return issues;
}

/** Everything that must be fixed before the pack can be submitted, in page order. */
export function blockingProblems(input: {
  mods: readonly ModDraft[];
  images: readonly File[];
  target: UploadTarget | undefined;
  title: string;
  issues: ReadonlyMap<string, ModIssue>;
}): string[] {
  const problems: string[] = [];
  if (input.mods.length === 0) problems.push("Add at least one .dat file");
  if (input.mods.length > LIMITS.PACK_MODS_MAX)
    problems.push(`A pack can hold up to ${LIMITS.PACK_MODS_MAX} files`);
  const bytes = [...input.mods.map((mod) => mod.file), ...input.images].reduce(
    (total, file) => total + file.size,
    0
  );
  if (bytes > LIMITS.PACK_FILES_MAX)
    problems.push(`A pack's files can add up to ${LIMITS.PACK_FILES_MAX / 1024 / 1024} MB`);
  if (!input.target) problems.push("Choose the character or stage these files are for");
  const fileErrors = [...input.issues.values()].filter((issue) => issue.kind === "error").length;
  if (fileErrors > 0)
    problems.push(`${fileErrors} ${fileErrors === 1 ? "file needs" : "files need"} attention`);
  if (!input.title.trim()) problems.push("Give the pack a title");
  return problems;
}
