import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  byVersionDescending,
  type CodeModKind,
  type CodeModNetplay,
  PRIMARY_GAME_SLUG,
} from "@vgskins/shared";
import { type InferResponseType, parseResponse } from "hono/client";
import type { ReactNode } from "react";
import { useAuth } from "@/contexts/auth-context";
import { appLinks } from "@/lib/app-links";
import { api } from "@/lib/api";
import { supportLinkLabel } from "@/lib/support-links";
import { CONTACT_EMAIL } from "@/lib/config";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { NETPLAY_LABELS } from "@/lib/format";
import { CompetitionModBox } from "@/ui/patterns/CompetitionVote";
import { InstallActions } from "@/ui/patterns/InstallActions";
import { layout } from "@/ui/patterns/layout";
import { Markdown } from "@/ui/patterns/Markdown";
import { ModEyebrow } from "@/ui/patterns/ModHeader";
import { Publisher } from "@/ui/patterns/ModTile";
import { Badge } from "@/ui/primitives";
import { color, font, radius, space, text, tracking } from "@/ui/tokens.stylex";
import { PublisherControls } from "../-publisher";
import { MakerReleases, type MakerMod } from "../-releases";

type Listing = InferResponseType<(typeof api)["registry"]["mods"][":id"]["$get"], 200>;

export const Route = createFileRoute("/games/$slug/mods/$modId/")({
  loader: async ({ context, params }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
    if (params.slug !== PRIMARY_GAME_SLUG) throw notFound();
    // The store listing (approved releases, for everyone) and the maker's view
    // (every release, for its maker and moderators); a mod nobody approved yet
    // has only the second, and only for them.
    const [gameRes, listingRes, makerRes, sets] = await Promise.all([
      api.games[":slug"].$get({ param: { slug: params.slug } }),
      api.registry.mods[":id"].$get({ param: { id: params.modId } }),
      api["code-mods"][":slug"].$get({ param: { slug: params.modId } }),
      parseResponse(api.registry.sets.$get()),
    ]);
    const listing: Listing | null = listingRes.ok ? await listingRes.json() : null;
    // The maker's support links, when the mod is published under their name.
    const supportLinks =
      listing && listing.publisher.name === listing.author
        ? await api.users[":identifier"]
            .$get({ param: { identifier: listing.author } })
            .then(async (res) => (res.ok ? (await res.json()).supportLinks : []))
        : [];
    const maker: MakerMod | null = makerRes.ok ? await makerRes.json() : null;
    if (!listing && !maker) throw notFound();
    const game = await parseResponse(gameRes);
    return { game, listing, maker, sets, supportLinks };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.listing?.name ?? loaderData?.maker?.name ?? "Mod";
    const description = loaderData?.listing?.description ?? loaderData?.maker?.description;
    const icon = loaderData?.listing?.icon?.url;
    return {
      meta: [
        { title: `${name} - textures.gg` },
        ...(description ? [{ name: "description", content: description }] : []),
        { property: "og:title", content: name },
        ...(description ? [{ property: "og:description", content: description }] : []),
        ...(icon ? [{ property: "og:image", content: icon }] : []),
      ],
    };
  },
  component: ModPage,
});

const WIDE = "@media (min-width: 1024px)";
const MEDIUM = "@media (min-width: 768px)";

const SYSTEM_NAMES = { linux: "Linux", windows: "Windows", macos: "macOS" } as const;

const KIND_SHORT: Record<CodeModKind, string> = {
  script: "Script",
  native: "Native",
  content: "Files",
};

/** What each kind of mod is, in a line. */
const KIND_LINES: Record<CodeModKind, string> = {
  script: "Luau script. Runs the same on every system.",
  native: "Native C library, built for each system.",
  content: "Files only, no code.",
};

const NETPLAY_SHORT: Record<CodeModNetplay, string> = {
  display: "Display",
  data: "Display",
  offline: "Offline",
  code: "Gameplay",
  files: "Gameplay",
  costumes: "Gameplay",
};

const TAG_TO_CATEGORY: Record<string, "rules" | "training" | "replays" | "hud" | "modes"> = {
  competitive: "rules",
  training: "training",
  replays: "replays",
  hud: "hud",
  visual: "hud",
  mode: "modes",
};

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  hero: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr)", [WIDE]: "minmax(0, 1fr) 340px" },
    gap: { default: space.lg, [WIDE]: space.xl },
    alignItems: "start",
    paddingBottom: space.xl,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
  },
  heroLead: { display: "flex", flexDirection: "column", gap: space.md, minWidth: 0 },
  identity: {
    display: "flex",
    alignItems: "flex-start",
    gap: { default: space.md, [MEDIUM]: space.lg },
    minWidth: 0,
  },
  icon: {
    flexShrink: 0,
    width: { default: "64px", [MEDIUM]: "80px" },
    height: { default: "64px", [MEDIUM]: "80px" },
    borderRadius: radius.lg,
    objectFit: "cover",
    backgroundColor: color.surface,
  },
  letter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: text.h2,
    fontWeight: 800,
    color: color.accentText,
  },
  titleBlock: { display: "flex", flexDirection: "column", gap: space.xs, minWidth: 0 },
  titleRow: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: space.sm },
  title: {
    margin: 0,
    fontSize: { default: text.h2, [MEDIUM]: text.h1 },
    fontWeight: 800,
    letterSpacing: tracking.tight,
    lineHeight: 1.08,
    overflowWrap: "anywhere",
  },
  version: { fontFamily: font.mono, fontSize: text.sm, color: color.muted },
  byline: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.sm,
    margin: 0,
    fontSize: text.md,
    color: color.muted,
  },
  badges: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  description: {
    margin: 0,
    maxWidth: "64ch",
    fontSize: text.lg,
    lineHeight: 1.5,
    color: color.muted,
  },
  installBox: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
  },
  installMeta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    fontSize: text.xs,
    color: color.muted,
  },
  body: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr)", [WIDE]: "minmax(0, 1fr) 340px" },
    gap: { default: space.xl, [WIDE]: space.xxl },
    alignItems: "start",
  },
  main: { display: "flex", flexDirection: "column", gap: space.xxl, minWidth: 0 },
  rail: { display: "flex", flexDirection: "column", gap: space.lg, minWidth: 0 },
  railCard: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
  },
  railTitle: {
    margin: 0,
    fontSize: text.sm,
    fontWeight: 700,
    color: color.muted,
  },
  facts: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    columnGap: space.md,
    rowGap: space.sm,
    margin: 0,
    fontSize: text.sm,
  },
  term: { color: color.muted },
  value: { margin: 0, overflowWrap: "anywhere" },
  mono: { fontFamily: font.mono },
  chips: { display: "flex", flexWrap: "wrap", gap: space.xs },
  chipLink: {
    display: "inline-flex",
    alignItems: "center",
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderRadius: radius.pill,
    backgroundColor: color.raise,
    color: color.text,
    fontSize: text.xs,
    fontWeight: 600,
    lineHeight: 1.1,
    textDecoration: { default: "none", ":hover": "underline" },
  },
  support: { margin: 0, fontSize: text.sm, color: color.muted },
  supportLink: { color: color.accentText, textDecoration: "underline", textUnderlineOffset: "2px" },
  link: { color: color.text, textDecoration: { default: "none", ":hover": "underline" } },
  section: { display: "flex", flexDirection: "column", gap: space.md },
  heading: { margin: 0, fontSize: text.h3, fontWeight: 800 },
  shots: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: space.sm,
  },
  shot: {
    display: "block",
    width: "100%",
    aspectRatio: "4 / 3",
    objectFit: "cover",
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  readmeFallback: {
    margin: 0,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    fontSize: text.md,
    lineHeight: 1.55,
    color: color.muted,
  },
  releaseList: { display: "flex", flexDirection: "column", gap: space.md },
  release: {
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
    paddingTop: space.md,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
  releaseFirst: { paddingTop: 0, borderTopWidth: 0 },
  releaseHead: { display: "flex", alignItems: "baseline", gap: space.sm },
  releaseVersion: { fontSize: text.lg, fontWeight: 700 },
  muted: { margin: 0, fontSize: text.sm, color: color.muted },
  withdrawn: {
    margin: 0,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.danger,
    fontSize: text.md,
    lineHeight: 1.5,
  },
  withdrawnTitle: { fontWeight: 700 },
  report: {
    fontSize: text.sm,
    color: { default: color.muted, ":hover": color.text },
  },
});

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ModPage() {
  const { game, listing, maker, sets, supportLinks } = Route.useLoaderData();
  const { user } = useAuth();
  const canReview = user?.role === "moderator" || user?.role === "admin";
  const showReleases = maker && (maker.mine || canReview);
  const name = listing?.name ?? maker?.name ?? "";
  const description = listing?.description ?? maker?.description;
  const withdrawn = newestWithdrawn(maker, listing);
  const version = listing?.version ?? withdrawn?.version;

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <header {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.heroLead)}>
          <ModEyebrow to="/games/$slug/mods" params={{ slug: game.slug }}>
            Mods · {game.name}
          </ModEyebrow>
          <div {...stylex.props(styles.identity)}>
            {listing?.icon ? (
              <img src={listing.icon.url} alt="" {...stylex.props(styles.icon)} />
            ) : (
              <span aria-hidden="true" {...stylex.props(styles.icon, styles.letter)}>
                {name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div {...stylex.props(styles.titleBlock)}>
              <div {...stylex.props(styles.titleRow)}>
                <h1 {...stylex.props(styles.title)}>{name}</h1>
                {version && <span {...stylex.props(styles.version)}>v{version}</span>}
              </div>
              <p {...stylex.props(styles.byline)}>
                {listing ? <Byline listing={listing} /> : maker?.owner && <>by {maker.owner}</>}
                {listing && (
                  <span {...stylex.props(styles.mono)}>
                    · {listing.installs.toLocaleString("en-US")}{" "}
                    {listing.installs === 1 ? "install" : "installs"}
                  </span>
                )}
              </p>
              {listing && (listing.netplay || listing.kind) && (
                <div {...stylex.props(styles.badges)}>
                  {listing.netplay && (
                    <Badge tone={listing.netplay === "offline" ? "neutral" : "accent"}>
                      {NETPLAY_SHORT[listing.netplay]}
                    </Badge>
                  )}
                  {listing.kind && <Badge tone="neutral">{KIND_SHORT[listing.kind]}</Badge>}
                </div>
              )}
            </div>
          </div>
          {description && <p {...stylex.props(styles.description)}>{description}</p>}
        </div>

        {listing && (
          <div {...stylex.props(styles.installBox)}>
            <InstallActions
              href={appLinks.mod(listing.id)}
              label={`Install ${name}`}
              command={`tgg mod install ${listing.id}`}
              fullWidth
            />
            <div {...stylex.props(styles.installMeta)}>
              <span>Updated {formatDate(listing.updatedAt)}</span>
              <span>
                {listing.releases.length} {listing.releases.length === 1 ? "release" : "releases"}
              </span>
            </div>
          </div>
        )}
      </header>

      {withdrawn && <WithdrawnNotice release={withdrawn} whole={!listing} />}

      <div {...stylex.props(styles.body)}>
        <div {...stylex.props(styles.main)}>
          {listing && listing.screenshots.length > 0 && (
            <section {...stylex.props(styles.section)}>
              <div {...stylex.props(styles.shots)}>
                {listing.screenshots.map((shot) => (
                  <a key={shot.url} href={shot.url} target="_blank" rel="noreferrer">
                    <img src={shot.url} alt="" loading="lazy" {...stylex.props(styles.shot)} />
                  </a>
                ))}
              </div>
            </section>
          )}
          {listing?.readme ? (
            <section {...stylex.props(styles.section)}>
              <Markdown>{listing.readme}</Markdown>
            </section>
          ) : (
            !listing?.screenshots.length &&
            description && (
              <p {...stylex.props(styles.readmeFallback)}>
                {description} Browse the{" "}
                <Link
                  to="/games/$slug/mods/$modId/source"
                  params={{ slug: game.slug, modId: listing?.id ?? maker?.slug ?? "" }}
                  {...stylex.props(styles.link)}
                >
                  source files
                </Link>{" "}
                to see how it works.
              </p>
            )
          )}
          {showReleases ? (
            <MakerReleases mod={maker} canReview={canReview} canRebuild={user?.role === "admin"} />
          ) : (
            listing && <Changelog releases={listing.releases} />
          )}
        </div>

        <aside {...stylex.props(styles.rail)}>
          {listing && <CompetitionModBox mod={listing.id} />}
          {listing && <Facts listing={listing} game={game.slug} sets={sets} />}
          {supportLinks.length > 0 && (
            <div {...stylex.props(styles.railCard)}>
              <p {...stylex.props(styles.support)}>
                Support {listing?.author}:{" "}
                {supportLinks.map((link, index) => (
                  <span key={link.url}>
                    {index > 0 && " · "}
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      {...stylex.props(styles.supportLink)}
                    >
                      {supportLinkLabel(link)}
                    </a>
                  </span>
                ))}
              </p>
            </div>
          )}
          {listing && maker && user?.role === "admin" && (
            <PublisherControls
              modId={maker.id}
              author={listing.author}
              publisher={listing.publisher}
            />
          )}
          {(listing || maker) && (
            <a
              href={reportHref(listing?.id ?? maker?.slug ?? "", name, version)}
              {...stylex.props(styles.report)}
            >
              Report this mod
            </a>
          )}
        </aside>
      </div>
    </div>
  );
}

type MakerRelease = MakerMod["releases"][number];

/**
 * The newest withdrawn release worth telling a visitor about: the mod's only
 * releases were withdrawn, or one newer than what's listed was.
 */
function newestWithdrawn(maker: MakerMod | null, listing: Listing | null): MakerRelease | null {
  const pulled = (maker?.releases ?? [])
    .filter((release) => release.withdrawn)
    .sort((a, b) => byVersionDescending(a.version, b.version));
  const newest = pulled[0];
  if (!newest) return null;
  if (!listing) return newest;
  return byVersionDescending(newest.version, listing.version) < 0 ? newest : null;
}

function WithdrawnNotice({ release, whole }: { release: MakerRelease; whole: boolean }) {
  return (
    <p {...stylex.props(styles.withdrawn)}>
      <span {...stylex.props(styles.withdrawnTitle)}>
        {whole ? "Withdrawn." : `Version ${release.version} was withdrawn.`}
      </span>{" "}
      {release.withdrawn?.reason}
    </p>
  );
}

/** A report by email, with the mod and version filled in. */
function reportHref(id: string, name: string, version: string | undefined): string {
  const subject = `Report: ${name} (${id}${version ? ` ${version}` : ""})`;
  const body = [
    `Mod: ${name}`,
    `Id: ${id}`,
    `Version: ${version ?? "unknown"}`,
    `Page: https://textures.gg/games/${PRIMARY_GAME_SLUG}/mods/${id}`,
    "",
    "What's wrong:",
    "",
  ].join("\n");
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Who publishes it, linking to their profile when it's the maker's own name. */
function Byline({ listing }: { listing: Listing }) {
  const own = listing.publisher.name === listing.author;
  return (
    <>
      by{" "}
      {own ? (
        <Link
          to="/users/$username"
          params={{ username: listing.author }}
          {...stylex.props(styles.link)}
        >
          <Publisher publisher={listing.publisher} inline />
        </Link>
      ) : (
        <Publisher publisher={listing.publisher} inline />
      )}
    </>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt {...stylex.props(styles.term)}>{term}</dt>
      <dd {...stylex.props(styles.value)}>{children}</dd>
    </>
  );
}

function Facts({
  listing,
  game,
  sets,
}: {
  listing: Listing;
  game: string;
  sets: { name: string; title: string }[];
}) {
  const inSets = sets.filter((set) => listing.sets.includes(set.name));
  return (
    <section {...stylex.props(styles.railCard)} aria-label="Mod details">
      <h2 {...stylex.props(styles.railTitle)}>Details</h2>
      <dl {...stylex.props(styles.facts)}>
        {listing.kind && <Fact term="Kind">{KIND_LINES[listing.kind]}</Fact>}
        {listing.netplay && <Fact term="Netplay">{NETPLAY_LABELS[listing.netplay]}</Fact>}
        <Fact term="Works on">
          {listing.targets.length
            ? listing.targets.map((target) => SYSTEM_NAMES[target]).join(", ")
            : "Not built for the latest tgg-melee yet"}
        </Fact>
        {listing.oneVersion && (
          <Fact term="Game version">
            Works only on the tgg-melee version it was built for. Each new version needs a new
            build.
          </Fact>
        )}
        {inSets.length > 0 && (
          <Fact term="In sets">
            <span {...stylex.props(styles.chips)}>
              {inSets.map((set) => (
                <Link
                  key={set.name}
                  to="/games/$slug/sets/$setName"
                  params={{ slug: game, setName: set.name }}
                  {...stylex.props(styles.chipLink)}
                >
                  {set.title}
                </Link>
              ))}
            </span>
          </Fact>
        )}
        {listing.tags.length > 0 && (
          <Fact term="Tags">
            <span {...stylex.props(styles.chips)}>
              {listing.tags.map((tag) => {
                const category = TAG_TO_CATEGORY[tag];
                return category ? (
                  <Link
                    key={tag}
                    to="/games/$slug/mods"
                    params={{ slug: game }}
                    search={{ category }}
                    {...stylex.props(styles.chipLink)}
                  >
                    {tag}
                  </Link>
                ) : (
                  <Badge key={tag} tone="neutral">
                    {tag}
                  </Badge>
                );
              })}
            </span>
          </Fact>
        )}
        {listing.depends.length > 0 && (
          <Fact term="Needs">
            {listing.depends.map((dependency, index) => (
              <span key={dependency.id}>
                {index > 0 && ", "}
                <Link
                  to="/games/$slug/mods/$modId"
                  params={{ slug: game, modId: dependency.id }}
                  {...stylex.props(styles.link, styles.mono)}
                >
                  {dependency.id}
                </Link>{" "}
                {dependency.range}
              </span>
            ))}
          </Fact>
        )}
        {listing.license && <Fact term="License">{listing.license}</Fact>}
        {listing.homepage && (
          <Fact term="Homepage">
            <a
              href={listing.homepage}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              {...stylex.props(styles.link)}
            >
              {listing.homepage.replace(/^https?:\/\//, "")}
            </a>
          </Fact>
        )}
        <Fact term="Source">
          <Link
            to="/games/$slug/mods/$modId/source"
            params={{ slug: game, modId: listing.id }}
            {...stylex.props(styles.link)}
          >
            Browse files
          </Link>
        </Fact>
        <Fact term="Id">
          <span {...stylex.props(styles.mono)}>{listing.id}</span>
        </Fact>
      </dl>
    </section>
  );
}

function Changelog({ releases }: { releases: Listing["releases"] }) {
  return (
    <section {...stylex.props(styles.section)}>
      <h2 {...stylex.props(styles.heading)}>Releases</h2>
      <div {...stylex.props(styles.releaseList)}>
        {releases.map((release, index) => (
          <article
            key={release.version}
            {...stylex.props(styles.release, index === 0 && styles.releaseFirst)}
          >
            <div {...stylex.props(styles.releaseHead)}>
              <span {...stylex.props(styles.releaseVersion, styles.mono)}>{release.version}</span>
              <span {...stylex.props(styles.muted)}>{formatDate(release.date)}</span>
            </div>
            {release.changelog && <Markdown>{release.changelog}</Markdown>}
          </article>
        ))}
      </div>
    </section>
  );
}
