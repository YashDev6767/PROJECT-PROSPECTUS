import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("ALLOW_DEMO_HEADERS parsing (security-critical)", () => {
  const env = (extra: Record<string, string>) => loadEnv({ ...extra } as NodeJS.ProcessEnv);
  it("the string 'false' really means false (z.coerce.boolean would have said true)", () => {
    expect(env({ NODE_ENV: "production", ALLOW_DEMO_HEADERS: "false" }).ALLOW_DEMO_HEADERS).toBe(false);
    expect(env({ NODE_ENV: "development", ALLOW_DEMO_HEADERS: "FALSE" }).ALLOW_DEMO_HEADERS).toBe(false);
    expect(env({ ALLOW_DEMO_HEADERS: "0" }).ALLOW_DEMO_HEADERS).toBe(false);
    expect(env({ ALLOW_DEMO_HEADERS: "" }).ALLOW_DEMO_HEADERS).toBe(false);
  });
  it("true spellings enable it", () => {
    for (const v of ["true", "TRUE", "1", "yes", "on"]) expect(env({ ALLOW_DEMO_HEADERS: v }).ALLOW_DEMO_HEADERS).toBe(true);
  });
  it("defaults to on in development and OFF in production", () => {
    expect(env({}).ALLOW_DEMO_HEADERS).toBe(true);
    expect(env({ NODE_ENV: "production" }).ALLOW_DEMO_HEADERS).toBe(false);
  });
  it("rejects garbage instead of guessing", () => {
    expect(() => env({ ALLOW_DEMO_HEADERS: "maybe" })).toThrow(/Use true or false/);
  });
});
