"use client";

import { QueryClient, QueryCache, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { queryRootsForDomain } from "@/lib/queryKeys";
import { useToast } from "./ToastContext";

function shouldRetry(failureCount: number, error: any): boolean {
  const status = error?.status;
  if (status === 401 || status === 403 || status === 404) return false;
  return failureCount < 2;
}

/** Overridable so failures detected outside React still reach the toast system. */
let reportReadFailure: (message: string) => void = (message) => console.warn(`[query] ${message}`);
let lastReported: { message: string; at: number } = { message: "", at: 0 };

/**
 * Reads used to fail silently — the panel just rendered its empty fallback and the
 * user believed the data was genuinely missing. 401/403 belong to the session-expiry
 * flow already handled elsewhere, so they are not toasted here.
 */
function onQueryError(error: any, query: { queryKey: readonly unknown[] }) {
  const status = error?.status;
  if (status === 401 || status === 403) return;
  const message = error?.message || "A data request failed.";
  if (message === lastReported.message && Date.now() - lastReported.at < 4000) return;
  lastReported = { message, at: Date.now() };
  console.warn("[query] failed:", query.queryKey.join("/"), message);
  reportReadFailure(message);
}

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: onQueryError }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 15 * 60_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/** Shared client so non-hook code (hover prefetch) can warm the same cache the app reads. */
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(getQueryClient);
  const { toast } = useToast();

  useEffect(() => {
    reportReadFailure = (message: string) => toast(message, "error");
    return () => {
      reportReadFailure = (message: string) => console.warn(`[query] ${message}`);
    };
  }, [toast]);

  // Never let a previous session's data survive a session expiry.
  useEffect(() => {
    const clear = () => client.clear();
    window.addEventListener("ecampus_session_expired", clear);
    return () => window.removeEventListener("ecampus_session_expired", clear);
  }, [client]);

  // A mutation in another tab wrote fp_data_changed to localStorage; mirror the
  // invalidation the originating tab already did in broadcastDataChanged.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "fp_data_changed" || !event.newValue) return;
      try {
        const domain = JSON.parse(event.newValue)?.domain as string | undefined;
        if (!domain) return;
        const roots = new Set(queryRootsForDomain(domain));
        client.invalidateQueries({
          predicate: (query) => roots.has(String(query.queryKey[0] ?? "")),
        });
      } catch (_) { /* malformed cross-tab payload — ignore */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
