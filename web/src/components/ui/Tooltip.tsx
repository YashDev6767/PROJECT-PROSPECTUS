import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

/**
 * Tooltip for icon-only controls (the collapsed sidebar). Shown on hover and on keyboard focus, hidden on blur/Escape/leave.
 * Rendered in a portal with fixed positioning so scroll containers (overflow-y-auto) can never clip it.
 * The trigger keeps its own accessible name; the tooltip is a visual duplicate and is aria-hidden.
 */
export function Tooltip({ label, enabled = true, children }: { label: string; enabled?: boolean; children: ReactElement<Record<string, unknown>> }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  const show = () => { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ x: r.right + 10, y: r.top + r.height / 2 }); };
  const hide = () => setPos(null);
  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("scroll", hide, true); };
  }, [pos]);
  if (!enabled) return children;
  return (
    <span ref={ref} className="block" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos && createPortal(
        <span id={id} aria-hidden style={{ left: pos.x, top: pos.y }}
          className="pop-in pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-md bg-fg px-2.5 py-1.5 text-xs font-medium text-app shadow-pop">{label}</span>,
        document.body)}
    </span>
  );
}
