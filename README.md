# PROSPECTUS

Course progression platform for Mirai School of Technology (MSOT): academic setup (semesters, calendar, exams, batches, subjects, timetable, syllabus) today; session logging, progression and exam readiness in later phases.

**Status: Phase 14 — Release Checkpoint & Deployment Readiness.**
- Real, persisted (PostgreSQL) and fully working: Semesters, Academic Calendar, Exam Schedule, Subjects (+ syllabus), Timetable, Settings (batches, faculty), **Session Logs, per-subject progression / risk, and Exam Readiness**.
- The **Overview dashboard is live** (computed from the database) whenever the campus has academic setup; it falls back to the labelled built-in demo dataset only for a campus with no semesters or when no database is connected. The top bar says "Live data" or "Demo data".
- **Exam Readiness** (`/exam-readiness`, `GET /api/exam-readiness?campusId[&track&semesterId&asOf]`): measures each applicable subject's remaining syllabus hours against the teaching hours left before *that exam's start date* (holidays, exam weeks and cancellations respected). Features executive buffer ratio guide badges (`≥ 1.15 Healthy`, `1.00–1.14 Tight`, `< 1.00 Deficit`).
- **Academic Intelligence & Reports** (`/reports`, `GET /api/reports?type=&...` and `GET /api/reports/export?format=csv`): 5 specialized analytical views (Course Progress, Faculty Activity, Teaching Delivery, Exam Readiness, Campus/Track Rollups) with live multi-dimensional filtering and formula-injection-safe CSV exports.
- **Smart carry-forward:** when faculty log a class, unfinished work from the previous teaching session of the same subject (partly covered topics and leftover topics, from the structured topic entries — not free text) is offered in a "Carry forward from previous session" section; items are selectable, pinned to the top of the topic list, and saved through the existing log API as leftover entries. Nothing is auto-completed and no historical log is modified (`GET /api/session-logs/carry-forward?subjectId&heldOn[&excludeLogId]`).
- **Student portal (`/my-learning`, `GET /api/student/portal`):** a dedicated read-only page for students — own batch, hour-weighted progress per subject, covered and upcoming topics, classes planned in the next two weeks, upcoming exams with their scope. A student is bound by the server to ONE batch (operator-issued `batchId` on the account); the batch is never taken from the request.
- **Access:** local development uses the labelled "Preview as" role picker (spoofable headers, development only). A server-verified **restricted evaluation sign-in** (`/login`, signed HttpOnly session cookie, operator-issued accounts) exists for staging / the evaluation environment. It is not a full identity system — see "Access control & security architecture".

## Design system (light / dark)
- **Themes:** Light, Dark and System (header menu, keyboard operable). The explicit choice is saved in `localStorage` (`prospectus.theme`); System follows the OS live. An inline script in `web/index.html` applies the saved theme before first paint, so there is no flash of the wrong theme. Changing theme cross-fades for ~220 ms (skipped with reduced motion).
- **Tokens:** every colour is a semantic CSS variable defined once per theme in `web/src/index.css` (`--surface`, `--fg-muted`, `--accent`, `--warn-soft`, ... plus shadows, glass, scrim and chart colours). Tailwind utilities (`bg-surface`, `text-fg-subtle`, `border-line`, `bg-accent-solid`) read them, so components follow the theme automatically. Accent is indigo (`#4f46e5` light, `#818cf8` text/`#5850ec` solid in dark); the brand mark uses an indigo→violet gradient. Green is reserved for success/complete status. Light page `#f3f4fb`, dark page `#080a13`; a fixed `.app-bg` layer (radial light pools, Aceternity Spotlight, Magic UI Dot Pattern, grain) sits behind translucent `.surface` cards so the background stays visible on every page.
- **Contrast is tested:** `web/src/test/theme.contrast.test.ts` parses the real tokens and asserts WCAG AA for every text/background pair in both themes. Status badges never rely on colour alone (label + icon: On track ✓, Tight ⏳, Danger ⚠, Complete in solid green, Needs data ?). Calendar kinds carry a glyph (● holiday, ◆ event, ▲ exam, ■ deadline, ★ special working day).
- **Motion:** CSS keyframes only (no animation framework). 120–180 ms micro-feedback, 200–280 ms standard transitions, ≤ 400 ms entrances. Page content rises in, dashboard blocks stagger, progress bars grow, dialogs/menus pop in and out, metric numbers count up. `prefers-reduced-motion` disables all of it (numbers render final immediately).
- **Third-party components (real, vendored source — see `web/src/components/vendor/README.md`):** Magic UI *Theme Toggler* (header, byte-identical) and *Dot Pattern* (background), Aceternity UI *Spotlight* (background) and *Stateful Button* ("Save syllabus"), Originkit *Arrow Reveal Button* (the Overview's "Log a session" call to action). Pristine originals + checksums are kept in `vendor/_originals` and verified by `provenance.test.ts`. Everything else — `ui/Menu.tsx`, form-control styling — is **custom code**, not library code. Dependencies added: `motion`, `clsx`, `tailwind-merge`, `@fontsource-variable/inter`.

## Stack
React 19 + TypeScript + Vite 6 · Tailwind CSS 4 · React Router 7 · Lucide · Express 4 + TypeScript + zod · Prisma 6 + PostgreSQL · Vitest · Playwright

## Documentation
`ARCHITECTURE.md` (diagrams and layering), `SUBMISSION.md` (requirements matrix, security findings, actual test results, limitations), `JUDGING_WALKTHROUGH.md` (demo script).

## Layout
```
api/        Express API: routes (thin) → services (DB) → domain (pure logic, unit-tested); prisma/ schema, migrations, seed
web/        React app: pages, components/ui, components/layout, context, lib
e2e/        Playwright specs (own servers + own database)
scripts/    embedded-db.mjs (PostgreSQL without Docker), with-env.mjs (loads the root .env for Prisma CLI)
```

## Requirements
Node.js ≥ 20.18 and npm ≥ 10. PostgreSQL: either Docker **or** the bundled embedded server (no install needed).

## Launch
```bash
npm install                           # also generates the Prisma client (postinstall)
cp .env.example .env                  # set POSTGRES_PASSWORD / DATABASE_URL if you change the defaults

# 1) a database — pick ONE (keep it running in its own terminal)
npm run db:embedded                   # embedded PostgreSQL on :5432, data in .pgdata/ (no Docker)
# npm run db:up                       # or: Docker Compose PostgreSQL

# 2) tables + sample data (second terminal)
npm run db:deploy                     # applies api/prisma/migrations
npm run db:seed                       # sample data, safe to re-run (no duplicates)

# 3) the app
npm run dev                           # API http://localhost:4000, web http://localhost:5173
```
Without a database the app still starts: `/api/health` reports `degraded`, the dashboard (demo) works, and academic pages show a "Database not connected" panel with these commands — they never show fake data.

Other database commands: `npm run db:migrate` (create a new migration while developing), `npm run db:clear-sample` (delete only rows flagged sample).

## Tests and builds (see also: Phase 3 summary below)
```bash
npm test                  # Vitest unit/API/component tests (no database needed)
npm run typecheck
npm run test:integration  # API tests against real PostgreSQL (uses TEST_DATABASE_URL — that database is WIPED)
npx playwright install chromium   # once
npm run test:e2e          # browser tests on :5183/:4010 against TEST_DATABASE_URL (reset + re-seeded first)
npm run build             # type-check + production builds of api and web
npm start                 # run the built API only (web/dist is static: serve it with a web server / reverse proxy; for the demo use npm run dev)
```
`npm run db:embedded` creates both `prospectus` and `prospectus_test` databases. Integration and e2e tests skip themselves when `TEST_DATABASE_URL` is unset.

## What Phase 3 does (progression engine)
**Session logging** (`/session-logs`). Faculty see the classes planned for a day (default today) plus earlier classes that still need a log, tap *Log session* and record: outcome (Completed, In progress, Skipped, Merged, Cancelled), topics covered (tap *Done*, or *Partly* + total % reached), leftover topics, topics to drop from scope (*Skipped*), carry-forward work, classwork/homework status, hours (prefilled from the timetable), notes. Batch, subject, faculty, date and scheduled hours come from the timetable. Mobile-first dialog. Saving shows the effect ("Coverage 37.5% → 43.8% · buffer 1.31").
- **One log per scheduled session** (database unique constraint on timetable slot + date, plus a friendly 409). Mistakes are fixed through **Correct this log**: a correction note is mandatory, the previous version is stored in `SessionLogRevision`, the revision counter increases and any review is cleared.
- **Merged** sessions point at a primary session (same date, same faculty); they carry **0 teaching hours**, so one class for two batches counts once, while each batch still gets its own topic coverage.
- **Cancelled / Skipped** sessions never count as teaching or coverage and need a reason. A cancelled session can be **rescheduled** to a future teaching day: that adds a replacement session to the plan, and the make-up is logged later against the cancelled log (once).
- Server rules: date not in the future and inside the semester, wrong-weekday / non-teaching-day slots refused, percentages 1–100 and never lower than what the topic already has, topics must belong to the subject, extra sessions need their hours.
- **Ownership (demo mode):** faculty must pick *who they are* ("Acting as", sent as `X-Demo-Faculty`) and can only log or correct subjects assigned to that person (403 `not_your_subject`); admins/campus managers may log on behalf; students cannot see session logs; only admins/campus managers can *review* logs. This identity is **not verified** — anyone can send any header. Real authentication is Phase 4.

**Planned schedule** (`api/src/domain/schedule.ts`). Sessions are *derived* from timetable + working-day rules + holidays + special working days + exam periods (regular classes are suspended during exam periods that apply to the batch). Nothing is stored, so recalculating after any change can never duplicate sessions. Past planned dates stay comparable: the original plan is always recomputed from the semester start, while remaining work is re-laid on the sessions that are left.

**Progression** (`api/src/domain/progress.ts`, one plain-data entry point `subjectEngine.ts`), all in planned **hours**, not topic counts:

| Quantity | Definition |
|---|---|
| Hours in scope | Σ planned hours of topics not marked Skipped |
| Covered hours | Σ planned hours × completion % (done = 100%, in progress = its %) |
| Remaining hours | max(0, in scope − covered) |
| Coverage % | covered ÷ in scope × 100 (null when nothing is in scope) |
| Available hours | hours of still-unlogged planned sessions (incl. make-ups) from the reference date through the last teaching day |
| Buffer ratio | available ÷ remaining, **rounded to 2 dp before classifying** |
| Pace vs plan | covered − min(in scope, planned hours of sessions dated before the reference date) |
| Overdue topics | planned finish (original plan) before the reference date and not fully covered |
| Projected completion | date on which cumulative remaining sessions reach the remaining hours (may be after the deadline; null if it never fits) |

A topic's state is the **latest** log entry for it (by date, then creation), never a running sum — repeated or merged logs cannot double count. **Risk:** COMPLETE (remaining 0) · ON TRACK (buffer ≥ 1.15) · TIGHT (≥ 1.00) · DANGER (< 1.00) · NEEDS DATA (no hours in scope, or no deadline). Low progress is *not* DANGER if capacity before the deadline still covers the work. Batch, track and campus status = the **worst** subject (order DANGER, TIGHT, NEEDS DATA, ON TRACK, COMPLETE), never an average. Every subject page explains *why* in plain language.

**Deadline** per subject = start of the earliest applicable End-term exam (configurable type); classes count until the day before. If none is scheduled the semester end is used and the page says so. Thresholds, time zone and deadline type are configurable (`.env.example`).

### Worked example (hand-checked, asserted in `progress.reference.test.ts` and the PostgreSQL integration test)
Topics T1–T4 of 4 h (16 h). Timetable Mon 09:00–10:00 (1 h), Wed 09:00–10:30 (1.5 h); semester starts Mon 7 Sep 2026, end-term starts Mon 9 Nov (last class 8 Nov); reference date 5 Oct. Sessions before 5 Oct = 4×1 + 4×1.5 = **10 h planned**; sessions 5 Oct–8 Nov = 5×1 + 5×1.5 = **12.5 h available**.

| Case | Covered | Remaining | Coverage | Buffer | Pace vs plan | Status | Projected finish |
|---|---|---|---|---|---|---|---|
| A: T1 100%, T2 50% | 6 h | 10 h | 37.50% | 12.5÷10 = **1.25** | 6−10 = **−4.00 h** | ON TRACK (behind plan, still safe) | 28 Oct |
| B: T1 100%, T2 25% | 5 h | 11 h | 31.25% | 12.5÷11 = 1.136 → **1.14** | −5.00 h | TIGHT | 2 Nov |
| C: T1 50% | 2 h | 14 h | 12.50% | 12.5÷14 = 0.893 → **0.89** | −8.00 h | DANGER (short by 1.5 h) | 11 Nov (after deadline) |

Variations also asserted: one Monday cancelled → 11.5 h → buffer exactly 1.15 (ON TRACK); one Wednesday cancelled → 11 h → 1.10 (TIGHT); a make-up restores 12.5 h; a holiday on 12 Oct → 11.5 h; a mid-term week 26–30 Oct removes Mon 26 (1 h) + Wed 28 (1.5 h) → 10 h → 1.00 (TIGHT); a Friday 1 h slot → 17.5 h available and 14 h planned so far (pace −8.00).

### Phase 3 data model (migration `20261016000000_session_logs_and_progression`)
`SessionLog` reshaped (existing rows are migrated, not dropped: DELIVERED→COMPLETED, MISSED/PLANNED→SKIPPED, hours→actualHours, topics text→notes; verified against a scratch database), new `SessionTopicEntry` (COVERED / LEFTOVER / SKIPPED per topic) and `SessionLogRevision`; enums `SessionOutcome`, `WorkStatus`, `TopicEntryKind`. Constraints include unique (timetable entry, date), unique make-up link, and CHECKs (percent 1–100 for COVERED, hours 0–24, merge/reschedule only on the matching outcome). Coverage, risk and projections are never stored. Topics with session history cannot be deleted from a syllabus (mark them Skipped in a log instead).

### Phase 3 API
`GET /session-logs/schedule?date&campusId[&track&facultyId]`, `GET /session-logs/pending?campusId[&days&facultyId]`, `GET/POST /session-logs`, `GET/PATCH /session-logs/:id` (PATCH = correction, `correctionNote` required), `POST /session-logs/:id/review`, `GET /progression?campusId[&track&semesterId&batchId&asOf]` (subjects + batch/track/campus roll-ups), `GET /exam-readiness?campusId[&track&semesterId&asOf]`, `GET /progression/subjects/:id[?asOf]` (full explanation), `GET /dashboard` (now live when possible). `asOf=YYYY-MM-DD` is a what-if date; logs dated after it are ignored.

## What Phase 2 does
- **Semesters** (admin): create/edit/activate/deactivate/delete; Mirai or University track; campuses HI-Tech, Ratnam, RGIB, JUJ; end ≥ start enforced; overlaps for the same campus + track produce a warning you must confirm; status (Upcoming / Active / Completed) is derived from dates + activation; activating one asks before deactivating another; each semester carries a Saturday rule.
- **Academic Calendar**: month grid and agenda, month navigation, legend, per-day text description (not colour alone). Entry categories: Holiday, Event, Exam, Academic Deadline, Special Working Day; campus-specific or institution-wide; single day or date range.
- **Working-day rules** (`api/src/domain/calendar.ts`, the only place they are computed): special working day → working; else holiday → off; else Sunday → off; else Saturday per rule (All / None / 2nd & 4th); else working. Events, exams and deadlines never change working status.
- **Exam Schedule**: Sessionals, Mid-term, PUT, End-term per semester, optional batch scope and notes; must fall inside the semester; overlapping exams (respecting batch scope) warn and need confirmation. Exams also appear on the calendar.
- **Subjects**: subject = code + name taught to one batch, with faculty and optional planned hours. Weekly scheduled hours and semester capacity are **derived** from the timetable + calendar, never stored. Reassigning faculty/batch re-checks timetable clashes.
- **Timetable**: weekly view by batch or faculty; end after start; faculty and batch clashes are refused with messages like "Faculty One already teaches Subject One to Batch A on Monday 09:00–10:00." Back-to-back classes are allowed.
- **Syllabus**: units and topics in explicit order, planned hours, optional exam scope; add/edit/remove/reorder, save in one transaction (ids stay stable for Phase 3 progress tracking); CSV export and import with a row-by-row preview — an invalid file imports nothing.
- **Settings**: batches, faculty, database status, sample-data and access notes.
- CSV exports: calendar, exams, subjects, timetable, syllabus (cells starting with `= + - @` are escaped).

### Syllabus CSV format
`unit,topic,planned_hours,exam_scope` — `exam_scope` optional (`SESSIONAL`, `MID_TERM`, `PUT`, `END_TERM`). Row order = unit/topic order; rows with the same unit title are grouped. Max 2000 rows / 1 MB. Importing over an existing syllabus requires confirmation; topics with the same title keep their identity.

## API
All under `/api`. Errors are JSON `{ error, message, issues?, warnings?, conflicts?, blockers? }` with 400 validation, 401 no demo role, 403 forbidden, 404, 409 (duplicate / `needs_confirmation` / `timetable_conflict` / `in_use`), 413, 503 `database_unavailable`.

| Area | Endpoints |
|---|---|
| Phase 1 | `GET /health`, `GET /dashboard?campusId=`, `GET /meta` |
| Semesters | `GET/POST /semesters`, `PATCH/DELETE /semesters/:id`, `POST /semesters/:id/activate`, `POST /semesters/:id/deactivate` |
| Calendar | `GET /calendar/month?campusId&track&month=YYYY-MM`, `POST /calendar/entries`, `PATCH/DELETE /calendar/entries/:id`, `GET /calendar/export.csv?campusId` |
| Exams | `GET/POST /exams`, `PATCH/DELETE /exams/:id`, `GET /exams/export.csv` |
| Batches / faculty | `GET/POST /batches`, `PATCH/DELETE /batches/:id`, `GET/POST /faculty`, `PATCH/DELETE /faculty/:id` |
| Subjects | `GET/POST /subjects`, `PATCH/DELETE /subjects/:id` (`?confirm=true` to cascade), `GET /subjects/export.csv?semesterId` |
| Timetable | `GET/POST /timetable`, `PATCH/DELETE /timetable/:id`, `GET /timetable/export.csv` |
| Syllabus | `GET/PUT /subjects/:id/syllabus`, `GET .../export.csv`, `POST .../import/preview`, `POST .../import` |

Writes that need confirmation return 409 `needs_confirmation` with `warnings`; resend with `confirmOverlap` / `confirm` / `confirmReplace` to proceed. Nothing is changed by the first call.

## Data model (api/prisma/schema.prisma, migration `20261015192236_init_academic_setup`)
Added in Phase 2: `Semester` (extended), `Batch`, `Faculty`, `Subject` (reshaped), `SyllabusUnit`, `SyllabusTopic`, `TimetableEntry`, `CalendarEntry`, `Exam`, enums `Track`, `SaturdayRule`, `CalendarCategory`, `ExamType`. Kept: `Campus` (now keyed by stable slugs `hi-tech`, `ratnam`, `rgib`, `juj` and pre-filled by the migration), `User`, `SessionLog`. Phase 1 never persisted `Semester`/`Subject` rows, so reshaping them lost no data.
Derived, not stored: a batch's campus/track (from its semester), an exam's campus/track, a timetable row's batch/faculty (from its subject), all scheduled hours. Deletes are restrictive and the API explains what blocks them. `isSample` flags demonstration rows.
Phase 3/4 hooks: `Subject` is the unit session logs attach to (`SessionLog.subjectId`); syllabus topics have stable ids, order, hours and `examScope`.

## Sample data
`npm run db:seed` adds clearly flagged sample rows for all four campuses and both tracks (10 semesters incl. one completed and one upcoming, batches, subjects, conflict-free timetables, calendar entries, exams, 5-unit syllabi). Names, codes, faculty and topics are **placeholders, not real MSOT courses or people**; the UI marks them "Sample". Seeding uses deterministic ids, so re-running inserts nothing new. `npm run db:clear-sample` removes only flagged rows.

## Access control & security architecture
Three layers, from least to most trustworthy:
1. **Demo role headers (development only).** The "Preview as" picker sends `X-Demo-Role` / `X-Demo-Faculty`; the API enforces the capability matrix on them (`api/src/domain/permissions.ts`, `api/src/http/errors.ts`). Anyone can send any header, so this is **not security**. It is **on by default in development and off when `NODE_ENV=production`**; `ALLOW_DEMO_HEADERS=true|false` overrides it (strict boolean parsing: `"false"` really means false, anything unrecognised stops the server). Never enable it on a publicly reachable server.
2. **Restricted evaluation sign-in (server-verified).** `/login` posts to `POST /api/auth/login`. Accounts exist only in the operator's environment (`AUTH_USERS`, JSON; passwords stored as scrypt hashes made with `npm run auth:hash`) — no sign-up, no database table, nothing in the repository. A successful sign-in sets an HttpOnly, SameSite=Lax (Secure in production) cookie holding a payload signed with HMAC-SHA256 (`SESSION_SECRET`, 32+ characters, required); the role and faculty identity are read from that signed cookie. A valid session always overrides demo headers (a signed-in student cannot elevate with `X-Demo-Role: admin`), wrong-password and unknown-email answers are identical, repeated failures are rate-limited (8 per 15 min per client+email), sessions expire after `SESSION_TTL_HOURS` (default 8) and logout clears the cookie. Verified by `api/src/auth.test.ts`, `api/src/auth.int.test.ts`, `web/src/test/login.test.tsx` and `e2e/login.spec.ts`.
   - **Student accounts** carry an operator-issued `batchId` (`npm run auth:add -- student@example.edu student 'passphrase' <batchId>`). `GET /api/student/portal` serves only that batch: asking for another batch is `403 forbidden_batch`, a student account without a (resolvable) batch has no campus and is refused everywhere with `403 no_campus_assigned` (never broad access; `409 no_batch_assigned` only appears in development demo mode), and there is no write endpoint under `/api/student`. Staff roles must name the batch they want to look at. In development demo mode a previewing student picks a batch via the labelled `X-Demo-Batch` header (spoofable, development only).
3. **Campus isolation (server-side, all data routes).** Every authenticated caller has a *campus scope* resolved on the server from trusted facts, never from the request (`api/src/http/scope.ts`):

   | Role | Scope | Provisioned by |
   |---|---|---|
   | Admin / Program Manager | **all campuses**, by role (the established product design: organization-wide administration) — or only the listed campuses if the account has `campusIds` | `AUTH_USERS` (`campusIds` optional) |
   | Campus Manager | the account's `campusIds`; **none configured = no access** | `AUTH_USERS` (`campusIds` required) |
   | Faculty | the campus of the faculty record the account is linked to (looked up in the database); unknown/unlinked = no access | `facultyId` in `AUTH_USERS` |
   | Student | the campus of the batch the account is linked to; unknown/unlinked = no access (the portal additionally serves only that batch) | `batchId` in `AUTH_USERS` |
   | Development demo headers | `X-Demo-Campus` if sent, otherwise **all** (spoofable, development only, never honoured in production); an invalid campus = no access | — |

   An empty scope gets `403 no_campus_assigned` on every route except `/health`, `/meta` and sign-in. Reads of lists and exports are restricted **inside the database query**; a campus named in a query/body that is outside the scope is `403 forbidden_campus`; a record reached by id on another campus is `404` (indistinguishable from a missing one); creating or moving a record onto another campus, or referencing another campus's semester/batch/faculty/subject, is refused and creates nothing; institution-wide calendar entries are readable by everyone and changeable only with organization-wide scope. Reports and exports without a `campusId` default to the caller's single campus, a multi-campus manager must choose one (`400`), and only organization-wide admins get the all-campus rollup. Provisioning examples: `npm run auth:add -- manager@example.edu campus_manager 'passphrase' rgib`, `... faculty ... <facultyId>`, `... student ... <batchId>`, `... admin ...` (organization-wide) or `... admin ... 'passphrase' rgib,juj` (limited). Changing someone's campus = edit their `campusIds` / linked faculty or batch and restart the API. Verified by `api/src/campus.int.test.ts` (43 tests on two seeded campuses, response contents and database side effects, plus a guard that fails if any route is not classified).
4. **Not provided.** No password reset, SSO/OAuth, MFA, account management UI, per-user audit trail (logs record the role and faculty), or CSRF tokens beyond SameSite + JSON-only writes. **Production read gate:** when demo headers are off (production), every `/api` route except `/health`, `/meta` and `/auth/*` requires a signed-in session — including every CSV export — and writes need the role's capability. **Remaining limits of campus isolation:** (a) *within* a campus it is role-based, not batch-based: a student or faculty member can still read that campus's other batches, subjects, timetables, exams and faculty names through the general endpoints (only `/my-learning` is limited to one batch); (b) `/api/meta` is public and lists the four campuses' names; (c) development demo mode is unscoped unless `X-Demo-Campus` is sent; (d) a faculty/student scope costs one extra database lookup per request and is read live (a changed link takes effect immediately, an `AUTH_USERS` change needs an API restart); (e) a faculty record belongs to one campus, so one account cannot span campuses. Logout revokes the presented token server-side (in memory; cleared by a restart). Treat the deployment as a restricted evaluation environment, not a public service.

### Safe demo access procedure
- **Try the sign-in page locally (1 minute):** `npm run auth:add -- admin@example.edu admin 'a long passphrase'` writes a hashed account and a session secret into your gitignored `.env`; restart `npm run dev` and open <http://localhost:5173/login>. The sidebar also links to it ("Open the sign-in page" / "Sign in with an account"). The role picker keeps working in development.
- **Local (laptop, judges at your screen):** nothing to configure — use the "Preview as" picker. Do not expose the dev server to the internet.
- **Hosted / shared evaluation:** set `NODE_ENV=production`, leave `ALLOW_DEMO_HEADERS` unset (or `false`), then create accounts:
  ```bash
  npm run auth:hash -- 'a long passphrase for the admin'      # prints scrypt:...  (do this per account)
  # .env (never commit it):
  AUTH_USERS=[{"email":"judge.admin@example.edu","role":"admin","name":"Judge (admin)","passwordHash":"scrypt:..."},{"email":"judge.student@example.edu","role":"student","passwordHash":"scrypt:..."}]
  SESSION_SECRET=<32+ random characters, e.g. `openssl rand -hex 32`>
  ```
  Share each passphrase out of band. With no `AUTH_USERS` the login page says sign-in is not configured and writes stay refused (401) — it never falls back to demo headers in production.

## Deployment prerequisites & environment
- **Node.js:** >= 20.18
- **PostgreSQL:** >= 14
- **Required Environment Variables:**
  - `DATABASE_URL`: Production PostgreSQL connection string with SSL (`?sslmode=require`).
  - `NODE_ENV`: Set to `production`.
  - `CORS_ORIGIN`: Set to the production domain(s) (e.g., `https://prospectus.msot.edu.in`).
  - `APP_TIME_ZONE`: Defaults to `Asia/Kolkata`.
  - `ALLOW_DEMO_HEADERS`: Leave unset or `false` outside local development; `true` only for a password-gated internal network.
  - `AUTH_USERS`, `SESSION_SECRET` (32+ chars), optional `SESSION_TTL_HOURS`: the restricted sign-in (see above). `VITE_API_BASE_URL` is only needed if the web build is served from a different origin than the API (then also add that origin to `CORS_ORIGIN`; cookies are sent with credentials).
- **Reverse Proxy:** Configure Nginx or Caddy with HTTPS/TLS termination, HSTS, and rate limiting.

## Database backup, migration & rollback procedures
- **Backup before migration:** Always take a PostgreSQL logical dump before applying migrations:
  ```bash
  pg_dump -Fc -v -d "$DATABASE_URL" -f "prospectus_backup_$(date +%Y%m%d_%H%M%S).dump"
  ```
- **Deploying migrations:** Run `npm run db:deploy` (invokes `prisma migrate deploy`, applying only unapplied migrations safely).
- **Rollback strategy:** If a migration fails, restore from the snapshot:
  ```bash
  pg_restore -c -v -d "$DATABASE_URL" "prospectus_backup_YYYYMMDD_HHMMSS.dump"
  ```

## Known limitations
- Phase 3/14: a timetable edit mid-semester re-plans *past* sessions too (the original plan is recomputed from the current timetable); logged sessions keep a snapshot of their own slot and hours. There is no log delete (correct or cancel instead) and the date/slot of a log cannot be edited.
- The single deadline per subject means a missed sessional/mid-term is not flagged separately (the Exam Readiness page measures each exam separately); topics with no exam tag are left out of exam-scoped readiness.
- Sample session logs stop at 15 Oct 2026; as real time passes without new logs the sample subjects drift toward Tight/Danger (use the *As of* date on a subject to look back).
- Authentication is the restricted evaluation sign-in described above, not an identity platform; reads are open only in development. OAuth/SSO would be required for a public launch. Campus isolation is enforced server-side (see Access control), with the limits listed there.
- Carry-forward looks only at the previous *teaching* session (cancelled and skipped classes are passed over) and only offers work that session left unfinished; a partly covered topic the faculty member does not keep selected is not offered again after the next class. Logs on the same date as the class being logged are not considered.
- Calendar entries have campus scope but no track; the track selector only picks which semester's Saturday rule applies. If no semester covers a month, "2nd & 4th Saturdays" is used and the page says so.
- Timetable classes are Monday–Saturday and weekly (no per-week exceptions). A subject belongs to one batch; to teach it to another batch add it again (syllabus can be copied via CSV export/import).
- Semester capacity assumes the weekly timetable runs on every working day of the semester; holidays, special working days and **exam periods do suspend classes** (they are subtracted from available hours).
- **No scheduled reminders or Campus-Manager escalation.** Missed or unlogged sessions are surfaced on screen ("Log pending", unlogged-session counts, the Session Logs queue and reports) but nothing is emailed, messaged or escalated automatically.
- **Imports:** only the syllabus has CSV import (with row-level validation). Semesters, calendar, exams, batches, subjects, faculty and timetables are entered through the UI; most lists export to CSV.
- The student portal is per **batch**, not per student: there is no student entity or roster, so it shows batch-level progress and cannot show an individual student's marks or attendance. A student account is linked to its batch by the operator in `AUTH_USERS`. The other pages students can open (Overview, Subjects, Timetable, Exam Schedule, Exam Readiness, Calendar) remain read-only and are limited to the student's campus, but not to the student's batch.
- Calendar CSV import is not provided (export only); syllabus has full CSV import.
- Hours are stored as floating-point numbers (fine for 0.25-hour steps).

## Dashboard and timetable integrity rules
- `GET /api/dashboard` returns **503 `dashboard_unavailable`** when the live computation fails — it no longer falls back to demo numbers. The labelled demo dataset is served only when no database is configured or the campus has no semesters at all. Live payloads carry `state` (`ready`, `no_active_semester`, `no_subjects`, `needs_data`); only `ready` makes an empty at-risk list mean "nothing is at risk".
- `DELETE /api/timetable/:id` returns **409 `in_use`** (`blockers.sessionLogs`) while session logs reference the slot, so historical plans and pace never change retroactively.
