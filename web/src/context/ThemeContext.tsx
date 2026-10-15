import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
export const THEME_KEY = "prospectus.theme";
const modes: ThemeMode[] = ["light", "dark", "system"];

const prefersDark = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
const prefersReducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const readStored = (): ThemeMode => { try { const v = localStorage.getItem(THEME_KEY); return modes.find((m) => m === v) ?? "system"; } catch { return "system"; } };

interface ThemeValue { mode: ThemeMode; resolved: "light" | "dark"; setMode: (m: ThemeMode, options?: { animate?: boolean }) => void }
const Ctx = createContext<ThemeValue | null>(null);

/** Light / Dark / System. The explicit choice is persisted; "system" follows the OS live. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStored);
  const [systemDark, setSystemDark] = useState(prefersDark);
  const resolved: "light" | "dark" = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
    root.dataset.theme = resolved;
  }, [resolved]);

  const setMode = useCallback((next: ThemeMode, options?: { animate?: boolean }) => {
    // `animate: false` is used by the view-transition toggler, which provides its own reveal animation
    if (options?.animate !== false && !prefersReducedMotion()) { // short cross-fade, only for user-initiated changes
      const root = document.documentElement;
      root.classList.add("theme-transition");
      window.setTimeout(() => root.classList.remove("theme-transition"), 260);
    }
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable: the choice still applies for this session */ }
    setModeState(next);
  }, []);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme must be used inside <ThemeProvider>");
  return v;
}
