"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import {
  restoreQueryCache,
  startPersisting,
  requestPersistentStorage,
} from "@/lib/query-persist";
import { ConnectivityProvider } from "@/components/common/connectivity-provider";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  // Stale-while-revalidate (260615-e8s round 8): hydrate the budget query cache
  // from IndexedDB on mount so a cold load renders cached data INSTANTLY, then
  // persist on every change. The read hooks use refetchOnMount:"always", so the
  // hydrated data is replaced by a fresh fetch in the background. No render gate
  // → SSR content paints normally; client-data queries flip from skeleton to the
  // hydrated rows within ~one IDB read.
  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    // Make storage durable BEFORE we start writing to it so WebKit doesn't evict
    // the IDB cache + SW caches under pressure (260619 "cache vanished" fix).
    void requestPersistentStorage();
    void restoreQueryCache(client).finally(() => {
      if (!cancelled) stop = startPersisting(client);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      <ConnectivityProvider>{children}</ConnectivityProvider>
    </QueryClientProvider>
  );
}
