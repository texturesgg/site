import type { QueryClient } from "@tanstack/react-query";

// Router context available to all route loaders
export interface RouterContext {
  queryClient: QueryClient;
}
