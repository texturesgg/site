import { createFileRoute, redirect } from "@tanstack/react-router";

// /docs/mods is the newest docs.
export const Route = createFileRoute("/docs/mods/")({
  loader: () => {
    throw redirect({ to: "/docs/mods/$version", params: { version: "latest" }, replace: true });
  },
});
