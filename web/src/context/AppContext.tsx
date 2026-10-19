import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchAuthConfig, fetchDashboard, fetchSession, setApiBatch, setApiFaculty, setApiRole, setApiSession, signInRequest, signOutRequest, type AuthConfig, type SessionUser } from "../lib/api";
import { can as canDo, type Capability } from "../lib/permissions";
import { roles, type Role } from "../lib/roles";
import type { Campus, Dashboard } from "../lib/types";

type DashboardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Dashboard };

/** How this browser is allowed to act: a verified session (user), or — only if the server permits — the demo role picker. */
export interface AuthState { status: "loading" | "ready"; sessionLogin: boolean; demoHeaders: boolean; user: SessionUser | null }

interface AppContextValue {
  auth: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  role: Role;
  can: (capability: Capability) => boolean;
  setRole: (r: Role) => void;
  /** Demo identity for faculty logging (not verified — see README). */
  facultyId: string | null;
  setFacultyId: (id: string | null) => void;
  /** The batch a student sees: from the signed session, or (development demo mode only) the one picked on the My learning page. */
  batchId: string | null;
  setBatchId: (id: string | null) => void;
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
  const [pickedRole, setRoleState] = useState<Role>(() => {
    const stored = safeGet("prospectus.role");
    return roles.find((r) => r === stored) ?? "faculty";
  });
  const [auth, setAuth] = useState<AuthState>({ status: "loading", sessionLogin: false, demoHeaders: true, user: null });
  const user = auth.user;
  const role: Role = user ? user.role : pickedRole; // a verified session always overrides the demo picker
  const [campusId, setCampusId] = useState<string | null>(() => safeGet("prospectus.campus"));
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [dashboard, setDashboard] = useState<DashboardState>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const [pickedFaculty, setFacultyIdState] = useState<string | null>(() => safeGet("prospectus.faculty"));
  const [pickedBatch, setPickedBatch] = useState<string | null>(() => safeGet("prospectus.batch"));
  const batchId = user ? user.batchId ?? null : pickedBatch;
  const facultyId = user ? user.facultyId : pickedFaculty;
  setApiSession(user !== null);
  setApiRole(role);
  setApiBatch(!user && role === "student" ? pickedBatch : null);
  setApiFaculty(role === "faculty" ? facultyId : null); // before any child effect fetches, so requests carry the current demo role

  // Who am I? (a signed cookie, if any) and which access modes does the server allow? Unknown/older servers = demo mode, as before.
  const loadAuth = useCallback(async () => {
    const [cfg, session] = await Promise.all([fetchAuthConfig().catch((): Partial<AuthConfig> => ({})), fetchSession().catch((): { user?: SessionUser | null } => ({}))]);
    setAuth({ status: "ready", sessionLogin: cfg.sessionLogin === true, demoHeaders: cfg.demoHeaders !== false, user: session.user ?? null });
  }, []);
  useEffect(() => { void loadAuth(); }, [loadAuth]);

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
  }, [campusId, nonce, user?.email]);

  const value = useMemo<AppContextValue>(() => ({
    auth,
    signIn: async (email, password) => { const { user: u } = await signInRequest(email, password); setApiSession(true); setAuth((a) => ({ ...a, status: "ready", user: u })); },
    signOut: async () => { await signOutRequest().catch(() => undefined); setApiSession(false); setAuth((a) => ({ ...a, user: null })); },
    role,
    can: (capability) => canDo(role, capability),
    setRole: (r) => { safeSet("prospectus.role", r); setRoleState(r); },
    campusId: dashboard.status === "ready" ? dashboard.data.context.campus.id : campusId,
    batchId, setBatchId: (id) => { if (id) safeSet("prospectus.batch", id); else { try { localStorage.removeItem("prospectus.batch"); } catch { /* optional */ } } setPickedBatch(id); },
    facultyId, setFacultyId: (id) => { if (id) safeSet("prospectus.faculty", id); setFacultyIdState(id); },
    setCampusId: (id) => { safeSet("prospectus.campus", id); setCampusId(id); },
    campuses,
    dashboard,
    reload: () => setNonce((n) => n + 1),
  }), [auth, role, facultyId, batchId, campusId, campuses, dashboard]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}
