import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { DISCORD_URL } from "@/lib/config";
import { Article, ArticleSection, Step, Steps } from "@/ui/patterns/Article";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { AnchorButton, TextLink } from "@/ui/primitives";
import { space } from "@/ui/tokens.stylex";
import { PRIMARY_GAME_SLUG } from "@vgskins/shared";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About - textures.gg" },
      {
        name: "description",
        content:
          "About textures.gg - a community platform for discovering and sharing texture mods for classic games.",
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
  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="About textures.gg"
        description="A community platform for finding and sharing texture mods, built by the community, for the community."
      />
      <div {...stylex.props(layout.narrow)}>
        <Article>
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
                  Load them into your game with the <TextLink to="/download">desktop app</TextLink>{" "}
                  or <TextLink to="/guides">another method</TextLink>.
                </p>
              </Step>
            </Steps>
          </ArticleSection>

          <ArticleSection title="How do I upload?">
            <p>
              Sign in, then <TextLink to="/upload">upload a pack</TextLink>: drop in your .dat files
              and a screenshot or two. Packs are checked automatically, then reviewed by a moderator
              before they go public.
            </p>
          </ArticleSection>

          <ArticleSection title="Community and support">
            <p>
              Join the Discord to meet other texture modders, get help, share works in progress, and
              tell us what to improve. It&apos;s also the place for account, upload, or download
              problems, bug reports, and feature requests.
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
