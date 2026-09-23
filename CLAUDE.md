# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

Two independent npm projects, no workspace root — always `cd` into one of them before running anything:

- `app/server` — NestJS 11 API (port 3000), Prisma 6 + PostgreSQL (Supabase; `DATABASE_URL` pooled + `DIRECT_URL` direct).
- `app/client` — Next.js 16 App Router + React 19, Tailwind v4, Redux Toolkit Query.

`SYSTEM-FLOW.md` (repo root) traces the request/data mechanics — read it after this file when tracing a bug across layers or wiring a new module into the same shape. Its evaluation section predates the template-versioning system described in §9 below; §9 here is authoritative for how the evaluation sheet's content is sourced.

## Commands

```bash
# server (app/server)
npm run start:dev                    # watch mode, http://localhost:3000
npm run build && npm run start:prod
npm run lint                         # eslint --fix
npm test                             # jest --passWithNoTests — there are currently no src/**/*.spec.ts files, so this passes trivially
npm run test:e2e                     # jest with test/jest-e2e.json — the one real test, test/app.e2e-spec.ts
npm run seed                         # tsx prisma/seed.ts — creates coordinator@wphi.edu / admin123
npm run reset-coordinator            # tsx scripts/reset-coordinator.ts — dev utility to reset the seeded coordinator

npx prisma migrate dev --name <desc> # create + apply a migration
npx prisma generate                  # REQUIRED after clone/schema change — see below

# client (app/client)
npm run dev -- -p 3001               # MUST be 3001; see CORS note in §3
npm run build
npm run lint
```

The client has **no test setup** (no test runner in `devDependencies`, no test files). `app/client/README.md` does not exist — do not look for it.

### Two things that bite on a fresh clone

- `app/server/generated/prisma` is **gitignored** (custom `prisma-client` generator output, not `node_modules/@prisma/client`). Nothing compiles until `npx prisma generate` runs.
- `app/server/.env` is gitignored and holds `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The server **refuses to boot** without `JWT_SECRET` (`src/auth/jwt.constants.ts` throws — it used to silently fall back to a hardcoded dev secret, which let anyone mint a COORDINATOR token from a value public in this repo; that fallback is gone). `main.ts`, `prisma.config.ts`, and `prisma/seed.ts` load env via `import 'dotenv/config'` — there is no `@nestjs/config`.

Prisma's own agent skills are vendored at `app/server/.agents/skills/` (symlinked into `.claude/skills/` and `.windsurf/skills/`) — consult them for CLI/client questions instead of guessing.

## Architecture

### 1. Modules actually wired

`app.module.ts` imports: `AuthModule`, `PrismaModule`, `CoordinatorModule`, `EstablishmentModule`, `StudentModule`, `SupervisorModule`, `MessagesModule`, `EvaluationTemplateModule`. There is no standalone `attendance` or `evaluation` module — that logic lives inside the `student`/`supervisor`/`coordinator` controllers and services. There is no separate document/credential module either — upload, review, and deletion live in `student.controller.ts`/`student.service.ts` and the coordinator's document-review endpoints. `PrismaService` exposes the client as a `.client` property rather than extending `PrismaClient`, so all queries read `this.prisma.client.<model>`.

### 2. Auth and ownership

JWT bearer tokens, no refresh flow, no sessions. `AuthService.login` verifies bcrypt and signs `{ sub, email, role }`; `JwtStrategy.validate` maps it onto `req.user` as `{ userId, email, role }` — **handlers read `req.user.userId`, not `req.user.id`**.

Authorization is the hand-rolled `RolesGuard` in `src/auth/roles.guard.ts` (also exports the `Roles()` decorator). It calls `reflector.getAllAndOverride('roles', [context.getHandler(), context.getClass()])`, so **both** a method-level and a class-level `@Roles(...)` are enforced. `StudentController`, `SupervisorController`, and `CoordinatorController` each declare `@Roles(...)` at the class level and it works. `EstablishmentController` is the one exception: reads (`GET`) are open to any authenticated user, and `@Roles('COORDINATOR')` sits only on the `create`/`update`/`remove` handlers. There is no global guard, so a controller without `@UseGuards(AuthGuard('jwt'), RolesGuard)` is fully public (e.g. `AppController`).

Row-level ownership is re-derived per request in the service layer, not trusted from the guard or the request body:

1. `getSupervisorByUserId(userId)` / `getStudentByUserId(userId)` translate the JWT's `userId` into the domain profile row.
2. Every mutation then verifies the target belongs to that profile's establishment (`verifyAttendanceBelongsToSupervisor`, the inline establishment check in `createEvaluation`, etc.) and throws `ForbiddenException`.

Never trust an id from the request body to imply ownership — preserve this pattern when adding endpoints.

### 3. Client session and route protection

`login/page.tsx` calls `persistSession(token, user)` (`app/client/lib/auth.ts`), which writes `token`/`user` to `localStorage` and sets a `ojt_role` cookie (`document.cookie`, `Max-Age` = `SESSION_MAX_AGE_SECONDS`) containing **only the role**, never the JWT. `app/client/proxy.ts` (Next 16 renamed the `middleware` file convention to `proxy`; behavior is unchanged) reads that cookie and redirects: no cookie on a role-prefixed path → `/login?next=<path>`; cookie role doesn't match the path's role prefix → that role's home page. The role tabs on the login form are cosmetic — the server decides the role from the JWT payload.

The `ojt_role` cookie is **forgeable client-side** and is not a security boundary — it only drives client-side routing UX. The real authorization boundary is the server's `RolesGuard` (§2). `Max-Age` on the cookie must be kept equal to the JWT's `expiresIn` (currently `1d`) or a user's cookie outlives their token (or vice versa), producing a login loop.

**CORS:** `main.ts` allows exactly `http://localhost:3001` and exposes the `Content-Disposition` header (needed for the evaluation PDF download's filename). `next dev` defaults to port 3000, which the API already occupies — run the client with `-p 3001` or every request fails.

### 4. Validation, DTO conventions, and dates

`main.ts` installs a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`. `class-validator`/`class-transformer` are real dependencies, and DTOs — plain classes declared inline at the top of each controller file — use real decorators (`@IsString`, `@IsOptional`, `@IsDateString`, `@Matches`, `@IsIn`, `@ValidateNested`, etc.). `whitelist`+`forbidNonWhitelisted` means an undeclared body property is a 400, not silently dropped — check the DTO lists every field a form sends before assuming a bug elsewhere. Numeric coercion generally happens via `transform` + custom `Transform`s below rather than by hand.

`src/common/transforms.ts` has four helpers, and picking the wrong one causes real bugs:

- `EmptyToUndefined()` / `ToOptionalNumber()` — empty string → `undefined` (Prisma: "leave unchanged" / for optional NOT NULL-ish fields). Use on **non-nullable** optional columns.
- `EmptyToNull()` / `ToNullableNumber()` — empty string → `null` (Prisma: "clear this column"). Use only on columns that are actually nullable in `schema.prisma`. Using `EmptyToUndefined` on a nullable column means a user-cleared field silently keeps its old value, since a field **absent** from the body and a field **emptied** both arrive as `undefined`.

Date-only columns (`Attendance.date`, `Student.startDate`/`endDate`) are stored as **UTC midnight of the intended calendar day** (`src/common/dates.ts`). `manilaToday()` — not `startOfUtcDay(new Date())` — is the only correct source for "today" server-side, because the server runs in UTC while the school is in Asia/Manila (UTC+8): between 00:00–07:59 Manila the two disagree by a day. Client-side, `formatDateOnly`/`formatWeekdayOnly` (`lib/format.ts`) force `timeZone: "UTC"` for the same reason; `createdAt`/`updatedAt` timestamps are real instants and render in local time instead.

Convention: a missing/inapplicable stat should read `null`/absent, not a fake `0` — e.g. attendance percentage is `null` until `Student.startDate` is set, not `0%`.

### 5. Messaging

`MessagesModule` (`src/messages/`) is a bare `/messages` controller with **no** `@Roles(...)` — deliberate: a conversation is the same resource shape for every role, and ownership is re-derived per request from `req.user.userId` inside the service, never from a body id. It's REST/polling (RTK Query refetch), not a websocket gateway — `socket.io`/`@nestjs/websockets` are not installed.

### 6. Cascade delete

The schema has **no `onDelete: Cascade`** anywhere — deleting a person is rare, irreversible, and touches many tables, so the order is spelled out explicitly in `src/common/cascade-delete.ts` and run inside `prisma.$transaction` (queries inside it are sequential, never `Promise.all`, since an interactive transaction is one connection). `CASCADE_TRANSACTION_OPTIONS` (`maxWait: 10s`, `timeout: 30s`) overrides Prisma's tight 5s default because a full establishment delete runs the supervisor cascade once per supervisor.

- `deleteStudentCascade` removes attendance, documents, credentials, evaluation scores/evaluations, messaging footprint, then the `Student` and `User` rows; it returns the storage object paths so the caller deletes the actual files *after* the transaction commits (storage isn't transactional).
- `deleteSupervisorCascade` removes their evaluations and messaging footprint, **nulls** `approvedById` on attendance they approved (a student's approved hours must survive their supervisor leaving), then deletes `Supervisor`/`User`.
- `EstablishmentService.remove` no longer blocks or throws a bare 500 when students/supervisors reference it (that old behavior is gone). It runs every supervisor through `deleteSupervisorCascade` and **nulls** `Student.establishmentId` for its students rather than deleting them — a removed placement doesn't remove the trainee, and that column is nullable so coordinators can reassign them.

### 7. File storage

`src/common/storage.ts` wraps a single private Supabase bucket (`student-files`), shared by Documents (`documents/<studentId>/<uuid>.ext`) and Credentials (`credentials/<studentId>/<uuid>.ext>`) under different prefixes. `getSignedUrl()` mints a 1-hour URL per read and the result is never persisted. Both features are wired end-to-end (upload/review/delete), not stubs.

### 8. Dashboard resilience pattern

`CoordinatorService.getDashboard` and `SupervisorService`'s dashboard query use `Promise.allSettled` (not `Promise.all`) across their independent queries: each slot falls back to an empty default, the rejection is logged, and the response includes a `failedSections` array the client uses to offer a per-section retry instead of blanking the whole page on one bad query. Apply this pattern to any new endpoint that aggregates from several tables or mints signed URLs for a list — one bad row must not 500 the rest.

### 9. Evaluation: data-driven template, not a hardcoded sheet

The evaluation sheet is **data**, not code, modeled as `EvaluationTemplate`/`EvaluationTemplateSection`/`EvaluationTemplateItem` and versioned. The coordinator edits it live via `EvaluationTemplateController` (`/coordinator/evaluation-template`: `GET` overview, `PUT draft`, `POST publish`, `DELETE draft`) — draft/publish/discard, not direct edits to a live version. `src/common/evaluation-scoring.ts` holds only what every version shares (the 1–5 scale, `SCORE_LABELS`, how numerals/letters/section maximums derive from item order and count, `sheetDefinition()`/`buildSections()` for rendering a scored sheet). `DEFAULT_SHEET` in that file is seed content for template version 1 only — nothing reads the live sheet from it.

`POST /supervisor/evaluations` computes and **stores** `totalRating` plus snapshots (`trainingEmployedAt`, `evaluatorName`, `evaluatorPosition`) at write time, so a later template edit, supervisor rename, or student reassignment can't rewrite an already-signed sheet. `PATCH /supervisor/evaluations/:id` resubmits the whole sheet and recomputes `totalRating`, but does not re-derive those snapshots.

### Client

Structure convention:

- `app/<role>/<page>/page.tsx` — thin, `"use client"`, composes a `Sidebar` (nav array declared locally per page, e.g. `COORDINATOR_NAV`) + feature components.
- `features/<domain>/hooks/use-<domain>.ts` — all state, RTK Query calls, filtering, pagination, and handlers for a domain, returned as one large object. `features/<domain>/components/` are presentational and receive that object's fields as props.
- `components/ui/` — generic primitives; `lib/api/*Api.ts` — one RTK Query `createApi` slice per domain, registered in `lib/store.ts`.
- `@/*` maps to the client root.

**How much exists:** every route directory under `app/coordinator/`, `app/student/`, `app/supervisor/` has a real, wired `page.tsx` — dashboards, attendance, establishments, evaluations, messages, documents, credentials, profile. `lib/api/` has one RTK Query slice per domain (`authApi`, `establishmentApi`, `studentApi`, `studentPortalApi`, `supervisorApi`, `supervisorManagementApi`, `evaluationApi`, `evaluationTemplateApi`, `messagesApi`, `documentApi`, `dashboardApi`, `attendanceOversightApi`) plus a shared `baseQuery.ts`. The coordinator dashboard is wired to `useGetCoordinatorDashboardQuery` (real data, including `failedSections` handling per §8), not mock constants. `establishment` was the first end-to-end vertical slice built and is still a reasonable one to copy the shape of for a new domain, but it is no longer the *only* one.

`lib/api/baseQuery.ts` centralizes the API base (`process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"`) and 401 handling (clears session, hard-navigates to `/login`, except `/auth/login` itself where a 401 means bad credentials) — slices don't hardcode their own `baseUrl` or duplicate that logic.

Philippine region/province/city/barangay dropdowns come from `@aivangogh/ph-address`, keyed by PSGC code. The DB stores **names**, not codes, so `useEstablishment.handleEdit` (`features/establishment/hooks/use-establishment.ts`) does a reverse name→code lookup (scanning every region for a matching province) and sets `isPopulatingRef` to stop the cascade effects from clearing the children it just restored; a `useEffect` on `editTarget` clears the flag afterwards. Touch that flag carefully.

`app/client/AGENTS.md` (regenerated by `next dev` — commit it, don't revert it) covers Next 16 conventions; `app/client/CLAUDE.md` just imports it. Read it before writing Next code, since Next 16 conventions differ from older releases and the docs ship in `app/client/node_modules/next/dist/docs/`.
