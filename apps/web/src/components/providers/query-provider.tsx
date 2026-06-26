"use client";
import {
  QueryClient,
  QueryClientProvider,
  IsRestoringProvider,
} from "@tanstack/react-query";
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
  // Restore-gate (260625 r3) — DETERMINISTIC stale-while-revalidate. Children
  // render immediately (cache-first paint, no spinner), but `isRestoring` gates
  // observer FETCHING the way react-query's own PersistQueryClientProvider does:
  // while true, useBaseQuery sets shouldSubscribe=false, so no observer runs its
  // refetchOnMount:"always" mount fetch yet. We flip it false only AFTER
  // restoreQueryCache().hydrate() finishes — so hydrate ALWAYS lands before any
  // fetch, then every read hook subscribes and refetches against the hydrated
  // cache. The fresh fetch lands last → it can never lose to the stale snapshot.
  const [isRestoring, setIsRestoring] = useState(true);
  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    // Make storage durable BEFORE we start writing to it so WebKit doesn't evict
    // the IDB cache + SW caches under pressure (260619 "cache vanished" fix).
    void requestPersistentStorage();
    void restoreQueryCache(client).finally(() => {
      if (cancelled) return;
      setIsRestoring(false);
      stop = startPersisting(client);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      <IsRestoringProvider value={isRestoring}>
        <ConnectivityProvider>{children}</ConnectivityProvider>
      </IsRestoringProvider>
    </QueryClientProvider>
  );
}
