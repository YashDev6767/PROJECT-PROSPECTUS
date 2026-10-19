import { Building2, ClipboardPen, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { canLogSessions } from "../../lib/roles";
import { ThemeMenu } from "../ThemeMenu";
import { Badge, ButtonLink } from "../ui";
import { Select } from "../ui/forms";
import { AppBackground } from "./AppBackground";
import { LogoMark, Wordmark } from "./Brand";
import { Sidebar } from "./Sidebar";

const KEY = "prospectus.sidebar";
const readCollapsed = () => { try { return localStorage.getItem(KEY) === "collapsed"; } catch { return false; } };

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="scrim-in absolute inset-0 bg-scrim" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Navigation menu" className="drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface shadow-pop">
        <button ref={closeRef} onClick={onClose} aria-label="Close menu" className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"><X className="size-5" /></button>
        <Sidebar drawer onNavigate={onClose} />
      </div>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { campuses, campusId, setCampusId, dashboard } = useApp();
  const { pathname } = useLocation();
  const onOverview = pathname === "/";
  const demo = dashboard.status === "ready" && dashboard.data.dataSource === "demo"; // only the labelled demo dashboard uses built-in numbers
  const semester = dashboard.status === "ready" ? dashboard.data.context.semester : "Loading…";
  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-app px-4 py-2 sm:px-6 lg:px-10">
      <button onClick={onMenu} aria-label="Open menu" className="grid size-11 place-items-center rounded-xl text-fg-2 transition-colors duration-[var(--dur-fast)] hover:bg-surface-3 lg:hidden"><Menu className="size-5" /></button>
      <span className="flex items-center gap-2.5 lg:hidden"><LogoMark className="size-8 rounded-[10px]" /><Wordmark className="hidden min-[420px]:flex [&>span:last-child]:hidden" /></span>
      <div className="relative">
        <label htmlFor="campus" className="sr-only">Campus</label>
        <Building2 className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-fg-subtle" strokeWidth={1.75} aria-hidden />
        <Select id="campus" className="min-h-11 py-0 pl-9 text-sm font-medium lg:min-h-10" wrapperClassName="min-w-40" value={campusId ?? ""} disabled={campuses.length === 0} onChange={(e) => setCampusId(e.target.value)}>
          {campuses.length === 0 && <option value="">Campus…</option>}
          {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {onOverview && <span className="hidden sm:inline-flex"><Badge>{semester}</Badge></span>}
      <div className="ml-auto flex items-center gap-2">
        {onOverview && dashboard.status === "ready" && <Badge tone={demo ? "warn" : "info"}>{demo ? "Demo data" : "Live data"}</Badge>}
        <ThemeMenu />
      </div>
    </header>
  );
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { role } = useApp();
  const { pathname } = useLocation();
  const onLogPage = pathname === "/session-logs";
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem(KEY, c ? "expanded" : "collapsed"); } catch { /* optional */ } return !c; });
  return (
    <div className="relative isolate min-h-screen" style={{ "--sidebar-w": collapsed ? "4.5rem" : "15rem" } as React.CSSProperties}>
      <AppBackground />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-soft">Skip to content</a>
      <aside aria-label="Sidebar" className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] overflow-hidden border-r border-line bg-surface/90 transition-[width] duration-[var(--dur-slow)] ease-out lg:block">
        <Sidebar collapsed={collapsed} onToggle={toggle} />
      </aside>
      <MobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="transition-[padding] duration-[var(--dur-slow)] ease-out lg:pl-[var(--sidebar-w)]">
        <TopBar onMenu={() => setMenuOpen(true)} />
        <main id="main" className="mx-auto max-w-[78rem] px-4 pb-32 pt-8 sm:px-6 lg:px-10 lg:pb-16">
          <div key={pathname} className="page-enter"><Outlet /></div>
        </main>
      </div>
      {canLogSessions(role) && !onLogPage && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-3 lg:hidden">
          <ButtonLink to="/session-logs" variant="primary" className="w-full"><ClipboardPen className="size-5" aria-hidden /> Log a session</ButtonLink>
        </div>
      )}
    </div>
  );
}
