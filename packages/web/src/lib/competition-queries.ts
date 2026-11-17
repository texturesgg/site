import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { competitionStateSchema } from "@vgskins/shared/competition";
import { api, apiError } from "@/lib/api";

// The competition's state (entries, counts, the viewer's votes) and the
// changes a viewer makes to it. Every change refetches the state.

export const competitionQuery = () =>
  queryOptions({
    queryKey: ["competition"],
    queryFn: async () => {
      const res = await api.competition.$get();
      if (!res.ok) throw await apiError(res);
      return competitionStateSchema.parse(await res.json());
    },
    staleTime: 15_000,
  });

type Change =
  | { kind: "vote" | "unvote" | "leave"; mod: string }
  | { kind: "enter"; mod: string; postUrl: string }
  | { kind: "claim" | "unclaim" };

async function send(change: Change) {
  const res = await (() => {
    switch (change.kind) {
      case "vote":
        return api.competition.votes[":mod"].$put({ param: { mod: change.mod } });
      case "unvote":
        return api.competition.votes[":mod"].$delete({ param: { mod: change.mod } });
      case "enter":
        return api.competition.entries[":mod"].$put({
          param: { mod: change.mod },
          json: { post_url: change.postUrl },
        });
      case "leave":
        return api.competition.entries[":mod"].$delete({ param: { mod: change.mod } });
      case "claim":
        return api.competition.follow.$put();
      case "unclaim":
        return api.competition.follow.$delete();
    }
  })();
  if (!res.ok) throw await apiError(res);
}

/** Makes a change and refetches the competition. */
export function useCompetitionChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["competition"] }),
  });
}
