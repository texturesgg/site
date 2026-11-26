import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { PRIMARY_GAME_SLUG } from "@vgskins/shared";
import { DISCORD_URL, GITHUB_URL } from "@/lib/config";
import { useFeatureFlag } from "@/lib/feature-flags";
import { Article, ArticleSection, BulletList, Code, Strong } from "@/ui/patterns/Article";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { AnchorButton, TextAnchor, TextLink } from "@/ui/primitives";
import { color, radius, space, text } from "@/ui/tokens.stylex";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ - textures.gg" },
      {
        name: "description",
        content:
          "Answers to common questions about textures.gg, tgg-melee, Slippi, mod safety, ISOs, platforms, and open source.",
      },
    ],
  }),
  component: Faq,
});

const TOPICS = [
  { id: "slippi", label: "Slippi Ranked & Unranked" },
  { id: "different", label: "tgg-melee vs Dolphin & other ports" },
  { id: "iso", label: "Melee ISOs" },
  { id: "mod-safety", label: "Mod classes & cheating online" },
  { id: "skins-in-slippi", label: "Using skins in Slippi" },
  { id: "platforms", label: "Platforms & controllers" },
  { id: "making-mods", label: "Making mods & uploading skins" },
  { id: "open-source", label: "Open source" },
  { id: "ssbmtextures", label: "ssbmtextures.com import" },
] as const;

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  toc: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.xs,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  tocLink: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "36px",
    paddingInline: space.sm,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
    fontSize: text.sm,
    fontWeight: 500,
    color: { default: color.muted, ":hover": color.text },
    textDecoration: "none",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accentText}` },
  },
  action: { alignSelf: "flex-start" },
});

function Faq() {
  const codeMods = useFeatureFlag("codeMods");

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="Frequently asked questions"
        description="Straight answers on Slippi, tgg-melee, mod safety, ISOs, and supported platforms."
      />
      <div {...stylex.props(layout.narrow)}>
        <Article>
          <nav aria-label="FAQ topics">
            <ul {...stylex.props(styles.toc)}>
              {TOPICS.map((topic) => (
                <li key={topic.id}>
                  <a href={`#${topic.id}`} {...stylex.props(styles.tocLink)}>
                    {topic.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <ArticleSection
            id="slippi"
            title="Why doesn't tgg-melee connect to Slippi Ranked or Unranked?"
          >
            <p>
              Fizzi has asked other projects not to connect to Slippi&apos;s matchmaking servers,
              and we respect that. <Code>tgg-melee</Code> runs its own matchmaking and room-code
              service (<Code>meet.textures.gg</Code>) instead of pointing at Slippi&apos;s
              infrastructure.
            </p>
            <p>
              Because netplay in <Code>tgg-melee</Code> is a regular mod rather than hardcoded into
              the binary, the architecture stays cleanly separated. Once <Code>tgg-melee</Code> is
              out in the open and people can inspect its mod classes, determinism checks, and source
              verification, we&apos;d love to talk with the Slippi team about an official
              collaboration if they&apos;re ever interested.
            </p>
          </ArticleSection>

          <ArticleSection
            id="different"
            title="How is tgg-melee different from Dolphin, Slippi, and other native ports?"
          >
            <p>
              Dolphin and Slippi emulate GameCube hardware. Native ports compile the Melee
              decompilation directly for PC, which cuts emulator overhead and input latency.
            </p>
            <p>
              Most native forks bake features like netplay, training tools, or skin browsers
              directly into the game executable, so adding or changing a feature means maintaining
              another fork. <Code>tgg-melee</Code> takes the opposite approach: the port itself
              ships with no gameplay changes baked in. Unlocks, competitive rules, rollback netplay,
              replays, skins, and training drills are all mods loaded on top of a blank 1.02 port.
              Modders can write gameplay rules, HUD overlays, custom menus, or new game modes in
              Luau or C without forking the game.
            </p>
          </ArticleSection>

          <ArticleSection
            id="iso"
            title="Where do I get a Melee ISO? Does this include game files?"
          >
            <p>
              No. Neither textures.gg nor <Code>tgg-melee</Code> distributes Nintendo game files,
              ROMs, or ISOs. You need your own clean Super Smash Bros. Melee NTSC 1.02 disc image.
            </p>
            <p>
              <Code>tgg-melee</Code> reads your ISO without modifying it, so the same clean disc
              works alongside Slippi.
            </p>
          </ArticleSection>

          <ArticleSection id="mod-safety" title="Can mods let people cheat online or split queues?">
            <p>
              The runtime enforces three mod classes so cosmetic and training mods never break
              fairness or split matchmaking:
            </p>
            <BulletList>
              <li>
                <Strong>Gameplay mods</Strong> change simulation and must match across every player
                in a match. Online peers compare each mod&apos;s reviewed source and build identity,
                and rooms offer the host&apos;s mods to joiners automatically.
              </li>
              <li>
                <Strong>Display mods</Strong> (such as input displays, trainers, and skins) only
                change local presentation and never split matchmaking. Skins that change character
                skeletons are swapped back to vanilla online so they can&apos;t desync.
              </li>
              <li>
                <Strong>Offline mods</Strong> (such as save states and solo practice drills) are
                disabled automatically by the port during netplay.
              </li>
            </BulletList>
            <p>
              Code mods published on textures.gg are built from committed git source on our build
              pipeline and reviewed before going public so players can inspect what they install.
            </p>
          </ArticleSection>

          <ArticleSection
            id="skins-in-slippi"
            title="Can I still use textures.gg skins with Slippi and Dolphin?"
          >
            <p>
              Yes. Skins and texture packs on{" "}
              <TextLink to="/games/$slug" params={{ slug: PRIMARY_GAME_SLUG }}>
                textures.gg
              </TextLink>{" "}
              work in both Slippi and <Code>tgg-melee</Code>. The{" "}
              <TextLink to="/download">desktop app</TextLink> can install skins directly into your
              Slippi ISO (with Undo and Restore vanilla) or load them in <Code>tgg-melee</Code>{" "}
              through the official <Code>tgg.skins</Code> mod without touching your ISO. You can
              also patch <Code>.dat</Code> files by hand with DAT Texture Wizard; see the{" "}
              <TextLink to="/guides">install guides</TextLink>.
            </p>
          </ArticleSection>

          <ArticleSection id="platforms" title="What platforms and controllers are supported?">
            <p>
              <Code>tgg-melee</Code>, the desktop app, and the <Code>tgg</Code> CLI run natively on
              Windows (x86-64), macOS (Apple Silicon), and Linux (x86-64). Netplay is cross-platform
              across all three operating systems.
            </p>
            <p>
              GameCube controller adapters (native mode) and standard USB or Bluetooth controllers
              supported by SDL work out of the box.
            </p>
          </ArticleSection>

          <ArticleSection id="making-mods" title="How do I make a mod or upload a skin?">
            <p>
              To share a character skin, stage, or UI texture, sign in and{" "}
              <TextLink to="/upload">upload a pack</TextLink>. Uploads are validated automatically
              and reviewed before going live.
            </p>
            <p>
              To build a code mod for <Code>tgg-melee</Code>, start with the{" "}
              <TextLink to="/docs/mods">mod docs</TextLink>. Most mods are Luau scripts that hot
              reload while the game runs, ship as one package for Windows, macOS, and Linux, and
              publish directly with <Code>tgg mod publish</Code>.
              {codeMods ? (
                <>
                  {" "}
                  You can also browse published mods and sets on{" "}
                  <TextLink to="/games/$slug/mods" params={{ slug: PRIMARY_GAME_SLUG }}>
                    Mods
                  </TextLink>
                  .
                </>
              ) : null}
            </p>
          </ArticleSection>

          <ArticleSection id="open-source" title="Is this open source?">
            <p>
              Yes. The site, desktop app, <Code>tgg</Code> CLI, Rust DAT/HSD crates,{" "}
              <Code>tgg-melee</Code>, and all official mods are open source under GPL-3.0-or-later,
              crediting the Melee decompilation, Slippi, UCF, and other upstream projects. Source
              repositories live on <TextAnchor href={GITHUB_URL}>GitHub</TextAnchor>.
            </p>
          </ArticleSection>

          <ArticleSection id="ssbmtextures" title="What happened to ssbmtextures.com?">
            <p>
              When ssbmtextures.com shut down, we imported its full archive so community textures
              would not be lost. Every pack kept its original creator credit. If you had an
              ssbmtextures account, sign in with the same email to reclaim your uploads, or report
              any miscredited pack from its page and we&apos;ll fix it.
            </p>
          </ArticleSection>

          <ArticleSection title="Still have a question?">
            <p>
              Ask in Discord for help with setup, mods, or bug reports, or read more on the{" "}
              <TextLink to="/about">about page</TextLink>.
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
