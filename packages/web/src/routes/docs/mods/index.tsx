import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireFeatureFlag } from "@/lib/feature-flags";

// /docs/mods is the newest docs.
export const Route = createFileRoute("/docs/mods/")({
  loader: async ({ context }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
    throw redirect({ to: "/docs/mods/$version", params: { version: "latest" }, replace: true });
  },
});
