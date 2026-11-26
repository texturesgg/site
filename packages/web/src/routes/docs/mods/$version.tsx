import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Link, notFound, Outlet, useNavigate } from "@tanstack/react-router";
import { ModDocsWanted } from "@vgskins/shared/mod-docs";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { docsHeaderPath, docsPageLabel, docsPagePath } from "@/lib/mod-docs-links";
import { modDocsReleaseQuery } from "@/lib/mod-docs-queries";
import { layout } from "@/ui/patterns/layout";
import { Select } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";
import { orNotFound } from "./-page";

// The mod docs for one version: `latest` or a tgg-melee major.minor. The
// contents come from the release's mirrored docs, so new pages show up here
// without a site change.

export const Route = createFileRoute("/docs/mods/$version")({
  loader: async ({ context, params }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
    if (!ModDocsWanted.safeParse(params.version).success) throw notFound();
    return orNotFound(context.queryClient.ensureQueryData(modDocsReleaseQuery(params.version)));
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: "Making mods - textures.gg" },
      {
        name: "description",
        content: `How to make mods for tgg-melee${loaderData ? ` ${loaderData.minor}` : ""}: events, hooks, rollback, drawing, settings and packaging.`,
      },
    ],
  }),
  component: DocsLayout,
});

const PHONE = "@media (max-width: 860px)";

const styles = stylex.create({
  page: {
    display: "grid",
    gridTemplateColumns: { default: "220px minmax(0, 1fr)", [PHONE]: "minmax(0, 1fr)" },
    alignItems: "start",
    gap: { default: space.xxl, [PHONE]: space.xl },
  },
  side: {
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
    position: { default: "sticky", [PHONE]: "static" },
    top: space.lg,
    maxHeight: { default: "calc(100vh - 2 * 24px)", [PHONE]: "none" },
    overflowY: "auto",
    order: { default: 0, [PHONE]: 1 },
  },
  content: { minWidth: 0, maxWidth: "760px" },
  group: { display: "flex", flexDirection: "column", gap: space.xxs },
  groupTitle: {
    margin: 0,
    paddingInline: space.sm,
    fontSize: text.sm,
    fontWeight: 700,
    color: color.muted,
  },
  list: { margin: 0, padding: 0, listStyle: "none" },
  link: {
    display: "block",
    padding: `${space.xxs} ${space.sm}`,
    borderRadius: radius.sm,
    fontSize: text.md,
    color: { default: color.muted, ":hover": color.text },
    textDecoration: "none",
  },
  header: { fontFamily: font.mono, fontSize: text.sm },
  active: { color: color.text, backgroundColor: color.surface, fontWeight: 600 },
});

function DocsLayout() {
  const release = Route.useLoaderData();
  const { version } = Route.useParams();
  const navigate = useNavigate();
  const headers = release.headers.map((header) => header.slice("tgg/".length, -".h".length));
  const readmeInSection = release.sections.some((section) => section.pages.includes("README"));

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <nav aria-label="Docs" {...stylex.props(styles.side)}>
        <Select
          label="Version"
          value={version}
          options={[
            { value: "latest", label: "Latest", meta: release.version },
            ...release.minors.map((minor) => ({ value: minor, label: minor })),
          ]}
          onValueChange={(next) =>
            void navigate({ to: "/docs/mods/$version", params: { version: next } })
          }
        />
        {release.pages.includes("README") && !readmeInSection && (
          <ul {...stylex.props(styles.list)}>
            <li>
              <DocsLink href={docsPagePath(version, "README")}>{docsPageLabel("README")}</DocsLink>
            </li>
          </ul>
        )}
        {release.sections.map((section) => (
          <div key={section.title} {...stylex.props(styles.group)}>
            <h2 {...stylex.props(styles.groupTitle)}>{section.title}</h2>
            <ul {...stylex.props(styles.list)}>
              {section.pages.map((page) => (
                <li key={page}>
                  <DocsLink href={docsPagePath(version, page)}>{docsPageLabel(page)}</DocsLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {headers.length > 0 && (
          <div {...stylex.props(styles.group)}>
            <h2 {...stylex.props(styles.groupTitle)}>API</h2>
            <ul {...stylex.props(styles.list)}>
              {headers.map((name) => (
                <li key={name}>
                  <DocsLink href={docsHeaderPath(version, name)} mono>
                    {`${name}.h`}
                  </DocsLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
      <div {...stylex.props(styles.content)}>
        <Outlet />
      </div>
    </div>
  );
}

function DocsLink({
  href,
  mono = false,
  children,
}: {
  href: string;
  mono?: boolean;
  children: string;
}) {
  return (
    <Link
      to={href}
      activeOptions={{ exact: true, includeHash: false }}
      {...stylex.props(styles.link, mono && styles.header)}
      activeProps={{ ...stylex.props(styles.link, mono && styles.header, styles.active) }}
    >
      {children}
    </Link>
  );
}
