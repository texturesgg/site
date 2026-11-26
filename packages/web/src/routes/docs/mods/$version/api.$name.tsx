import { createFileRoute, notFound } from "@tanstack/react-router";
import { ModDocsHeaderName } from "@vgskins/shared/mod-docs";
import { modDocsHeaderQuery } from "@/lib/mod-docs-queries";
import { HeaderPage, orNotFound } from "../-page";

export const Route = createFileRoute("/docs/mods/$version/api/$name")({
  loader: ({ context, params }) => {
    if (!ModDocsHeaderName.safeParse(params.name).success) throw notFound();
    return orNotFound(
      context.queryClient.ensureQueryData(modDocsHeaderQuery(params.version, params.name))
    );
  },
  head: ({ params }) => ({
    meta: [
      { title: `${params.name}.h - Making mods - textures.gg` },
      { name: "description", content: `C SDK header tgg/${params.name}.h for tgg-melee.` },
    ],
  }),
  component: Header,
});

function Header() {
  const file = Route.useLoaderData();
  const { name } = Route.useParams();
  return <HeaderPage name={name} text={file.text} />;
}
