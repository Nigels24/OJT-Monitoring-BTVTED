# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

Two independent npm projects, no workspace root — always `cd` into one of them before running anything:

- `app/server` — NestJS 11 API (port 3000), Prisma 6 + PostgreSQL (Supabase; `DATABASE_URL` pooled + `DIRECT_URL` direct).
- `app/client` — Next.js 16 App Router + React 19, Tailwind v4, Redux Toolkit Query.

`SYSTEM-FLOW.md` (repo root) traces the request/data mechanics — read it after this file when tracing a bug across layers. It predates training assignments, notifications, journals, the document checklist, and evaluation-template versioning; where it disagrees with this file, this file wins.

Section numbers below (§1–§12) are cited from code comments and `schema.prisma` (e.g. "CLAUDE.md §6") — **do not renumber them**; append new sections instead.

## Commands

```bash
# server (app/server)
npm run start:dev                    # watch mode, http://localhost:3000
npm run build && npm run start:prod
npm run lint                         # eslint, check only
npm run lint:fix                     # eslint --fix
npm test                             # jest, rootDir src, *.spec.ts — five spec files so far, all pure rules or a stubbed-Prisma service (--passWithNoTests)
npx jest path/to/file.spec.ts        # single unit test file (or: npx jest -t "<test name>")
npm run test:e2e                     # test/app.e2e-spec.ts — boots the real AppModule, so it needs .env and a reachable DB
npm run seed                         # idempotent; see below
npm run reset-coordinator            # CLI-only recovery for a locked-out coordinator: [-- '<password>' [<username|email>]]

npx prisma migrate dev --name <desc> # create + apply a migration
npx prisma generate                  # REQUIRED after clone/schema change — see below

# client (app/client)
npm run dev -- -p 3001               # MUST be 3001; see CORS note in §3
npm run build
npm run lint
```

The client has **no test setup** (no test runner in `devDependencies`, no test files) and no README.

`npm run seed` never overwrites or deletes. It creates `coordinator` / `coordinator@wphi.edu` / `admin123` (no forced password change), a second coordinator `coordinator2` with a **generated password printed once**, the `BTVTED-CHS` course with its year-4 requirement (486 hours is a flagged placeholder) and blocks assigned to those coordinators, and the six `DocumentRequirement` rows. `SEED_COORDINATOR_*` env vars override the defaults.

### Two things that bite on a fresh clone

- `app/server/generated/prisma` is **gitignored** (custom `prisma-client` generator output, not `node_modules/@prisma/client`). Nothing compiles until `npx prisma generate` runs. Import types from `../../generated/prisma/client`.
- `app/server/.env` is gitignored (template: `.env.example`) and holds `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The server **refuses to boot** without `JWT_SECRET` (`src/auth/jwt.constants.ts` throws; there is deliberately no dev fallback secret). Env is loaded via `import 'dotenv/config'` in `main.ts`, `app.module.ts`, `prisma.config.ts`, and the scripts — there is no `@nestjs/config`.

## Architecture

### 1. Modules actually wired

`app.module.ts` imports: `AuthModule`, `PrismaModule`, `CoordinatorModule`, `EstablishmentModule`, `StudentModule`, `SupervisorModule`, `MessagesModule`, `EvaluationTemplateModule`, `CourseModule`, `NotificationModule`, `JournalModule`, `DocumentModule`, `WeeklyTaskModule`, `ConcernModule`, `AnnouncementModule`.

- There is no standalone `attendance` or `evaluation` module — that logic lives in the `student`/`supervisor`/`coordinator` controllers and services. Placements (`TrainingAssignment`, §10) live in `CoordinatorService`. Credentials live in `StudentService`.
- `JournalModule` and `DocumentModule` have **one service and one controller per role** (`student-*.controller.ts`, `coordinator-*.controller.ts`, `supervisor-journal.controller.ts`), each mounted under that role's URL prefix (`/student/journals`, `/coordinator/documents`, …). `CourseModule` exposes `/courses`, `/blocks`, `/course-requirements`.
- `PrismaService` exposes the client as a `.client` property rather than extending `PrismaClient`, so all queries read `this.prisma.client.<model>`.
- `src/common/` holds the cross-module rules. Before writing a `where` clause, date comparison, hours sum, or upload check, look there first — most are single-source-of-truth helpers that exist precisely because two hand-written copies drifted.

### 2. Auth and ownership

JWT bearer tokens only. `AuthService.login(identifier, password)` accepts a **username or an email** (usernames may never contain `@`, which keeps the namespaces apart) and signs `{ sub, email, role, mustChangePassword }`. `JwtStrategy.validate` maps it onto `req.user` as `{ userId, email, role, mustChangePassword }` — **handlers read `req.user.userId`, not `req.user.id`**; type the request as `AuthedRequest` (`src/auth/authed-request.ts`), not `any`.

**Session lifetime is a 30-minute sliding window, not a refresh-token flow.** The access token itself lives `SESSION_IDLE_MINUTES` (30); `POST /auth/refresh` trades a still-valid token for a fresh one, re-reading the user row so a role/password change is not carried forward stale. There is no refresh-token table.

**Forced password change.** `User.mustChangePassword` defaults to `true`, so every coordinator-issued account (temporary passwords come from `src/common/temp-password.ts` and are returned to the coordinator exactly once) is born needing a change. `PasswordChangeGuard` is registered globally via `APP_GUARD` and 403s with `{ code: "PASSWORD_CHANGE_REQUIRED" }` on every route not marked `@AllowWhenPasswordChangeRequired()` (currently `POST /auth/login`, `PATCH /auth/password`, `POST /auth/refresh`). Because `APP_GUARD` runs before controller guards, it decodes the bearer token itself and lets missing/invalid tokens through — it is **not** an authentication guard.

Authorization is the hand-rolled `RolesGuard` in `src/auth/roles.guard.ts` (also exports `Roles()`). It uses `getAllAndOverride('roles', [handler, class])`, so both method- and class-level `@Roles(...)` work. Role controllers declare it at class level. Exceptions: `EstablishmentController` (reads open to any authenticated user; `@Roles('COORDINATOR')` only on writes) and `MessagesController`/`NotificationController` (no `@Roles`, see §5). Nothing authenticates globally, so a controller without `@UseGuards(AuthGuard('jwt'), RolesGuard)` is fully public (e.g. `AppController`).

Row-level ownership is re-derived per request in the service layer, never trusted from the guard or the request body:

1. `getSupervisorByUserId` / `getStudentByUserId` / `getCoordinatorByUserId` translate the JWT's `userId` into the domain profile row.
2. Every mutation then verifies the target belongs to that profile and throws `ForbiddenException`.

**Supervisor scope is TrainingAssignment-first** (`src/common/supervisor-scope.ts`): a supervisor sees rows whose *assignment* is at their establishment, falling back to `Student.establishmentId` only for legacy attendance with no assignment. Scoping by `Student.establishmentId` alone breaks on transfer — the old establishment's still-PENDING rows become unapprovable. Reuse those helpers; don't write a second `where`.

**Coordinator "My Block" is a view default, not an authorization boundary.** `scope: 'block'` (default) narrows lists to blocks the coordinator owns, `scope=all` shows the whole program, and a coordinator with no blocks falls back to everything with `noBlocksAssigned: true`. When scoping by block, match **either** `trainingAssignment.blockId` or `student.blockId` (the assignment's is nullable).

Never trust an id from the request body to imply ownership — preserve this pattern when adding endpoints.

### 3. Client session and route protection

`persistSession(token, user)` (`app/client/lib/auth.ts`) writes `token`/`user` to `localStorage` and sets two cookies: `ojt_role` (the role only, never the JWT) and `ojt_pwc` (present while `mustChangePassword`). It is called at login, after a password change, **and on every `/auth/refresh` response** so the cookies slide with the token.

`app/client/proxy.ts` (Next 16 renamed the `middleware` file convention to `proxy`) reads those cookies: no role cookie on a role-prefixed path → `/login?next=<path>`; role mismatch → that role's home; `ojt_pwc` set → `/change-password` (a standalone, sidebar-less page outside every role prefix). The role tabs on the login form are cosmetic — the server decides the role.

Both cookies are **forgeable client-side** and are routing UX only; the real boundaries are the server's `RolesGuard` and `PasswordChangeGuard` (§2). `SESSION_MAX_AGE_SECONDS` (client) must equal `SESSION_IDLE_MINUTES` (server) in seconds, or a cookie outlives its token (or vice versa) and produces a login loop.

`IdleSessionManager` (`features/account/components/`, mounted once in `lib/providers.tsx` because there is no shared per-role layout) is the client half of the idle timeout: it calls `/auth/refresh` periodically while there is real activity, warns at 28 minutes, signs out at 30, and syncs activity across tabs through `localStorage`.

**CORS:** `main.ts` allows exactly `http://localhost:3001` and exposes `Content-Disposition` (needed for the evaluation PDF's filename). `next dev` defaults to port 3000, which the API occupies — run the client with `-p 3001` or every request fails.

### 4. Validation, DTO conventions, and dates

`main.ts` installs a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`. DTOs are plain classes declared **inline at the top of each controller file** with real `class-validator` decorators. An undeclared body property is a 400, not silently dropped — check the DTO lists every field a form sends before assuming a bug elsewhere. Several services spread the DTO straight into a Prisma `data`, so the whitelist is also what stops extra columns being smuggled in.

`src/common/transforms.ts` has four helpers, and picking the wrong one causes real bugs:

- `EmptyToUndefined()` / `ToOptionalNumber()` — empty string → `undefined` (Prisma: "leave unchanged"). Use on **non-nullable** optional columns.
- `EmptyToNull()` / `ToNullableNumber()` — empty string → `null` (Prisma: "clear this column"). Use only on columns that are nullable in `schema.prisma`. Using `EmptyToUndefined` on a nullable column means a user-cleared field silently keeps its old value.

Date-only values (`Attendance.date`, `JournalEntry.entryDate`, assignment and student `startDate`/`endDate`) are stored as **UTC midnight of the intended calendar day** (`src/common/dates.ts`). `manilaToday()` — not `startOfUtcDay(new Date())` — is the only correct "today" server-side: the server runs in UTC, the school is in Asia/Manila (UTC+8), and they disagree by a day between 00:00–07:59 Manila. Client-side, `formatDateOnly`/`formatWeekdayOnly` (`lib/format.ts`) force `timeZone: "UTC"` for the same reason; `createdAt`-style timestamps are real instants and render in local time. Durations between two instants (e.g. the overdue window) need no Manila conversion.

Convention: a missing/inapplicable stat reads `null`/absent, not a fake `0`.

### 5. Messaging

`MessagesModule` (`src/messages/`) is a bare `/messages` controller with **no** `@Roles(...)` — deliberate: a conversation is the same resource shape for every role, and ownership is re-derived per request from `req.user.userId` inside the service, never from a body id. `NotificationController` (§11) follows the same reasoning. Both are REST + RTK Query polling (messages 3–10s, notifications 60s), not websockets — `socket.io`/`@nestjs/websockets` are not installed.

### 6. Cascade delete

Deleting a person is rare, irreversible, and touches many tables, so the order is spelled out explicitly in `src/common/cascade-delete.ts` and run inside `prisma.$transaction` with `CASCADE_TRANSACTION_OPTIONS` (`maxWait: 10s`, `timeout: 30s`). Queries inside it are **sequential, never `Promise.all`** — an interactive transaction is one connection, and racing reads on it silently returned empty results.

The schema has no `onDelete: Cascade` except two documented, narrow exceptions for rows with no independent meaning: `Notification.user` and `JournalPhoto.journalEntry`. (`Evaluation.template` is `onDelete: Restrict` — a template with evaluations is never deleted.) Don't add a third without the same justification in the schema comment.

- `deleteStudentCascade` removes attendance, documents, credentials, evaluation scores/evaluations, journal entries, training assignments, messaging footprint, then the `Student` and `User` rows. It **returns the storage paths** (documents, credentials, journal photos) so the caller deletes the files *after* the commit — storage isn't transactional.
- `deleteSupervisorCascade` removes their evaluations and messaging footprint, **nulls** `approvedById` on attendance they approved (approved hours survive the supervisor leaving), then deletes `Supervisor`/`User`.
- `EstablishmentService.remove` **refuses (409) if any `TrainingAssignment` references the establishment** — training history must be preserved; set it `INACTIVE` instead. Otherwise it runs each supervisor through `deleteSupervisorCascade` and nulls `Student.establishmentId` rather than deleting students.

### 7. File storage and uploads

`src/common/storage.ts` wraps a single private Supabase bucket (`student-files`) with three prefixes: `documents/<studentId>/`, `credentials/<studentId>/`, `journals/<studentId>/`. The bucket key is always `<prefix>/<studentId>/<uuid>.<ext>`; signed URLs last 1 hour and are never persisted.

Every upload goes through `src/common/file-upload.ts`:

- `validateUpload(buffer, { allowed, maxBytes })` decides the type from **magic bytes** (PDF/JPG/PNG, 10MB cap). The client's filename and Content-Type are never consulted; use the returned `mimeType`/`ext`.
- `buildStorageName(...)` applies the school's naming convention, `StudentNo_CODE[_SUFFIX]_SURNAME.ext` (e.g. `2022-00145_MOA_MUNDO.pdf`). That name is stored on the row and passed as the signed URL's `downloadName`; it is separate from the uuid bucket key.

Write order matters because storage isn't transactional: upload the object, write the row (delete the object if the write fails), and only then delete any file being replaced — an orphaned object is recoverable, a row pointing at a deleted file is not.

### 8. Resilience pattern for aggregates and lists

`CoordinatorService.getDashboard` and `SupervisorService.getDashboard` use `Promise.allSettled` across their independent queries: each slot falls back to an empty default, the rejection is logged, and the response includes a `failedSections` array the client uses to offer a per-section retry (`SectionError`). Likewise, lists that mint signed URLs use `signedUrlOrNull`/`withSignedUrl` (`src/common/signed-url.ts`), which never throw — a missing object renders as "unavailable" instead of failing the page. Apply this to any new endpoint that aggregates several tables or signs URLs for a list: one bad row must not 500 the rest.

For per-row figures in a list, batch two flat queries and group in memory (`progressFromRows`, `batchAssignmentProgress`) rather than one round trip per row.

### 9. Evaluation: data-driven template, not a hardcoded sheet

The evaluation sheet is **data**, modeled as `EvaluationTemplate`/`EvaluationTemplateSection`/`EvaluationTemplateItem` and versioned: at most one `PUBLISHED` and one `DRAFT`, the rest `ARCHIVED`, and published/archived versions are immutable. The coordinator edits via `/coordinator/evaluation-template` (`GET` overview, `PUT draft`, `POST publish`, `DELETE draft`). `src/common/evaluation-scoring.ts` holds only what every version shares (the 1–5 scale, how numerals/letters/section maximums derive from item order and count, `sheetDefinition()`/`buildSections()`). `DEFAULT_SHEET` there is seed content for version 1 only — nothing reads the live sheet from it.

An `Evaluation` keeps its own `templateId` forever, and scores are `EvaluationScore` rows keyed by a plain-string `itemKey` (deliberately not an FK). `POST /supervisor/evaluations` computes and **stores** `totalRating`, `maxTotalRating`, and snapshots (`trainingEmployedAt`, `evaluatorName`, `evaluatorPosition`), so a later template edit, supervisor rename, or reassignment can't rewrite a signed sheet. `PATCH` resubmits the whole sheet and recomputes `totalRating` against the sheet's original template version, but does not re-derive the snapshots. PDFs are rendered by `src/common/evaluation-pdf.ts` (pdfkit).

### 10. Training assignments (placements)

`TrainingAssignment` is one deployment of a student to an establishment, and is what attendance, documents, evaluations, and journal entries attach to (`trainingAssignmentId`; nullable on the older tables for legacy rows, NOT NULL on `JournalEntry`).

- **Recording a placement is one action** (`POST /coordinator/students/:id/placements`, `CoordinatorService.createPlacement`): the previous `ACTIVE` assignment is marked `TRANSFERRED` with its `endDate` set, never deleted or merged, and a new one starts at zero hours. "At most one ACTIVE per student" is maintained by that function, not by a schema constraint.
- `requiredHours` is **copied** from `CourseRequirement` (per course + year level) at creation — a later change to the program's requirement must not alter an existing assignment.
- `Student.course`, `establishmentId`, `requiredHours`, `startDate`, `endDate`, `yearLevel` are **deprecated mirrors**, written at placement time and not kept in sync afterwards. Read the ACTIVE assignment for anything new; `Student.courseId`/`blockId`/`courseYearLevel` are the structured, current fields (`resolveCourseFields` keeps the legacy `yearLevel` string in sync).
- Progress (`src/common/assignment-progress.ts`) is computed from **that assignment's own** APPROVED/PENDING attendance, using `totalHours` from `attendance-hours.ts` — never reimplement the hours math.
- **Duty days** (`src/common/duty-days.ts`): a date outside the assignment's `dutyDays` cannot be logged or journalled at all. Attendance and journals share `assertDutyDay` so they give the same answer and wording. Attendance also requires an ACTIVE assignment and a date within its window and not in the future; completion is by hours, so `Student.status === 'COMPLETED'` — not `endDate` passing — is what closes logging.
- `Attendance` is unique per `[studentId, date]`. A DECLINED row is corrected **in place**, which resets `submittedAt` (not `createdAt`).

### 11. Notifications and the overdue sweep

In-app only (no email infrastructure). `NotificationService.notify(client, input)` is the single entry point; it takes a Prisma client explicitly so a caller inside a `$transaction` can pass `tx` and commit the notification atomically with its cause.

Idempotency rests on `@@unique([userId, dedupeKey])` + `createMany({ skipDuplicates: true })`. Follow the `dedupeKey` convention — `${eventTag}:${entityId}[:${versionMarker}]` — where the version marker is whatever changes on a genuinely new cycle (`submittedAt` for attendance and journals, `uploadedAt` for documents). That is what lets a double-click be a no-op while a second decline after a resubmission still notifies. Keep those timestamp resets intact when touching resubmission paths.

"Overdue" (PENDING attendance ≥ 21 days since `submittedAt`) is **computed at read time** via `overdueAttendanceWhere()`/`isOverdue()` in `src/common/attendance-overdue.ts`, never stored. `OverdueSweepService` only decides whether a notification row exists: it runs on a plain `setInterval` (on boot and every 6h — `@nestjs/schedule` is not installed) and is also triggered from `getDashboard`, since a sleeping host may never fire the timer. It must never throw into its caller.

### 12. Document checklist and journals

**Documents.** The required documents are data (`DocumentRequirement`, like §9): retire one with `isActive: false`, never delete. `DOCUMENT_REQUIREMENT_SEED` (`src/common/document-requirements.ts`) is seed content shared by the migration and `seed.ts` with fixed ids; nothing reads it at request time. `perAssignment` decides whether a document belongs to the placement (endorsement, MOA, waiver, portfolio — a transferred student needs new ones) or to the student for good (application letter, resume). Re-uploading replaces the existing PENDING/rejected row in place; an APPROVED one is locked (409). A coordinator upload on a student's behalf is stored already APPROVED. Rows with `requirementId: null` are legacy and surface as "Other uploads". `Document.status` and `EvaluationTemplate.status` are plain strings, not enums.

**Journals.** One `JournalEntry` per duty day per assignment (`@@unique([trainingAssignmentId, entryDate])`), up to 5 photos. Students may edit while `SUBMITTED` or `RETURNED`; `ACCEPTED` is final. Coordinators accept/return (remarks required on return, and left in place on resubmission); supervisors are **view-only** and never receive `coordinatorRemarks` — it is stripped server-side, not hidden in the UI.

### 13. Two-part assessment: coordinator grade and the printable sheet

A placement is assessed twice, and the two figures are **never combined**: the supervisor's evaluation sheet (§9 — a raw `totalRating / maxTotalRating`, no percentage or band) and the coordinator's grade for the OJT portfolio report and its presentation, stored on `TrainingAssignment` (`coordinatorGrade` Decimal(5,2), 0–100, plus `coordinatorGradeRemarks`, `gradedById`, `gradedAt`).

- `PUT /coordinator/assignments/:id/grade` (`CoordinatorService.setAssignmentGrade`) both records and corrects it. `gradedById`/`gradedAt` are stamped server-side and restamped on a correction. Saving an unchanged grade is a no-op, which is what keeps `gradedAt` usable as the notification's version marker (`grade:${assignmentId}:${gradedAt}`, type `ASSESSMENT_COMPLETED`, §11).
- **Eligibility** is `gradeEligibility()` in `src/common/assignment-grade.ts`: the assignment has ended (any status but ACTIVE, or `endDate` reached — `endDate` is exclusive, as in attendance) **or** its APPROVED hours reach `requiredHours`. The list (`grading: { eligible, reason }`) and the write share that one function; 400 otherwise.
- **Any coordinator may grade any assignment** — the §2 rule ("My Block" is a view default, not an authorization boundary) applies here unchanged.
- Who sees what: the coordinator gets everything on `GET /coordinator/students/:id/assignments`; the student gets grade, remarks, who/when in `GET /student/dashboard` (`assessment`); the supervisor gets grade and who/when but **never the remarks** (`GET /supervisor/students`, and `trainingAssignment` on every evaluation via `EVALUATION_INCLUDE`) — the same call as a journal's `coordinatorRemarks` (§12).

**Print view.** `features/evaluation/components/EvaluationPrintView.tsx` + `EvaluationPrintSheet.tsx` render one evaluation in the paper form's order with signature lines, at `/coordinator/evaluations/[id]/print`, `/supervisor/evaluation/[id]/print` and `/student/evaluations/[id]/print` (one per role because `proxy.ts` routes by prefix). The pages have no sidebar; the toolbar is `print:hidden` and `@page` A4 lives in `app/globals.css`. The sheet uses borders, not background fills (browsers drop backgrounds when printing), and the total is a body row, not a `<tfoot>` (which repeats on every page). The legend comes from the evaluation's own `scale` (`SCORE_SCALE`), so the client still restates nothing. Coordinator and supervisor pages read from their existing list queries; the student has `GET /student/evaluations/:id` (own sheets only). This is separate from the pdfkit download in §9, which is still coordinator-only.

### 14. Weekly tasks and the weekly task report (MOV)

`WeeklyTaskModule` (`src/weekly-task/`) follows the journal's shape: one service, three role-prefixed controllers. A `WeeklyTask` belongs to a `TrainingAssignment` (`studentId` denormalised) and to one week — `weekStart` is always that week's **Monday** at UTC midnight, normalised by `weekStartOf` whatever day was sent. The status and week rules are pure functions in `src/common/weekly-tasks.ts` (unit-tested); reuse them rather than re-deriving a Monday or a status check.

- **Lifecycle:** `ASSIGNED` → `DONE` (student, optional note + up to 5 proof photos) → `RATED` (supervisor, 1–5 + optional comment). The supervisor may edit/delete only while `ASSIGNED`; the student may undo `DONE` until it is rated, which **removes the note and photos**, so photos only ever exist on a DONE/RATED task. A rating can be corrected; an unchanged save is a no-op.
- **A weekly rating is its own figure.** Nothing in this module reads or writes `Evaluation` or `coordinatorGrade` (§9, §13), and the week average (rated tasks only, a plain number, `null` when none) is never combined with either.
- **Scope:** supervisors by the *assignment's* establishment (§2). Assigning, editing and deleting need an ACTIVE assignment; listing and rating do not, so work done before a transfer can still be rated. Students see only their own. The coordinator is read-only and unscoped, like its other single-record reads.
- **Photos** use the journal's pipeline unchanged (§7): magic-byte JPG/PNG check, private bucket under `weekly-tasks/<studentId>/`, signed URLs in the list response, name `StudentNo_TASK_<yyyymmdd>_<n>_SURNAME.ext`. `WeeklyTaskPhoto` deliberately has **no** `onDelete: Cascade` (§6): every delete path removes photo rows explicitly, then the files after the commit.
- **Cascade (§6):** `deleteStudentCascade` deletes the student's tasks and photos and returns the photo paths; `deleteSupervisorCascade` **nulls** `supervisorId` — the task is the trainee's record and survives, like approved attendance.
- **Notifications (§11):** `WEEKLY_TASK_ASSIGNED:${id}` to the student; `WEEKLY_TASK_DONE:${id}:${doneAt}` to the assigning supervisor (every supervisor at the establishment if that account is gone); `WEEKLY_TASK_RATED:${id}:${ratedAt}` to the student. `doneAt`/`ratedAt` are the version markers, so keep them moving only on a real change.
- **One response shape.** Every role's `GET .../weekly-tasks?assignmentId&week` returns the same week object (tasks, photos, counts, average, header fields), and the printed report renders from it — there is no separate summary endpoint to drift.

Client: `features/weekly-tasks/`, slice `lib/api/weeklyTaskApi.ts`. Print routes are `/{student,supervisor,coordinator}/weekly-tasks/print?assignment=…&week=…`. `components/ui/PrintPage.tsx` is the shared print shell (toolbar + A4 frame) used by this report and by the §13 evaluation sheet. Pages that read the URL wrap `useSearchParams` in `<Suspense>`, as the students page does.

### 15. Placement threads, concerns, announcements, and message retention

Four things that look alike and are deliberately kept apart: **messages** are chat and expire; **concerns** and **announcements** are records and do not; **feedback on a record** (decline reason, journal remarks, weekly-task comment) was never a message at all.

**Placement threads.** Every `TrainingAssignment` has one group `Conversation` (`isGroup: true`, `trainingAssignmentId` unique) with the student, every supervisor at the establishment and every coordinator in it. `PlacementThreadService` (`src/messages/`) owns existence and membership only — reading and sending still go through `MessagesService` and the same `/messages` endpoints as a 1:1 (§5), where `requireParticipant` is the single access check for both kinds.

- Created inside `createPlacement`'s transaction; `createSupervisor` adds the new supervisor to the active threads at their establishment; `syncAll()` runs **on every boot** and idempotently creates missing threads and adds missing participants. That boot sync is the backfill (there is none in the migration) and the only hook for a coordinator account, which the seed/CLI creates outside the app.
- The thread's name is derived at read time (`<Student> — <Establishment>`), never stored. It is **read-only once the assignment is not ACTIVE**: `sendMessage` answers 409; the client's banner is only the explanation.
- Each message is returned with its `sender` (a group has several), and each summary with `isGroup`/`name`/`readOnly`/`members`. Unread counts needed no change — they were already per participant.

**Concerns** (`src/concern/`). A supervisor raises one about a trainee whose *assignment* is at their establishment (§2; any status); it is stored on `Concern` against the placement with a `raisedByName` snapshot. Coordinators acknowledge/resolve with an optional response (never back to OPEN; an unchanged save is a no-op). The supervisor sees only the ones they raised. **There is no student route** — that, not a hidden UI element, is why students cannot see concerns. No delete route either. Notifications: `CONCERN_RAISED:${id}` to the block's coordinator (all coordinators if there is none, like the overdue sweep), `CONCERN_RESPONDED:${id}:${respondedAt}` to the raiser.

**Announcements** (`src/announcement/`). Coordinator CRUD under `/coordinator/announcements`; students and supervisors read theirs from the bare `/announcements` (§5-style: one shape, filtered from the caller's own profile). Who one reaches is the single rule in `src/common/announcement-audience.ts`, in two forms that must agree — `announcementWhereFor` for listing, `isAnnouncementVisibleTo` for choosing whom to notify. `audience` picks the role; `blockId`/`courseId` are optional and both must match when set. A supervisor has no block or program, so matches through the trainees actively placed with them. Posting notifies once (`ANNOUNCEMENT_POSTED:${id}`); editing never re-notifies. `Announcement.block`/`course` are `onDelete: Restrict` and `CourseService` 409s first — the default SET NULL would silently widen the audience.

**Retention.** `MessageRetentionSweepService` deletes `Message` rows older than `MESSAGE_RETENTION_DAYS` (30, `src/common/message-retention.ts`) on boot and every 24h via `setInterval`, with an in-flight guard. Its whole `where` is `expiredMessagesWhere()` — `createdAt` only, so it applies to 1:1 and group alike — and it touches no other table: conversations, participants, concerns, announcements and notifications are never deleted by it. The client shows the 30-day note from its own mirrored constant; keep the two equal.

**Cascade (§6).** Deleting a student deletes their concerns and each placement's thread outright (everyone's messages in it, since the thread has no meaning without the placement). Deleting a supervisor **nulls** `Concern.raisedById` and removes their thread membership via the messaging footprint. `AnnouncementRead` has no cascade and is deleted explicitly with its announcement or its user.

### Client

Structure convention:

- `app/<role>/<page>/page.tsx` — thin, `"use client"`, composes `Sidebar` + feature components. Each role's nav array lives in one file (`features/coordinator/nav.ts`, `features/student-portal/nav.ts`, `features/supervisor/nav.ts`) — add a new page's entry there. `Sidebar` also hosts the notification bell and the change-password dialog.
- `features/<domain>/hooks/use-<domain>.ts` — all state, RTK Query calls, filtering, pagination, and handlers for a domain, returned as one large object. `features/<domain>/components/` are presentational and receive that object's fields as props.
- `components/ui/` — generic primitives; `lib/api/*Api.ts` — one RTK Query `createApi` slice per domain. **A new slice must be added to both the `reducer` map and the `middleware` concat in `lib/store.ts`.**
- `@/*` maps to the client root. There is no shared per-role layout; app-wide concerns go in `lib/providers.tsx`.

Every route under `app/coordinator/`, `app/student/`, `app/supervisor/` is a real, wired page backed by real endpoints — there are no mock-data pages. `establishment` was the first end-to-end vertical slice and is still a reasonable shape to copy for a new domain.

`lib/api/baseQuery.ts` centralizes the API base (`NEXT_PUBLIC_API_URL ?? "http://localhost:3000"`) and auth failures: a 401 clears the session and hard-navigates to `/login?reason=expired`; a 403 with `code: "PASSWORD_CHANGE_REQUIRED"` navigates to `/change-password` without clearing it; `/auth/login` is exempt from both. Slices don't hardcode a `baseUrl` or duplicate this. `useCurrentUser` (`lib/hooks/`) reads the stored user via `useSyncExternalStore` — use it rather than a `useState`/`useEffect` pair over `localStorage`.

The school name is a fixed constant duplicated in `app/server/src/common/school.ts` and `app/client/lib/school.ts` (the projects share no code) — keep the two identical and never make it a setting.

Philippine region/province/city/barangay dropdowns come from `@aivangogh/ph-address`, keyed by PSGC code. The DB stores **names**, not codes, so `useEstablishment.handleEdit` does a reverse name→code lookup and sets `isPopulatingRef` to stop the cascade effects from clearing the children it just restored; a `useEffect` on `editTarget` clears the flag afterwards. Touch that flag carefully.

`app/client/AGENTS.md` is regenerated by `next dev` — commit it, don't revert it. Next 16 has breaking changes relative to older releases; read the relevant guide in `app/client/node_modules/next/dist/docs/` before writing Next code.
