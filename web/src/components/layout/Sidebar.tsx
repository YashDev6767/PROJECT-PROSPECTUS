import { PanelLeftClose, PanelLeftOpen, UserRound } from "lucide-react";
import { motion } from "motion/react";
import { useId } from "react";
import { NavLink } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { navFor, navGroupOrder, roleLabels, roles, type NavGroup, type NavItem, type Role } from "../../lib/roles";
import { cx } from "../ui";
import { Select } from "../ui/forms";
import { LogoMark, Wordmark } from "./Brand";

function NavItemLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: (() => void) | undefined }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.path} end={item.path === "/"} onClick={onNavigate} title={collapsed ? item.label : undefined} aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) => cx(
        "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium outline-offset-0 transition-colors duration-150",
        collapsed && "justify-center px-0",
        isActive ? "text-fg" : "text-fg-muted hover:bg-surface-3/70 hover:text-fg",
      )}>
      {({ isActive }) => (
        <>
          {/* the highlight slides between items (Motion layout animation) */}
          {isActive && <motion.span layoutId="nav-active" transition={{ type: "spring", stiffness: 520, damping: 42 }} className="absolute inset-0 rounded-xl bg-accent-soft ring-1 ring-inset ring-accent/25" />}
          {isActive && <motion.span layoutId="nav-bar" transition={{ type: "spring", stiffness: 520, damping: 42 }} className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-accent" />}
          <Icon strokeWidth={1.75} aria-hidden className={cx("relative size-[18px] shrink-0 transition-colors duration-150", isActive ? "text-accent-text" : "text-fg-subtle group-hover:text-fg-2")} />
          <span className={cx("relative truncate", collapsed && "sr-only")}>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function ProfileCard({ collapsed, onExpand }: { collapsed: boolean; onExpand?: (() => void) | undefined }) {
  const { role, setRole } = useApp();
  const selectId = useId();
  const avatar = (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text ring-1 ring-inset ring-accent/25"><UserRound className="size-[18px]" strokeWidth={1.75} /></span>
  );
  if (collapsed) {
    return (
      <button type="button" onClick={onExpand} title={`Previewing as ${roleLabels[role]} — expand to change`} aria-label={`Previewing as ${roleLabels[role]}. Expand the sidebar to change role`}
        className="mx-auto grid size-11 place-items-center rounded-xl transition-colors hover:bg-surface-3/70">{avatar}</button>
    );
  }
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-3">
      <div className="flex items-center gap-3">
        {avatar}
        <div className="min-w-0">
          <label htmlFor={selectId} className="block text-sm font-medium text-fg">Preview as</label>
          <p className="truncate text-xs text-fg-subtle">Demo role · not a login</p>
        </div>
      </div>
      <Select id={selectId} aria-label="Preview as role" className="mt-3 text-sm" value={role} onChange={(e) => setRole(e.target.value as Role)}>
        {roles.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
      </Select>
    </div>
  );
}

/** Left navigation: brand, grouped destinations, and a bottom section with Settings and the demo role. */
export function Sidebar({ collapsed = false, onToggle, onNavigate, drawer = false }: { collapsed?: boolean; onToggle?: () => void; onNavigate?: () => void; drawer?: boolean }) {
  const { role } = useApp();
  const items = navFor(role);
  const bottom = items.filter((i) => i.group === "System");
  const groups = navGroupOrder.filter((g) => g !== "System").map((g) => [g, items.filter((i) => i.group === g)] as [NavGroup, NavItem[]]).filter(([, list]) => list.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 p-3">
      <div className={cx("flex items-center gap-3 px-1.5 pt-1.5", collapsed && "flex-col gap-2 px-0")}>
        <LogoMark />
        {!collapsed && <Wordmark className="min-w-0 flex-1" />}
        {onToggle && (
          <button type="button" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-subtle transition-[background-color,color,transform] duration-150 hover:bg-surface-3 hover:text-fg active:scale-95">
            {collapsed ? <PanelLeftOpen className="size-[18px]" strokeWidth={1.75} /> : <PanelLeftClose className="size-[18px]" strokeWidth={1.75} />}
          </button>
        )}
      </div>

      <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden px-0.5">
        <div className="flex flex-col gap-5">
          {groups.map(([group, list]) => (
            <div key={group} role="group" aria-label={group} className="flex flex-col gap-0.5">
              {collapsed ? <div className="mx-3 mb-1 h-px bg-line" aria-hidden /> : <p className="px-3 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-fg-faint">{group}</p>}
              {list.map((item) => <NavItemLink key={item.path} item={item} collapsed={collapsed} onNavigate={onNavigate} />)}
            </div>
          ))}
        </div>
        {bottom.length > 0 && (
          <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
            {bottom.map((item) => <NavItemLink key={item.path} item={item} collapsed={collapsed} onNavigate={onNavigate} />)}
          </div>
        )}
      </nav>

      <ProfileCard collapsed={collapsed && !drawer} onExpand={onToggle} />
    </div>
  );
}
