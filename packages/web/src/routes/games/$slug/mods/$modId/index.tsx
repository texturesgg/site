import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PRIMARY_GAME_SLUG } from "@vgskins/shared";
import { type InferResponseType, parseResponse } from "hono/client";
import type { ReactNode } from "react";
import { useAuth } from "@/contexts/auth-context";
import { appLinks } from "@/lib/app-links";
import { api } from "@/lib/api";
import { supportLinkLabel } from "@/lib/support-links";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { NETPLAY_LABELS } from "@/lib/format";
import { InstallActions } from "@/ui/patterns/InstallActions";
import { layout } from "@/ui/patterns/layout";
import { Markdown } from "@/ui/patterns/Markdown";
import { ModEyebrow, ModHeader } from "@/ui/patterns/ModHeader";
import { Publisher } from "@/ui/patterns/ModTile";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";
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

const SYSTEM_NAMES = { linux: "Linux", windows: "Windows", macos: "macOS" } as const;

const styles = stylex.create({
  // The pack page's frame: on wide screens the work on the left and the
  // header in a side column; on phones the header first.
  page: {
    display: { default: "flex", [WIDE]: "grid" },
    flexDirection: "column",
    gridTemplateColumns: "minmax(0, 1fr) 400px",
    alignItems: { default: "stretch", [WIDE]: "start" },
    gap: { default: space.xl, [WIDE]: space.xxl },
  },
  side: {
    order: { default: 1, [WIDE]: 2 },
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
    minWidth: 0,
  },
  main: {
    order: { default: 2, [WIDE]: 1 },
    display: "flex",
    flexDirection: "column",
    gap: space.xxl,
    minWidth: 0,
  },
  icon: { width: "80px", height: "80px", borderRadius: radius.lg, objectFit: "cover" },
  description: { margin: 0, fontSize: text.lg, lineHeight: 1.5, color: color.muted },
  support: { margin: 0, fontSize: text.sm, color: color.muted },
  supportLink: { color: color.accentText, textDecoration: "underline", textUnderlineOffset: "2px" },
  link: { color: color.text, textDecoration: { default: "none", ":hover": "underline" } },
  // After the header, which is order 1 (ModHeader).
  facts: {
    order: 2,
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    columnGap: space.lg,
    rowGap: space.sm,
    margin: 0,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.line,
    fontSize: text.sm,
  },
  term: { color: color.muted },
  value: { margin: 0, overflowWrap: "anywhere" },
  mono: { fontFamily: font.mono },
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
  release: { display: "flex", flexDirection: "column", gap: space.xs },
  releaseHead: { display: "flex", alignItems: "baseline", gap: space.sm },
  releaseVersion: { fontSize: text.lg, fontWeight: 700 },
  muted: { margin: 0, fontSize: text.sm, color: color.muted },
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

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <div {...stylex.props(styles.side)}>
        <ModHeader
          eyebrow={
            <ModEyebrow to="/games/$slug/mods" params={{ slug: game.slug }}>
              Mod · {game.name}
            </ModEyebrow>
          }
          title={name}
          byline={listing ? <Byline listing={listing} /> : maker?.owner && <>by {maker.owner}</>}
        >
          {listing?.icon && <img src={listing.icon.url} alt="" {...stylex.props(styles.icon)} />}
          {description && <p {...stylex.props(styles.description)}>{description}</p>}
          {listing && <InstallActions href={appLinks.mod(listing.id)} label={`Install ${name}`} />}
          {supportLinks.length > 0 && (
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
          )}
        </ModHeader>
        {listing && <Facts listing={listing} game={game.slug} sets={sets} />}
        {listing && maker && user?.role === "admin" && (
          <PublisherControls
            modId={maker.id}
            author={listing.author}
            publisher={listing.publisher}
          />
        )}
      </div>

      <div {...stylex.props(styles.main)}>
        {listing && listing.screenshots.length > 0 && (
          <div {...stylex.props(styles.shots)}>
            {listing.screenshots.map((shot) => (
              <a key={shot.url} href={shot.url} target="_blank" rel="noreferrer">
                <img src={shot.url} alt="" loading="lazy" {...stylex.props(styles.shot)} />
              </a>
            ))}
          </div>
        )}
        {listing?.readme && <Markdown>{listing.readme}</Markdown>}
        {showReleases ? (
          <MakerReleases mod={maker} canReview={canReview} canRebuild={user?.role === "admin"} />
        ) : (
          listing && <Changelog releases={listing.releases} />
        )}
      </div>
    </div>
  );
}

/** Who publishes it, linking to their profile when it's the maker's own name, and when it last changed. */
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
    <dl {...stylex.props(styles.facts)}>
      <Fact term="Version">
        <span {...stylex.props(styles.mono)}>{listing.version}</span> ·{" "}
        {formatDate(listing.updatedAt)}
      </Fact>
      <Fact term="Works on">
        {listing.targets.length
          ? listing.targets.map((target) => SYSTEM_NAMES[target]).join(", ")
          : "Not built for the current game yet"}
      </Fact>
      {listing.netplay && <Fact term="Netplay">{NETPLAY_LABELS[listing.netplay]}</Fact>}
      <Fact term="Installs">
        <span {...stylex.props(styles.mono)}>{listing.installs.toLocaleString("en-US")}</span>
      </Fact>
      {inSets.length > 0 && (
        <Fact term="In sets">
          {inSets.map((set, index) => (
            <span key={set.name}>
              {index > 0 && ", "}
              <Link
                to="/games/$slug/sets/$setName"
                params={{ slug: game, setName: set.name }}
                {...stylex.props(styles.link)}
              >
                {set.title}
              </Link>
            </span>
          ))}
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
          Browse
        </Link>
      </Fact>
      <Fact term="Id">
        <span {...stylex.props(styles.mono)}>{listing.id}</span>
      </Fact>
    </dl>
  );
}

function Changelog({ releases }: { releases: Listing["releases"] }) {
  return (
    <section {...stylex.props(styles.section)}>
      <h2 {...stylex.props(styles.heading)}>Changelog</h2>
      {releases.map((release) => (
        <article key={release.version} {...stylex.props(styles.release)}>
          <div {...stylex.props(styles.releaseHead)}>
            <span {...stylex.props(styles.releaseVersion, styles.mono)}>{release.version}</span>
            <span {...stylex.props(styles.muted)}>{formatDate(release.date)}</span>
          </div>
          {release.changelog && <Markdown>{release.changelog}</Markdown>}
        </article>
      ))}
    </section>
  );
}
