import { QueryClient } from "@tanstack/react-query";

/**
 * React Query client factory. A fresh client per server render; a singleton in
 * the browser (the standard Next App Router pattern). `staleTime > 0` avoids an
 * immediate refetch on hydration.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000 } },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
