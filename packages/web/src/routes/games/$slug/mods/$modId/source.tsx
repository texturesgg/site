import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { PRIMARY_GAME_SLUG } from "@vgskins/shared";
import { parseResponse } from "hono/client";
import { api, apiError } from "@/lib/api";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { layout } from "@/ui/patterns/layout";
import { ModEyebrow } from "@/ui/patterns/ModHeader";
import { Select } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

type SourceSearch = { release?: string; path?: string };

export const Route = createFileRoute("/games/$slug/mods/$modId/source")({
  validateSearch: (search: Record<string, unknown>): SourceSearch => ({
    release: typeof search.release === "string" ? search.release : undefined,
    path: typeof search.path === "string" && search.path ? search.path : undefined,
  }),
  loader: async ({ context, params }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
    if (params.slug !== PRIMARY_GAME_SLUG) throw notFound();
    const res = await api["code-mods"][":slug"].$get({ param: { slug: params.modId } });
    if (!res.ok) throw notFound();
    const mod = await parseResponse(res);
    // Releases with source to read: everything but a failed check.
    const releases = mod.releases.filter((release) => release.status !== "failed");
    if (releases.length === 0) throw notFound();
    return { mod, releases };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.mod.name ?? "Mod"} source - textures.gg` }],
  }),
  component: SourcePage,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.lg },
  head: { display: "flex", flexDirection: "column", gap: space.sm },
  title: { margin: 0, fontSize: text.h2, fontWeight: 800 },
  bar: { display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: space.md },
  crumbs: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.xxs,
    fontFamily: font.mono,
    fontSize: text.sm,
  },
  crumb: { color: color.accentText, textDecoration: { default: "none", ":hover": "underline" } },
  muted: { color: color.muted },
  list: {
    margin: 0,
    padding: 0,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    listStyle: "none",
    overflow: "hidden",
  },
  entry: {
    display: "block",
    padding: `${space.xs} ${space.md}`,
    borderTopWidth: { default: 1, ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: color.line,
    fontFamily: font.mono,
    fontSize: text.sm,
    color: color.text,
    textDecoration: { default: "none", ":hover": "underline" },
  },
  folder: { fontWeight: 700 },
  code: {
    margin: 0,
    padding: space.md,
    overflowX: "auto",
    borderRadius: radius.md,
    backgroundColor: color.surface,
    fontFamily: font.mono,
    fontSize: text.sm,
    lineHeight: 1.5,
    counterReset: "line",
  },
  line: { display: "block", whiteSpace: "pre", minHeight: "1.5em" },
  number: {
    display: "inline-block",
    width: "4ch",
    marginRight: space.md,
    textAlign: "right",
    color: color.muted,
    userSelect: "none",
  },
});

const STATUS: Record<string, string> = {
  approved: "",
  pending: " (in review)",
  rejected: " (rejected)",
  processing: " (checking)",
};

function SourcePage() {
  const { mod, releases } = Route.useLoaderData();
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const release =
    releases.find((candidate) => candidate.id === search.release) ??
    releases.find((candidate) => candidate.status === "approved") ??
    releases[0];
  const path = search.path ?? "";

  const tree = useQuery({
    queryKey: ["code-mod-release", release.id, "tree"],
    queryFn: async () => {
      const res = await api["code-mod-releases"][":id"].tree.$get({ param: { id: release.id } });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
  const isFile = tree.data?.entries.some((entry) => entry.path === path && entry.kind === "file");
  const file = useQuery({
    queryKey: ["code-mod-release", release.id, "file", path],
    enabled: Boolean(isFile),
    queryFn: async () => {
      const res = await api["code-mod-releases"][":id"].file.$get({
        param: { id: release.id },
        query: { path },
      });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });

  const parts = path ? path.split("/") : [];

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <div {...stylex.props(styles.head)}>
        <ModEyebrow to="/games/$slug/mods/$modId" params={{ slug, modId: mod.slug }}>
          {mod.name}
        </ModEyebrow>
        <h1 {...stylex.props(styles.title)}>Source</h1>
      </div>
      <div {...stylex.props(styles.bar)}>
        <Select
          label="Version"
          value={release.id}
          options={releases.map((candidate) => ({
            value: candidate.id,
            label: `${candidate.version}${STATUS[candidate.status] ?? ""}`,
            meta: candidate.commit.slice(0, 7),
          }))}
          onValueChange={(id) => void navigate({ search: { release: id, path: search.path } })}
        />
      </div>
      <nav aria-label="Path" {...stylex.props(styles.crumbs)}>
        <Link
          from={Route.fullPath}
          search={{ release: search.release }}
          {...stylex.props(styles.crumb)}
        >
          {mod.slug}
        </Link>
        {parts.map((part, index) => (
          <span key={index}>
            <span {...stylex.props(styles.muted)}>/ </span>
            {index === parts.length - 1 ? (
              <span>{part}</span>
            ) : (
              <Link
                from={Route.fullPath}
                search={{ release: search.release, path: parts.slice(0, index + 1).join("/") }}
                {...stylex.props(styles.crumb)}
              >
                {part}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {tree.isPending ? (
        <p {...stylex.props(styles.muted)}>Loading…</p>
      ) : tree.error ? (
        <EmptyState title="The source couldn't be loaded" body={tree.error.message} />
      ) : isFile ? (
        <FileView file={file} />
      ) : (
        <Folder entries={tree.data.entries} path={path} release={search.release} />
      )}
    </div>
  );
}

/** What's directly in `path`: its folders first, then its files. */
function Folder({
  entries,
  path,
  release,
}: {
  entries: { path: string; kind: string }[];
  path: string;
  release?: string;
}) {
  const prefix = path ? `${path}/` : "";
  const folders = new Set<string>();
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.path.startsWith(prefix)) continue;
    const rest = entry.path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) files.push(rest);
    else folders.add(rest.slice(0, slash));
  }
  if (folders.size === 0 && files.length === 0) return <EmptyState title="Nothing here" />;
  return (
    <ul aria-label="Files" {...stylex.props(styles.list)}>
      {[...folders].sort().map((name) => (
        <li key={`d:${name}`}>
          <Link
            from={Route.fullPath}
            search={{ release, path: `${prefix}${name}` }}
            {...stylex.props(styles.entry, styles.folder)}
          >
            {name}/
          </Link>
        </li>
      ))}
      {files.sort().map((name) => (
        <li key={`f:${name}`}>
          <Link
            from={Route.fullPath}
            search={{ release, path: `${prefix}${name}` }}
            {...stylex.props(styles.entry)}
          >
            {name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function FileView({
  file,
}: {
  file: ReturnType<
    typeof useQuery<{ content: string | null; size: number; truncated: boolean }, Error>
  >;
}) {
  if (file.isPending) return <p {...stylex.props(styles.muted)}>Loading…</p>;
  if (file.error)
    return <EmptyState title="The file couldn't be loaded" body={file.error.message} />;
  if (file.data.content === null) {
    return (
      <EmptyState title="Binary file" body={`${file.data.size.toLocaleString("en-US")} bytes`} />
    );
  }
  const lines = file.data.content.replace(/\n$/, "").split("\n");
  return (
    <>
      <pre {...stylex.props(styles.code)}>
        {lines.map((line, index) => (
          <span key={index} {...stylex.props(styles.line)}>
            <span {...stylex.props(styles.number)}>{index + 1}</span>
            {line}
          </span>
        ))}
      </pre>
      {file.data.truncated && <p {...stylex.props(styles.muted)}>Cut at 1 MiB.</p>}
    </>
  );
}
