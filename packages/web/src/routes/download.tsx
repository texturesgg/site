import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { ASSETS_URL, DISCORD_URL } from "@/lib/config";
import { DownloadIcon } from "@/ui/icons";
import { Article, ArticleSection, Strong } from "@/ui/patterns/Article";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { AnchorButton, TextAnchor, TextLink } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

const VERSION = "0.1.0";

const PLATFORMS = [
  {
    name: "Windows",
    requirement: "Windows 10 or later",
    file: `textures.gg_${VERSION}_x64-setup.exe`,
  },
  { name: "Linux", requirement: "Debian or Ubuntu", file: `textures.gg_${VERSION}_amd64.deb` },
] as const;

const downloadUrl = (file: string) => `${ASSETS_URL}/desktop/v${VERSION}/${file}`;

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download the desktop app - textures.gg" },
      {
        name: "description",
        content: "Download the textures.gg desktop app to apply texture mods to your Melee ISO.",
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
        title="Download the desktop app"
        description={`Apply texture mods to your Melee ISO: drop in .dat files or .zip packs, press Save, done. Version ${VERSION}.`}
      />
      <div {...stylex.props(layout.narrow)}>
        <Article>
          <ul aria-label="Downloads" {...stylex.props(styles.platforms)}>
            {PLATFORMS.map((platform) => (
              <li key={platform.file} {...stylex.props(styles.platform)}>
                <span {...stylex.props(styles.platformText)}>
                  <span {...stylex.props(styles.platformName)}>{platform.name}</span>
                  <span {...stylex.props(styles.platformMeta)}>{platform.requirement}</span>
                  <span {...stylex.props(styles.file)}>{platform.file}</span>
                </span>
                <AnchorButton
                  href={downloadUrl(platform.file)}
                  variant="primary"
                  icon={<DownloadIcon />}
                  aria-label={`Download for ${platform.name}`}
                >
                  Download
                </AnchorButton>
              </li>
            ))}
          </ul>

          <ArticleSection title="First launch">
            <p>
              On Windows, SmartScreen may warn about an unknown publisher. Choose{" "}
              <Strong>More info</Strong>, then <Strong>Run anyway</Strong>. You only need to do this
              once.
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
