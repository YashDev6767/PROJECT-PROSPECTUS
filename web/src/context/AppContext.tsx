import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchDashboard, setApiFaculty, setApiRole } from "../lib/api";
import { can as canDo, type Capability } from "../lib/permissions";
import { roles, type Role } from "../lib/roles";
import type { Campus, Dashboard } from "../lib/types";

type DashboardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Dashboard };

interface AppContextValue {
  role: Role;
  can: (capability: Capability) => boolean;
  setRole: (r: Role) => void;
  /** Demo identity for faculty logging (not verified — see README). */
  facultyId: string | null;
  setFacultyId: (id: string | null) => void;
  campusId: string | null;
  setCampusId: (id: string) => void;
  campuses: Campus[];
  dashboard: DashboardState;
  reload: () => void;
}

const Ctx = createContext<AppContextValue | null>(null);

const safeGet = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const safeSet = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(() => {
    const stored = safeGet("prospectus.role");
    return roles.find((r) => r === stored) ?? "faculty";
  });
  const [campusId, setCampusId] = useState<string | null>(() => safeGet("prospectus.campus"));
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [dashboard, setDashboard] = useState<DashboardState>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const [facultyId, setFacultyIdState] = useState<string | null>(() => safeGet("prospectus.faculty"));
  setApiRole(role);
  setApiFaculty(role === "faculty" ? facultyId : null); // before any child effect fetches, so requests carry the current demo role

  useEffect(() => {
    const controller = new AbortController();
    setDashboard({ status: "loading" });
    fetchDashboard(campusId, controller.signal)
      .then((data) => {
        setCampuses(data.campuses);
        setDashboard({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (campusId) { // a stale stored campus id: fall back to the default campus
          const message = error instanceof Error ? error.message : "";
          if (message.includes("404")) { setCampusId(null); return; }
        }
        setDashboard({ status: "error", message: error instanceof Error ? error.message : "Network error" });
      });
    return () => controller.abort();
  }, [campusId, nonce]);

  const value = useMemo<AppContextValue>(() => ({
    role,
    can: (capability) => canDo(role, capability),
    setRole: (r) => { safeSet("prospectus.role", r); setRoleState(r); },
    campusId: dashboard.status === "ready" ? dashboard.data.context.campus.id : campusId,
    facultyId, setFacultyId: (id) => { if (id) safeSet("prospectus.faculty", id); setFacultyIdState(id); },
    setCampusId: (id) => { safeSet("prospectus.campus", id); setCampusId(id); },
    campuses,
    dashboard,
    reload: () => setNonce((n) => n + 1),
  }), [role, facultyId, campusId, campuses, dashboard]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}
