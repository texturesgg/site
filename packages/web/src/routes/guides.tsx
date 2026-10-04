import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import {
  Article,
  ArticleSection,
  BulletList,
  Code,
  Step,
  Steps,
  Strong,
  Tip,
} from "@/ui/patterns/Article";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { Tabs, TextAnchor, TextLink } from "@/ui/primitives";
import { color, font, space, text } from "@/ui/tokens.stylex";

type Method = "desktop" | "dtw";

export const Route = createFileRoute("/guides")({
  validateSearch: (search: Record<string, unknown>): { method?: Method } => ({
    method: search.method === "dtw" ? "dtw" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "How to install texture mods - textures.gg" },
      {
        name: "description",
        content:
          "Learn how to apply texture mods to Super Smash Bros. Melee using the textures.gg desktop app or DAT Texture Wizard.",
      },
    ],
  }),
  component: Guides,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  examples: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    columnGap: space.lg,
    rowGap: space.xxs,
    margin: 0,
    fontSize: text.md,
  },
  file: { fontFamily: font.mono, color: color.text },
  what: { margin: 0, color: color.muted },
});

function Guides() {
  const { method = "desktop" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="How to install texture mods"
        description="There are two ways to get texture mods into Melee. The app does it all for you, or DAT Texture Wizard works if you'd rather do it by hand."
      />
      <div {...stylex.props(layout.narrow)}>
        <Tabs<Method>
          label="Installation method"
          value={method}
          onValueChange={(next) =>
            navigate({ search: { method: next === "dtw" ? "dtw" : undefined }, replace: true })
          }
          items={[
            { value: "desktop", label: "The app (recommended)", panel: <DesktopGuide /> },
            { value: "dtw", label: "DAT Texture Wizard", panel: <DtwGuide /> },
          ]}
        />
      </div>
    </div>
  );
}

function DesktopGuide() {
  return (
    <Article>
      <ArticleSection title="What you'll need">
        <BulletList>
          <li>Your Melee ISO (NTSC 1.02, the one Slippi uses)</li>
          <li>The textures.gg app</li>
          <li>Some skins (.dat) or packs (.zip) from here</li>
        </BulletList>
      </ArticleSection>

      <ArticleSection title="Getting the app">
        <p>
          Grab it from the <TextLink to="/download">download page</TextLink>. It runs on macOS and
          Linux, and Windows is coming soon.
        </p>
      </ArticleSection>

      <ArticleSection title="Installing skins">
        <Steps>
          <Step number={1}>
            <p>
              <Strong>Open the app and pick your Melee.</Strong> It finds the ISOs in your game
              folders and marks the one Slippi plays. Pick that one, or choose a different ISO.
            </p>
          </Step>
          <Step number={2}>
            <p>
              <Strong>Drop your skins on the window.</Strong> .dat files and .zip packs both work,
              or use <Strong>Add skins…</Strong>.
            </p>
            <Tip>
              Files named like <Code>PlFxNr.dat</Code> get matched to their character and color for
              you. If it guessed wrong, just change it.
            </Tip>
          </Step>
          <Step number={3}>
            <p>
              <Strong>Hit Add and install.</Strong> The skin goes straight into your ISO, and it
              stays in your library if you want it again later.
            </p>
          </Step>
        </Steps>
      </ArticleSection>

      <ArticleSection title="That's it">
        <p>
          Load up Slippi and play. Changed your mind? <Strong>Undo</Strong> puts back what was
          there, and <Strong>Restore vanilla</Strong> brings any costume back to the original.
        </p>
      </ArticleSection>
    </Article>
  );
}

function DtwGuide() {
  return (
    <Article>
      <ArticleSection title="What you'll need">
        <BulletList>
          <li>A Melee ISO file (.iso or .gcm)</li>
          <li>
            <TextAnchor href="https://smashboards.com/threads/dat-texture-wizard-current-version-6-1.373777/">
              DAT Texture Wizard
            </TextAnchor>{" "}
            (Windows, free)
          </li>
          <li>Texture files (.dat) from textures.gg</li>
        </BulletList>
      </ArticleSection>

      <ArticleSection title="Opening your ISO">
        <Steps>
          <Step number={1}>
            <p>
              <Strong>Open DAT Texture Wizard</Strong> and choose <Strong>File → Open Disc</Strong>,
              then select your Melee ISO.
            </p>
          </Step>
          <Step number={2}>
            <p>
              The tree on the left lists every file in the ISO. The .dat, .lat, and .rat files are
              the character and stage textures.
            </p>
          </Step>
        </Steps>
      </ArticleSection>

      <ArticleSection title="Finding the right file">
        <p>
          Character textures follow a pattern like <Code>PlFxNr.dat</Code> (Fox, Neutral). Most
          downloads on textures.gg are already named for their target; otherwise check the pack
          description.
        </p>
        <dl {...stylex.props(styles.examples)}>
          <dt {...stylex.props(styles.file)}>PlFxNr.dat</dt>
          <dd {...stylex.props(styles.what)}>Fox, Neutral</dd>
          <dt {...stylex.props(styles.file)}>PlMsNr.dat</dt>
          <dd {...stylex.props(styles.what)}>Marth, Neutral</dd>
          <dt {...stylex.props(styles.file)}>PlFcBu.dat</dt>
          <dd {...stylex.props(styles.what)}>Falco, Blue</dd>
          <dt {...stylex.props(styles.file)}>GrNBa.dat</dt>
          <dd {...stylex.props(styles.what)}>Battlefield</dd>
        </dl>
      </ArticleSection>

      <ArticleSection title="Importing the texture">
        <Steps start={3}>
          <Step number={3}>
            <p>
              <Strong>Find the target file</Strong> in the tree, scrolling or searching with{" "}
              <Strong>Ctrl+F</Strong>.
            </p>
          </Step>
          <Step number={4}>
            <p>
              <Strong>Right-click it</Strong>, choose <Strong>Import File to (ISO)</Strong>, and
              pick the .dat file you downloaded.
            </p>
          </Step>
          <Step number={5}>
            <p>
              <Strong>Save with Ctrl+S.</Strong> The status bar confirms the change.
            </p>
          </Step>
        </Steps>
        <Tip>
          DAT Texture Wizard replaces one file at a time, so repeat steps 3–5 for each file in a
          pack.
        </Tip>
      </ArticleSection>

      <ArticleSection title="You're done">
        <p>
          Load the ISO in Slippi or Dolphin to see your textures. If something looks wrong, check
          that each .dat file went to the right target; that's the most common mistake.
        </p>
      </ArticleSection>
    </Article>
  );
}
