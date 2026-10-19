import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// E2E runs its own API (:4010) and web (:5183) so it never touches your dev servers, and — when TEST_DATABASE_URL is set —
// its own database, which is reset and re-seeded with sample data before the run. Without it, only Phase 1 specs run.
const testDb = process.env.TEST_DATABASE_URL;

// TEST-ONLY accounts for the sign-in specs (throw-away passwords, hashed with the same scrypt format as `npm run auth:hash`).
import { randomBytes, scryptSync } from "node:crypto";
const hash = (pw: string) => { const salt = randomBytes(16); return `scrypt:${salt.toString("hex")}:${scryptSync(pw, salt, 64).toString("hex")}`; };
export const E2E_LOGIN = { email: "e2e.admin@msot.test", password: "e2e-admin-passphrase", studentEmail: "e2e.student@msot.test", studentPassword: "e2e-student-passphrase" };
const e2eUsers = JSON.stringify([
  { email: E2E_LOGIN.email, role: "admin", name: "E2E Admin", passwordHash: hash(E2E_LOGIN.password) },
  { email: E2E_LOGIN.studentEmail, role: "student", passwordHash: hash(E2E_LOGIN.studentPassword) },
]);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://localhost:5183", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /dashboard|mobile|theme/ },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5183",
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      API_PORT: "4010", WEB_PORT: "5183", CORS_ORIGIN: "http://localhost:5183",
      DATABASE_URL: testDb ?? "",
      AUTH_USERS: e2eUsers, SESSION_SECRET: "e2e-only-session-secret-0123456789abcdef",
    },
  },
});
