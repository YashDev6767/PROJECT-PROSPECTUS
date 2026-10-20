import { AlertTriangle, BadgeCheck, ChevronDown, CircleCheck, CircleHelp, Hourglass, Inbox, TriangleAlert, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import type { RiskStatus } from "../../lib/types";
import { spring } from "../../lib/motion";

import { cx } from "./cx";
export { cx };

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-accent-solid text-on-accent hover:bg-accent-solid-hover active:bg-accent-solid-active",
  secondary: "border border-line-strong bg-surface text-fg-2 hover:bg-surface-3 active:bg-surface-3",
  ghost: "text-fg-muted hover:bg-surface-3 hover:text-fg active:bg-surface-3",
};
// 120 ms colour feedback and a 1 px press; no lift, glow or shadow. Disabled controls neither react nor press.
const buttonBase = "inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-[background-color,border-color,color,transform] duration-[var(--dur-fast)] ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-50 lg:min-h-10";

export function Button({ variant = "secondary", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={cx(buttonBase, variants[variant], className)} {...rest} />;
}
export function ButtonLink({ variant = "secondary", className, ...rest }: LinkProps & { variant?: Variant }) {
  return <Link className={cx(buttonBase, variants[variant], className)} {...rest} />;
}

/* ---------- Card ---------- */
export function Card({ title, description, action, children, className, ...rest }: Omit<HTMLAttributes<HTMLElement>, "title"> & { title?: string; description?: string; action?: ReactNode }) {
  return (
    <section className={cx("surface backdrop-blur-md p-5 sm:p-6", className)} aria-label={title} {...rest}>
      {title && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
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
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", tones[tone])}>{Icon && <Icon className="size-3 shrink-0" aria-hidden />}{children}</span>;
}

/* ---------- Progress ---------- */
export function Progress({ value, expected, label }: { value: number; expected?: number; label: string }) {
  // grows from 0 on mount and animates (500 ms) whenever the value changes; no motion with prefers-reduced-motion
  const [w, setW] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setW(value)); return () => cancelAnimationFrame(id); }, [value]);
  return (
    <div className="relative h-2 w-full rounded-full bg-surface-3" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-[var(--dur-slow)] ease-out" style={{ width: `${w}%` }} />
      {expected !== undefined && <div className="absolute -top-0.5 h-3 w-0.5 rounded bg-fg-2" style={{ left: `${expected}%` }} title={`Planned: ${expected}%`} />}
    </div>
  );
}

/* ---------- Skeleton / states ---------- */
export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cx("shimmer rounded-xl", className)} />;

export function EmptyState({ icon: Icon = Inbox, title, children }: { icon?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="pop-in flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-surface-3 text-fg-subtle" aria-hidden><Icon className="size-5" /></span>
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

/* ---------- Stat: a figure with a label and a hint. No box — pages group several in a divided strip (StatStrip). ---------- */
export function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="px-5 py-4 first:pl-0">
      <p className="text-xs font-medium text-fg-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-fg">{value}</p>
      <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>
    </div>
  );
}
export function StatStrip({ children, label }: { children: ReactNode; label: string }) {
  return <div role="list" aria-label={label} className="grid grid-cols-2 divide-x divide-line border-y border-line lg:grid-cols-4 [&>*]:border-b-0 max-lg:[&>*:nth-child(n+3)]:border-t max-lg:[&>*:nth-child(n+3)]:border-line [&>*:nth-child(odd)]:max-lg:pl-0 lg:[&>*:first-child]:pl-0">{children}</div>;
}

/* ---------- Section: a heading with a hairline, instead of wrapping every group in a card ---------- */
export function Section({ title, description, action, children, className }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={className}>
      <header className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-line pb-2.5">
        <div className="min-w-0"><h2 className="text-base font-semibold tracking-tight text-fg">{title}</h2>{description && <p className="mt-0.5 text-sm text-fg-subtle">{description}</p>}</div>
        {action}
      </header>
      {children}
    </section>
  );
}

/* ---------- Tabs (the selected pill slides between tabs: Motion layout animation) ---------- */
export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: Array<{ id: T; label: string }>; label: string }) {
  const group = useId();
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-xl border border-line bg-surface-3/70 p-1">
      {tabs.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx("relative min-h-11 rounded-lg px-3.5 lg:min-h-9 text-sm font-medium transition-colors duration-150", value === t.id ? "text-accent-soft-fg" : "text-fg-muted hover:text-fg")}>
          {value === t.id && <motion.span layoutId={`tab-pill-${group}`} transition={spring} className="absolute inset-0 rounded-lg bg-accent-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_35%,transparent)]" />}
          <span className="relative">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Page header ---------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-fg sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-fg-subtle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const SampleBadge = () => <span title="Demonstration data — not real MSOT data" className="text-[11px] font-medium uppercase tracking-wide text-warn">Sample</span>;

/* ---------- Table ---------- */
export const tableClasses = {
  wrap: "surface backdrop-blur-md overflow-x-auto",
  table: "w-full min-w-[40rem] text-left text-sm [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-[var(--dur-fast)] [&_tbody_tr:hover]:bg-surface-2 [&_tbody_tr:last-child_td]:border-b-0",
  /** Same as `table`, but on phones it shrinks to the screen (the page hides secondary columns there) instead of scrolling sideways. */
  tableFit: "w-full text-left text-sm md:min-w-[40rem] [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-[var(--dur-fast)] [&_tbody_tr:hover]:bg-surface-2 [&_tbody_tr:last-child_td]:border-b-0",
  th: "whitespace-nowrap border-b border-line px-3.5 py-2.5 text-xs font-medium text-fg-subtle",
  td: "border-b border-line/60 px-3.5 py-2.5 align-middle text-fg-2",
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
        className="relative z-10 -ml-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-medium text-accent-text transition-colors hover:text-fg lg:min-h-8">
        <ChevronDown aria-hidden className={cx("size-3.5 transition-transform duration-[var(--dur-base)]", open && "rotate-180")} /> {summary}
      </button>
      <div id={id} className={cx("grid transition-[grid-template-rows,opacity] duration-[var(--dur-base)] ease-out", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden"><div className="pt-1.5">{children}</div></div>
      </div>
    </div>
  );
}
