import { useFeatureFlag } from "@/lib/feature-flags";
import { NavTab, NavTabs } from "@/ui/patterns/NavTabs";

/**
 * The kinds of mods a game has, each its own section of the game's page.
 * Textures is the only one until code mods are on for the viewer.
 */
export function GameSections({ slug }: { slug: string }) {
  const codeMods = useFeatureFlag("codeMods");
  if (!codeMods) return null;
  return (
    <NavTabs label="Sections">
      <NavTab
        to="/games/$slug"
        params={{ slug }}
        activeOptions={{ exact: true, includeSearch: false }}
      >
        Textures
      </NavTab>
      <NavTab to="/games/$slug/code-mods" params={{ slug }}>
        Code mods
      </NavTab>
    </NavTabs>
  );
}
