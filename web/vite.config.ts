import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // "@/..." resolves to src/..., the alias convention used by shadcn-style component registries (Magic UI, Aceternity UI, React Bits)
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: { "/api": { target: `http://localhost:${process.env.API_PORT ?? 4000}`, changeOrigin: true } },
  },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], include: ["src/**/*.test.{ts,tsx}"], css: false },
});
