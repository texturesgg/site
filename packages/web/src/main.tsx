import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { NotFoundPage, RouteErrorPage } from "./components/route-status";
import { AuthProvider } from "./contexts/auth-context";
import { shouldRetryQuery } from "./lib/api";
import type { RouterContext } from "./lib/router-context";
import { routeTree } from "./routeTree.gen";
import "./index.css";
import { applyDocumentStyles } from "./ui/patterns/layout";

// Create a query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes — show cached data instantly, refetch in background
      gcTime: 1000 * 60 * 10, // keep unused data for 10 minutes
      refetchOnWindowFocus: false,
      // A 4xx will not change on retry; a 401 after a ban otherwise kept
      // the auth state loading for about 7 s.
      retry: shouldRetryQuery,
    },
  },
});

// Create router with context
const router = createRouter({
  routeTree,
  context: { queryClient } satisfies RouterContext,
  defaultPreload: "intent",
  defaultNotFoundComponent: NotFoundPage,
  defaultErrorComponent: RouteErrorPage,
  scrollRestoration: true,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

applyDocumentStyles();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
