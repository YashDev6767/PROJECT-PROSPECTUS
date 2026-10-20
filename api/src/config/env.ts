import dotenv from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { campuses } from "../data/campuses.js";

// The single .env lives at the repository root (works from src/ and from dist/).
dotenv.config({ path: resolve(fileURLToPath(import.meta.url), "../../../../.env"), quiet: true });

/** Strict env-var boolean: only true/false spellings are accepted; anything else is a startup error, never a silent "true". */
const envBoolean = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const s = v.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(s)) return true;
  if (["false", "0", "no", "off", ""].includes(s)) return false;
  return v;
}, z.boolean({ message: "Use true or false" }));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // Optional: the API starts without a database and reports it honestly via /api/health.
  DATABASE_URL: z.string().optional(),
  // Institution calendar: "today" and "now" are evaluated in this zone, not the server's UTC.
  APP_TIME_ZONE: z.string().default("Asia/Kolkata").refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Unknown IANA time zone"),
  // Risk thresholds on the buffer ratio (available hours / remaining hours).
  RISK_ON_TRACK_BUFFER: z.coerce.number().positive().default(1.15),
  RISK_TIGHT_BUFFER: z.coerce.number().positive().default(1.0),
  // Which exam type marks the syllabus-completion deadline (falls back to the semester end when it is not scheduled).
  SYLLABUS_DEADLINE_EXAM_TYPE: z.enum(["SESSIONAL", "MID_TERM", "PUT", "END_TERM"]).default("END_TERM"),
  // Security: client-controlled demo headers (X-Demo-Role) are disabled in production by default.
  // NOTE: never z.coerce.boolean() here — it turns the string "false" into true, which would ENABLE the spoofable headers.
  ALLOW_DEMO_HEADERS: envBoolean.optional(),
  // Development demo previews are scoped to ONE campus: the one named in X-Demo-Campus, otherwise this default (never "all campuses").
  DEMO_DEFAULT_CAMPUS: z.string().default(campuses[0]!.id).refine((c) => campuses.some((k) => k.id === c), "DEMO_DEFAULT_CAMPUS must be a known campus id"),
  // Restricted evaluation sign-in (server-verified). Both unset = no login; see api/src/services/auth.ts and the README.
  AUTH_USERS: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().positive().max(72).default(8),
}).transform((e) => ({
  ...e,
  ALLOW_DEMO_HEADERS: e.ALLOW_DEMO_HEADERS ?? (e.NODE_ENV !== "production"),
})).refine((e) => e.RISK_TIGHT_BUFFER <= e.RISK_ON_TRACK_BUFFER, { message: "RISK_TIGHT_BUFFER cannot exceed RISK_ON_TRACK_BUFFER", path: ["RISK_TIGHT_BUFFER"] });

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${details}`);
  }
  return parsed.data;
}
