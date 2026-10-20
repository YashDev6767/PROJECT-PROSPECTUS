import { AlertCircle, Eye, EyeOff, Info, Loader2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AppBackground } from "../components/layout/AppBackground";
import { LogoMark, Wordmark } from "../components/layout/Brand";
import { Button, cx } from "../components/ui";
import { control, Field, Input } from "../components/ui/forms";
import { ThemeMenu } from "../components/ThemeMenu";
import { Beams } from "../components/vendor/reactbits/Beams";
import { useTheme } from "../context/ThemeContext";
import { useApp } from "../context/AppContext";
import { ApiError } from "../lib/api";

import { ChromaWaves } from "../components/chroma-waves";

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** Sign-in for the restricted evaluation environment. The session is verified by the server (signed HttpOnly cookie); this page is not what protects the API. */
export function Login() {
  const { auth, signIn } = useApp();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pwId = useId();
  const { resolved } = useTheme();

  if (auth.status === "ready" && auth.user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = { ...(email.trim() ? (emailOk(email) ? {} : { email: "Enter a valid email address" }) : { email: "Enter your email" }), ...(password ? {} : { password: "Enter your password" }) };
    setErrors(next); setFormError(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try { await signIn(email.trim(), password); navigate(from, { replace: true }); }
    catch (err) {
      const e2 = err as ApiError;
      setFormError(e2.status === 0 ? "Could not reach the server. Check your connection and try again." : e2.message);
      setPassword("");
    } finally { setBusy(false); }
  };

  const notConfigured = auth.status === "ready" && !auth.sessionLogin;
  const inputCls = "min-h-12 text-[0.9375rem] lg:min-h-12";
  return (
    <div className="login-page relative isolate flex min-h-screen flex-col">
      <AppBackground />
      {/* React Bits Beams (official WebGL2 component, vendored unchanged). A non-interactive layer between the page background and the form:
          where WebGL2 is unavailable the component draws nothing, so the static AppBackground behind it is the fallback. Light theme uses the component's own `lightMode` (dark ink on a light page); dark theme lowers the component's `opacity` so the white beams never fight the text. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-[9]" data-testid="login-beams">
        <Beams color="#ffffff" beamWidth={138} rotation={30} speed={2} glow={1.2} waveLength={290} depth={1.05} fillLight={0.25} brightness={2.95} grain={0} mouseStrength={0.9} lightMode={resolved === "light"} opacity={resolved === "light" ? 1 : 0.45} />
      </div>
      <header className="flex items-center justify-between px-5 py-5 sm:px-10 lg:px-14 lg:py-8">
        <div className="flex items-center gap-3"><LogoMark className="size-9" /><Wordmark /></div>
        <ThemeMenu />
      </header>

      <div className="mx-auto grid w-full max-w-[72rem] flex-1 items-center gap-10 px-5 pb-10 sm:px-10 lg:grid-cols-[minmax(0,1fr)_26.5rem] lg:gap-20 lg:px-14 lg:pb-16">
        {/* branding: quiet, desktop only — on phones the form comes first */}
        <section aria-label="About Prospectus" className="hidden max-w-lg lg:block">
          <div className="relative mb-6 overflow-hidden rounded-2xl border border-line bg-surface/60 p-1 shadow-soft">
            <ChromaWaves
              backgroundColor={"#ffffff"}
              color="#2563eb"
              waveFrequency={0.2}
              waveAmplitude={0.3}
              distortion={1.2}
              chromaShift={0.2}
              noiseLevel={0}
              className="h-32 w-full rounded-xl"
            >
              <div className="flex h-full flex-col justify-end p-3.5 text-fg">
                <span className="text-[0.6875rem] font-semibold tracking-wider text-accent-text uppercase">Academic Progression</span>
                <span className="text-xs font-medium text-fg-2">Structured syllabus tracking &amp; deadline intelligence</span>
              </div>
            </ChromaWaves>
          </div>
          <p className="text-sm font-medium text-accent-text">Course progression tracker</p>
          <p className="mt-2 text-[2.5rem] font-semibold leading-[1.1] tracking-tight text-fg">Know every subject will be taught before its exam.</p>
          <p className="mt-4 text-base leading-relaxed text-fg-muted">Prospectus measures the syllabus still to cover against the teaching time the timetable and academic calendar actually leave.</p>
          <SemesterRule />
          <p className="mt-6 text-xs text-fg-subtle">Mirai School of Technology</p>
        </section>

        <main className="w-full max-w-[26.5rem] justify-self-center lg:justify-self-end">
          <div className="rounded-[1.25rem] border border-line bg-surface/75 p-6 shadow-[var(--sh-pop)] backdrop-blur-xl sm:p-8">
            <h1 className="text-[1.625rem] font-semibold tracking-tight text-fg">Welcome back</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-subtle">Sign in to continue to Prospectus. Faculty, campus managers, administrators and students use the same form.</p>

            <form onSubmit={submit} noValidate className="mt-7 space-y-5">
              <Field label="Email" error={errors.email}>
                <Input type="email" name="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} autoFocus className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@msot.edu" disabled={busy} />
              </Field>
              <div className="space-y-1.5">
                <label htmlFor={pwId} className="block text-sm font-medium text-fg-2">Password</label>
                <div className="relative">
                  <input id={pwId} type={show ? "text" : "password"} name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy}
                    aria-invalid={errors.password ? true : undefined} aria-describedby={errors.password ? `${pwId}-err` : undefined} className={cx(control, inputCls, "pr-12")} />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} aria-label={show ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-fg-subtle transition-colors duration-[var(--dur-fast)] hover:bg-surface-3 hover:text-fg">
                    {show ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
                  </button>
                </div>
                {errors.password && <p id={`${pwId}-err`} role="alert" className="text-xs font-medium text-danger">{errors.password}</p>}
              </div>

              {formError && (
                <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3 text-sm text-danger"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{formError}</p>
              )}

              <Button type="submit" variant="primary" className="min-h-12 w-full text-[0.9375rem]" disabled={busy} aria-busy={busy}>
                {busy ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Signing in…</> : "Sign in"}
              </Button>
            </form>

            {notConfigured && (
              <p role="status" className="mt-6 flex items-start gap-2 border-t border-line pt-5 text-xs leading-relaxed text-fg-subtle">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>Sign-in is not configured on this server yet. The operator sets <code className="rounded bg-surface-3 px-1">AUTH_USERS</code> and <code className="rounded bg-surface-3 px-1">SESSION_SECRET</code> (see the README).</span>
              </p>
            )}
            {auth.demoHeaders && (
              <p className="mt-5 border-t border-line pt-5 text-xs leading-relaxed text-fg-subtle">
                Local development: <Link to="/" className="font-medium text-accent-text underline underline-offset-2">continue with the role preview</Link> (not a login, not secure).
              </p>
            )}
          </div>
          <p className="mt-5 text-center text-xs text-fg-faint">Restricted evaluation environment · sessions expire after a few hours</p>
        </main>
      </div>
    </div>
  );
}

/** Decorative semester ruler (aria-hidden): weekly ticks, the part already taught filled, one marker for "today". Carries no data. */
function SemesterRule() {
  const weeks = 20, done = 12;
  return (
    <div aria-hidden className="mt-10 max-w-md">
      <div className="flex h-9 items-end gap-[5px]">
        {Array.from({ length: weeks }, (_, i) => (
          <span key={i} className={cx("w-full rounded-full", i < done ? "bg-accent/70" : "bg-line-strong/70", i === done ? "h-9 !bg-accent" : (i % 5 === 4 ? "h-6" : "h-4"))} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[0.6875rem] tracking-wide text-fg-faint"><span>Semester start</span><span>Exams</span></div>
    </div>
  );
}
