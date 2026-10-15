import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Verifies the real tokens in index.css: every text/background pair that the UI uses meets WCAG AA in BOTH themes. */
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const block = (selector: RegExp) => {
  const m = selector.exec(css)!;
  const body = css.slice(m.index + m[0].length, css.indexOf("\n}", m.index));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((x) => [x[1]!, x[2]!]));
};
const light = block(/:root\s*\{/);
const dark = { ...light, ...block(/\n\.dark\s*\{/) };

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };

// [foreground token, background token, minimum ratio, where it is used]
const text: Array<[string, string, number, string]> = [
  ["fg", "surface", 4.5, "headings on cards"], ["fg", "app", 4.5, "headings on the page"], ["fg-2", "surface", 4.5, "body text"], ["fg-2", "surface-2", 4.5, "table cells on hover"],
  ["fg-muted", "surface", 4.5, "secondary text"], ["fg-muted", "surface-3", 4.5, "neutral badges, tabs"], ["fg-subtle", "surface", 4.5, "hints and captions"], ["fg-subtle", "app", 4.5, "captions on the page"],
  ["fg-subtle", "surface-2", 4.5, "table headers"], ["fg-subtle", "surface-3", 4.5, "captions on chips"], ["fg-faint", "surface", 3, "placeholders / decorative (large UI only)"],
  ["accent-text", "surface", 4.5, "links and active nav text"], ["accent-text", "accent-soft", 4.5, "active nav item"], ["accent-soft-fg", "accent-soft", 4.5, "good badges"], ["accent-soft-fg", "accent-muted", 4.5, "special working day pill"],
  ["on-accent", "accent-solid", 4.5, "primary buttons, complete badge"], ["warn", "warn-soft", 4.5, "tight badge, warnings"], ["warn", "surface", 4.5, "warning text on cards"],
  ["danger", "danger-soft", 4.5, "danger badge, errors"], ["danger", "surface", 4.5, "error text on cards"], ["info", "info-soft", 4.5, "event pills"], ["on-accent", "danger-solid", 4.5, "destructive confirm button"],
  ["ok", "ok-soft", 4.5, "on-track badge, success text"], ["ok", "surface", 4.5, "success text on cards"], ["on-accent", "ok-solid", 4.5, "complete badge"],
];
const ui: Array<[string, string, number, string]> = [
  ["accent", "surface", 3, "focus ring, progress bar, selected cell"], ["accent-solid", "surface", 3, "primary button vs card"], ["accent", "accent-soft", 3, "ring on tinted cells"], ["line-strong", "surface", 1.3, "control borders stay visible (non-essential)"],
];

for (const [name, tokens] of [["light", light], ["dark", dark]] as const) {
  describe(`${name} theme contrast`, () => {
    it.each(text)("%s on %s ≥ %s (%s)", (fg, bg, min) => expect(ratio(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(min));
    it.each(ui)("%s vs %s ≥ %s (%s)", (a, b, min) => expect(ratio(tokens[a]!, tokens[b]!)).toBeGreaterThanOrEqual(min));
  });
}

describe("token completeness", () => {
  it("dark overrides every colour token that light defines", () => {
    const darkOnly = block(/\n\.dark\s*\{/);
    for (const key of Object.keys(light)) expect(Object.keys(darkOnly), `--${key} missing in .dark`).toContain(key);
  });
  it("risk statuses are distinguishable without colour: each has its own label and icon", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/ui/index.tsx"), "utf8");
    const block = src.slice(src.indexOf("const riskStyle"), src.indexOf("export const riskLabel"));
    for (const label of ["On track", "Tight", "Danger", "Complete", "Needs data"]) expect(block).toContain(`label: "${label}"`);
    const icons = [...block.matchAll(/icon: (\w+) \}/g)].map((m) => m[1]).filter((n) => n !== "LucideIcon");
    expect(new Set(icons).size).toBe(5);
  });
});
