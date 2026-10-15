import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "../context/ThemeContext";
import { AnimatedThemeToggler } from "./vendor/magicui/animated-theme-toggler";
import { Menu } from "./ui/Menu";

const labels: Record<ThemeMode, string> = { light: "Light", dark: "Dark", system: "System" };

/**
 * Header theme control, a split button: the left half is Magic UI's Animated Theme Toggler (click = switch light/dark with its
 * circular View-Transition reveal, controlled by our ThemeProvider), the right half opens Light / Dark / System.
 */
export function ThemeMenu() {
  const { mode, resolved, setMode } = useTheme();
  return (
    <div className="flex items-center">
      <AnimatedThemeToggler theme={resolved} onThemeChange={(t) => setMode(t, { animate: false })} duration={420}
        className="grid size-11 place-items-center rounded-l-xl border border-r-0 border-line-strong bg-surface text-fg-2 transition-[background-color,transform] duration-150 hover:bg-surface-3 active:scale-95 lg:size-10 [&_svg]:size-[18px]" />
      <Menu label={`Theme: ${labels[mode]}${mode === "system" ? ` (${resolved})` : ""}`} align="right" triggerClassName="w-7 rounded-l-none"
        trigger={<ChevronDown className="size-4" aria-hidden />}
        items={(["light", "dark", "system"] as ThemeMode[]).map((m) => ({ id: m, label: labels[m], checked: mode === m, icon: m === "light" ? <Sun className="size-4" /> : m === "dark" ? <Moon className="size-4" /> : <Monitor className="size-4" />, onSelect: () => setMode(m) }))} />
    </div>
  );
}
