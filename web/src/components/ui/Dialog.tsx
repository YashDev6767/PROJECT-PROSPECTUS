import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "./motion";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Modal dialog: focus moves in, Tab stays inside, Escape and the backdrop close it, focus returns on close. */
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [leaving, setLeaving] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // 140 ms exit animation, then the owner is told to unmount us (immediately with reduced motion)
  const requestClose = useCallback(() => {
    if (prefersReducedMotion()) { closeRef.current(); return; }
    setLeaving(true);
    window.setTimeout(() => closeRef.current(), 140);
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current!;
    (node.querySelector<HTMLElement>("[data-autofocus]") ?? node.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); requestClose(); return; }
      if (e.key !== "Tab") return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0]!, last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; previous?.focus(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className={`absolute inset-0 bg-scrim ${leaving ? "scrim-out" : "scrim-in"}`} onClick={requestClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`glass relative max-h-[92vh] w-full overflow-y-auto rounded-t-card bg-surface/95 p-5 shadow-pop sm:rounded-card ${leaving ? "dialog-out" : "dialog-in"} ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
          <button type="button" onClick={requestClose} aria-label="Close dialog" className="-mr-2 -mt-1 grid size-10 place-items-center rounded-xl text-fg-subtle hover:bg-surface-3"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
