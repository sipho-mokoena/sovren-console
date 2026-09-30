/**
 * Everything a screen needs before it renders, in one place.
 *
 * Three providers, and the order matters only in that the gate is innermost: no
 * screen may fetch until the mock backend is intercepting, because a request that
 * escapes the interceptor is a real request to whatever answers on this origin,
 * and the failure it produces has nothing to do with the screen under test.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { ToastProvider } from "@/components/sovren/toast";
import { backendIsReady, startMockBackend, subscribeToBackend } from "@/lib/mock-backend";

const newQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // The backend is a mock, so nothing here is expensive to refetch, and
        // the last-updated stamp is the operator's clue to how old a view is.
        staleTime: 5_000,
        refetchOnWindowFocus: false,
        // The generated client never throws: a failure is a resolved value with
        // a code in it. Retrying would re-ask a question that has been answered.
        retry: false,
      },
    },
  });

/** Whether requests are answered yet. `true` in a test, whose server is already up. */
const useBackendReady = (): boolean =>
  useSyncExternalStore(subscribeToBackend, backendIsReady, () => true);

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(newQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BackendGate>{children}</BackendGate>
      </ToastProvider>
    </QueryClientProvider>
  );
}

/**
 * Hold the app until the mock backend is intercepting.
 *
 * A blank moment during startup, in exchange for never issuing a request that
 * leaves the browser. The alternative -- rendering immediately -- produces a
 * first paint full of error states that are an artefact of startup and that an
 * operator would report as bugs.
 */
function BackendGate({ children }: { children: ReactNode }) {
  const ready = useBackendReady();

  useEffect(() => {
    startMockBackend();
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="font-mono text-xs text-muted-foreground">starting the mock backend…</p>
      </div>
    );
  }
  return children;
}
