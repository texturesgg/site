import { createFileRoute, getRouteApi, notFound } from "@tanstack/react-router";
import { ModDocsPage } from "@vgskins/shared/mod-docs";
import { docsPageLabel } from "@/lib/mod-docs-links";
import { modDocsPageQuery } from "@/lib/mod-docs-queries";
import { DocsPage, orNotFound } from "../-page";

export const Route = createFileRoute("/docs/mods/$version/$page")({
  loader: ({ context, params }) => {
    if (!ModDocsPage.safeParse(params.page).success) throw notFound();
    return orNotFound(
      context.queryClient.ensureQueryData(modDocsPageQuery(params.version, params.page))
    );
  },
  head: ({ params }) => ({
    meta: [{ title: `${docsPageLabel(params.page)} - Making mods - textures.gg` }],
  }),
  component: Page,
});

const parent = getRouteApi("/docs/mods/$version");

function Page() {
  const file = Route.useLoaderData();
  const release = parent.useLoaderData();
  const { version, page } = Route.useParams();
  return <DocsPage text={file.text} wanted={version} page={page} release={release} />;
}
