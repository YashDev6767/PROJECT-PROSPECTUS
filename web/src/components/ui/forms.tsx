import { AlertTriangle, ChevronDown } from "lucide-react";
import { cloneElement, useCallback, useId, useState, type InputHTMLAttributes, type ReactElement, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ApiError, type ApiConflict, type ApiWarning } from "../../lib/api";
import { Button } from "./index";
import { cx } from "./index";

// Control styling adapted from the Origin UI input pattern: quiet border, emerald 3 px focus ring, 150 ms transition.
export const control = "min-h-11 w-full lg:min-h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg-2 shadow-[0_1px_0_rgb(0_0_0/0.02)] transition-[border-color,box-shadow] duration-150 placeholder:text-fg-faint hover:border-fg-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-fg-subtle aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/25";
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(control, p.className)} />;
export function Select({ wrapperClassName, className, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return (
    <div className={cx("relative", wrapperClassName)}>
      <select {...p} className={cx(control, "appearance-none pr-9", className)} />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
    </div>
  );
}
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cx(control, "py-2", p.className)} />;

export function Field({ label, error, hint, required, children }: { label: string; error?: string | undefined; hint?: string; /** shows a visual asterisk and sets aria-required on the control */ required?: boolean; children: ReactElement<Record<string, unknown>> }) {
  const id = useId();
  const describedBy = [hint && !error ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={cx("block text-sm font-medium text-fg-2", required && "after:ml-0.5 after:text-danger after:content-['*']")}>{label}</label>
      {cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, ...(required ? { "aria-required": true } : {}) })}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-fg-subtle">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

/* ---------- submit state: validation issues, confirmation warnings, timetable conflicts ---------- */
interface SubmitState { busy: boolean; fieldErrors: Record<string, string>; formError: string | null; warnings: ApiWarning[]; conflicts: ApiConflict[] }
const idle: SubmitState = { busy: false, fieldErrors: {}, formError: null, warnings: [], conflicts: [] };

export function useSubmit() {
  const [state, setState] = useState<SubmitState>(idle);
  const run = useCallback(async (action: (confirm: boolean) => Promise<unknown>, confirm = false): Promise<boolean> => {
    setState({ ...idle, busy: true });
    try {
      await action(confirm);
      setState(idle);
      return true;
    } catch (e) {
      if (!(e instanceof ApiError)) { setState({ ...idle, formError: "Something went wrong. Please try again." }); return false; }
      if (e.code === "needs_confirmation") setState({ ...idle, warnings: e.details.warnings ?? [] });
      else if (e.code === "timetable_conflict") setState({ ...idle, conflicts: e.details.conflicts ?? [], formError: e.message });
      else if (e.code === "validation_failed") {
        const fieldErrors: Record<string, string> = {};
        for (const i of e.issues) fieldErrors[i.path] ??= i.message;
        setState({ ...idle, fieldErrors, formError: Object.keys(fieldErrors).length ? null : e.message });
      } else setState({ ...idle, formError: e.message });
      return false;
    }
  }, []);
  const reset = useCallback(() => setState(idle), []);
  return { ...state, run, reset };
}

/** Renders form-level errors, conflicts, and — for warnings — an explicit "continue anyway" step. */
export function SubmitFeedback({ state, onConfirm, confirmLabel = "Continue anyway" }: { state: Pick<SubmitState, "formError" | "warnings" | "conflicts" | "busy">; onConfirm?: () => void; confirmLabel?: string }) {
  const { formError, warnings, conflicts, busy } = state;
  if (!formError && warnings.length === 0 && conflicts.length === 0) return null;
  return (
    <div role="alert" className={cx("space-y-2 rounded-xl border p-3 text-sm", warnings.length ? "border-warn/30 bg-warn-soft text-warn" : "border-danger/30 bg-danger-soft text-danger")}>
      {formError && <p className="flex items-start gap-2 font-medium"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {formError}</p>}
      {conflicts.length > 0 && <ul className="list-disc space-y-1 pl-6">{conflicts.map((c, i) => <li key={i}>{c.message}</li>)}</ul>}
      {warnings.length > 0 && (
        <>
          <p className="flex items-start gap-2 font-medium"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Please check before saving</p>
          <ul className="list-disc space-y-1 pl-6">{warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
          {onConfirm && <Button onClick={onConfirm} disabled={busy} className="mt-1 bg-surface">{confirmLabel}</Button>}
        </>
      )}
    </div>
  );
}
