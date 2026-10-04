import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { DISCORD_URL } from "@/lib/config";
import { DownloadIcon } from "@/ui/icons";
import { Article, ArticleSection, Code, Strong } from "@/ui/patterns/Article";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { AnchorButton, TextAnchor, TextLink } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

const VERSION = "0.2.0";

const PLATFORMS: { name: string; requirement: string; file?: string }[] = [
  {
    name: "macOS",
    requirement: "macOS 12 or later, Apple silicon",
    file: `textures.gg-${VERSION}-macos-arm64.dmg`,
  },
  {
    name: "Linux",
    requirement: "x86-64: Ubuntu 22.04, Debian 12, Fedora 36, or later",
    file: `textures.gg-${VERSION}-linux-x86_64.tar.gz`,
  },
  { name: "Windows", requirement: "Coming soon" },
];

const downloadUrl = (file: string) =>
  `https://github.com/texturesgg/texturesgg/releases/download/app-v${VERSION}/${file}`;

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download the app - textures.gg" },
      {
        name: "description",
        content: "Get the textures.gg app to put skins into the Melee you play on Slippi.",
      },
    ],
  }),
  component: Download,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  platforms: { display: "flex", flexDirection: "column", gap: space.xs, margin: 0, padding: 0 },
  platform: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    listStyle: "none",
  },
  platformText: { display: "flex", flexDirection: "column", gap: space.xxs, minWidth: 0 },
  platformName: { fontSize: text.xl, fontWeight: 700 },
  platformMeta: { fontSize: text.sm, color: color.muted },
  file: { fontFamily: font.mono, fontSize: text.xs, color: color.muted, overflowWrap: "anywhere" },
});

function Download() {
  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="Download the app"
        description={`Get skins into the Melee you play on Slippi, and see them in 3D before you play. Version ${VERSION}.`}
      />
      <div {...stylex.props(layout.narrow)}>
        <Article>
          <ul aria-label="Downloads" {...stylex.props(styles.platforms)}>
            {PLATFORMS.map((platform) => (
              <li key={platform.name} {...stylex.props(styles.platform)}>
                <span {...stylex.props(styles.platformText)}>
                  <span {...stylex.props(styles.platformName)}>{platform.name}</span>
                  <span {...stylex.props(styles.platformMeta)}>{platform.requirement}</span>
                  {platform.file && <span {...stylex.props(styles.file)}>{platform.file}</span>}
                </span>
                {platform.file && (
                  <AnchorButton
                    href={downloadUrl(platform.file)}
                    variant="primary"
                    icon={<DownloadIcon />}
                    aria-label={`Download for ${platform.name}`}
                  >
                    Download
                  </AnchorButton>
                )}
              </li>
            ))}
          </ul>

          <ArticleSection title="Installing">
            <p>
              <Strong>macOS:</Strong> open the .dmg and drag textures.gg into Applications.
            </p>
            <p>
              <Strong>Linux:</Strong> extract it and run <Code>install.sh</Code>, then it&apos;ll
              show up in your app menu.
            </p>
          </ArticleSection>

          <ArticleSection title="Need help?">
            <p>
              The <TextLink to="/guides">installation guide</TextLink> walks through every step, or
              ask in <TextAnchor href={DISCORD_URL}>Discord</TextAnchor> if you&apos;re stuck.
            </p>
          </ArticleSection>
        </Article>
      </div>
    </div>
  );
}
