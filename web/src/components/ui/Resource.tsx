import { DatabaseZap } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, api } from "../../lib/api";
import { Button, ErrorState, Skeleton } from "./index";

export interface Resource<T> { data: T | undefined; error: Error | null; loading: boolean; reload: () => void }

/** Fetches JSON for the current deps; keeps showing previous data while reloading. `path === null` waits. */
export function useResource<T>(path: string | null): Resource<T> {
  const [state, setState] = useState<{ data: T | undefined; error: Error | null; loading: boolean }>({ data: undefined, error: null, loading: path !== null });
  const [nonce, setNonce] = useState(0);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    // switching to a different resource must not show the old one's data
    setState((s) => ({ data: lastPath.current === path ? s.data : undefined, error: null, loading: true }));
    lastPath.current = path;
    api.get<T>(path, controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error: unknown) => { if (!controller.signal.aborted) setState((s) => ({ data: s.data, error: error as Error, loading: false })); });
    return () => controller.abort();
  }, [path, nonce]);

  return { ...state, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export function DatabaseSetupNotice({ onRetry }: { onRetry?: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-card border border-warn/30 bg-warn-soft p-5 text-warn">
      <div className="flex items-center gap-2 font-semibold"><DatabaseZap className="size-5" aria-hidden /> Database not connected</div>
      <p className="text-sm">Academic setup is stored in PostgreSQL and none is reachable, so nothing can be shown or saved. Start one and restart the API:</p>
      <pre className="overflow-x-auto rounded-lg bg-surface/70 p-3 text-xs text-fg-2">{"npm run db:embedded   # no Docker needed (separate terminal)\nnpm run db:deploy && npm run db:seed\n# or: npm run db:up   (Docker Compose)"}</pre>
      {onRetry && <Button onClick={onRetry} className="bg-surface">Check again</Button>}
    </div>
  );
}

/** Standard loading / error / database-missing handling around a resource. */
export function Boundary<T>({ res, children, lines = 3 }: { res: Resource<T>; children: (data: T) => ReactNode; lines?: number }) {
  if (res.error && !res.data) {
    if (res.error instanceof ApiError && res.error.code === "database_unavailable") return <DatabaseSetupNotice onRetry={res.reload} />;
    return <ErrorState title="Couldn't load this page" message={res.error.message} onRetry={res.reload} />;
  }
  if (res.data === undefined) {
    return <div aria-busy="true" aria-label="Loading" className="space-y-3">{Array.from({ length: lines }, (_, i) => <Skeleton key={i} className="h-16" />)}</div>;
  }
  return <>{children(res.data)}</>;
}
