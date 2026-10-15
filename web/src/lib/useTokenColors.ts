import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";

/**
 * Resolved colour values of design tokens (e.g. "accent-solid" -> "#047857"), refreshed when the theme changes.
 * Needed for third-party components that interpolate colour strings in JS (motion cannot animate `var(--x)`).
 */
export function useTokenColors<K extends string>(names: readonly K[]): Record<K, string> {
  const { resolved } = useTheme();
  const read = () => {
    const css = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((n) => [n, css?.getPropertyValue(`--${n}`).trim() || "#047857"])) as Record<K, string>;
  };
  const [colors, setColors] = useState(read);
  useEffect(() => { setColors(read()); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);
  return colors;
}
