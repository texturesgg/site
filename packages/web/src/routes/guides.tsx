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
        description="There are two ways to apply texture mods to Melee. The desktop app does everything for you; DAT Texture Wizard works if you prefer doing it by hand."
      />
      <div {...stylex.props(layout.narrow)}>
        <Tabs<Method>
          label="Installation method"
          value={method}
          onValueChange={(next) =>
            navigate({ search: { method: next === "dtw" ? "dtw" : undefined }, replace: true })
          }
          items={[
            { value: "desktop", label: "Desktop app (recommended)", panel: <DesktopGuide /> },
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
          <li>A Melee ISO file (.iso or .gcm)</li>
          <li>The textures.gg desktop app</li>
          <li>Texture files (.dat) or packs (.zip) from textures.gg</li>
        </BulletList>
        <Tip>If you use Slippi, the app finds your Melee ISO automatically.</Tip>
      </ArticleSection>

      <ArticleSection title="Getting the app">
        <p>
          Get the desktop app from the <TextLink to="/download">download page</TextLink>. It runs on
          Windows and Linux.
        </p>
      </ArticleSection>

      <ArticleSection title="Applying textures">
        <Steps>
          <Step number={1}>
            <p>
              <Strong>Open the app and load your ISO.</Strong> With Slippi installed it detects your
              Melee ISO; otherwise choose <Strong>Browse for ISO file</Strong> and select it.
            </p>
          </Step>
          <Step number={2}>
            <p>
              <Strong>Drag your texture files onto the window.</Strong> Single .dat files and .zip
              packs both work.
            </p>
            <Tip>
              Files named like <Code>PlFxNr.dat</Code> are matched to their character and costume
              automatically. For anything else, pick from the dropdowns.
            </Tip>
          </Step>
          <Step number={3}>
            <p>
              <Strong>Check the pending changes.</Strong> Each file shows the character or stage it
              replaces; change the character, costume, or stage if something looks wrong.
            </p>
          </Step>
          <Step number={4}>
            <p>
              <Strong>Save.</Strong> <Strong>Save</Strong> writes the changes into your ISO; use{" "}
              <Strong>Save as copy…</Strong> to keep the original untouched.
            </p>
          </Step>
        </Steps>
      </ArticleSection>

      <ArticleSection title="That's it">
        <p>
          Your ISO now has the new textures built in. Load it in Slippi or Dolphin, and add more
          whenever you like.
        </p>
        <Tip>
          You can queue several textures at once, mixing characters, costumes, and stages in one
          batch.
        </Tip>
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
