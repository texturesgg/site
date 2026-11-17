import { createFileRoute, notFound } from "@tanstack/react-router";
import { ModDocsPage } from "@vgskins/shared/mod-docs";
import { modDocsHeaderQuery } from "@/lib/mod-docs-queries";
import { HeaderPage, orNotFound } from "../-page";

export const Route = createFileRoute("/docs/mods/$version/api/$name")({
  loader: ({ context, params }) => {
    if (!ModDocsPage.safeParse(params.name).success) throw notFound();
    return orNotFound(
      context.queryClient.ensureQueryData(modDocsHeaderQuery(params.version, params.name))
    );
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.name}.h - Making mods - textures.gg` }],
  }),
  component: Header,
});

function Header() {
  const file = Route.useLoaderData();
  const { name } = Route.useParams();
  return <HeaderPage name={name} text={file.text} />;
}
