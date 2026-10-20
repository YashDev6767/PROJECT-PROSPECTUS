import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

// jsdom does not implement Blob.text(); real browsers do.
if (!Blob.prototype.text) {
  Blob.prototype.text = function text(this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// jsdom has no matchMedia: report "no dark preference" and "reduced motion" so tests are deterministic (numbers render final, no timers).
if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  });
}

// jsdom lacks these observers (used by the vendored Magic UI / React Bits / Originkit components): benign stand-ins.
class FakeObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
if (typeof window.IntersectionObserver === "undefined") (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeObserver;
if (typeof window.ResizeObserver === "undefined") (window as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeObserver;

// jsdom has no canvas/WebGL: report "no context" quietly (what a browser without WebGL2 does) instead of logging "Not implemented".
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
