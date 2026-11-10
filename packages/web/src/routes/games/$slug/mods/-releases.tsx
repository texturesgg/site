import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import type { InferResponseType } from "hono/client";
import { useState } from "react";
import { api, apiError } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import { NETPLAY_LABELS } from "@/lib/format";
import { byVersionDescending } from "@vgskins/shared";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { RejectReleaseDialog } from "@/ui/patterns/RejectReleaseDialog";
import { AnchorButton, Badge, Button } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

// A mod's releases as its maker and moderators see them: every status, each
// build with its log, and review for moderators.

export type MakerMod = InferResponseType<(typeof api)["code-mods"][":slug"]["$get"], 200>;
export type Release = MakerMod["releases"][number];
export type Build = Release["builds"][number];

const RELEASE_STATUS: Record<string, string> = {
  processing: "Checking",
  pending: "In review",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
};

const SYSTEM_NAMES: Record<string, string> = { linux: "Linux", windows: "Windows", macos: "macOS" };

/** Which game a build is for: the system and tgg-melee version, or every one. */
function buildLabel(build: Build): string {
  if (!build.layout) return build.layoutId ?? "Every system";
  const system = SYSTEM_NAMES[build.layout.system] ?? build.layout.target;
  return `${system} · ${build.layout.portVersion}${build.layout.active ? "" : " (retired)"}`;
}

/** Newest port first, then Linux, Windows, macOS. */
function byGame(a: Build, b: Build): number {
  const order = Object.keys(SYSTEM_NAMES);
  return (
    byVersionDescending(a.layout?.portVersion ?? "0.0.0", b.layout?.portVersion ?? "0.0.0") ||
    order.indexOf(a.layout?.system ?? "") - order.indexOf(b.layout?.system ?? "")
  );
}

/**
 * The newest approved release's failed builds for games players have now:
 * the registry rebuilds a mod for each new tgg-melee without its maker, so a
 * failure there is theirs to see first.
 */
function brokenBuilds(mod: MakerMod): { release: Release; builds: Build[] } | null {
  const release = mod.releases.find((candidate) => candidate.status === "approved");
  if (!release) return null;
  const builds = release.builds.filter(
    (build) => build.status === "failed" && build.layout?.active
  );
  return builds.length ? { release, builds: builds.sort(byGame) } : null;
}

const BUILD_STATUS: Record<string, string> = {
  queued: "Queued",
  building: "Building",
  succeeded: "Built",
  failed: "Failed",
};

const styles = stylex.create({
  warning: { borderWidth: 1, borderStyle: "solid", borderColor: color.accent },
  warningTitle: { margin: 0, fontSize: text.md, fontWeight: 700 },
  buildName: { fontWeight: 600 },
  creator: { color: color.text, textDecoration: { default: "none", ":hover": "underline" } },
  section: { display: "flex", flexDirection: "column", gap: space.md },
  heading: { margin: 0, fontSize: text.h3, fontWeight: 800 },
  id: { fontFamily: font.mono },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  spread: { justifyContent: "space-between" },
  version: { fontSize: text.lg, fontWeight: 700 },
  muted: { margin: 0, fontSize: text.sm, color: color.muted },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
  build: {
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
  code: {
    margin: 0,
    padding: space.sm,
    overflowX: "auto",
    borderRadius: radius.sm,
    backgroundColor: color.bg,
    fontFamily: font.mono,
    fontSize: text.xs,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
});

/** Every release of `mod`, newest first, with how to publish for its maker. */
export function MakerReleases({
  mod,
  canReview,
  canRebuild,
}: {
  mod: MakerMod;
  canReview: boolean;
  canRebuild: boolean;
}) {
  const broken = brokenBuilds(mod);
  return (
    <section {...stylex.props(styles.section)}>
      <h2 {...stylex.props(styles.heading)}>Releases</h2>
      {broken && (
        <div {...stylex.props(styles.card, styles.warning)}>
          <p {...stylex.props(styles.warningTitle)}>
            {broken.release.version} didn't build for {broken.builds.map(buildLabel).join(", ")}
          </p>
          <p {...stylex.props(styles.muted)}>
            Players there can't install it until a version builds. The log is below.
          </p>
        </div>
      )}
      {mod.mine && <Publish />}
      {mod.releases.length === 0 ? (
        <EmptyState title="No releases yet" />
      ) : (
        mod.releases.map((release) => (
          <ReleaseCard
            key={release.id}
            release={release}
            game={mod.game}
            modSlug={mod.slug}
            canReview={canReview}
            canRebuild={canRebuild}
          />
        ))
      )}
    </section>
  );
}

/** How the owner publishes a version, with the tgg command line. */
function Publish() {
  return (
    <div {...stylex.props(styles.card)}>
      <p {...stylex.props(styles.muted)}>
        To publish a version, bump it in manifest.json, commit, then in your mod&apos;s folder:
      </p>
      <pre {...stylex.props(styles.code)}>{"tgg mod publish"}</pre>
    </div>
  );
}

function ReleaseCard({
  release,
  game,
  modSlug,
  canReview,
  canRebuild,
}: {
  release: Release;
  game: string;
  modSlug: string;
  canReview: boolean;
  canRebuild: boolean;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const review = useMutation({
    mutationFn: async (decision: { approve: true } | { approve: false; reason: string }) => {
      const param = { id: release.id };
      const res = decision.approve
        ? await api.admin["code-mods"].releases[":id"].approve.$post({ param })
        : await api.admin["code-mods"].releases[":id"].reject.$post({
            param,
            json: { reason: decision.reason || undefined },
          });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: async () => {
      setRejecting(false);
      await router.invalidate();
    },
  });
  // A failed release is checked again; an approved one builds what failed.
  const rebuild = useMutation({
    mutationFn: async () => {
      const res = await api.admin["code-mods"].releases[":id"].rebuild.$post({
        param: { id: release.id },
      });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => router.invalidate(),
  });
  const rebuildable =
    release.status === "failed" ||
    (release.status === "approved" && release.builds.some((build) => build.status === "failed"));

  return (
    <article {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.row, styles.spread)}>
        <div {...stylex.props(styles.row)}>
          <span {...stylex.props(styles.version)}>{release.version}</span>
          <Badge tone={release.status === "approved" ? "neutral" : "accent"}>
            {RELEASE_STATUS[release.status] ?? release.status}
          </Badge>
          {release.netplay && <Badge>{NETPLAY_LABELS[release.netplay]}</Badge>}
          {release.license && <Badge>{release.license}</Badge>}
        </div>
        {canRebuild && rebuildable && (
          <Button onClick={() => rebuild.mutate()} disabled={rebuild.isPending}>
            {rebuild.isPending ? "Rebuilding…" : "Rebuild"}
          </Button>
        )}
        {canReview && release.status === "pending" && (
          <div {...stylex.props(styles.row)}>
            <Button
              variant="primary"
              onClick={() => review.mutate({ approve: true })}
              disabled={review.isPending}
            >
              Approve
            </Button>
            <Button onClick={() => setRejecting(true)} disabled={review.isPending}>
              Reject
            </Button>
          </div>
        )}
      </div>
      <p {...stylex.props(styles.muted)}>
        {release.status !== "failed" && (
          <>
            <Link
              to="/games/$slug/mods/$modId/review/$releaseId"
              params={{ slug: game, modId: modSlug, releaseId: release.id }}
              {...stylex.props(styles.creator)}
            >
              {canReview && release.status === "pending" ? "Review changes" : "Changes"}
            </Link>
            {" · "}
            <Link
              to="/games/$slug/mods/$modId/source"
              params={{ slug: game, modId: modSlug }}
              search={{ release: release.id }}
              {...stylex.props(styles.creator)}
            >
              Source
            </Link>
            {" · "}
          </>
        )}
        {release.tag} at <span {...stylex.props(styles.id)}>{release.commit.slice(0, 12)}</span>
      </p>
      {release.depends.length > 0 && (
        <p {...stylex.props(styles.muted)}>
          Needs{" "}
          {release.depends.map((dependency, i) => (
            <span key={dependency.id}>
              {i > 0 && ", "}
              <Link
                to="/games/$slug/mods/$modId"
                params={{ slug: game, modId: dependency.id }}
                {...stylex.props(styles.id, styles.creator)}
              >
                {dependency.id}
              </Link>{" "}
              {dependency.range}
            </span>
          ))}
        </p>
      )}
      {release.error && <p {...stylex.props(styles.error)}>{release.error}</p>}
      {release.status === "rejected" && release.rejectionReason && (
        <p {...stylex.props(styles.error)}>Rejected: {release.rejectionReason}</p>
      )}
      {review.error && !rejecting && <p {...stylex.props(styles.error)}>{review.error.message}</p>}
      {rebuild.error && <p {...stylex.props(styles.error)}>{rebuild.error.message}</p>}
      {[...release.builds].sort(byGame).map((build: Build) => (
        <BuildRow key={build.id} build={build} />
      ))}
      <RejectReleaseDialog
        open={rejecting}
        onOpenChange={setRejecting}
        version={release.version}
        pending={review.isPending}
        error={review.error?.message}
        onReject={(reason) => review.mutate({ approve: false, reason })}
      />
    </article>
  );
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The game files a build ships, the first few by name. */
function fileSummary(files: Build["files"]): string {
  const shown = files.slice(0, 6).map((file) => file.path);
  const more = files.length - shown.length;
  return `Files: ${shown.join(", ")}${more > 0 ? `, and ${more} more` : ""}`;
}

function hookSummary(hooks: Build["hooks"]): string | null {
  if (!hooks) return null;
  const parts = [
    hooks.replaces?.length ? `replaces ${hooks.replaces.join(", ")}` : null,
    hooks.before?.length ? `runs before ${hooks.before.join(", ")}` : null,
    hooks.after?.length ? `runs after ${hooks.after.join(", ")}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}

export function BuildRow({ build }: { build: Build }) {
  const [showLog, setShowLog] = useState(false);
  const log = useQuery({
    queryKey: ["code-mod-build", build.id, "log"],
    enabled: showLog,
    queryFn: async () => {
      const res = await api["code-mods"].builds[":id"].log.$get({ param: { id: build.id } });
      if (!res.ok) throw await apiError(res);
      return res.text();
    },
  });
  const hooks = hookSummary(build.hooks);

  return (
    <div {...stylex.props(styles.build)}>
      <div {...stylex.props(styles.row, styles.spread)}>
        <div {...stylex.props(styles.row)}>
          <span {...stylex.props(styles.buildName)}>{buildLabel(build)}</span>
          <Badge tone={build.status === "succeeded" ? "neutral" : "accent"}>
            {BUILD_STATUS[build.status] ?? build.status}
          </Badge>
          {build.size !== null && (
            <span {...stylex.props(styles.muted)}>{formatSize(build.size)}</span>
          )}
          {build.state !== null && <span {...stylex.props(styles.muted)}>Keeps state</span>}
        </div>
        <div {...stylex.props(styles.row)}>
          {build.hasLog && (
            <Button variant="text" onClick={() => setShowLog((shown) => !shown)}>
              {showLog ? "Hide log" : "Log"}
            </Button>
          )}
          {build.sha256 && (
            <AnchorButton href={`${API_BASE_URL}/api/code-mods/packages/${build.sha256}.zip`}>
              Download
            </AnchorButton>
          )}
        </div>
      </div>
      {hooks && <p {...stylex.props(styles.muted)}>{hooks}</p>}
      {build.files.length > 0 && <p {...stylex.props(styles.muted)}>{fileSummary(build.files)}</p>}
      {build.error && <p {...stylex.props(styles.error)}>{build.error}</p>}
      {showLog && (
        <pre {...stylex.props(styles.code)}>
          {log.isPending
            ? "Loading…"
            : log.error
              ? log.error.message
              : log.data || "The log is empty."}
        </pre>
      )}
    </div>
  );
}
