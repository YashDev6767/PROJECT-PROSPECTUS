import { PrismaClient } from "@prisma/client";

export type DatabaseStatus =
  | { state: "not_configured"; detail: string }
  | { state: "connected"; latencyMs: number }
  | { state: "unreachable"; detail: string };

export interface Database {
  /** Null when DATABASE_URL is not set; academic-setup endpoints then answer 503. */
  prisma: PrismaClient | null;
  check(): Promise<DatabaseStatus>;
  close(): Promise<void>;
}

/** Builds a database handle. Without a DATABASE_URL nothing is opened and status says so. */
export function createDatabase(url: string | undefined): Database {
  if (!url) {
    return {
      prisma: null,
      check: async () => ({ state: "not_configured", detail: "DATABASE_URL is not set" }),
      close: async () => {},
    };
  }

  const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });

  return {
    prisma,
    async check() {
      const started = performance.now();
      try {
        await Promise.race([
          prisma.$queryRaw`SELECT 1`,
          new Promise((_, reject) => setTimeout(() => reject(new Error("timed out after 2s")), 2000)),
        ]);
        return { state: "connected", latencyMs: Math.round(performance.now() - started) };
      } catch (error) {
        return { state: "unreachable", detail: error instanceof Error ? error.message.split("\n").at(-1) ?? "error" : "error" };
      }
    },
    close: () => prisma.$disconnect(),
  };
}
