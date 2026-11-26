import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { modDocsPageQuery, modDocsReleaseQuery } from "@/lib/mod-docs-queries";
import { DocsLanding, orNotFound } from "../-page";

export const Route = createFileRoute("/docs/mods/$version/")({
  loader: async ({ context, params }) => {
    const [release, file] = await Promise.all([
      orNotFound(context.queryClient.ensureQueryData(modDocsReleaseQuery(params.version))),
      orNotFound(context.queryClient.ensureQueryData(modDocsPageQuery(params.version, "index"))),
    ]);
    return { file, meta: release.pages.index };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.meta
          ? `${loaderData.meta.title} - textures.gg`
          : "Making mods - textures.gg",
      },
      ...(loaderData?.meta ? [{ name: "description", content: loaderData.meta.description }] : []),
    ],
    links: [{ rel: "canonical", href: "https://textures.gg/docs/mods/latest" }],
  }),
  component: Overview,
});

const parent = getRouteApi("/docs/mods/$version");

function Overview() {
  const { file } = Route.useLoaderData();
  const release = parent.useLoaderData();
  const { version } = Route.useParams();
  return <DocsLanding text={file.text} wanted={version} release={release} />;
}
