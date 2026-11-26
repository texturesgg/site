import * as stylex from "@stylexjs/stylex";
import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import {
  docsPageLabel,
  type ModDocsNavSection,
  type ModDocsRelease,
  ModDocsWanted,
} from "@vgskins/shared/mod-docs";
import { useEffect, useState } from "react";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { docsHeaderPath, docsPagePath } from "@/lib/mod-docs-links";
import { modDocsReleaseQuery } from "@/lib/mod-docs-queries";
import { ChevronDownIcon, ChevronRightIcon, MenuIcon } from "@/ui/icons";
import { layout } from "@/ui/patterns/layout";
import { Badge, Button, Select, Sheet } from "@/ui/primitives";
import { color, font, motion, radius, space, text } from "@/ui/tokens.stylex";
import { orNotFound } from "./-page";

// The mod docs shell for one version: `latest`, `main`, or a format 2 major.minor.
// Legacy `/docs/mods/0.1/...` paths redirect to `latest`.

export const Route = createFileRoute("/docs/mods/$version")({
  loader: async ({ context, params, location }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
    if (params.version === "0.1") {
      const rest = location.pathname.replace(/^\/docs\/mods\/0\.1\/?/, "");
      const target = rest ? `/docs/mods/latest/${rest}` : "/docs/mods/latest";
      throw redirect({ href: `${target}${location.hash}`, replace: true });
    }
    if (!ModDocsWanted.safeParse(params.version).success) throw notFound();
    return orNotFound(context.queryClient.ensureQueryData(modDocsReleaseQuery(params.version)));
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: "Making mods - textures.gg" },
      {
        name: "description",
        content:
          loaderData?.pages.index?.description ??
          "Build Luau script mods, overlays, custom menus, training tools, and native C mods for tgg-melee.",
      },
    ],
  }),
  component: DocsLayout,
});

const PHONE = "@media (max-width: 860px)";
const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";

const styles = stylex.create({
  page: {
    display: "grid",
    gridTemplateColumns: { default: "248px minmax(0, 1fr)", [PHONE]: "minmax(0, 1fr)" },
    alignItems: "start",
    gap: { default: space.xxl, [PHONE]: space.lg },
  },
  sideDesktop: {
    display: { default: "flex", [PHONE]: "none" },
    flexDirection: "column",
    gap: space.lg,
    position: "sticky",
    top: space.lg,
    maxHeight: "calc(100vh - 48px)",
    overflowY: "auto",
    paddingRight: space.xs,
  },
  mobileBar: {
    display: { default: "none", [PHONE]: "flex" },
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingBottom: space.sm,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
  },
  mobileVersion: {
    minWidth: "140px",
  },
  content: {
    minWidth: 0,
  },
  navStack: {
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
  },
  group: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
  },
  groupTitle: {
    margin: 0,
    paddingInline: space.sm,
    paddingBottom: "2px",
    fontSize: text.xs,
    fontWeight: 700,
    color: color.muted,
  },
  advancedBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
    width: "100%",
    paddingBlock: space.xxs,
    paddingInline: space.sm,
    borderRadius: radius.sm,
    color: { default: color.muted, ":hover": color.text },
    fontSize: text.xs,
    fontWeight: 700,
    textAlign: "left",
    transitionProperty: "color, background-color",
    transitionDuration: { default: motion.fast, [REDUCED_MOTION]: "0ms" },
    transitionTimingFunction: motion.easing,
  },
  advancedLeft: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
  },
  subTitle: {
    margin: 0,
    marginTop: space.xs,
    paddingInline: space.sm,
    fontSize: text.xs,
    fontWeight: 600,
    color: color.muted,
  },
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  link: {
    display: "block",
    padding: `6px ${space.sm}`,
    borderRadius: radius.sm,
    fontSize: text.sm,
    color: { default: color.muted, ":hover": color.text },
    textDecoration: "none",
    transitionProperty: "color, background-color",
    transitionDuration: { default: motion.fast, [REDUCED_MOTION]: "0ms" },
    transitionTimingFunction: motion.easing,
  },
  headerLink: {
    fontFamily: font.mono,
    fontSize: text.xs,
  },
  active: {
    color: color.text,
    backgroundColor: color.surface,
    fontWeight: 600,
  },
});

function VersionPicker({
  version,
  release,
  onSelect,
}: {
  version: string;
  release: ModDocsRelease;
  onSelect: (next: string) => void;
}) {
  const options = [
    ...(version === "main" ? [{ value: "main", label: "main", meta: "dev" }] : []),
    ...(release.minors.length > 0 || version === "latest"
      ? [
          {
            value: "latest",
            label: "Latest",
            meta: version === "main" ? release.minors[0] : release.version,
          },
        ]
      : []),
    ...release.minors.map((minor) => ({ value: minor, label: minor })),
  ];

  return <Select label="Version" value={version} options={options} onValueChange={onSelect} />;
}

function DocsNavTree({
  version,
  release,
  inAdvanced,
  onNavigate,
}: {
  version: string;
  release: ModDocsRelease;
  inAdvanced: boolean;
  onNavigate?: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(inAdvanced);
  const headers = release.headers.map((header) => header.slice("tgg/".length, -".h".length));

  useEffect(() => {
    if (inAdvanced) setAdvancedOpen(true);
  }, [inAdvanced]);

  const standardSections = release.nav.filter((section) => !section.advanced);
  const advancedSections = release.nav.filter((section) => section.advanced);

  return (
    <div {...stylex.props(styles.navStack)}>
      <ul {...stylex.props(styles.list)}>
        <li>
          <DocsLink href={docsPagePath(version, "index")} onNavigate={onNavigate}>
            {docsPageLabel("index", release.pages)}
          </DocsLink>
        </li>
      </ul>

      {standardSections.map((section) => (
        <SectionGroup
          key={section.title}
          section={section}
          version={version}
          release={release}
          onNavigate={onNavigate}
        />
      ))}

      {advancedSections.map((section) => (
        <div key={section.title} {...stylex.props(styles.group)}>
          <button
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((open) => !open)}
            {...stylex.props(styles.advancedBtn)}
          >
            <span {...stylex.props(styles.advancedLeft)}>
              {advancedOpen ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
              <span>{section.title}</span>
            </span>
            <Badge>Advanced</Badge>
          </button>
          {advancedOpen && (
            <>
              <ul {...stylex.props(styles.list)}>
                {section.pages.map((page) => (
                  <li key={page}>
                    <DocsLink href={docsPagePath(version, page)} onNavigate={onNavigate}>
                      {docsPageLabel(page, release.pages)}
                    </DocsLink>
                  </li>
                ))}
              </ul>
              {headers.length > 0 && (
                <>
                  <h3 {...stylex.props(styles.subTitle)}>C headers</h3>
                  <ul {...stylex.props(styles.list)}>
                    {headers.map((name) => (
                      <li key={name}>
                        <DocsLink href={docsHeaderPath(version, name)} mono onNavigate={onNavigate}>
                          {`${name}.h`}
                        </DocsLink>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function SectionGroup({
  section,
  version,
  release,
  onNavigate,
}: {
  section: ModDocsNavSection;
  version: string;
  release: ModDocsRelease;
  onNavigate?: () => void;
}) {
  return (
    <div {...stylex.props(styles.group)}>
      <h2 {...stylex.props(styles.groupTitle)}>{section.title}</h2>
      <ul {...stylex.props(styles.list)}>
        {section.pages.map((page) => (
          <li key={page}>
            <DocsLink href={docsPagePath(version, page)} onNavigate={onNavigate}>
              {docsPageLabel(page, release.pages)}
            </DocsLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocsLayout() {
  const release = Route.useLoaderData();
  const { version } = Route.useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const subPath = location.pathname.replace(/^\/docs\/mods\/[^/]+\/?/, "");
  const inAdvanced =
    subPath.startsWith("api/") ||
    release.nav.some((section) => section.advanced && section.pages.includes(subPath));

  const switchVersion = (next: string) => {
    void navigate({ to: "/docs/mods/$version", params: { version: next } });
  };

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <div {...stylex.props(styles.mobileBar)}>
        <Sheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Mod docs"
          trigger={
            <Button variant="secondary" icon={<MenuIcon size={16} />}>
              Contents
            </Button>
          }
        >
          <DocsNavTree
            version={version}
            release={release}
            inAdvanced={inAdvanced}
            onNavigate={() => setSheetOpen(false)}
          />
        </Sheet>
        <div {...stylex.props(styles.mobileVersion)}>
          <VersionPicker version={version} release={release} onSelect={switchVersion} />
        </div>
      </div>

      <nav aria-label="Docs" {...stylex.props(styles.sideDesktop)}>
        <VersionPicker version={version} release={release} onSelect={switchVersion} />
        <DocsNavTree version={version} release={release} inAdvanced={inAdvanced} />
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
  onNavigate,
  children,
}: {
  href: string;
  mono?: boolean;
  onNavigate?: () => void;
  children: string;
}) {
  return (
    <Link
      to={href}
      onClick={onNavigate}
      activeOptions={{ exact: true, includeHash: false }}
      {...stylex.props(styles.link, mono && styles.headerLink)}
      activeProps={{ ...stylex.props(styles.link, mono && styles.headerLink, styles.active) }}
    >
      {children}
    </Link>
  );
}
