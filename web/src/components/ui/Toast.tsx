import { CheckCircle2 } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const Ctx = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback((m: string) => setMessage(m), []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4500);
    return () => clearTimeout(t);
  }, [message]);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 lg:bottom-6">
        {message && (
          <p className="glass pop-in pointer-events-auto flex items-center gap-2 rounded-xl bg-surface/80 backdrop-blur-xl px-4 py-3 text-sm font-medium text-fg-2 shadow-lg border border-line/80">
            <CheckCircle2 className="size-4 text-ok" aria-hidden /> {message}
          </p>
        )}
      </div>
    </Ctx.Provider>
  );
}
