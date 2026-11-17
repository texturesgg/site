import { queryOptions } from "@tanstack/react-query";
import { ModDocsFile, ModDocsRelease } from "@vgskins/shared/mod-docs";
import { api, apiError } from "@/lib/api";

// The mod docs pages read the API's copy of tgg-melee's mirrored docs.
// Mirrored files never change, so a page keeps what it fetched.
const STALE = 1000 * 60 * 5;

export const modDocsReleaseQuery = (wanted: string) =>
  queryOptions({
    queryKey: ["mod-docs", wanted],
    queryFn: async () => {
      const res = await api.docs.mods[":wanted"].$get({ param: { wanted } });
      if (!res.ok) throw await apiError(res);
      return ModDocsRelease.parse(await res.json());
    },
    staleTime: STALE,
  });

export const modDocsPageQuery = (wanted: string, page: string) =>
  queryOptions({
    queryKey: ["mod-docs", wanted, "page", page],
    queryFn: async () => {
      const res = await api.docs.mods[":wanted"].pages[":page"].$get({ param: { wanted, page } });
      if (!res.ok) throw await apiError(res);
      return ModDocsFile.parse(await res.json());
    },
    staleTime: STALE,
  });

export const modDocsHeaderQuery = (wanted: string, name: string) =>
  queryOptions({
    queryKey: ["mod-docs", wanted, "header", name],
    queryFn: async () => {
      const res = await api.docs.mods[":wanted"].headers[":name"].$get({
        param: { wanted, name },
      });
      if (!res.ok) throw await apiError(res);
      return ModDocsFile.parse(await res.json());
    },
    staleTime: STALE,
  });
