import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { Skeleton } from "../ui";

/**
 * Sends visitors to /login when the server has turned the demo role headers off (production) and there is no signed-in session.
 * While demo mode is allowed (local development / staging) the app opens as before with the "Preview as" picker.
 */
export function RequireAccess({ children }: { children: ReactNode }) {
  const { auth } = useApp();
  const { pathname } = useLocation();
  if (auth.status === "loading") return <div className="mx-auto max-w-md space-y-3 p-10" aria-busy="true" aria-label="Loading"><Skeleton className="h-8" /><Skeleton className="h-40" /></div>;
  if (!auth.user && !auth.demoHeaders) return <Navigate to="/login" replace state={{ from: pathname }} />;
  return <>{children}</>;
}
