import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LIMITS, MOD_FILE_ACCEPT } from "@vgskins/shared";
import { parseResponse } from "hono/client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { TurnstileField, VERIFICATION_REQUIRED } from "@/components/ui/turnstile";
import { api, uploadFormData } from "@/lib/api";
import {
  blockingProblems,
  detectTarget,
  draftMods,
  IMAGE_ACCEPT,
  type ModDraft,
  modIssues,
  modLabel,
  reassignSlots,
  sortDroppedFiles,
  suggestTitle,
  type UploadTarget,
} from "@/lib/upload-plan";
import { fileSize } from "@/lib/upload-validators";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, FileIcon } from "@/ui/icons";
import type { HsdEvaluationPolicy } from "@/lib/hsd-preview";
import { FileDropZone } from "@/ui/patterns/FileDropZone";
import { MediaViewer } from "@/ui/patterns/MediaViewer";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { shared } from "@/ui/primitives/shared";
import { TagInput } from "@/ui/patterns/TagInput";
import {
  Badge,
  Button,
  IconButton,
  Progress,
  Select,
  type SelectOption,
  TextArea,
  TextField,
} from "@/ui/primitives";
import { color, font, radius, space, text, tracking } from "@/ui/tokens.stylex";

export const Route = createFileRoute("/_auth/upload")({
  loader: async () => ({ games: await parseResponse(api.games.$get()) }),
  head: () => ({ meta: [{ title: "Upload a pack - textures.gg" }] }),
  component: UploadPage,
});

// Title, description, and tags survive a reload on this device; files cannot.
const DRAFT_KEY = "textures.gg:upload-draft:v3";
const Draft = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()).max(LIMITS.TAG_COUNT_MAX),
});
const UploadResult = z.object({ slug: z.string(), gameSlug: z.string() });

const CATEGORY_GROUPS: Record<string, string> = {
  character: "Characters",
  stage: "Stages",
  ui: "Interface",
  audio: "Audio",
};

let keyCounter = 0;
const nextKey = () => `mod-${++keyCounter}`;

// ─── Styles ─────────────────────────────────────────────────────

const WIDE = "@media (min-width: 1024px)";

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  layout: {
    display: { default: "flex", [WIDE]: "grid" },
    flexDirection: "column",
    gridTemplateColumns: "minmax(0, 7fr) minmax(0, 5fr)",
    alignItems: { default: "stretch", [WIDE]: "start" },
    gap: space.xl,
  },
  main: { display: "flex", flexDirection: "column", gap: space.xl, minWidth: 0 },
  section: { display: "flex", flexDirection: "column", gap: space.md },
  sectionTitle: { margin: 0, fontSize: text.h3, fontWeight: 800, letterSpacing: tracking.tight },
  sectionHint: { margin: 0, fontSize: text.md, color: color.muted },
  notices: { display: "flex", flexDirection: "column", gap: space.xxs, margin: 0, padding: 0 },
  notice: { listStyle: "none", fontSize: text.sm, color: color.danger },
  targetRow: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  detected: { fontSize: text.sm, color: color.muted },
  files: { display: "flex", flexDirection: "column", margin: 0, padding: 0 },
  file: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr) auto", [WIDE]: "minmax(0, 1fr) auto auto" },
    alignItems: "center",
    columnGap: space.sm,
    rowGap: space.xs,
    paddingBlock: space.sm,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
    listStyle: "none",
  },
  fileInfo: { display: "flex", alignItems: "center", gap: space.sm, minWidth: 0 },
  fileIcon: { flexShrink: 0, color: color.muted },
  fileText: { display: "flex", flexDirection: "column", minWidth: 0 },
  fileName: {
    fontFamily: font.mono,
    fontSize: text.sm,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  fileSize: { fontSize: text.xs, color: color.muted },
  fileSlot: {
    gridColumn: { default: "1 / -1", [WIDE]: "auto" },
    gridRow: { default: 2, [WIDE]: "auto" },
  },
  issue: { gridColumn: "1 / -1", margin: 0, fontSize: text.sm },
  issueError: { color: color.danger },
  issueWarning: { color: color.muted },
  shots: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: space.sm,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  shot: { display: "flex", flexDirection: "column", gap: space.xs },
  shotFrame: {
    position: "relative",
    aspectRatio: "16 / 10",
    overflow: "hidden",
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  shotImage: { display: "block", width: "100%", height: "100%", objectFit: "cover" },
  shotBadge: { position: "absolute", top: space.xs, left: space.xs },
  shotActions: { display: "flex", justifyContent: "space-between" },
  addShots: { alignSelf: "flex-start" },
  hiddenInput: { display: "none" },
  // Taller than most screens once the 3D preview shows, so it sticks by its bottom edge:
  // at the top of the page it sits in place, and Submit stays in view while scrolling.
  aside: {
    position: { default: "static", [WIDE]: "sticky" },
    bottom: space.lg,
    alignSelf: { default: "stretch", [WIDE]: "end" },
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  previewEmpty: {
    aspectRatio: "16 / 10",
    overflow: "hidden",
    borderRadius: radius.md,
    backgroundColor: color.raise,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: text.sm,
    color: color.muted,
  },
  previewHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  previewNote: { margin: 0, fontSize: text.xs, color: color.muted },
  summaryTitle: { margin: 0, fontSize: text.xl, fontWeight: 700, overflowWrap: "anywhere" },
  summaryMeta: { margin: 0, fontSize: text.md, color: color.muted },
  checklist: { display: "flex", flexDirection: "column", gap: space.xs, margin: 0, padding: 0 },
  check: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    listStyle: "none",
    fontSize: text.md,
    color: color.muted,
  },
  checkDone: { color: color.text },
  checkMark: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: "20px",
    height: "20px",
    borderRadius: radius.pill,
    borderWidth: "1.5px",
    borderStyle: "solid",
    borderColor: color.lineStrong,
  },
  checkMarkDone: { borderColor: color.success, backgroundColor: color.success, color: color.bg },
  alert: { margin: 0, fontSize: text.sm, color: color.danger },
  note: { margin: 0, fontSize: text.sm, lineHeight: 1.5, color: color.muted },
});

// ─── Page ───────────────────────────────────────────────────────

function UploadPage() {
  const { games } = Route.useLoaderData();
  const navigate = useNavigate();
  // Every current target belongs to the largest game; a picker appears with a second game.
  const [gameId, setGameId] = useState(
    () => [...games].sort((a, b) => b.packCount - a.packCount)[0]?.id ?? ""
  );
  const game = games.find((candidate) => candidate.id === gameId);
  const { data: targets = [] } = useQuery({
    queryKey: ["targets", game?.slug],
    queryFn: () =>
      parseResponse(
        api.games[":slug"].targets.$get({ param: { slug: game?.slug ?? "" }, query: {} })
      ),
    enabled: Boolean(game),
  });

  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetChosen, setTargetChosen] = useState(false);
  const [mods, setMods] = useState<ModDraft[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const target = targets.find((candidate) => candidate.id === targetId);
  const objectUrl = useObjectUrls([...mods.map((mod) => mod.file), ...images]);
  const previewImages = images.map((image, index) => ({
    id: `${image.name}-${image.lastModified}-${index}`,
    src: objectUrl(image),
  }));
  // The uploader's own files render before anything is sent; the viewer only fetches its URL.
  const policy: HsdEvaluationPolicy =
    target?.category === "character" ? "meleeFighter" : "genericHsd";
  const previewModels = target
    ? mods.map((mod) => ({
        id: mod.key,
        label: target.slots.find((slot) => slot.id === mod.slotId)?.name ?? mod.file.name,
        datUrl: objectUrl(mod.file),
        nativeEvaluationPolicy: policy,
      }))
    : [];
  const issues = modIssues(mods, target, targets);
  const problems = blockingProblems({ mods, images, target, title, issues });

  // Restore the text fields once, then keep them saved.
  const restored = useRef(false);
  useEffect(() => {
    try {
      const draft = Draft.safeParse(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null"));
      if (draft.success) {
        setTitle(draft.data.title);
        setTitleEdited(Boolean(draft.data.title));
        setDescription(draft.data.description);
        setTags(draft.data.tags);
      }
    } catch {
      // Storage can be unavailable (private windows); the form works without it.
    }
    restored.current = true;
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, description, tags }));
    } catch {
      // As above: saving the draft is a convenience.
    }
  }, [title, description, tags]);

  const applyTarget = (next: UploadTarget | undefined, nextMods: ModDraft[]) => {
    const assigned = next && next.id !== target?.id ? reassignSlots(nextMods, next) : nextMods;
    setTargetId(next?.id ?? null);
    setMods(assigned);
    // A suggestion fills an untouched title but never clears it.
    const suggestion = suggestTitle(assigned, next);
    if (!titleEdited && suggestion) setTitle(suggestion);
  };

  const addFiles = (files: File[]) => {
    const sorted = sortDroppedFiles(files);
    const messages = [...sorted.rejected];

    const room = LIMITS.PACK_MODS_MAX - mods.length;
    if (sorted.mods.length > room) {
      messages.push(
        `A pack holds up to ${LIMITS.PACK_MODS_MAX} files; ${sorted.mods.length - room} were left out`
      );
    }
    const imageRoom = LIMITS.PACK_IMAGES_MAX - images.length;
    if (sorted.images.length > imageRoom) {
      messages.push(
        `Up to ${LIMITS.PACK_IMAGES_MAX} screenshots; ${sorted.images.length - imageRoom} were left out`
      );
    }
    setImages((current) => [...current, ...sorted.images.slice(0, Math.max(imageRoom, 0))]);

    const added = sorted.mods.slice(0, Math.max(room, 0));
    if (added.length > 0) {
      const all = [...mods, ...draftMods(added, target, mods, nextKey)];
      let next: UploadTarget | undefined = target;
      if (!targetChosen) {
        const detected = detectTarget(
          all.map((mod) => mod.file),
          targets
        );
        if (detected.mixed) {
          messages.push(
            "These files are for more than one character. A pack covers one character or stage, so remove the others."
          );
        } else if (detected.target) {
          next = detected.target;
        }
      }
      applyTarget(next, all);
    }
    setNotices(messages);
  };

  const chooseTarget = (id: string) => {
    setTargetChosen(true);
    applyTarget(
      targets.find((candidate) => candidate.id === id),
      mods
    );
  };

  const removeMod = (key: string) => {
    const rest = mods.filter((mod) => mod.key !== key);
    // Until the uploader picks a target, removing a stray file can settle the match.
    const next = targetChosen
      ? target
      : detectTarget(
          rest.map((mod) => mod.file),
          targets
        ).target;
    applyTarget(next, rest);
    setNotices([]);
  };

  const upload = useMutation({
    mutationFn: async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setProgress(0);
      const form = new FormData();
      form.append("title", title.trim());
      form.append("gameId", gameId);
      form.append("targetId", target?.id ?? "");
      if (description.trim()) form.append("description", description.trim());
      if (tags.length > 0) form.append("tags", tags.join(","));
      if (turnstileToken) form.append("turnstileToken", turnstileToken);
      for (const mod of mods) {
        form.append("modLabels[]", modLabel(mod, target));
        form.append("modSlotIds[]", mod.slotId);
        form.append("modFiles[]", mod.file);
      }
      for (const image of images) form.append("images", image);
      const result = await uploadFormData<unknown>("/api/packs", form, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      return UploadResult.parse(result);
    },
    onSuccess: (pack) => {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Nothing to clean up without storage.
      }
      navigate({
        to: "/games/$slug/packs/$packSlug",
        params: { slug: pack.gameSlug, packSlug: pack.slug },
      });
    },
    onSettled: () => {
      abortRef.current = null;
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (problems.length > 0) {
      summaryRef.current?.focus();
      return;
    }
    upload.mutate();
  };

  const busy = upload.isPending;
  const canceled = upload.error instanceof DOMException && upload.error.name === "AbortError";
  const targetOptions: SelectOption<string>[] = targets.map((candidate) => ({
    value: candidate.id,
    label: candidate.name,
    group: CATEGORY_GROUPS[candidate.category] ?? "Other",
  }));
  const gameOptions = games.map((candidate) => ({ value: candidate.id, label: candidate.name }));
  const costumes = target && target.slots.length > 1;

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="Upload a pack"
        description="Add your .dat files and screenshots. Files named like PlFxLa.dat are matched to their character and costume for you."
      />

      <form onSubmit={submit} noValidate {...stylex.props(styles.layout)}>
        <div {...stylex.props(styles.main)}>
          <section aria-labelledby="files-heading" {...stylex.props(styles.section)}>
            <h2 id="files-heading" {...stylex.props(styles.sectionTitle)}>
              Files
            </h2>
            <FileDropZone
              accept={`${MOD_FILE_ACCEPT},${IMAGE_ACCEPT}`}
              title={mods.length > 0 ? "Add more files" : "Drop .dat files and screenshots here"}
              hint={`Up to ${LIMITS.PACK_MODS_MAX} .dat files (${LIMITS.FILE_SIZE_DAT / 1024 / 1024} MB each) and ${LIMITS.PACK_IMAGES_MAX} screenshots.`}
              buttonLabel="Choose files"
              compact={mods.length > 0}
              disabled={busy}
              onFiles={addFiles}
            />
            {notices.length > 0 && (
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- <output> takes phrasing content only; this is a list.
              <ul role="status" {...stylex.props(styles.notices)}>
                {notices.map((message) => (
                  <li key={message} {...stylex.props(styles.notice)}>
                    {message}
                  </li>
                ))}
              </ul>
            )}

            {(mods.length > 0 || targetChosen) && (
              <div {...stylex.props(styles.targetRow)}>
                {games.length > 1 && (
                  <Select
                    label="Game"
                    value={gameId}
                    options={gameOptions}
                    disabled={busy}
                    onValueChange={(id) => {
                      setGameId(id);
                      setTargetId(null);
                      setTargetChosen(false);
                    }}
                  />
                )}
                <Select
                  label="For"
                  value={target?.id ?? null}
                  placeholder="Choose a character or stage"
                  options={targetOptions}
                  disabled={busy}
                  onValueChange={chooseTarget}
                />
                {target && !targetChosen && (
                  <span {...stylex.props(styles.detected)}>Matched from the file names</span>
                )}
              </div>
            )}

            {mods.length > 0 && (
              <ul aria-label="Files in this pack" {...stylex.props(styles.files)}>
                {mods.map((mod) => (
                  <FileRow
                    key={mod.key}
                    mod={mod}
                    target={costumes ? target : undefined}
                    usedBy={mods}
                    issue={issues.get(mod.key)}
                    disabled={busy}
                    onSlot={(slotId) =>
                      setMods((current) =>
                        current.map((item) => (item.key === mod.key ? { ...item, slotId } : item))
                      )
                    }
                    onRemove={() => removeMod(mod.key)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="shots-heading" {...stylex.props(styles.section)}>
            <h2 id="shots-heading" {...stylex.props(styles.sectionTitle)}>
              Screenshots
            </h2>
            <p {...stylex.props(styles.sectionHint)}>
              Optional, up to {LIMITS.PACK_IMAGES_MAX}. The first one is the pack&apos;s thumbnail.
            </p>
            {images.length > 0 && (
              <ul {...stylex.props(styles.shots)}>
                {images.map((image, index) => (
                  <Screenshot
                    key={`${image.name}-${image.lastModified}-${index}`}
                    file={image}
                    src={objectUrl(image)}
                    index={index}
                    count={images.length}
                    disabled={busy}
                    onMove={(step) =>
                      setImages((current) => {
                        const next = [...current];
                        const other = index + step;
                        [next[index], next[other]] = [next[other], next[index]];
                        return next;
                      })
                    }
                    onRemove={() => setImages((current) => current.filter((_, i) => i !== index))}
                  />
                ))}
              </ul>
            )}
            {images.length < LIMITS.PACK_IMAGES_MAX && (
              <AddScreenshots disabled={busy} onFiles={addFiles} />
            )}
          </section>

          <section aria-labelledby="details-heading" {...stylex.props(styles.section)}>
            <h2 id="details-heading" {...stylex.props(styles.sectionTitle)}>
              Details
            </h2>
            <TextField
              label="Title"
              value={title}
              maxLength={LIMITS.PACK_TITLE_MAX}
              disabled={busy}
              description={
                !titleEdited && title
                  ? "Suggested from your file names; change it freely."
                  : undefined
              }
              onChange={(event) => {
                setTitle(event.currentTarget.value);
                setTitleEdited(true);
              }}
            />
            <TextArea
              label="Description (optional)"
              value={description}
              maxLength={LIMITS.PACK_DESCRIPTION_MAX}
              rows={5}
              disabled={busy}
              placeholder="What changed? Credits, compatibility notes, and install tips are welcome."
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
            <TagInput value={tags} onValueChange={setTags} disabled={busy} />
          </section>
        </div>

        <aside aria-label="Submission" {...stylex.props(styles.aside)}>
          <div {...stylex.props(styles.previewHead)}>
            <Badge>Preview</Badge>
            <p {...stylex.props(styles.previewNote)}>How your pack page will look</p>
          </div>
          {previewImages.length > 0 || previewModels.length > 0 ? (
            <MediaViewer
              images={previewImages}
              alt={title.trim() || "Your pack"}
              modelPreviews={previewModels}
            />
          ) : (
            <div {...stylex.props(styles.previewEmpty)}>
              Screenshots and a 3D preview of your files appear here
            </div>
          )}
          <div>
            <p {...stylex.props(styles.summaryTitle)}>{title.trim() || "Untitled pack"}</p>
            <p {...stylex.props(styles.summaryMeta)}>
              {[
                target?.name ?? "No character or stage yet",
                `${mods.length} ${mods.length === 1 ? "file" : "files"}`,
              ].join(" · ")}
            </p>
          </div>

          <div
            ref={summaryRef}
            tabIndex={-1}
            role={attempted && problems.length > 0 ? "alert" : undefined}
          >
            <ul aria-label="Before you submit" {...stylex.props(styles.checklist)}>
              <Check done={mods.length > 0}>Files added</Check>
              <Check done={Boolean(target)}>Character or stage chosen</Check>
              <Check
                done={mods.length > 0 && ![...issues.values()].some((i) => i.kind === "error")}
              >
                Every file has its own costume
              </Check>
              <Check done={Boolean(title.trim())}>Title</Check>
            </ul>
          </div>
          {attempted && problems.length > 0 && (
            <p {...stylex.props(styles.alert)}>{problems[0]}.</p>
          )}

          <TurnstileField
            onTokenChange={setTurnstileToken}
            verificationRequired={upload.error?.message === VERIFICATION_REQUIRED}
          />

          {busy ? (
            <>
              <Progress label="Uploading" value={progress} />
              <Button onClick={() => abortRef.current?.abort()}>Cancel upload</Button>
            </>
          ) : (
            <Button type="submit" variant="primary" size="lg" fullWidth>
              Submit for review
            </Button>
          )}
          {upload.isError && !canceled && (
            <p role="alert" {...stylex.props(styles.alert)}>
              {upload.error.message || "The upload failed. Try again."}
            </p>
          )}
          {canceled && <output {...stylex.props(styles.note)}>Upload canceled.</output>}
          <p {...stylex.props(styles.note)}>
            Files are checked automatically, then a moderator reviews the pack before it goes
            public.
          </p>
        </aside>
      </form>
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────

function FileRow({
  mod,
  target,
  usedBy,
  issue,
  disabled,
  onSlot,
  onRemove,
}: {
  mod: ModDraft;
  /** Set when the target has several costumes to choose between. */
  target: UploadTarget | undefined;
  usedBy: readonly ModDraft[];
  issue: { kind: "error" | "warning"; message: string } | undefined;
  disabled: boolean;
  onSlot: (slotId: string) => void;
  onRemove: () => void;
}) {
  const issueId = `${mod.key}-issue`;
  const options = (target?.slots ?? []).map((slot) => {
    const holder = usedBy.find((other) => other.key !== mod.key && other.slotId === slot.id);
    return {
      value: slot.id,
      label: slot.name,
      disabled: Boolean(holder),
      meta: holder ? "In use" : (slot.fileCode ?? undefined),
    };
  });
  return (
    <li {...stylex.props(styles.file)} aria-describedby={issue ? issueId : undefined}>
      <span {...stylex.props(styles.fileInfo)}>
        <span {...stylex.props(styles.fileIcon)}>
          <FileIcon />
        </span>
        <span {...stylex.props(styles.fileText)}>
          <span {...stylex.props(styles.fileName)} title={mod.file.name}>
            {mod.file.name}
          </span>
          <span {...stylex.props(styles.fileSize)}>{fileSize(mod.file)}</span>
        </span>
      </span>
      {target && (
        <span {...stylex.props(styles.fileSlot)}>
          <Select
            label={`Costume for ${mod.file.name}`}
            hideLabel
            value={mod.slotId || null}
            placeholder="Choose costume"
            options={options}
            disabled={disabled}
            onValueChange={onSlot}
          />
        </span>
      )}
      <IconButton
        label={`Remove ${mod.file.name}`}
        icon={<CloseIcon />}
        disabled={disabled}
        onClick={onRemove}
      />
      {issue && (
        <p
          id={issueId}
          {...stylex.props(
            styles.issue,
            issue.kind === "error" ? styles.issueError : styles.issueWarning
          )}
        >
          {issue.message}
        </p>
      )}
    </li>
  );
}

/**
 * One object URL per local file, created on first use and revoked once the file
 * leaves the form or the page unmounts.
 */
function useObjectUrls(files: readonly File[]): (file: File) => string {
  const cache = useRef(new Map<File, string>());
  useEffect(() => {
    const present = new Set(files);
    for (const [file, url] of cache.current) {
      if (!present.has(file)) {
        URL.revokeObjectURL(url);
        cache.current.delete(file);
      }
    }
  });
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const urls = cache.current;
    return () => {
      mounted.current = false;
      // StrictMode re-mounts at once in development; only a real unmount revokes.
      setTimeout(() => {
        if (mounted.current) return;
        for (const url of urls.values()) URL.revokeObjectURL(url);
        urls.clear();
      });
    };
  }, []);
  return (file) => {
    let url = cache.current.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      cache.current.set(file, url);
    }
    return url;
  };
}

function Screenshot({
  file,
  src,
  index,
  count,
  disabled,
  onMove,
  onRemove,
}: {
  file: File;
  src: string;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (step: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <li {...stylex.props(styles.shot)}>
      <div {...stylex.props(styles.shotFrame)}>
        {src && (
          <img
            src={src}
            alt={`Screenshot ${index + 1}: ${file.name}`}
            {...stylex.props(styles.shotImage)}
          />
        )}
        {index === 0 && (
          <span {...stylex.props(styles.shotBadge)}>
            <Badge tone="accent">Thumbnail</Badge>
          </span>
        )}
      </div>
      <div {...stylex.props(styles.shotActions)}>
        <IconButton
          label={`Move ${file.name} earlier`}
          icon={<ChevronLeftIcon />}
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
        />
        <IconButton
          label={`Remove ${file.name}`}
          icon={<CloseIcon />}
          disabled={disabled}
          onClick={onRemove}
        />
        <IconButton
          label={`Move ${file.name} later`}
          icon={<ChevronRightIcon />}
          disabled={disabled || index === count - 1}
          onClick={() => onMove(1)}
        />
      </div>
    </li>
  );
}

function AddScreenshots({
  disabled,
  onFiles,
}: {
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span {...stylex.props(styles.addShots)}>
      <input
        ref={input}
        type="file"
        multiple
        accept={IMAGE_ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onFiles(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
        {...stylex.props(styles.hiddenInput)}
      />
      <Button disabled={disabled} onClick={() => input.current?.click()}>
        Add screenshots
      </Button>
    </span>
  );
}

function Check({ done, children }: { done: boolean; children: string }) {
  return (
    <li {...stylex.props(styles.check, done && styles.checkDone)}>
      <span {...stylex.props(styles.checkMark, done && styles.checkMarkDone)} aria-hidden="true">
        {done && <CheckIcon size={12} strokeWidth={3} />}
      </span>
      {children}
      <span {...stylex.props(shared.visuallyHidden)}>{done ? " (done)" : " (to do)"}</span>
    </li>
  );
}
