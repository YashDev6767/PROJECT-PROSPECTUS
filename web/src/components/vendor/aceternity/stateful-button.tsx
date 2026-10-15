/**
 * VENDORED THIRD-PARTY COMPONENT — Aceternity UI: Stateful Button
 * Docs:    https://ui.aceternity.com/components/stateful-button
 * Source:  https://ui.aceternity.com/registry/stateful-button.json
 * Licence: Aceternity License (https://ui.aceternity.com/licence): unlimited end products incl. modification; re-distributing the item's source files or building templates from it is prohibited
 * Retrieved 2026-10-16. The pristine file is kept in ./_originals/aceternity-stateful-button.tsx.orig.txt (sha256 b19e3cee5986e376b9bffb740b77747ffd3c149d150c9e36b73c395ba7cb2ef9).
 * Modifications from the official source (everything else is unchanged):
 *   - colours/shape use the emerald theme tokens instead of green-500/rounded-full
 *   - respects prefers-reduced-motion (durations 0)
 *   - onClick may resolve to `false` or throw to signal failure: the success check is then NOT shown (official version always shows it)
 *   - unused AnimatePresence import removed; onClick typed to allow async/boolean-returning handlers
 */
"use client";
import { cn } from "@/lib/utils";
import React from "react";
import { motion, useAnimate, useReducedMotion } from "motion/react";

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  className?: string;
  children: React.ReactNode;
  /** May be async; resolve to `false` (or throw) to signal failure. */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => unknown;
}

export const Button = ({ className, children, ...props }: ButtonProps) => {
  const [scope, animate] = useAnimate();
  const reduced = useReducedMotion();
  const d = (seconds: number) => (reduced ? 0 : seconds);

  const animateLoading = async () => {
    await animate(
      ".loader",
      {
        width: "20px",
        scale: 1,
        display: "block",
      },
      {
        duration: d(0.2),
      },
    );
  };

  const animateSuccess = async () => {
    await animate(
      ".loader",
      {
        width: "0px",
        scale: 0,
        display: "none",
      },
      {
        duration: d(0.2),
      },
    );
    await animate(
      ".check",
      {
        width: "20px",
        scale: 1,
        display: "block",
      },
      {
        duration: d(0.2),
      },
    );

    await animate(
      ".check",
      {
        width: "0px",
        scale: 0,
        display: "none",
      },
      {
        delay: reduced ? 1 : 2,
        duration: d(0.2),
      },
    );
  };

  const animateReset = async () => {
    await animate(".loader", { width: "0px", scale: 0, display: "none" }, { duration: d(0.2) });
  };

  // The official version always plays the success check. Here the handler's outcome decides:
  // returning `false` or throwing means "did not succeed", so the spinner is withdrawn instead.
  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    await animateLoading();
    try {
      const result = await props.onClick?.(event);
      if ((result as unknown) === false) { await animateReset(); return; }
    } catch (error) {
      await animateReset();
      throw error;
    }
    await animateSuccess();
  };

  const {
    onClick,
    onDrag,
    onDragStart,
    onDragEnd,
    onAnimationStart,
    onAnimationEnd,
    ...buttonProps
  } = props;

  return (
    <motion.button
      layout
      layoutId="button"
      ref={scope}
      className={cn(
        "primary-glow flex min-h-11 min-w-[120px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent-solid px-4 py-2 text-sm font-semibold text-on-accent ring-offset-2 ring-offset-surface transition duration-200 hover:bg-accent-solid-hover hover:ring-2 hover:ring-accent disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...buttonProps}
      onClick={handleClick}
    >
      <motion.div layout className="flex items-center gap-2">
        <Loader />
        <CheckIcon />
        <motion.span layout>{children}</motion.span>
      </motion.div>
    </motion.button>
  );
};

const Loader = () => {
  return (
    <motion.svg
      animate={{
        rotate: [0, 360],
      }}
      initial={{
        scale: 0,
        width: 0,
        display: "none",
      }}
      style={{
        scale: 0.5,
        display: "none",
      }}
      transition={{
        duration: 0.3,
        repeat: Infinity,
        ease: "linear",
      }}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="loader text-on-accent"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M12 3a9 9 0 1 0 9 9" />
    </motion.svg>
  );
};

const CheckIcon = () => {
  return (
    <motion.svg
      initial={{
        scale: 0,
        width: 0,
        display: "none",
      }}
      style={{
        scale: 0.5,
        display: "none",
      }}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="check text-on-accent"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M9 12l2 2l4 -4" />
    </motion.svg>
  );
};
