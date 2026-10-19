import { PanelLeftClose, PanelLeftOpen, UserRound } from "lucide-react";
import { useId } from "react";
import { NavLink } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { navFor, navGroupOrder, roleLabels, roles, type NavGroup, type NavItem, type Role } from "../../lib/roles";
import { cx } from "../ui";
import { Select } from "../ui/forms";
import { Tooltip } from "../ui/Tooltip";
import { LogoMark, Wordmark } from "./Brand";

/*
 * Layout rule that keeps the collapsed mode from jumping: every row is a fixed 40 px-tall flex row whose first child is a fixed
 * 40 px icon slot. Collapsing only fades the label (and clips it with overflow-hidden on the rail), so icons never move.
 */
const SLOT = "grid size-10 shrink-0 place-items-center";

function NavItemLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: (() => void) | undefined }) {
  const Icon = item.icon;
  return (
    <Tooltip label={item.label} enabled={collapsed}>
      <NavLink to={item.path} end={item.path === "/"} onClick={onNavigate} aria-label={collapsed ? item.label : undefined}
        className={({ isActive }) => cx(
          "group relative flex h-10 items-center rounded-lg text-sm transition-colors duration-[var(--dur-fast)]",
          isActive ? "bg-accent-soft/70 font-medium text-fg" : "text-fg-muted hover:bg-surface-3/70 hover:text-fg",
        )}>
        {({ isActive }) => (
          <>
            {isActive && <span aria-hidden className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-accent" />}
            <span className={SLOT}><Icon strokeWidth={1.75} aria-hidden className={cx("size-[18px]", isActive ? "text-accent-text" : "text-fg-subtle group-hover:text-fg-2")} /></span>
            <span className={cx("truncate pr-3 transition-opacity duration-[var(--dur-fast)]", collapsed && "pointer-events-none opacity-0")} aria-hidden={collapsed || undefined}>{item.label}</span>
          </>
        )}
      </NavLink>
    </Tooltip>
  );
}

function RolePicker({ collapsed, onExpand }: { collapsed: boolean; onExpand?: (() => void) | undefined }) {
  const { role, setRole } = useApp();
  const selectId = useId();
  const avatar = <span aria-hidden className={cx(SLOT, "rounded-full bg-surface-3 text-fg-muted")}><UserRound className="size-[18px]" strokeWidth={1.75} /></span>;
  if (collapsed) {
    return (
      <Tooltip label={`Previewing as ${roleLabels[role]}`}>
        <button type="button" onClick={onExpand} aria-label={`Previewing as ${roleLabels[role]}. Expand the sidebar to change role`} className="flex h-10 w-full items-center rounded-lg transition-colors hover:bg-surface-3/70">{avatar}</button>
      </Tooltip>
    );
  }
  return (
    <div className="space-y-1.5 border-t border-line pt-3">
      <label htmlFor={selectId} className="flex items-baseline justify-between px-1 text-xs"><span className="font-medium text-fg-muted">Preview as</span><span className="text-fg-faint">demo, not a login</span></label>
      <Select id={selectId} aria-label="Preview as role" className="min-h-9 text-sm" value={role} onChange={(e) => setRole(e.target.value as Role)}>
        {roles.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
      </Select>
    </div>
  );
}

/** Left navigation: brand, grouped destinations, then Reports/Settings and the demo role separated at the bottom. */
export function Sidebar({ collapsed = false, onToggle, onNavigate, drawer = false }: { collapsed?: boolean; onToggle?: () => void; onNavigate?: () => void; drawer?: boolean }) {
  const { role } = useApp();
  const items = navFor(role);
  const bottom = items.filter((i) => i.group === "System");
  const groups = navGroupOrder.filter((g) => g !== "System").map((g) => [g, items.filter((i) => i.group === g)] as [NavGroup, NavItem[]]).filter(([, list]) => list.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col px-3 pb-3 pt-3">
      <div className="flex h-10 items-center">
        <span className={SLOT}><LogoMark className="size-8" /></span>
        <Wordmark className={cx("min-w-0 flex-1 pl-1 transition-opacity duration-[var(--dur-fast)]", collapsed && "pointer-events-none opacity-0")} />
      </div>

      <nav aria-label="Primary" className="-mx-3 mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-contain px-3">
        {groups.map(([group, list]) => (
          <div key={group} role="group" aria-label={group} className="flex flex-col gap-0.5">
            <p aria-hidden className={cx("h-5 px-3 text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-fg-faint transition-opacity duration-[var(--dur-fast)]", collapsed && "opacity-0")}>{group}</p>
            {list.map((item) => <NavItemLink key={item.path} item={item} collapsed={collapsed} onNavigate={onNavigate} />)}
          </div>
        ))}
        {bottom.length > 0 && (
          <div role="group" aria-label="Reports and settings" className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
            {bottom.map((item) => <NavItemLink key={item.path} item={item} collapsed={collapsed} onNavigate={onNavigate} />)}
          </div>
        )}
      </nav>

      {onToggle && (
        <div className="mt-3">
          <Tooltip label="Expand sidebar" enabled={collapsed}>
            <button type="button" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}
              className="flex h-10 w-full items-center rounded-lg text-sm text-fg-subtle transition-colors duration-[var(--dur-fast)] hover:bg-surface-3/70 hover:text-fg">
              <span className={SLOT}>{collapsed ? <PanelLeftOpen className="size-[18px]" strokeWidth={1.75} /> : <PanelLeftClose className="size-[18px]" strokeWidth={1.75} />}</span>
              <span aria-hidden className={cx("truncate transition-opacity duration-[var(--dur-fast)]", collapsed && "opacity-0")}>Collapse</span>
            </button>
          </Tooltip>
        </div>)}
      <div className="mt-3 flex min-h-[4.95rem] flex-col justify-end"><RolePicker collapsed={collapsed && !drawer} onExpand={onToggle} /></div>
    </div>
  );
}
