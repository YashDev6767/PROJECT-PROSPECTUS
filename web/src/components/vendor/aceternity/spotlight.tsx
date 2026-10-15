/**
 * VENDORED THIRD-PARTY COMPONENT — Aceternity UI: Spotlight
 * Docs:    https://ui.aceternity.com/components/spotlight
 * Source:  https://ui.aceternity.com/registry/spotlight.json
 * Licence: Aceternity License (https://ui.aceternity.com/licence): unlimited end products incl. modification; re-distributing the item's source files or building templates from it is prohibited
 * Retrieved 2026-10-16. The pristine file is kept in ./_originals/aceternity-spotlight.tsx.orig.txt (sha256 5bf5e3c43a1dab43e6e0ac56c4783132608b91a2fabdc4a61b2b961ef519093d).
 * Modifications from the official source: the unused `import React` is removed (this project uses the automatic JSX runtime and noUnusedLocals). The documented CSS (--animate-spotlight + @keyframes spotlight) is added to src/index.css.
 */
import { cn } from "@/lib/utils";

type SpotlightProps = {
  className?: string;
  fill?: string;
};

export const Spotlight = ({ className, fill }: SpotlightProps) => {
  return (
    <svg
      className={cn(
        "animate-spotlight pointer-events-none absolute z-[1]  h-[169%] w-[138%] lg:w-[84%] opacity-0",
        className
      )}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 3787 2842"
      fill="none"
    >
      <g filter="url(#filter)">
        <ellipse
          cx="1924.71"
          cy="273.501"
          rx="1924.71"
          ry="273.501"
          transform="matrix(-0.822377 -0.568943 -0.568943 0.822377 3631.88 2291.09)"
          fill={fill || "white"}
          fillOpacity="0.21"
        ></ellipse>
      </g>
      <defs>
        <filter
          id="filter"
          x="0.860352"
          y="0.838989"
          width="3785.16"
          height="2840.26"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix"></feFlood>
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="BackgroundImageFix"
            result="shape"
          ></feBlend>
          <feGaussianBlur
            stdDeviation="151"
            result="effect1_foregroundBlur_1065_8"
          ></feGaussianBlur>
        </filter>
      </defs>
    </svg>
  );
};
