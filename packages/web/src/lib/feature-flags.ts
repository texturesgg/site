import { type QueryClient, queryOptions, useQuery } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import { parseResponse } from "hono/client";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { sessionQuery } from "@/lib/session";

type FlagName = "codeMods";

const flagsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["feature-flags", userId],
    queryFn: () => parseResponse(api.flags.me.$get()),
    staleTime: 1000 * 30,
  });

/** A flag for the signed-in viewer, from Flagship through the API; off until it answers. */
export function useFeatureFlag(name: FlagName): boolean {
  const { user } = useAuth();
  const { data } = useQuery({ ...flagsQuery(user?.id ?? ""), enabled: Boolean(user) });
  return data?.[name] ?? false;
}

/** A flag for the signed-in viewer, for loaders. */
export async function featureFlag(queryClient: QueryClient, name: FlagName): Promise<boolean> {
  const session = await queryClient.ensureQueryData(sessionQuery);
  if (!session?.user) return false;
  const flags = await queryClient.ensureQueryData(flagsQuery(session.user.id));
  return flags[name];
}

/** For a flagged page's loader: the page is not found unless the flag is on for the viewer. */
export async function requireFeatureFlag(queryClient: QueryClient, name: FlagName) {
  if (!(await featureFlag(queryClient, name))) throw notFound();
}
