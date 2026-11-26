import { createFileRoute, getRouteApi, notFound, redirect } from "@tanstack/react-router";
import { docsResolveRedirect, ModDocsPage } from "@vgskins/shared/mod-docs";
import { docsPagePath } from "@/lib/mod-docs-links";
import { modDocsPageQuery, modDocsReleaseQuery } from "@/lib/mod-docs-queries";
import { DocsPage, orNotFound } from "../-page";

export const Route = createFileRoute("/docs/mods/$version/$")({
  loader: async ({ context, params, location }) => {
    const rawPage = (params._splat ?? "").replace(/^\/+|\/+$/g, "");
    if (!rawPage) {
      throw redirect({
        to: "/docs/mods/$version",
        params: { version: params.version },
        replace: true,
      });
    }

    const release = await orNotFound(
      context.queryClient.ensureQueryData(modDocsReleaseQuery(params.version))
    );

    const redirected = docsResolveRedirect(release.redirects, rawPage, location.hash);
    if (redirected) {
      const base = docsPagePath(params.version, redirected.page);
      const href = redirected.hash ? `${base}#${redirected.hash}` : base;
      throw redirect({ href, replace: true });
    }

    if (!ModDocsPage.safeParse(rawPage).success || !(rawPage in release.pages)) {
      throw notFound();
    }

    const file = await orNotFound(
      context.queryClient.ensureQueryData(modDocsPageQuery(params.version, rawPage))
    );
    return { page: rawPage, file, meta: release.pages[rawPage] };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.meta
          ? `${loaderData.meta.title} - Making mods - textures.gg`
          : "Making mods - textures.gg",
      },
      ...(loaderData?.meta ? [{ name: "description", content: loaderData.meta.description }] : []),
    ],
    links: loaderData?.page
      ? [
          {
            rel: "canonical",
            href:
              loaderData.page === "index"
                ? "https://textures.gg/docs/mods/latest"
                : `https://textures.gg/docs/mods/latest/${loaderData.page}`,
          },
        ]
      : [],
  }),
  component: Page,
});

const parent = getRouteApi("/docs/mods/$version");

function Page() {
  const { page, file } = Route.useLoaderData();
  const release = parent.useLoaderData();
  const { version } = Route.useParams();
  return <DocsPage text={file.text} wanted={version} page={page} release={release} />;
}
