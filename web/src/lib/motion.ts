/**
 * Motion tokens — the single source of truth for timing in the app.
 * CSS reads the same numbers from the custom properties in index.css (--dur-*, --ease-out); this file mirrors them for the
 * `motion` library (used only where layout animation matters: sliding tab pills). Keep both in sync.
 *
 *   instant  80 ms   press feedback, hover colour
 *   fast    120 ms   menus, tooltips, small state changes
 *   base    180 ms   page entrance, dialogs, expanders
 *   slow    260 ms   drawers, sheets, progress bars
 *
 * Rules: opacity and transform only (never width/height/top/left), nothing animates per list item, and every duration
 * collapses to ~0 under prefers-reduced-motion (see the reduced-motion block in index.css and MotionConfig in main.tsx).
 */
export const dur = { instant: 0.08, fast: 0.12, base: 0.18, slow: 0.26 } as const;
export const ease = { out: [0.22, 1, 0.36, 1] as [number, number, number, number], inOut: [0.4, 0, 0.2, 1] as [number, number, number, number] };
export const spring = { type: "spring", stiffness: 520, damping: 42 } as const;
