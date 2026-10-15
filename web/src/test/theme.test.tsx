import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeMenu } from "../components/ThemeMenu";
import { Metric } from "../components/ui/Metric";
import { Progress } from "../components/ui";
import { ThemeProvider } from "../context/ThemeContext";

type Listener = () => void;
/** A controllable matchMedia: `dark` = OS prefers dark, `reduced` = OS prefers reduced motion. */
function mockMedia(state: { dark: boolean; reduced: boolean }) {
  const listeners = new Set<Listener>();
  window.matchMedia = ((query: string) => ({
    get matches() { return query.includes("prefers-color-scheme: dark") ? state.dark : query.includes("prefers-reduced-motion") ? state.reduced : false; },
    media: query, onchange: null,
    addEventListener: (_: string, l: Listener) => listeners.add(l), removeEventListener: (_: string, l: Listener) => listeners.delete(l),
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return { changeOs: (dark: boolean) => { state.dark = dark; listeners.forEach((l) => l()); } };
}
const root = document.documentElement;
const mount = () => render(<ThemeProvider><ThemeMenu /></ThemeProvider>);
const pick = async (name: RegExp | string) => { await userEvent.click(screen.getByRole("button", { name: /^Theme:/ })); await userEvent.click(screen.getByRole("menuitemradio", { name })); };

beforeEach(() => { localStorage.clear(); root.classList.remove("dark", "theme-transition"); });
afterEach(() => vi.restoreAllMocks());

describe("theme modes", () => {
  it("System follows the operating system, including live changes", () => {
    const media = mockMedia({ dark: false, reduced: true });
    mount();
    expect(root).not.toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Theme: System (light)" })).toBeInTheDocument();
    act(() => media.changeOs(true));
    expect(root).toHaveClass("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(screen.getByRole("button", { name: "Theme: System (dark)" })).toBeInTheDocument();
  });

  it("an explicit choice overrides the OS, is persisted, and survives a reload", async () => {
    const media = mockMedia({ dark: false, reduced: true });
    const first = mount();
    await pick("Dark");
    expect(root).toHaveClass("dark");
    expect(localStorage.getItem("prospectus.theme")).toBe("dark");
    act(() => media.changeOs(false)); // OS change must not affect an explicit choice
    expect(root).toHaveClass("dark");
    first.unmount();
    mount(); // "reload"
    expect(root).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Theme: Dark" })).toBeInTheDocument();
    await pick("Light");
    expect(root).not.toHaveClass("dark");
    expect(localStorage.getItem("prospectus.theme")).toBe("light");
    await pick("System");
    expect(localStorage.getItem("prospectus.theme")).toBe("system");
  });

  it("ignores a corrupted stored value and still works when storage throws", async () => {
    mockMedia({ dark: true, reduced: true });
    localStorage.setItem("prospectus.theme", "neon");
    mount();
    expect(root).toHaveClass("dark"); // fell back to System
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    await pick("Light");
    expect(root).not.toHaveClass("dark"); // applies for this session even though it could not be saved
  });

  it("adds the short cross-fade class only when motion is allowed", async () => {
    mockMedia({ dark: false, reduced: false });
    mount();
    await pick("Dark");
    expect(root).toHaveClass("theme-transition");
    await waitFor(() => expect(root).not.toHaveClass("theme-transition"), { timeout: 1000 });
    mockMedia({ dark: false, reduced: true });
    await pick("Light");
    expect(root).not.toHaveClass("theme-transition");
  });
});

describe("theme menu accessibility", () => {
  it("is operable from the keyboard: open, arrow, select with Enter, Escape returns focus", async () => {
    mockMedia({ dark: false, reduced: true });
    mount();
    const trigger = screen.getByRole("button", { name: /^Theme:/ });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    const menu = await screen.findByRole("menu");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitemradio", { name: "System" })).toHaveFocus(); // starts on the current choice
    expect(screen.getByRole("menuitemradio", { name: "System" })).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}"); // System -> Dark -> Light
    expect(screen.getByRole("menuitemradio", { name: "Light" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{Enter}"); // Dark
    expect(root).toHaveClass("dark");
    expect(menu).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await screen.findByRole("menu");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on outside click", async () => {
    mockMedia({ dark: false, reduced: true });
    mount();
    await userEvent.click(screen.getByRole("button", { name: /^Theme:/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("motion", () => {
  it("dashboard numbers render the exact final value immediately under reduced motion", () => {
    mockMedia({ dark: false, reduced: true });
    render(<Metric value={72.4} decimals={1} suffix="%" />);
    expect(screen.getByText("72.4%")).toBeInTheDocument();
  });

  it("with motion allowed the official Magic UI Number Ticker counts up from 0 and settles on the exact value", async () => {
    mockMedia({ dark: false, reduced: false });
    // motion's useInView needs IntersectionObserver: report the element as visible straight away
    vi.stubGlobal("IntersectionObserver", class { constructor(private cb: (e: unknown[]) => void) {} observe(target: Element) { this.cb([{ isIntersecting: true, target }]); } unobserve() {} disconnect() {} });
    const { container } = render(<Metric value={50} decimals={1} suffix="%" />);
    expect(container.textContent).toBe("0%");
    await waitFor(() => expect(container.textContent).toBe("50.0%"), { timeout: 8000 });
    vi.unstubAllGlobals();
  }, 12000);

  it("progress bars keep their accessible value regardless of animation", () => {
    mockMedia({ dark: false, reduced: false });
    render(<Progress value={37.5} label="Coverage" />);
    expect(screen.getByRole("progressbar", { name: "Coverage" })).toHaveAttribute("aria-valuenow", "38");
  });
});

describe("Magic UI Animated Theme Toggler (vendored)", () => {
  it("switches light <-> dark in one click through our provider and persists the choice", async () => {
    mockMedia({ dark: false, reduced: true });
    mount();
    expect(root).not.toHaveClass("dark");
    await userEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(root).toHaveClass("dark");
    expect(localStorage.getItem("prospectus.theme")).toBe("dark");
    await userEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(root).not.toHaveClass("dark");
    expect(localStorage.getItem("prospectus.theme")).toBe("light");
  });
  it("does not add the app's own cross-fade class (the toggler animates itself)", async () => {
    mockMedia({ dark: false, reduced: false });
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(root).not.toHaveClass("theme-transition");
  });
});
