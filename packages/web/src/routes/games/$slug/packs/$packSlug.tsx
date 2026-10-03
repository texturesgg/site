import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { displayName, MOD_FILE_ACCEPT, modFileError } from "@vgskins/shared";
import { type InferResponseType, parseResponse } from "hono/client";
import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  api,
  apiError,
  getFileUrl,
  getImageUrl,
  getThumbnailUrl,
  isUnauthorized,
  uploadFormData,
} from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import { orderModelPreviewMods } from "@/lib/model-preview";
import type { HsdEvaluationPolicy } from "@/lib/hsd-preview";
import { DownloadIcon, FlagIcon, HeartIcon, MoreIcon, TrashIcon } from "@/ui/icons";
import { Comments } from "@/ui/patterns/Comments";
import { Description } from "@/ui/patterns/Description";
import { layout } from "@/ui/patterns/layout";
import { MediaViewer } from "@/ui/patterns/MediaViewer";
import { ReportDialog } from "@/ui/patterns/ReportDialog";
import {
  Button,
  ButtonLink,
  ConfirmDialog,
  IconButton,
  MenuItem,
  MenuPanel,
  MenuRoot,
  MenuTrigger,
} from "@/ui/primitives";
import { color, font, radius, space, text, tracking } from "@/ui/tokens.stylex";

export const Route = createFileRoute("/games/$slug/packs/$packSlug")({
  loader: async ({ params }) => {
    const res = await api.games[":slug"].packs[":packSlug"].$get({
      param: { slug: params.slug, packSlug: params.packSlug },
    });
    if (res.status === 404) throw notFound();
    return { pack: await parseResponse(res) };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.pack
      ? `${loaderData.pack.title} - textures.gg`
      : "Pack - textures.gg";
    const description = loaderData?.pack?.description || "A texture pack on textures.gg";
    return { meta: [{ title }, { name: "description", content: description }] };
  },
  pendingComponent: PackSkeleton,
  component: PackPage,
});

// ─── Styles ─────────────────────────────────────────────────────

const WIDE = "@media (min-width: 1024px)";

const styles = stylex.create({
  // Phones read top to bottom: title and download first, then media, details,
  // and comments. Wide screens put the title and details in a side column.
  page: {
    display: { default: "flex", [WIDE]: "grid" },
    flexDirection: "column",
    gridTemplateColumns: "minmax(0, 1fr) 400px",
    alignItems: { default: "stretch", [WIDE]: "start" },
    gap: { default: space.lg, [WIDE]: space.xl },
  },
  column: {
    display: { default: "contents", [WIDE]: "flex" },
    flexDirection: "column",
    gap: space.xl,
    minWidth: 0,
  },
  head: { order: 1, display: "flex", flexDirection: "column", gap: space.md, minWidth: 0 },
  media: { order: 2, minWidth: 0 },
  about: { order: 3, display: "flex", flexDirection: "column", gap: space.sm, minWidth: 0 },
  details: { order: 4, display: "flex", flexDirection: "column", gap: space.lg, minWidth: 0 },
  comments: { order: 5, minWidth: 0 },
  aboutTitle: { margin: 0, fontSize: text.h3, fontWeight: 800, letterSpacing: tracking.tight },
  eyebrow: {
    margin: 0,
    fontSize: text.md,
    fontWeight: 600,
    color: color.accentText,
    textDecoration: { default: "none", ":hover": "underline" },
  },
  title: {
    margin: 0,
    fontSize: { default: text.h1, [WIDE]: text.display },
    fontWeight: 800,
    letterSpacing: tracking.tighter,
    lineHeight: 0.98,
    overflowWrap: "anywhere",
  },
  byline: { margin: 0, fontSize: text.lg, color: color.muted },
  creator: { color: color.text, textDecoration: { default: "none", ":hover": "underline" } },
  actions: { display: "flex", flexDirection: "column", gap: space.xs },
  actionRow: { display: "flex", gap: space.xs },
  grow: { flexGrow: 1, display: "flex" },
  liked: { color: color.danger },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
  stats: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.md,
    margin: 0,
    fontSize: text.md,
    color: color.muted,
  },
  statValue: { fontFamily: font.mono, color: color.text },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
    paddingTop: space.md,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
  sectionTitle: { margin: 0, fontSize: text.md, fontWeight: 700 },
  files: { margin: 0, padding: 0, listStyle: "none" },
  file: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingBlock: space.xxs,
  },
  fileGroup: { display: "flex", flexDirection: "column" },
  fileSlot: { margin: 0, fontSize: text.sm, fontWeight: 600, color: color.muted },
  fileName: {
    fontFamily: font.mono,
    fontSize: text.sm,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tags: { display: "flex", flexWrap: "wrap", gap: space.xs },
  notice: {
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  noticeDanger: { borderColor: color.danger },
  noticeTitle: { margin: 0, fontSize: text.lg, fontWeight: 700 },
  noticeBody: { margin: 0, fontSize: text.md, lineHeight: 1.5, color: color.muted },
  problems: { display: "flex", flexDirection: "column", gap: space.xs, margin: 0, padding: 0 },
  problem: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
    listStyle: "none",
    fontSize: text.sm,
  },
  problemText: { flexBasis: "16rem", flexGrow: 1, overflowWrap: "anywhere" },
  hiddenInput: { display: "none" },
  skeletonBlock: { borderRadius: radius.lg, backgroundColor: color.surface },
  skeletonMedia: { aspectRatio: "16 / 9" },
  skeletonHead: { height: "320px" },
});

const INITIAL_FILES = 12;

// ─── Page ───────────────────────────────────────────────────────

function PackPage() {
  const { pack: initialPack } = Route.useLoaderData();
  const { slug: gameSlug, packSlug } = Route.useParams();
  const { data: pack = initialPack } = useQuery({
    queryKey: ["pack", gameSlug, packSlug],
    queryFn: () =>
      parseResponse(
        api.games[":slug"].packs[":packSlug"].$get({ param: { slug: gameSlug, packSlug } })
      ),
    initialData: initialPack,
    refetchInterval: (query) => (query.state.data?.status === "processing" ? 3000 : false),
  });

  const { user, requireAuth, openAuthModal } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [downloadBump, setDownloadBump] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);

  const isModerator = user?.role === "moderator" || user?.role === "admin";
  const isOwner = Boolean(user && pack.user && user.id === pack.user.id);
  // Files are served only once a pack is approved.
  const canDownload = pack.status === "approved";

  const modelPreviews = useMemo(() => {
    if (pack.status !== "approved") return [];
    const policy: HsdEvaluationPolicy =
      pack.target?.category === "character" ? "meleeFighter" : "genericHsd";
    const ordered = orderModelPreviewMods(pack.mods);
    // Packs often ship several files for one costume; name them apart by
    // version, and by file name if versions still collide.
    const repeated = (labels: string[]) => (label: string) =>
      labels.filter((other) => other === label).length > 1;
    const costumes = ordered.map((mod) => mod.slot?.name || mod.fileName);
    const costumeRepeats = repeated(costumes);
    const versions = ordered.map((mod, i) =>
      costumeRepeats(costumes[i]) ? `${costumes[i]} · ${variantName(mod) ?? "base"}` : costumes[i]
    );
    const versionRepeats = repeated(versions);
    return ordered.map((mod, i) => {
      return {
        id: mod.id,
        label: versionRepeats(versions[i]) ? `${costumes[i]} · ${mod.fileName}` : versions[i],
        datUrl: `${API_BASE_URL}/api/packs/by-id/${encodeURIComponent(pack.id)}/mods/${encodeURIComponent(mod.id)}/download`,
        nativeEvaluationPolicy: policy,
      };
    });
  }, [pack.id, pack.mods, pack.status, pack.target]);

  // Until the queue optimizes a pack's images, only the uploaded originals exist.
  const media = useMemo(() => {
    const originals = ["pending", "processing", "failed"].includes(pack.imageProcessingStatus);
    const full = originals ? getFileUrl : getImageUrl;
    const thumb = originals ? getFileUrl : getThumbnailUrl;
    const images = [...pack.images].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const keys =
      images.length > 0
        ? images
        : pack.thumbnailKey
          ? [{ id: "cover", imageKey: pack.thumbnailKey }]
          : [];
    return keys.flatMap(({ id, imageKey }) => {
      const src = full(imageKey);
      return src ? [{ id, src, thumbSrc: thumb(imageKey) ?? src }] : [];
    });
  }, [pack.images, pack.imageProcessingStatus, pack.thumbnailKey]);

  const files = useMemo(
    () =>
      [...pack.mods].sort(
        (a, b) => a.slotSortOrder - b.slotSortOrder || a.fileName.localeCompare(b.fileName)
      ),
    [pack.mods]
  );
  // Files grouped under their costume, so a costume with several versions reads as one.
  const fileGroups = groupBy(
    showAllFiles ? files : files.slice(0, INITIAL_FILES),
    (mod) => mod.slotName
  );

  // The pack query owns the like; while a toggle is in flight it shows flipped.
  const like = useMutation({
    mutationFn: async () => {
      const res = await api.packs["by-id"][":id"].vote.$post({ param: { id: pack.id } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
    onSuccess: ({ voted, voteCount }) => {
      queryClient.setQueryData(
        ["pack", gameSlug, packSlug],
        (current: typeof pack | undefined) => current && { ...current, voted, voteCount }
      );
    },
    onError: (error) => {
      if (isUnauthorized(error)) {
        openAuthModal("signIn", "Sign in to like this pack");
      }
    },
  });
  const liked = like.isPending ? !pack.voted : pack.voted;
  const likeCount = like.isPending ? pack.voteCount + (pack.voted ? -1 : 1) : pack.voteCount;

  const deletePack = useMutation({
    mutationFn: async () => {
      const res = await api.admin.packs[":id"].delete.$post({ param: { id: pack.id } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
    onSuccess: () => navigate({ to: "/games/$slug", params: { slug: gameSlug } }),
  });

  // Downloads go through fetch so the session cookie is sent and failures can be shown.
  const download = async (path: string, fallbackName: string) => {
    const res = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
    if (!res.ok) throw new Error("The download failed. Try again.");
    const blob = await res.blob();
    const name = /filename="(.+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name || fallbackName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await download(`/api/packs/by-id/${pack.id}/download`, `${pack.slug}.zip`);
      setDownloadBump((bump) => bump + 1);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "The download failed.");
    } finally {
      setDownloading(false);
    }
  };

  const downloadFile = async (modId: string, fileName: string) => {
    setDownloadError(null);
    try {
      await download(`/api/packs/by-id/${pack.id}/mods/${modId}/download`, fileName);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "The download failed.");
    }
  };

  const fileCount = `${pack.mods.length} ${pack.mods.length === 1 ? "file" : "files"}`;
  const published = new Date(pack.publishedAt ?? pack.createdAt);

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <div {...stylex.props(styles.column)}>
        <div {...stylex.props(styles.media)}>
          <MediaViewer images={media} alt={pack.title} modelPreviews={modelPreviews} />
        </div>
        {pack.description && (
          <section aria-labelledby="about-heading" {...stylex.props(styles.about)}>
            <h2 id="about-heading" {...stylex.props(styles.aboutTitle)}>
              About
            </h2>
            <Description text={pack.description} />
          </section>
        )}
        <div {...stylex.props(styles.comments)}>
          <Comments packId={pack.id} />
        </div>
      </div>

      <div {...stylex.props(styles.column)}>
        <header {...stylex.props(styles.head)}>
          {pack.target && (
            <Link
              to="/games/$slug"
              params={{ slug: gameSlug }}
              search={{ target: pack.target.slug }}
              {...stylex.props(styles.eyebrow)}
            >
              {pack.target.name} · {pack.game?.name ?? gameSlug}
            </Link>
          )}
          <h1 {...stylex.props(styles.title)}>{pack.title}</h1>
          <p {...stylex.props(styles.byline)}>
            {pack.user && (
              <>
                by{" "}
                <Link
                  to="/users/$username"
                  params={{ username: pack.user.name || pack.user.id }}
                  {...stylex.props(styles.creator)}
                >
                  {pack.user.name && displayName(pack.user.name)}
                </Link>{" "}
                ·{" "}
              </>
            )}
            <time dateTime={published.toISOString()}>
              {published.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </time>
          </p>

          {(isOwner || isModerator) && pack.status !== "approved" && <StatusNotice pack={pack} />}

          <div {...stylex.props(styles.actions)}>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              icon={<DownloadIcon />}
              disabled={!canDownload || downloading}
              onClick={downloadAll}
            >
              {!canDownload
                ? "Download available after approval"
                : downloading
                  ? "Preparing download…"
                  : pack.mods.length === 1
                    ? "Download"
                    : `Download all ${fileCount}`}
            </Button>
            <div {...stylex.props(styles.actionRow)}>
              <span {...stylex.props(styles.grow)}>
                <Button
                  size="lg"
                  fullWidth
                  aria-pressed={liked}
                  icon={
                    <span {...stylex.props(liked && styles.liked)}>
                      <HeartIcon filled={liked} />
                    </span>
                  }
                  onClick={() => {
                    if (requireAuth("like this pack")) like.mutate();
                  }}
                  disabled={like.isPending}
                >
                  {liked ? "Liked" : "Like"} · {likeCount}
                </Button>
              </span>
              <MenuRoot>
                <MenuTrigger>
                  <IconButton
                    label="More actions"
                    variant="secondary"
                    size="lg"
                    icon={<MoreIcon />}
                  />
                </MenuTrigger>
                <MenuPanel>
                  <MenuItem onClick={() => setReportOpen(true)}>
                    <FlagIcon size={16} />
                    Report pack
                  </MenuItem>
                  {(isOwner || isModerator) && (
                    <MenuItem tone="danger" onClick={() => setDeleteOpen(true)}>
                      <TrashIcon size={16} />
                      Delete pack
                    </MenuItem>
                  )}
                </MenuPanel>
              </MenuRoot>
            </div>
            {downloadError && (
              <p role="alert" {...stylex.props(styles.error)}>
                {downloadError}
              </p>
            )}
            {like.isError && !isUnauthorized(like.error) && (
              <p role="alert" {...stylex.props(styles.error)}>
                {like.error.message}
              </p>
            )}
          </div>

          <p {...stylex.props(styles.stats)}>
            <span>
              <span {...stylex.props(styles.statValue)}>
                {(pack.downloadCount + downloadBump).toLocaleString("en-US")}
              </span>{" "}
              {pack.downloadCount + downloadBump === 1 ? "download" : "downloads"}
            </span>
            <span>
              <span {...stylex.props(styles.statValue)}>{pack.mods.length}</span>{" "}
              {pack.mods.length === 1 ? "file" : "files"}
            </span>
          </p>
        </header>

        <div {...stylex.props(styles.details)}>
          <section aria-labelledby="files-heading" {...stylex.props(styles.section)}>
            <h2 id="files-heading" {...stylex.props(styles.sectionTitle)}>
              Files
            </h2>
            {fileGroups.map(([costume, mods]) => (
              <div key={costume} {...stylex.props(styles.fileGroup)}>
                <h3 {...stylex.props(styles.fileSlot)}>{costume}</h3>
                <ul {...stylex.props(styles.files)}>
                  {mods.map((mod) => (
                    <li key={mod.id} {...stylex.props(styles.file)}>
                      <span {...stylex.props(styles.fileName)} title={mod.fileName}>
                        {mod.fileName}
                      </span>
                      <IconButton
                        label={`Download ${mod.fileName}`}
                        icon={<DownloadIcon />}
                        disabled={!canDownload}
                        onClick={() => downloadFile(mod.id, mod.fileName)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {files.length > INITIAL_FILES && (
              <Button variant="text" onClick={() => setShowAllFiles(!showAllFiles)}>
                {showAllFiles ? "Show fewer files" : `Show all ${fileCount}`}
              </Button>
            )}
          </section>

          {pack.tags.length > 0 && (
            <section aria-labelledby="tags-heading" {...stylex.props(styles.section)}>
              <h2 id="tags-heading" {...stylex.props(styles.sectionTitle)}>
                Tags
              </h2>
              <div {...stylex.props(styles.tags)}>
                {pack.tags.map((tag) => (
                  <ButtonLink
                    key={tag.id}
                    to="/games/$slug"
                    params={{ slug: gameSlug }}
                    search={{ tag: tag.slug }}
                  >
                    {tag.name}
                  </ButtonLink>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetType="pack"
        targetId={pack.id}
        targetLabel={pack.title}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this pack?"
        description={`“${pack.title}” and its ${fileCount} will be hidden from the site. A moderator can restore it.`}
        confirmLabel="Delete pack"
        pending={deletePack.isPending}
        error={deletePack.error?.message}
        onConfirm={() => deletePack.mutate()}
      />
    </div>
  );
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return [...groups];
}

/** The part of a costume file name after its code: "PlCaNr_Canti.dat" is "Canti". */
function variantName(mod: { label: string | null; fileName: string }): string | null {
  if (mod.label?.trim()) return mod.label.trim();
  const rest = /^Pl[A-Za-z]{4}(.*)\.[a-z]+$/i.exec(mod.fileName)?.[1]?.replace(/^[\s_.-]+/, "");
  return rest || null;
}

// ─── Owner and moderator status ─────────────────────────────────

type Pack = InferResponseType<(typeof api.games)[":slug"]["packs"][":packSlug"]["$get"], 200>;

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  processing: {
    title: "Checking your upload",
    body: "This page updates by itself as files finish.",
  },
  pending: {
    title: "Waiting for review",
    body: "Every file processed, and the pack is in the moderation queue.",
  },
  corrupted: {
    title: "Some files need attention",
    body: "These files couldn't be processed. Replace them to continue.",
  },
  rejected: {
    title: "Not approved",
    body: "A moderator rejected this submission. Contact support if you need the reason.",
  },
};

function StatusNotice({ pack }: { pack: Pack }) {
  const { slug: gameSlug, packSlug } = Route.useParams();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["pack", gameSlug, packSlug] });
  const [progress, setProgress] = useState(0);

  const replaceFile = useMutation({
    mutationFn: async ({ modId, file }: { modId: string; file: File }) => {
      const fileError = modFileError(file, "Replacement mod file");
      if (fileError) throw new Error(fileError);
      const formData = new FormData();
      formData.append("file", file);
      setProgress(0);
      return uploadFormData(`/api/packs/by-id/${pack.id}/mods/${modId}/retry`, formData, {
        onProgress: setProgress,
      });
    },
    onSuccess: refresh,
  });

  const retryImages = useMutation({
    mutationFn: async () => {
      const res = await api.packs["by-id"][":id"].images.retry.$post({ param: { id: pack.id } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: refresh,
  });

  const copy = STATUS_COPY[pack.status];
  const failed = pack.mods.filter((mod) => mod.processingStatus === "failed");
  const done = pack.mods.filter((mod) => mod.processingStatus === "succeeded").length;
  const danger = pack.status === "corrupted";
  const actionError = replaceFile.error?.message || retryImages.error?.message;

  return (
    <div
      role={danger ? "alert" : "status"}
      {...stylex.props(styles.notice, danger && styles.noticeDanger)}
    >
      <p {...stylex.props(styles.noticeTitle)}>{copy?.title ?? pack.status}</p>
      <p {...stylex.props(styles.noticeBody)}>
        {pack.status === "processing" &&
          `${done} of ${pack.expectedModCount || pack.mods.length} files checked. `}
        {copy?.body}
      </p>
      {(failed.length > 0 || pack.imageProcessingError) && (
        <ul {...stylex.props(styles.problems)}>
          {failed.map((mod) => (
            <li key={mod.id} {...stylex.props(styles.problem)}>
              <span {...stylex.props(styles.problemText)}>
                {mod.fileName}: {mod.processingError || "Processing failed"}
              </span>
              <ReplaceFileButton
                fileName={mod.fileName}
                disabled={replaceFile.isPending}
                label={
                  replaceFile.isPending && replaceFile.variables?.modId === mod.id
                    ? `Uploading ${progress}%`
                    : "Replace file"
                }
                onFile={(file) => replaceFile.mutate({ modId: mod.id, file })}
              />
            </li>
          ))}
          {pack.imageProcessingError && (
            <li {...stylex.props(styles.problem)}>
              <span {...stylex.props(styles.problemText)}>
                Preview images: {pack.imageProcessingError}
              </span>
              <Button disabled={retryImages.isPending} onClick={() => retryImages.mutate()}>
                {retryImages.isPending ? "Retrying…" : "Retry previews"}
              </Button>
            </li>
          )}
        </ul>
      )}
      {actionError && (
        <p role="alert" {...stylex.props(styles.error)}>
          {actionError}
        </p>
      )}
    </div>
  );
}

function ReplaceFileButton({
  fileName,
  label,
  disabled,
  onFile,
}: {
  fileName: string;
  label: string;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={MOD_FILE_ACCEPT}
        aria-label={`Replacement for ${fileName}`}
        tabIndex={-1}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) onFile(file);
        }}
        {...stylex.props(styles.hiddenInput)}
      />
      <Button disabled={disabled} onClick={() => input.current?.click()}>
        {label}
      </Button>
    </>
  );
}

function PackSkeleton() {
  return (
    <div aria-hidden="true" {...stylex.props(layout.container, layout.page, styles.page)}>
      <div {...stylex.props(styles.column)}>
        <div {...stylex.props(styles.media, styles.skeletonBlock, styles.skeletonMedia)} />
      </div>
      <div {...stylex.props(styles.column)}>
        <div {...stylex.props(styles.head, styles.skeletonBlock, styles.skeletonHead)} />
      </div>
    </div>
  );
}
