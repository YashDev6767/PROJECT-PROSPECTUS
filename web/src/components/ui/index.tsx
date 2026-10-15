import { AlertTriangle, BadgeCheck, ChevronDown, CircleCheck, CircleHelp, Hourglass, Inbox, TriangleAlert, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { Link, matchPath, useLocation, type LinkProps } from "react-router-dom";
import { navItems } from "../../lib/roles";
import type { RiskStatus } from "../../lib/types";
import { useTheme } from "../../context/ThemeContext";
import SpotlightCard from "../vendor/reactbits/SpotlightCard";
import { Metric } from "./Metric";
import { BlurFade } from "../vendor/magicui/blur-fade";

import { cx } from "./cx";
export { cx };

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost";
const variants: Record<Variant, string> = {
  primary: "primary-glow bg-accent-solid text-on-accent shadow-soft hover:-translate-y-px hover:bg-accent-solid-hover hover:shadow-pop active:translate-y-0 active:bg-accent-solid-active",
  secondary: "border border-line-strong bg-surface text-fg-2 hover:border-accent/60 hover:bg-accent-soft/60 hover:text-accent-soft-fg active:bg-accent-soft",
  ghost: "text-fg-muted hover:bg-accent-soft hover:text-accent-text active:bg-accent-muted",
};
// 150 ms colour/press feedback; disabled controls neither lift nor press
const buttonBase = "inline-flex min-h-11 select-none items-center lg:min-h-10 justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export function Button({ variant = "secondary", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={cx(buttonBase, variants[variant], className)} {...rest} />;
}
export function ButtonLink({ variant = "secondary", className, ...rest }: LinkProps & { variant?: Variant }) {
  return <Link className={cx(buttonBase, variants[variant], className)} {...rest} />;
}

/* ---------- Card ---------- */
export function Card({ title, description, action, children, className, ...rest }: Omit<HTMLAttributes<HTMLElement>, "title"> & { title?: string; description?: string; action?: ReactNode }) {
  return (
    <section className={cx("surface p-6", className)} aria-label={title} {...rest}>
      {title && (
        <header className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-fg">{title}</h2>
            {description && <p className="mt-1 text-sm text-fg-subtle">{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/* ---------- Badge ---------- */
const tones = {
  neutral: "bg-surface-3 text-fg-muted",
  good: "bg-ok-soft text-ok",
  solid: "bg-ok-solid text-on-accent",
  accent: "bg-accent-soft text-accent-soft-fg",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};
export function Badge({ tone = "neutral", icon: Icon, children }: { tone?: keyof typeof tones; icon?: LucideIcon; children: ReactNode }) {
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>{Icon && <Icon className="size-3 shrink-0" aria-hidden />}{children}</span>;
}

/* ---------- Progress ---------- */
export function Progress({ value, expected, label }: { value: number; expected?: number; label: string }) {
  // grows from 0 on mount and animates (500 ms) whenever the value changes; no motion with prefers-reduced-motion
  const [w, setW] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setW(value)); return () => cancelAnimationFrame(id); }, [value]);
  return (
    <div className="relative h-2 w-full rounded-full bg-surface-3" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${w}%` }} />
      {expected !== undefined && <div className="absolute -top-0.5 h-3 w-0.5 rounded bg-fg-2" style={{ left: `${expected}%` }} title={`Planned: ${expected}%`} />}
    </div>
  );
}

/* ---------- Skeleton / states ---------- */
export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cx("shimmer rounded-xl", className)} />;

export function EmptyState({ icon: Icon = Inbox, title, children }: { icon?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="pop-in flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent-text" aria-hidden><Icon className="size-5" /></span>
      <p className="text-sm font-semibold text-fg">{title}</p>
      {children && <p className="max-w-sm text-sm leading-relaxed text-fg-subtle">{children}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry, title = "Couldn't load the dashboard" }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/30 bg-danger-soft p-5 text-danger">
      <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-5" aria-hidden /> {title}</div>
      <p className="text-sm">{message}. Check that the API is running (<code>npm run dev</code>) and try again.</p>
      {onRetry && <Button onClick={onRetry} className="bg-surface">Try again</Button>}
    </div>
  );
}

/* ---------- Stat tile ---------- */
export function StatTile({ label, value, hint, numeric }: { label: string; value: string; hint: string; /** when given, the value counts up to it (Magic UI Number Ticker) */ numeric?: { value: number; decimals?: number; prefix?: string; suffix?: string } }) {
  const { resolved } = useTheme();
  return (
    // React Bits SpotlightCard: the pointer-following light is its own effect; surface, border and shadow come from the theme tokens
    <SpotlightCard theme={resolved} spotlightColor="var(--accent)" intensity={0.22} spotlightSize={200} softness={0.8} borderGlow={0.7} flare={false}
      className="rounded-card px-5 py-4 backdrop-blur-md"
      style={{ "--spotlight-card-surface": "color-mix(in srgb, var(--surface) var(--surface-alpha), transparent)", "--spotlight-card-border": "var(--line)", "--spotlight-card-shadow": "var(--sh-soft)" } as React.CSSProperties}>
      <p className="text-xs font-medium text-fg-subtle">{label}</p>
      <p className={cx("mt-1 text-2xl font-semibold tracking-tight tabular-nums", "text-fg")}>{numeric ? <Metric {...numeric} /> : value}</p>
      <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>
    </SpotlightCard>
  );
}

/* ---------- Tabs (the selected pill slides between tabs: Motion layout animation) ---------- */
export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: Array<{ id: T; label: string }>; label: string }) {
  const group = useId();
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-xl border border-line bg-surface-3/70 p-1">
      {tabs.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx("relative min-h-9 rounded-lg px-3.5 text-sm font-medium transition-colors duration-150", value === t.id ? "text-accent-soft-fg" : "text-fg-muted hover:text-fg")}>
          {value === t.id && <motion.span layoutId={`tab-pill-${group}`} transition={{ type: "spring", stiffness: 520, damping: 40 }} className="absolute inset-0 rounded-lg bg-accent-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_35%,transparent)]" />}
          <span className="relative">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Page header ---------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const { pathname } = useLocation();
  const Icon = navItems.filter((n) => n.path !== "/" || pathname === "/").find((n) => matchPath({ path: n.path, end: n.path === "/" }, pathname) || (n.path !== "/" && pathname.startsWith(n.path)))?.icon;
  // Flat heading row (no card). The title block fades in with Magic UI's Blur Fade.
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-1">
      <BlurFade direction="up" offset={8} duration={0.5}>
        <div className="flex items-center gap-4">
          {Icon && <span className="hidden size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-text ring-1 ring-inset ring-accent/20 sm:grid" aria-hidden><Icon className="size-[22px]" strokeWidth={1.75} /></span>}
          <div>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-fg">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-fg-subtle">{subtitle}</p>}
          </div>
        </div>
      </BlurFade>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export const SampleBadge = () => <span title="Demonstration data — not real MSOT data" className="inline-flex items-center rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warn">Sample</span>;

/* ---------- Table ---------- */
export const tableClasses = {
  wrap: "surface overflow-x-auto",
  table: "w-full min-w-[40rem] text-left text-sm [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-150 [&_tbody_tr:hover]:bg-surface-2 [&_tbody_tr:last-child_td]:border-b-0",
  th: "whitespace-nowrap border-b border-line bg-surface-2 px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle",
  td: "border-b border-line/60 px-3.5 py-3 align-middle text-fg-2",
};

/* ---------- Risk badge: colour + icon + label, so statuses stay distinguishable without colour ---------- */
const riskStyle: Record<RiskStatus, { tone: keyof typeof tones; label: string; icon: LucideIcon }> = {
  ON_TRACK: { tone: "good", label: "On track", icon: CircleCheck },
  TIGHT: { tone: "warn", label: "Tight", icon: Hourglass },
  DANGER: { tone: "danger", label: "Danger", icon: TriangleAlert },
  COMPLETE: { tone: "solid", label: "Complete", icon: BadgeCheck },
  UNKNOWN: { tone: "neutral", label: "Needs data", icon: CircleHelp },
};
export const riskLabel = (r: RiskStatus) => riskStyle[r].label;
export function RiskBadge({ status }: { status: RiskStatus | null }) {
  if (!status) return <Badge>No subjects</Badge>;
  const { tone, label, icon } = riskStyle[status];
  return <Badge tone={tone} icon={icon}>{label}</Badge>;
}


/* ---------- Disclosure: show/hide secondary detail with a smooth height transition ---------- */
export function Disclosure({ summary, children, className }: { summary: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={className}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className="relative z-10 inline-flex items-center gap-1 rounded-md py-1 text-xs font-medium text-accent-text transition-colors hover:text-fg">
        <ChevronDown aria-hidden className={cx("size-3.5 transition-transform duration-200", open && "rotate-180")} /> {summary}
      </button>
      <div id={id} className={cx("grid transition-[grid-template-rows,opacity] duration-250 ease-out", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden"><div className="pt-1.5">{children}</div></div>
      </div>
    </div>
  );
}
