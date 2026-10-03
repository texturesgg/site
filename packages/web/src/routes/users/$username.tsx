import * as stylex from "@stylexjs/stylex";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { displayName } from "@vgskins/shared";
import { parseResponse } from "hono/client";
import type { ReactNode } from "react";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { Description } from "@/ui/patterns/Description";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { layout } from "@/ui/patterns/layout";
import { PackGrid, PackGridSkeleton, type PackTileData } from "@/ui/patterns/PackTile";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { Pagination } from "@/ui/patterns/Pagination";
import { AnchorButton, Button, ButtonLink, Select, Tabs } from "@/ui/primitives";
import { color, font, radius, space, text, tracking } from "@/ui/tokens.stylex";

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "downloads", label: "Most downloaded" },
  { value: "likes", label: "Most liked" },
] as const;
type Sort = (typeof SORTS)[number]["value"];
type Tab = "packs" | "likes";

interface ProfileSearch {
  tab?: Tab;
  sort?: Sort;
  page?: number;
}

const PAGE_SIZE = 24;
const FEATURED = 3;

export const Route = createFileRoute("/users/$username")({
  validateSearch: (search: Record<string, unknown>): ProfileSearch => ({
    tab: search.tab === "likes" ? "likes" : undefined,
    sort: SORTS.find((option) => option.value === search.sort && option.value !== "newest")?.value,
    page: typeof search.page === "number" && search.page > 1 ? search.page : undefined,
  }),
  loader: async ({ params }) => {
    const res = await api.users[":identifier"].$get({ param: { identifier: params.username } });
    if (res.status === 404) throw notFound();
    const profile = await parseResponse(res);
    // Their most-downloaded public packs lead the page.
    const featured = await parseResponse(
      api.users[":identifier"].uploads.$get({
        param: { identifier: params.username },
        query: { sort: "downloads", pageSize: String(FEATURED * 2) },
      })
    );
    return {
      profile,
      featured: featured.items.filter((pack) => pack.status === "approved").slice(0, FEATURED),
    };
  },
  head: ({ loaderData, params }) => {
    const name = displayName(loaderData?.profile?.name || params.username);
    const description = loaderData?.profile?.bio || `${name}'s packs on textures.gg`;
    return {
      meta: [{ title: `${name} - textures.gg` }, { name: "description", content: description }],
    };
  },
  pendingComponent: ProfileSkeleton,
  component: ProfilePage,
});

// ─── Styles ─────────────────────────────────────────────────────

const WIDE = "@media (min-width: 768px)";

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  avatar: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: { default: "64px", [WIDE]: "88px" },
    height: { default: "64px", [WIDE]: "88px" },
    borderRadius: radius.pill,
    objectFit: "cover",
    backgroundColor: color.raise,
    fontSize: { default: text.h3, [WIDE]: text.h2 },
    fontWeight: 800,
    color: color.muted,
  },
  about: { display: "flex", flexDirection: "column", gap: space.md, maxWidth: "720px" },
  links: { display: "flex", flexWrap: "wrap", gap: space.xs },
  stats: {
    display: "flex",
    flexWrap: "wrap",
    columnGap: space.md,
    margin: 0,
    fontSize: text.md,
    color: color.muted,
  },
  number: { fontFamily: font.mono, color: color.text },
  notice: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  noticeTitle: { margin: 0, fontSize: text.lg, fontWeight: 700 },
  noticeBody: { margin: 0, fontSize: text.md, lineHeight: 1.5, color: color.muted },
  section: { display: "flex", flexDirection: "column", gap: space.md },
  sectionTitle: {
    margin: 0,
    fontSize: { default: text.h3, [WIDE]: text.h2 },
    fontWeight: 800,
    letterSpacing: tracking.tight,
  },
  toolbar: { display: "flex", justifyContent: "flex-end", marginBottom: space.md },
  panel: { display: "flex", flexDirection: "column", gap: space.lg },
  skeleton: { borderRadius: radius.lg, backgroundColor: color.surface, height: "160px" },
});

// ─── Page ───────────────────────────────────────────────────────

function ProfilePage() {
  const { profile, featured } = Route.useLoaderData();
  const { username } = Route.useParams();
  const { tab = "packs", sort = "newest", page = 1 } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();

  const isOwner = user?.id === profile.id;
  const name = profile.isPlaceholder ? "Unknown creators" : displayName(profile.name);
  const update = (changes: ProfileSearch) =>
    navigate({ search: (prev) => ({ ...prev, page: undefined, ...changes }) });

  const uploads = useQuery({
    queryKey: ["user", username, "uploads", sort, tab === "packs" ? page : 1],
    queryFn: () =>
      parseResponse(
        api.users[":identifier"].uploads.$get({
          param: { identifier: username },
          query: { sort, page: String(tab === "packs" ? page : 1), pageSize: String(PAGE_SIZE) },
        })
      ),
    placeholderData: keepPreviousData,
  });
  const likes = useQuery({
    queryKey: ["user", username, "likes", tab === "likes" ? page : 1],
    queryFn: () =>
      parseResponse(
        api.users[":identifier"].likes.$get({
          param: { identifier: username },
          query: { page: String(tab === "likes" ? page : 1), pageSize: String(PAGE_SIZE) },
        })
      ),
    placeholderData: keepPreviousData,
  });

  const uploadTiles: PackTileData[] = (uploads.data?.items ?? []).map((pack) => ({
    title: pack.title,
    slug: pack.slug,
    gameSlug: pack.gameSlug,
    thumbnailKey: pack.thumbnailKey,
    targetName: pack.targetName,
    creatorName: null,
    voteCount: pack.voteCount,
    status: pack.status,
  }));
  const likeTiles: PackTileData[] = (likes.data?.items ?? []).map((pack) => ({
    title: pack.title,
    slug: pack.slug,
    gameSlug: pack.game?.slug ?? null,
    thumbnailKey: pack.thumbnailKey,
    targetName: pack.target?.name ?? null,
    creatorName: pack.creatorName,
    voteCount: pack.voteCount,
  }));
  const featuredTiles: PackTileData[] = featured.map((pack) => ({
    title: pack.title,
    slug: pack.slug,
    gameSlug: pack.gameSlug,
    thumbnailKey: pack.thumbnailKey,
    targetName: pack.targetName,
    creatorName: null,
    voteCount: pack.voteCount,
  }));

  const links = [
    profile.discordId && {
      label: "Discord",
      href: `https://discord.com/users/${encodeURIComponent(profile.discordId)}`,
    },
    profile.githubUsername && {
      label: "GitHub",
      href: `https://github.com/${encodeURIComponent(profile.githubUsername)}`,
    },
    profile.twitterHandle && {
      label: `@${profile.twitterHandle}`,
      href: `https://x.com/${encodeURIComponent(profile.twitterHandle)}`,
    },
    profile.websiteUrl &&
      /^https?:\/\//i.test(profile.websiteUrl) && { label: "Website", href: profile.websiteUrl },
  ].filter((link): link is { label: string; href: string } => Boolean(link));

  const since = new Date(profile.createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const { packCount, downloadCount, likeCount } = profile.stats;
  // Featured only earns its space when the grid below has more than a screenful.
  const showFeatured = featuredTiles.length === FEATURED && packCount > FEATURED * 3;

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        leading={
          profile.image && !profile.isPlaceholder ? (
            <img src={profile.image} alt="" {...stylex.props(styles.avatar)} />
          ) : (
            <span aria-hidden="true" {...stylex.props(styles.avatar)}>
              {profile.isPlaceholder ? "?" : name[0]?.toUpperCase()}
            </span>
          )
        }
        title={name}
        description={[!profile.isPlaceholder && profile.pronouns, `Member since ${since}`]
          .filter(Boolean)
          .join(" · ")}
        actions={
          isOwner && (
            <ButtonLink to="/settings" variant="secondary">
              Edit profile
            </ButtonLink>
          )
        }
      >
        <div {...stylex.props(styles.about)}>
          {profile.bio && !profile.isPlaceholder && <Description text={profile.bio} />}
          {links.length > 0 && (
            <div {...stylex.props(styles.links)}>
              {links.map((link) => (
                <AnchorButton
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer me"
                >
                  {link.label}
                </AnchorButton>
              ))}
            </div>
          )}
          <p {...stylex.props(styles.stats)}>
            <Stat value={packCount} one="pack" many="packs" />
            <Stat value={downloadCount} one="download" many="downloads" />
            <Stat value={likeCount} one="like" many="likes" />
          </p>
        </div>
      </PageHeader>

      {profile.isPlaceholder && (
        <div role="note" {...stylex.props(styles.notice)}>
          <p {...stylex.props(styles.noticeTitle)}>Imported without a known creator</p>
          <p {...stylex.props(styles.noticeBody)}>
            These packs came from ssbmtextures, where they were uploaded without an account. If one
            is yours, contact us to have it credited.
          </p>
        </div>
      )}
      {profile.claimable && (
        <div role="note" {...stylex.props(styles.notice)}>
          <p {...stylex.props(styles.noticeTitle)}>Imported from ssbmtextures</p>
          <p {...stylex.props(styles.noticeBody)}>
            Is this your work? Sign up with the email you used on ssbmtextures and these packs move
            to your account.
          </p>
        </div>
      )}

      {showFeatured && (
        <section aria-labelledby="featured-heading" {...stylex.props(styles.section)}>
          <h2 id="featured-heading" {...stylex.props(styles.sectionTitle)}>
            Most downloaded
          </h2>
          <PackGrid packs={featuredTiles} label={`${name}'s most downloaded packs`} />
        </section>
      )}

      <Tabs<Tab>
        label={`${name}'s packs and likes`}
        value={tab}
        onValueChange={(next) => update({ tab: next === "packs" ? undefined : next })}
        items={[
          {
            value: "packs",
            label: "Packs",
            count: uploads.data?.total,
            panel: (
              <div {...stylex.props(styles.panel)}>
                <div {...stylex.props(styles.toolbar)}>
                  <Select
                    label="Sort"
                    value={sort}
                    options={SORTS}
                    onValueChange={(value) =>
                      update({ sort: value === "newest" ? undefined : value })
                    }
                  />
                </div>
                <PackList
                  query={uploads}
                  tiles={uploadTiles}
                  label={`${name}'s packs`}
                  empty={isOwner ? "You haven't uploaded anything yet." : "No packs yet."}
                  action={
                    isOwner ? (
                      <ButtonLink to="/upload" variant="primary">
                        Upload a pack
                      </ButtonLink>
                    ) : undefined
                  }
                  page={tab === "packs" ? page : 1}
                  onPage={(next) => update({ page: next > 1 ? next : undefined })}
                />
              </div>
            ),
          },
          {
            value: "likes",
            label: "Liked",
            count: likes.data?.total,
            panel: (
              <PackList
                query={likes}
                tiles={likeTiles}
                label={`Packs ${name} liked`}
                empty="No liked packs yet."
                page={tab === "likes" ? page : 1}
                onPage={(next) => update({ page: next > 1 ? next : undefined })}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

function Stat({ value, one, many }: { value: number; one: string; many: string }) {
  return (
    <span>
      <span {...stylex.props(styles.number)}>{value.toLocaleString("en-US")}</span>{" "}
      {value === 1 ? one : many}
    </span>
  );
}

function PackList({
  query,
  tiles,
  label,
  empty,
  action,
  page,
  onPage,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    refetch: () => unknown;
    data?: { totalPages: number };
  };
  tiles: PackTileData[];
  label: string;
  empty: string;
  action?: ReactNode;
  page: number;
  onPage: (page: number) => void;
}) {
  if (query.isPending) return <PackGridSkeleton count={6} />;
  if (query.isError) {
    return (
      <EmptyState
        title="Packs couldn't be loaded"
        body="This may be a temporary problem."
        action={<Button onClick={() => query.refetch()}>Try again</Button>}
      />
    );
  }
  if (tiles.length === 0) return <EmptyState title={empty} action={action} />;
  return (
    <div {...stylex.props(styles.panel)}>
      <PackGrid packs={tiles} label={label} />
      <Pagination
        page={page}
        totalPages={query.data?.totalPages ?? 1}
        onPageChange={(next) => {
          onPage(next);
          window.scrollTo({ top: 0 });
        }}
      />
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-hidden="true" {...stylex.props(layout.container, layout.page, styles.page)}>
      <div {...stylex.props(styles.skeleton)} />
      <PackGridSkeleton count={6} />
    </div>
  );
}
