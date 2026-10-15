import { defineConfig } from "vitest/config";

export default defineConfig({
  // *.int.test.ts need a real PostgreSQL and run via `npm run test:integration`.
  test: { environment: "node", include: ["src/**/*.test.ts"], exclude: ["src/**/*.int.test.ts", "node_modules/**"] },
});
