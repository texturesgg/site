import { useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";

/** A flag for the signed-in viewer, from Flagship through the API; off until it answers. */
export function useFeatureFlag(name: "codeMods"): boolean {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["feature-flags", user?.id],
    enabled: Boolean(user),
    queryFn: () => parseResponse(api.flags.me.$get()),
    staleTime: 1000 * 30,
  });
  return data?.[name] ?? false;
}
