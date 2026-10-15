import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";

export interface MenuItem { id: string; label: string; icon?: ReactNode; /** defined = radio-style item */ checked?: boolean; onSelect: () => void }

/**
 * Small accessible dropdown (adapted from the Origin UI dropdown pattern, no Radix): click or Enter/Space/ArrowDown opens,
 * arrows / Home / End move, Enter selects, Escape closes and returns focus, outside click and Tab close.
 */
export function Menu({ label, trigger, items, align = "right", triggerClassName }: { label: string; trigger: ReactNode; items: MenuItem[]; align?: "left" | "right"; triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const close = useCallback((returnFocus = true) => { setOpen(false); if (returnFocus) button.current?.focus(); }, []);
  const focusItem = (i: number) => refs.current[(i + items.length) % items.length]?.focus();

  useEffect(() => {
    if (!open) return;
    const start = Math.max(0, items.findIndex((i) => i.checked));
    queueMicrotask(() => refs.current[start]?.focus());
    const onDown = (e: MouseEvent | TouchEvent) => { if (!root.current?.contains(e.target as Node)) close(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const i = refs.current.findIndex((r) => r === document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); focusItem(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusItem(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusItem(0); }
    else if (e.key === "End") { e.preventDefault(); focusItem(items.length - 1); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") close(false);
  };

  return (
    <div ref={root} className="relative">
      <button ref={button} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)} onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}
        className={cx("grid size-11 place-items-center rounded-xl border border-line-strong bg-surface text-fg-2 transition-[background-color,transform] duration-150 hover:bg-surface-2 active:scale-95 lg:size-10", triggerClassName)}>
        {trigger}
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label} onKeyDown={onMenuKey}
          className={cx("pop-in absolute z-50 mt-2 w-40 rounded-xl border border-line bg-surface p-1 shadow-pop", align === "right" ? "right-0" : "left-0")}>
          {items.map((it, n) => (
            <button key={it.id} ref={(el) => { refs.current[n] = el; }} type="button" role={it.checked === undefined ? "menuitem" : "menuitemradio"} aria-checked={it.checked}
              onClick={() => { it.onSelect(); close(); }}
              className={cx("flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium transition-colors duration-100 hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none",
                it.checked ? "text-accent-text" : "text-fg-2")}>
              <span className="grid size-5 place-items-center" aria-hidden>{it.icon}</span>
              <span className="flex-1">{it.label}</span>
              {it.checked && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
            </button>))}
        </div>)}
    </div>
  );
}
