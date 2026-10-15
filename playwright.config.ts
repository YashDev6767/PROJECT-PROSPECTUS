import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// E2E runs its own API (:4010) and web (:5183) so it never touches your dev servers, and — when TEST_DATABASE_URL is set —
// its own database, which is reset and re-seeded with sample data before the run. Without it, only Phase 1 specs run.
const testDb = process.env.TEST_DATABASE_URL;

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
    },
  },
});
