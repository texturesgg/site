import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { PRIMARY_GAME_SLUG } from "@vgskins/shared";
import { DISCORD_URL, GITHUB_URL } from "@/lib/config";
import { featureFlag, useFeatureFlag } from "@/lib/feature-flags";
import { Article, ArticleSection, Code, Step, Steps } from "@/ui/patterns/Article";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { AnchorButton, TextLink } from "@/ui/primitives";
import { space } from "@/ui/tokens.stylex";

export const Route = createFileRoute("/about")({
  loader: async ({ context }) => ({
    codeMods: await featureFlag(context.queryClient, "codeMods").catch(() => false),
  }),
  head: ({ loaderData }) => ({
    meta: [
      { title: "About - textures.gg" },
      {
        name: "description",
        content: loaderData?.codeMods
          ? "About textures.gg - Melee texture mods, custom skins, and code mods for tgg-melee."
          : "About textures.gg - a community platform for discovering and sharing texture mods for classic games.",
      },
    ],
  }),
  component: About,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  action: { alignSelf: "flex-start" },
});

function About() {
  const codeMods = useFeatureFlag("codeMods");
  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="About textures.gg"
        description={
          codeMods
            ? "Textures, code mods, and native online play for Super Smash Bros. Melee."
            : "A community platform for finding and sharing texture mods, built by the community, for the community."
        }
      />
      <div {...stylex.props(layout.narrow)}>
        <Article>
          {codeMods ? (
            <>
              <ArticleSection title="What it is">
                <p>
                  textures.gg is a home for Super Smash Bros. Melee modding. It hosts community
                  texture packs and skins you can install into your Slippi ISO or play in{" "}
                  <Code>tgg-melee</Code>, plus a registry of code mods and mod sets for{" "}
                  <Code>tgg-melee</Code>.
                </p>
                <p>
                  <Code>tgg-melee</Code> is a native PC port of Melee 1.02 with a mod loader built
                  in. Nothing from the game is shipped with it: you bring your own clean Melee 1.02
                  disc, and every change to the game, from competitive rules and rollback netplay to
                  training drills and replays, is a mod you choose to load.
                </p>
              </ArticleSection>

              <ArticleSection title="The desktop app">
                <p>
                  The <TextLink to="/download">textures.gg app</TextLink> brings both sides together
                  on Windows, macOS, and Linux. You can browse and install skins, recolor costumes
                  in a 3D editor, download <Code>tgg-melee</Code>, switch between mod sets, watch
                  Slippi and <Code>tgg-melee</Code> replays, and find matches or host rooms with
                  friends.
                </p>
              </ArticleSection>

              <ArticleSection title="How to get started">
                <Steps>
                  <Step number={1}>
                    <p>
                      Grab the <TextLink to="/download">desktop app</TextLink> and point it at your
                      Melee NTSC 1.02 ISO.
                    </p>
                  </Step>
                  <Step number={2}>
                    <p>
                      Browse{" "}
                      <TextLink to="/games/$slug" params={{ slug: PRIMARY_GAME_SLUG }}>
                        textures
                      </TextLink>{" "}
                      to install skins into Slippi or <Code>tgg-melee</Code>, or pick a starter set
                      like Competitive, Practice, or Replays on{" "}
                      <TextLink to="/games/$slug/mods" params={{ slug: PRIMARY_GAME_SLUG }}>
                        Mods
                      </TextLink>
                      .
                    </p>
                  </Step>
                  <Step number={3}>
                    <p>
                      Need a walkthrough? The <TextLink to="/guides">install guides</TextLink> cover
                      skins, <Code>tgg-melee</Code> sets, and DAT Texture Wizard.
                    </p>
                  </Step>
                </Steps>
              </ArticleSection>

              <ArticleSection title="Making skins and mods">
                <p>
                  Sign in and <TextLink to="/upload">upload a pack</TextLink> to share custom
                  character skins, stages, or UI textures. Packs are validated automatically and
                  reviewed before going public.
                </p>
                <p>
                  To build a gameplay rule, HUD overlay, trainer, or game mode for{" "}
                  <Code>tgg-melee</Code>, start with the{" "}
                  <TextLink to="/docs/mods">mod docs</TextLink>. Most mods are Luau scripts with
                  live hot reload, no compiler required, and publish straight from the{" "}
                  <Code>tgg</Code> CLI.
                </p>
              </ArticleSection>
            </>
          ) : (
            <ArticleSection title="What it is">
              <p>
                A home for the texture modding community. We host and preserve custom skins, stages,
                and other visual mods, and make them easy to find, preview, and download.
              </p>
              <p>
                We started with Super Smash Bros. Melee and plan to add other games with active
                modding communities.
              </p>
            </ArticleSection>
          )}

          <ArticleSection title="The ssbmtextures import">
            <p>
              When ssbmtextures.com shut down, we imported its whole library so nothing was lost.
              Every pack came over credited to its original creator.
            </p>
            <p>
              If you had an ssbmtextures account, sign in with the same email and it links
              automatically, with your uploads, comments, and likes.
            </p>
            <p>
              See a pack that&apos;s uncredited or credited to the wrong person? Report it from the
              pack&apos;s page and we&apos;ll fix it.
            </p>
          </ArticleSection>

          {!codeMods && (
            <>
              <ArticleSection title="How do I use mods?">
                <Steps>
                  <Step number={1}>
                    <p>
                      <TextLink to="/games/$slug" params={{ slug: PRIMARY_GAME_SLUG }}>
                        Browse
                      </TextLink>{" "}
                      by character or stage, or search for something specific.
                    </p>
                  </Step>
                  <Step number={2}>
                    <p>Download the files from the pack&apos;s page.</p>
                  </Step>
                  <Step number={3}>
                    <p>
                      Load them into your game with the <TextLink to="/download">app</TextLink> or{" "}
                      <TextLink to="/guides">another method</TextLink>.
                    </p>
                  </Step>
                </Steps>
              </ArticleSection>

              <ArticleSection title="How do I upload?">
                <p>
                  Sign in, then <TextLink to="/upload">upload a pack</TextLink>: drop in your .dat
                  files and a screenshot or two. Packs are checked automatically, then reviewed by a
                  moderator before they go public.
                </p>
              </ArticleSection>
            </>
          )}

          <ArticleSection title="Open source">
            <p>
              {codeMods
                ? "The site, the desktop app, the tgg CLI, the Rust crates that read Melee's files, and the official mods are all open source under GPL-3.0-or-later. Poke around, open an issue, or send a PR."
                : "The site, the app, and the Rust crates that read Melee's files are all open source. Poke around, open an issue, or send a PR."}
            </p>
            <span {...stylex.props(styles.action)}>
              <AnchorButton href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                textures.gg on GitHub
              </AnchorButton>
            </span>
          </ArticleSection>

          <ArticleSection title="Community and support">
            <p>
              Join the Discord to meet other modders, get help, share works in progress, and tell us
              what to improve. It&apos;s also the place for account, upload, or download problems,
              bug reports, and feature requests.
            </p>
            <span {...stylex.props(styles.action)}>
              <AnchorButton href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
                Join the Discord
              </AnchorButton>
            </span>
          </ArticleSection>
        </Article>
      </div>
    </div>
  );
}
