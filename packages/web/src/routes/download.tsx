import * as stylex from "@stylexjs/stylex";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  STUDIO_PLATFORMS,
  type StudioAsset,
  type StudioPlatform,
  StudioRelease,
} from "@vgskins/shared/studio-release";
import { ASSETS_URL, DISCORD_URL } from "@/lib/config";
import { featureFlag, useFeatureFlag } from "@/lib/feature-flags";
import { DownloadIcon } from "@/ui/icons";
import { Article, ArticleSection, Code, Strong } from "@/ui/patterns/Article";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { AnchorButton, TextAnchor, TextLink } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";
import { CurrentDownload } from "./-download-current";

/** The platforms the page lists, and what the app needs on each when the release doesn't say. */
const PLATFORMS: { id: StudioPlatform; name: string }[] = [
  { id: "windows", name: "Windows" },
  { id: "macos", name: "macOS" },
  { id: "linux", name: "Linux" },
];

/** The newest app release, or null when there's none to read (everything is coming soon). */
const studioReleaseQuery = queryOptions({
  queryKey: ["studio-release"],
  queryFn: async (): Promise<StudioRelease | null> => {
    const response = await fetch(`${ASSETS_URL}/studio/latest.json`).catch(() => null);
    if (!response?.ok) return null;
    const release = StudioRelease.safeParse(await response.json().catch(() => null));
    return release.success ? release.data : null;
  },
  staleTime: 1000 * 60 * 5,
});

/** A file's name, the last part of its URL. */
const fileName = (url: string) => decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");

/** A size in MB, as the page shows it. */
const megabytes = (bytes: number) => `${Math.max(0.1, bytes / 1_000_000).toFixed(1)} MB`;

export const Route = createFileRoute("/download")({
  loader: async ({ context }) => {
    // A flag that can't be read leaves the page as it is with the flag off.
    if (await featureFlag(context.queryClient, "codeMods").catch(() => false)) {
      await context.queryClient.ensureQueryData(studioReleaseQuery);
    }
  },
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
  platformText: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
    flex: "1 1 240px",
    minWidth: 0,
  },
  platformName: { fontSize: text.xl, fontWeight: 700 },
  platformMeta: { fontSize: text.sm, color: color.muted },
  file: { fontFamily: font.mono, fontSize: text.xs, color: color.muted, overflowWrap: "anywhere" },
  actions: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: space.xxs },
  others: { display: "flex", gap: space.sm, fontSize: text.sm },
  command: {
    margin: 0,
    padding: space.md,
    overflowX: "auto",
    borderRadius: radius.md,
    backgroundColor: color.surface,
    fontFamily: font.mono,
    fontSize: text.sm,
  },
});

function Download() {
  return useFeatureFlag("codeMods") ? <AppDownload /> : <CurrentDownload />;
}

/** The download page from studio/latest.json, for viewers with code mods on. */
function AppDownload() {
  const { data: release } = useQuery(studioReleaseQuery);
  const has = (platform: StudioPlatform) => (release?.assets[platform]?.length ?? 0) > 0;
  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="Download the app"
        description={`Put skins in the Melee you play on Slippi, and play tgg-melee with mods.${release && STUDIO_PLATFORMS.some(has) ? ` Version ${release.version}.` : ""}`}
      />
      <div {...stylex.props(layout.narrow)}>
        <Article>
          <ul aria-label="Downloads" {...stylex.props(styles.platforms)}>
            {PLATFORMS.map((platform) => (
              <PlatformRow
                key={platform.id}
                name={platform.name}
                assets={release?.assets[platform.id] ?? []}
              />
            ))}
          </ul>
          {release?.notes_url && (
            <p>
              <TextAnchor href={release.notes_url}>What&apos;s new in {release.version}</TextAnchor>
            </p>
          )}
          {STUDIO_PLATFORMS.some(has) && (
            <ArticleSection title="Installing">
              {has("windows") && (
                <p>
                  <Strong>Windows:</Strong> run the installer.
                </p>
              )}
              {has("macos") && (
                <p>
                  <Strong>macOS:</Strong> open the .dmg and drag textures.gg into Applications.
                </p>
              )}
              {has("linux") && (
                <p>
                  <Strong>Linux:</Strong> extract it and run <Code>install.sh</Code>, then
                  it&apos;ll show up in your app menu.
                </p>
              )}
            </ArticleSection>
          )}
          <ArticleSection title="Command line">
            <p>
              <Code>tgg</Code> installs tgg-melee and mods from a terminal. On Linux and macOS:
            </p>
            <pre {...stylex.props(styles.command)}>
              curl -fsSL https://textures.gg/install.sh | sh
            </pre>
            <p>On Windows, in PowerShell:</p>
            <pre {...stylex.props(styles.command)}>irm https://textures.gg/install.ps1 | iex</pre>
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

/** One platform: its main download and any others, or "Coming soon". */
function PlatformRow({ name, assets }: { name: string; assets: StudioAsset[] }) {
  const [main, ...others] = assets;
  return (
    <li {...stylex.props(styles.platform)}>
      <span {...stylex.props(styles.platformText)}>
        <span {...stylex.props(styles.platformName)}>{name}</span>
        {(!main || main.min_os) && (
          <span {...stylex.props(styles.platformMeta)}>{main ? main.min_os : "Coming soon"}</span>
        )}
        {main && (
          <span {...stylex.props(styles.file)}>
            {fileName(main.url)} · {megabytes(main.size)}
          </span>
        )}
      </span>
      {main && (
        <span {...stylex.props(styles.actions)}>
          <AnchorButton
            href={main.url}
            variant="primary"
            icon={<DownloadIcon />}
            aria-label={`Download for ${name}`}
          >
            Download
          </AnchorButton>
          {others.length > 0 && (
            <span {...stylex.props(styles.others)}>
              {others.map((asset) => (
                <TextAnchor
                  key={asset.url}
                  href={asset.url}
                  aria-label={`${asset.kind} for ${name}, ${megabytes(asset.size)}`}
                >
                  {asset.kind}
                </TextAnchor>
              ))}
            </span>
          )}
        </span>
      )}
    </li>
  );
}
