import type { Dashboard, Health } from "./types";
import type { Role } from "./roles";

const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

// DEMO ONLY: the selected preview role is sent as a header. It is not authentication (see README).
let demoRole: Role | null = null;
export const setApiRole = (role: Role) => { demoRole = role; };
// DEMO ONLY: which faculty member the user says they are (sent as X-Demo-Faculty; not verified).
let demoFaculty: string | null = null;
export const setApiFaculty = (id: string | null) => { demoFaculty = id; };
const identityHeaders = (): Record<string, string> => ({ ...(demoRole ? { "X-Demo-Role": demoRole } : {}), ...(demoFaculty ? { "X-Demo-Faculty": demoFaculty } : {}) });

export interface ApiIssue { path: string; message: string }
export interface ApiWarning { code: string; message: string }
export interface ApiConflict { type: "faculty" | "batch"; message: string }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string,
    public details: { issues?: ApiIssue[]; warnings?: ApiWarning[]; conflicts?: ApiConflict[]; errors?: Array<{ row: number; field: string; message: string }>; blockers?: Record<string, number>; existingLogId?: string } = {}) {
    super(message);
  }
  get issues() { return this.details.issues ?? []; }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method, signal,
      headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...identityHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ApiError(0, "network_error", "Could not reach the server");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = text ? (JSON.parse(text) as Record<string, unknown>) : {}; } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const { error, message, ...details } = json as { error?: string; message?: string } & ApiError["details"];
    throw new ApiError(res.status, error ?? "error", message ?? `The server responded with ${res.status}`, details);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>("GET", path, undefined, signal),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: (path: string) => request<void>("DELETE", path),
};

/** Downloads a CSV endpoint through fetch (so the demo-role header is sent) and saves it. */
export async function downloadCsv(path: string, fallbackName: string) {
  const res = await fetch(`${base}${path}`, { headers: identityHeaders() });
  if (!res.ok) throw new ApiError(res.status, "download_failed", `Export failed (${res.status})`);
  const name = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export const fetchDashboard = (campusId: string | null, signal?: AbortSignal) =>
  api.get<Dashboard>(`/api/dashboard${campusId ? `?campusId=${encodeURIComponent(campusId)}` : ""}`, signal);
export const fetchHealth = (signal?: AbortSignal) => api.get<Health>("/api/health", signal);
