import { cn } from "@/lib/utils";

/** PROSPECTUS mark: three rising bars (syllabus progress) on an indigo-violet tile. Deliberately not green. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-[13px] text-white shadow-[0_6px_18px_-6px_rgb(99_102_241/0.7),inset_0_1px_0_rgb(255_255_255/0.28)]", className)}
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
      <span className="text-[0.9375rem] font-semibold tracking-[0.2em] text-fg">PROSPECTUS</span>
      <span className="mt-1.5 text-[0.6875rem] font-medium tracking-[0.12em] text-fg-subtle">MSOT · ACADEMICS</span>
    </span>
  );
}
