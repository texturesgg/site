import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { api } from "./api";
import { getSession } from "./auth-client";

/**
 * The better-auth session, cached so route guards do not ask the API on every
 * navigation and hover preload. AuthProvider writes useSession's value here,
 * so signing in or out updates it at once.
 */
export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: async () => (await getSession()).data ?? null,
  staleTime: 60_000,
});

/** The signed-in user's full profile; AuthProvider reads the same cache entry. */
export const currentUserQuery = queryOptions({
  queryKey: ["user", "me"],
  queryFn: () => parseResponse(api.users.me.$get()),
  staleTime: 5 * 60_000,
});
