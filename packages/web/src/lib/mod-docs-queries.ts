import { queryOptions } from "@tanstack/react-query";
import { ModDocsFile, ModDocsRelease, ModDocsSearchIndex } from "@vgskins/shared/mod-docs";
import { api, apiError } from "@/lib/api";

// Mirrored release docs never change; `main` updates on pushes to tgg-melee main.
const STALE_RELEASE = 1000 * 60 * 5;
const STALE_MAIN = 1000 * 30;

export const modDocsReleaseQuery = (wanted: string) =>
  queryOptions({
    queryKey: ["mod-docs", wanted],
    queryFn: async () => {
      const res = await api.docs.mods[":wanted"].$get({ param: { wanted } });
      if (!res.ok) throw await apiError(res);
      return ModDocsRelease.parse(await res.json());
    },
    staleTime: wanted === "main" ? STALE_MAIN : STALE_RELEASE,
  });

export const modDocsPageQuery = (wanted: string, page: string) =>
  queryOptions({
    queryKey: ["mod-docs", wanted, "page", page],
    queryFn: async () => {
      const res = await api.docs.mods[":wanted"].page.$get({
        param: { wanted },
        query: { path: page },
      });
      if (!res.ok) throw await apiError(res);
      return ModDocsFile.parse(await res.json());
    },
    staleTime: wanted === "main" ? STALE_MAIN : STALE_RELEASE,
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
    staleTime: wanted === "main" ? STALE_MAIN : STALE_RELEASE,
  });

export const modDocsSearchQuery = (wanted: string) =>
  queryOptions({
    queryKey: ["mod-docs", wanted, "search"],
    queryFn: async () => {
      const res = await api.docs.mods[":wanted"].search.$get({ param: { wanted } });
      if (!res.ok) throw await apiError(res);
      return ModDocsSearchIndex.parse(await res.json());
    },
    staleTime: wanted === "main" ? STALE_MAIN : STALE_RELEASE,
  });
