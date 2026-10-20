import { cn } from "@/lib/utils";

/** PROSPECTUS mark: structured academic progression symbol on a graphite to restrained blue tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-[10px] text-white shadow-sm ring-1 ring-white/10", className)}
      style={{ background: "linear-gradient(145deg, var(--brand-a), var(--brand-b))" }}>
      <svg viewBox="0 0 24 24" className="size-[22px]" fill="none">
        <rect x="4.5" y="13" width="3.4" height="6.5" rx="1.3" fill="currentColor" opacity="0.7" />
        <rect x="10.3" y="9" width="3.4" height="10.5" rx="1.3" fill="currentColor" opacity="0.85" />
        <rect x="16.1" y="4.5" width="3.4" height="15" rx="1.3" fill="currentColor" />
      </svg>
    </span>
  );
}

/** Neutral wordmark (follows the theme's foreground colour). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span className="text-[0.9375rem] font-semibold tracking-[0.16em] text-fg">PROSPECTUS</span>
      <span className="mt-1 text-[0.6875rem] tracking-[0.08em] text-fg-subtle">MSOT · ACADEMICS</span>
    </span>
  );
}
