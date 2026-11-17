import type { CodeModKind, CodeModNetplay, ModShare, SetShare } from "@vgskins/shared";
import type { CardInput } from "./card";

// What a mod's or set's card and link tags say. Plain strings, so the tests
// and the card read the same thing.

const KIND_CHIPS: Record<CodeModKind, string | null> = {
  script: "Script",
  native: "Native",
  content: null,
};

const NETPLAY_CHIPS: Record<CodeModNetplay, string> = {
  code: "Has to match in netplay",
  files: "Has to match in netplay",
  costumes: "Has to match in netplay",
  data: "Display only",
  display: "Display only",
  offline: "Offline only",
};

export function modCard(mod: ModShare): Omit<CardInput, "iconData"> {
  const kind = mod.kind ? KIND_CHIPS[mod.kind] : null;
  return {
    eyebrow: "Melee mod",
    title: mod.name,
    byline: `by ${mod.publisher.name}`,
    official: mod.publisher.official,
    description: mod.description,
    chips: [...(kind ? [kind] : []), ...(mod.netplay ? [NETPLAY_CHIPS[mod.netplay]] : [])],
  };
}

export function setCard(set: SetShare): Omit<CardInput, "iconData"> {
  return {
    eyebrow: "Melee mod set",
    title: set.title,
    // Admins make sets.
    byline: "by textures.gg",
    official: true,
    description: set.description || null,
    chips: [set.modCount === 1 ? "1 mod" : `${set.modCount} mods`],
  };
}

/** The description a link shows when the mod has none of its own. */
export function modDescription(mod: ModShare): string {
  return mod.description || `A Melee mod by ${mod.publisher.name}.`;
}

export function setDescription(set: SetShare): string {
  return set.description || `A set of ${set.modCount} Melee mods.`;
}
