import { Button } from "./index";
import { Dialog } from "./Dialog";
import { SubmitFeedback, useSubmit } from "./forms";

/** Destructive confirmation. If the API answers "needs_confirmation" its warnings are shown before a second, explicit confirm. */
export function ConfirmDialog({ title, message, confirmLabel = "Delete", action, onClose, onDone }: {
  title: string; message: string; confirmLabel?: string;
  action: (confirm: boolean) => Promise<unknown>; onClose: () => void; onDone: () => void;
}) {
  const s = useSubmit();
  const go = async (confirm: boolean) => { if (await s.run(action, confirm)) onDone(); };
  return (
    <Dialog title={title} onClose={onClose}>
      <p className="mb-4 text-sm text-fg-muted">{message}</p>
      <SubmitFeedback state={s} onConfirm={() => go(true)} confirmLabel={`${confirmLabel} anyway`} />
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose} data-autofocus>Cancel</Button>
        {s.warnings.length === 0 && <Button variant="primary" className="bg-danger-solid hover:bg-danger-solid-hover" disabled={s.busy} onClick={() => go(false)}>{s.busy ? "Working…" : confirmLabel}</Button>}
      </div>
    </Dialog>
  );
}
