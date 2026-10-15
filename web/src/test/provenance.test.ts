import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Component provenance guard. Each third-party component is vendored with (a) a header naming its official source, (b) a pristine
 * copy of the official file + sha256 in _originals/, and (c) a budget on how many lines may differ from that official file.
 */
const vendor = resolve(process.cwd(), "src/components/vendor");
const manifest = JSON.parse(readFileSync(join(vendor, "_originals/MANIFEST.json"), "utf8")) as Array<{ file: string; sha256: string; bytes: number; source: string; library: string; component: string }>;

// official file -> vendored file, the import specifier the app uses, and the maximum number of changed lines (both sides of a diff)
const vendored: Record<string, { path: string; importedAs: string; maxChangedLines: number }> = {
  "magicui-number-ticker.tsx.orig.txt": { path: "magicui/number-ticker.tsx", importedAs: "vendor/magicui/number-ticker", maxChangedLines: 2 },
  "magicui-animated-theme-toggler.tsx.orig.txt": { path: "magicui/animated-theme-toggler.tsx", importedAs: "vendor/magicui/animated-theme-toggler", maxChangedLines: 0 },
  "reactbits-SpotlightCard.tsx.orig.txt": { path: "reactbits/SpotlightCard.tsx", importedAs: "vendor/reactbits/SpotlightCard", maxChangedLines: 2 },
  "aceternity-stateful-button.tsx.orig.txt": { path: "aceternity/stateful-button.tsx", importedAs: "vendor/aceternity/stateful-button", maxChangedLines: 40 },
  "magicui-blur-fade.tsx.orig.txt": { path: "magicui/blur-fade.tsx", importedAs: "vendor/magicui/blur-fade", maxChangedLines: 0 },
  "magicui-dot-pattern.tsx.orig.txt": { path: "magicui/dot-pattern.tsx", importedAs: "vendor/magicui/dot-pattern", maxChangedLines: 0 },
  "aceternity-spotlight.tsx.orig.txt": { path: "aceternity/spotlight.tsx", importedAs: "vendor/aceternity/spotlight", maxChangedLines: 2 },
  "originkit-arrow-reveal-button.tsx.orig.txt": { path: "originkit/arrow-reveal-button.tsx", importedAs: "vendor/originkit/arrow-reveal-button", maxChangedLines: 20 },
};

const sources = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? (f === "vendor" || f === "test" ? [] : sources(p)) : /\.(tsx?|ts)$/.test(f) ? [p] : [];
});
const appCode = sources(resolve(process.cwd(), "src")).map((p) => readFileSync(p, "utf8")).join("\n");

describe("vendored third-party components", () => {
  it("covers all four libraries", () => expect(new Set(manifest.map((m) => m.library))).toEqual(new Set(["Magic UI", "React Bits", "Aceternity UI", "Originkit"])));

  it.each(manifest)("$library · $component: pristine original matches its recorded checksum", (m) => {
    const content = readFileSync(join(vendor, "_originals", m.file));
    expect(content.length).toBe(m.bytes);
    expect(createHash("sha256").update(content).digest("hex")).toBe(m.sha256);
  });

  it.each(manifest)("$library · $component: vendored file names its source and original checksum", (m) => {
    const body = readFileSync(join(vendor, vendored[m.file]!.path), "utf8");
    const header = body.slice(0, body.indexOf("*/"));
    expect(header).toContain("VENDORED THIRD-PARTY COMPONENT");
    expect(header).toContain(m.sha256);
    expect(header).toContain(m.source.split(" ")[0]!);
  });

  it.each(manifest)("$library · $component: differs from the official file by at most the documented number of lines", (m) => {
    const v = vendored[m.file]!;
    const body = readFileSync(join(vendor, v.path), "utf8");
    const withoutHeader = body.slice(body.indexOf("*/") + 3);
    const tmp = join(process.env.TMPDIR ?? "/tmp", `vendored-${m.sha256.slice(0, 8)}.tsx`);
    writeFileSync(tmp, withoutHeader);
    const diff = spawnSync("diff", [tmp, join(vendor, "_originals", m.file)], { encoding: "utf8" });
    if (diff.error) return; // `diff` binary unavailable on this machine
    const changed = diff.stdout.split("\n").filter((l) => /^[<>]/.test(l)).length;
    expect(changed).toBeLessThanOrEqual(v.maxChangedLines);
  });

  it.each(manifest)("$library · $component: is actually imported by application code (no dead vendoring)", (m) => {
    expect(appCode).toContain(vendored[m.file]!.importedAs);
  });

  it.each([["magicui/animated-theme-toggler.tsx", "magicui-animated-theme-toggler"], ["magicui/blur-fade.tsx", "magicui-blur-fade"], ["magicui/dot-pattern.tsx", "magicui-dot-pattern"]])("%s is byte-identical to the official source", (file, original) => {
    const body = readFileSync(join(vendor, file), "utf8");
    expect(body.slice(body.indexOf("*/") + 3)).toBe(readFileSync(join(vendor, `_originals/${original}.tsx.orig.txt`), "utf8"));
  });
});
