import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { modDocsPageQuery } from "@/lib/mod-docs-queries";
import { DocsPage, orNotFound } from "../-page";

export const Route = createFileRoute("/docs/mods/$version/")({
  loader: ({ context, params }) =>
    orNotFound(context.queryClient.ensureQueryData(modDocsPageQuery(params.version, "README"))),
  component: Overview,
});

const parent = getRouteApi("/docs/mods/$version");

function Overview() {
  const file = Route.useLoaderData();
  const release = parent.useLoaderData();
  const { version } = Route.useParams();
  return <DocsPage text={file.text} wanted={version} page="README" release={release} />;
}
