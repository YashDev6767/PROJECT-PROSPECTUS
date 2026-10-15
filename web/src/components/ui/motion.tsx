/**
 * Small local motion helpers.
 *
 * `Reveal` is a CUSTOM approximation (CSS keyframe + stagger index) of the idea behind React Bits' "Fade Content". It is NOT
 * React Bits' component: that one requires gsap + ScrollTrigger, which this app deliberately avoids (a single animation library,
 * `motion`, is already present for the vendored Magic UI / Aceternity / Originkit components).
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export const prefersReducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Reveal({ index = 0, className, children, ...rest }: { index?: number; className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx("reveal", className)} style={{ "--i": index } as CSSProperties}>{children}</div>;
}
