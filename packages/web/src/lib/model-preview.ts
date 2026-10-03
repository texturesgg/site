import { isModFileName } from "@vgskins/shared";

type ModelPreviewCandidate = {
  fileName: string;
  slot?: { sortOrder?: number | null } | null;
};

/** Order previewable DATs by canonical costume slot while preserving stable fallbacks. */
export function orderModelPreviewMods<T extends ModelPreviewCandidate>(mods: readonly T[]): T[] {
  return mods
    .map((mod, relationIndex) => ({ mod, relationIndex }))
    .filter(({ mod }) => isModFileName(mod.fileName))
    .sort(
      (a, b) =>
        (a.mod.slot?.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.mod.slot?.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.relationIndex - b.relationIndex
    )
    .map(({ mod }) => mod);
}

/** Prefer the canonical lowest-order costume slot instead of API relation order. */
export function selectPreferredModelMod<T extends ModelPreviewCandidate>(
  mods: readonly T[]
): T | undefined {
  return orderModelPreviewMods(mods)[0];
}
