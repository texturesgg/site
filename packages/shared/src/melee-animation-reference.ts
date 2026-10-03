// A copy of the melee-dat crate's reference catalog; a test in
// packages/hsd-render-web fails when the two differ.
import inventory from "./melee-animation-reference.json";

export type MeleeAnimationReferenceAsset = Readonly<(typeof inventory.assets)[number]>;

// Fixed, source-verified reference data. Preparing a fighter's assets does not enable its playback.
export const MELEE_ANIMATION_REFERENCE_CATALOG = inventory;
export const MELEE_ANIMATION_REFERENCE_ASSETS: readonly MeleeAnimationReferenceAsset[] =
  inventory.assets.map((asset) => Object.freeze(asset));
const assetsByKey: Readonly<Partial<Record<string, MeleeAnimationReferenceAsset>>> =
  Object.fromEntries(MELEE_ANIMATION_REFERENCE_ASSETS.map((asset) => [asset.key, asset]));

/** Only declared objects are public; a plausible hash alone is not admission. */
export function getMeleeAnimationReferenceAsset(
  key: string
): MeleeAnimationReferenceAsset | undefined {
  return Object.hasOwn(assetsByKey, key) ? assetsByKey[key] : undefined;
}
