"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useState, type ReactNode } from "react";
import superjson from "superjson";

import type { AppRouter } from "./root";
import { getQueryClient } from "./query-client";

/**
 * @repo/api client. `createTRPCContext` yields the typed provider + `useTRPC`
 * hook. `TRPCReactProvider` wires a browser-singleton QueryClient and a tRPC
 * client (same-origin `/api/trpc`, superjson) — mount it around the subtree that
 * uses tRPC (e.g. the dashboard).
 */
const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export { useTRPC };

export function TRPCReactProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
