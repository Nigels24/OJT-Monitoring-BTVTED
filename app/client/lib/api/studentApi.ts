import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";
import { dashboardApi } from "./dashboardApi";
import { attendanceOversightApi } from "./attendanceOversightApi";
import { documentApi } from "./documentApi";
import { evaluationApi } from "./evaluationApi";
import { messagesApi } from "./messagesApi";
import type {
  AccountEmailStatus,
  CredentialsEmailResult,
} from "./credentialsEmail";

export type StudentStatus = "ACTIVE" | "PENDING" | "COMPLETED" | "INACTIVE";

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export type AssignmentStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "TRANSFERRED"
  | "CANCELLED";

/** `AssignmentProgress` (server: `common/assignment-progress.ts`), computed
 * per TrainingAssignment from its own APPROVED/PENDING attendance only. */
export interface AssignmentProgress {
  requiredHours: number;
  approvedHours: number;
  pendingHours: number;
  remainingHours: number;
  /** 0-100, 2dp, capped at 100. */
  percentComplete: number;
  expectedDutyDaysToDate: number;
  daysWithApprovedAttendance: number;
}

export interface TrainingAssignment {
  id: string;
  studentId: string;
  establishmentId: string;
  establishment: { id: string; name: string };
  courseRequirementId: string | null;
  blockId: string | null;
  yearLevel: number;
  requiredHours: number;
  dutyDays: Weekday[];
  startDate: string;
  endDate: string | null;
  academicYear: string;
  status: AssignmentStatus;
  /**
   * The coordinator's final grade for this placement, 0-100. A string because
   * it is a Decimal(5,2) server-side — render it with `formatGrade`.
   */
  coordinatorGrade: string | null;
  coordinatorGradeRemarks: string | null;
  gradedById: string | null;
  gradedBy: { id: string; user: { name: string } } | null;
  gradedAt: string | null;
  createdAt: string;
  updatedAt: string;
  progress: AssignmentProgress;
  /**
   * Whether a grade can be recorded yet (the placement has ended, or its
   * approved hours reach the requirement). Decided server-side by the same rule
   * the save enforces; `reason` says why not.
   */
  grading: { eligible: boolean; reason: string | null };
  /** The supervisor's sheets for this placement, newest first — totals only. */
  evaluations: AssignmentEvaluationSummary[];
}

/** One supervisor evaluation sheet, as much as an assignment row needs of it. */
export interface AssignmentEvaluationSummary {
  id: string;
  totalRating: number;
  maxTotalRating: number;
  evaluatorName: string | null;
  createdAt: string;
}

export interface SetAssignmentGradeRequest {
  /** 0-100, at most two decimal places. */
  grade: number;
  /** `null` clears the remarks; omit to leave them unchanged. */
  remarks?: string | null;
}

/** `GET /coordinator/students/:id/placement-defaults` — the auto-filled hours
 * a placement would use, from the student's course + year level. */
export interface PlacementDefaults {
  courseId: string;
  yearLevel: number;
  requirement: { id: string; yearLevel: number; requiredHours: number };
  requiredHours: number;
  establishment: { id: string; name: string; status: string } | null;
}

export interface CreatePlacementRequest {
  establishmentId: string;
  dutyDays: Weekday[];
  startDate: string;
  academicYear: string;
  /** Overrides the requirement's hours; omit to use the auto-filled default. */
  requiredHours?: number;
  blockId?: string;
}

export interface UpdateAssignmentRequest {
  dutyDays?: Weekday[];
  /** `null` clears the end date; omit to leave it unchanged. */
  endDate?: string | null;
  status?: "COMPLETED" | "CANCELLED";
}

export interface ListStudentsParams {
  /** Defaults server-side to "block" — the requesting coordinator's own blocks. */
  scope?: "block" | "all";
  courseId?: string;
  yearLevel?: number;
  blockId?: string;
  academicYear?: string;
  status?: StudentStatus;
}

export interface ListStudentsResponse {
  /** True when `scope=block` fell back to the full roster because this
   * coordinator has no blocks assigned yet. */
  noBlocksAssigned: boolean;
  students: Student[];
}

function toQueryString(
  params: Record<string, string | number | undefined>,
): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

/**
 * A student as returned by the coordinator endpoints (`/coordinator/students`).
 *
 * Not to be confused with the student-facing `/student/*` routes, which serve
 * the signed-in student their own record and will get their own slice.
 */
export interface Student {
  id: string;
  userId: string;
  studentIdNumber: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleInitial?: string | null;
  age?: number | null;
  dateOfBirth?: string | null;
  school?: string | null;
  contactNumber?: string | null;
  address?: string | null;
  /** DEPRECATED free-text fields — still populated for students not yet on
   * a structured Course/Block (see `courseId`/`blockId` below). */
  course?: string | null;
  yearLevel?: string | null;
  courseId?: string | null;
  /** The structured counterpart to `yearLevel` above (see
   * `StudentDetailsRequest.courseYearLevel`), now backed by its own column. */
  courseYearLevel?: number | null;
  blockId?: string | null;
  establishmentId?: string | null;
  requiredHours: number;
  startDate?: string | null;
  status: StudentStatus;
  /** The ACTIVE assignment's approved hours; 0 with `hasActiveAssignment:
   * false` when the student has none. */
  completedHours: number;
  hasActiveAssignment: boolean;
  progress: AssignmentProgress;
  /** The account, with how emailing its login last went. */
  user: {
    id: string;
    email: string;
    username: string | null;
    name: string;
    createdAt: string;
  } & AccountEmailStatus;
  establishment?: { id: string; name: string } | null;
  /**
   * Dependent-row counts. The delete confirmation spells these out, since
   * deleting a student now cascades through all four (see the server's
   * `deleteStudentCascade`).
   */
  _count?: {
    credentials: number;
    documents: number;
    attendances: number;
    evaluations: number;
  } | null;
}

/**
 * `null` on a nullable field clears it; omitting the field leaves the stored
 * value alone. `requiredHours` and `status` are NOT NULL server-side, so they
 * are omit-only.
 *
 * `school` is deliberately absent — the server ignores any client-supplied
 * value and always sets it to the one permanent school name (`SCHOOL_NAME`,
 * `lib/school.ts`), so there is nothing for this form to send.
 */
export interface StudentDetailsRequest {
  firstName?: string | null;
  lastName?: string | null;
  middleInitial?: string | null;
  age?: number | null;
  dateOfBirth?: string | null;
  contactNumber?: string | null;
  address?: string | null;
  /** DEPRECATED — set automatically from `courseId`/`courseYearLevel` below
   * when those are sent; only used directly for a student not on a course yet. */
  course?: string | null;
  yearLevel?: string | null;
  courseId?: string | null;
  blockId?: string | null;
  /** Named apart from `yearLevel` above only because that name was already
   * taken by the deprecated free-text field (server: `resolveCourseFields`). */
  courseYearLevel?: number | null;
  establishmentId?: string | null;
  requiredHours?: number;
  startDate?: string | null;
  status?: StudentStatus;
}

export interface CreateStudentRequest extends StudentDetailsRequest {
  email: string;
  /** Login name issued by the coordinator. No "@" allowed. */
  username: string;
  /** Leave unset and the server generates a readable one and emails it to
   * the account. It comes back as `temporaryPassword` only if that email
   * was not sent. */
  password?: string;
  studentIdNumber: string;
  name?: string;
}

export interface CreateStudentResponse {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: string;
  /** How emailing the login went. */
  credentialsEmail: CredentialsEmailResult;
  /**
   * Present only when `password` was omitted from the request **and** the
   * login email was not sent — the coordinator hands it over instead. Shown
   * once. When the email was sent, the password never reaches the client.
   */
  temporaryPassword?: string;
}

export type UpdateStudentRequest = StudentDetailsRequest;

/* ---------------------------------------------------------------------------
 * Batch import from Excel
 * ------------------------------------------------------------------------ */

/** The server's ceilings, pre-checked client-side for a faster no. */
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;

/** One row of the uploaded sheet, normalised and judged by the server. */
export interface ImportRow {
  /** The row's number as Excel shows it. */
  rowNumber: number;
  status: "VALID" | "ERROR";
  /** Every reason the row is rejected — empty when VALID. */
  reasons: string[];
  values: {
    studentNumber: string;
    lastName: string;
    firstName: string;
    middleName: string;
    middleInitial: string | null;
    sex: "Male" | "Female" | null;
    /** `yyyy-mm-dd`, or `null` if the cell was not a valid date. */
    birthdate: string | null;
    age: number | null;
    email: string;
    contactNumber: string;
    course: string;
    courseId: string | null;
    yearLevel: number | null;
  };
}

interface ImportBlock {
  id: string;
  name: string;
  courseId: string;
  yearLevel: number;
}

/** `POST …/import/preview` — nothing has been written. */
export interface ImportPreview {
  block: ImportBlock | null;
  counts: { total: number; valid: number; errors: number };
  rows: ImportRow[];
}

/** A login the coordinator must hand over, because it was not emailed. */
export interface ImportedCredential {
  rowNumber: number;
  studentNumber: string;
  name: string;
  /** Their email — an imported account has no username. */
  loginId: string;
  /** Plaintext, in this one response only. */
  temporaryPassword: string;
}

/** `POST …/import/commit` — the valid rows were created in one transaction. */
export interface ImportResult {
  created: number;
  rejected: { rowNumber: number; studentNumber: string; reasons: string[] }[];
  block: ImportBlock | null;
  /**
   * QUEUED — login emails are being sent in the background; no password is in
   * this response. NOT_CONFIGURED — email is off; `credentials` has each one,
   * once.
   */
  emailMode: "QUEUED" | "NOT_CONFIGURED";
  credentials?: ImportedCredential[];
}

/** The template as something a link can save: an object URL and its name. */
export interface ImportTemplateDownload {
  /** From `URL.createObjectURL`; the caller revokes it after the click. */
  url: string;
  filename: string;
}

export const studentApi = createApi({
  reducerPath: "studentApi",
  baseQuery: baseQueryWithAuth,
  tagTypes: ["Student", "Assignment"],
  endpoints: (builder) => ({
    getStudents: builder.query<ListStudentsResponse, ListStudentsParams | void>({
      query: (params) =>
        `/coordinator/students${toQueryString({ ...params })}`,
      providesTags: ["Student"],
    }),
    createStudent: builder.mutation<CreateStudentResponse, CreateStudentRequest>(
      {
        query: (body) => ({
          url: "/coordinator/students",
          method: "POST",
          body,
        }),
        invalidatesTags: ["Student"],
      },
    ),
    updateStudent: builder.mutation<
      Student,
      { id: string } & UpdateStudentRequest
    >({
      query: ({ id, ...body }) => ({
        url: `/coordinator/students/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Student"],
    }),
    deleteStudent: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({
        url: `/coordinator/students/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Student", "Assignment"],
      // The server-side cascade (deleteStudentCascade) takes attendance,
      // documents, credentials, evaluations and messages with it. Those live
      // in other createApi slices whose tags this mutation can't reach on its
      // own, so every coordinator page that reads them would keep showing
      // the deleted student's rows until revisited (CLAUDE.md §8 item 22).
      async onQueryStarted(_id, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(dashboardApi.util.invalidateTags(["Dashboard"]));
          dispatch(
            attendanceOversightApi.util.invalidateTags([
              "AttendanceOversight",
            ]),
          );
          dispatch(documentApi.util.invalidateTags(["Document"]));
          dispatch(evaluationApi.util.invalidateTags(["Evaluation"]));
          dispatch(
            messagesApi.util.invalidateTags(["Conversations", "Contacts"]),
          );
        } catch {
          // Delete failed — nothing else to invalidate.
        }
      },
    }),
    /** The requirement + hours a placement would auto-fill, before confirming. */
    getPlacementDefaults: builder.query<
      PlacementDefaults,
      { studentId: string; establishmentId?: string }
    >({
      query: ({ studentId, establishmentId }) =>
        `/coordinator/students/${studentId}/placement-defaults${toQueryString({ establishmentId })}`,
    }),
    /**
     * Records a placement: one action. If the student has an ACTIVE
     * assignment it is transferred out (never deleted) and the new one starts
     * at zero hours — see the confirmation copy in `use-placement.ts`.
     */
    createPlacement: builder.mutation<
      TrainingAssignment,
      { studentId: string } & CreatePlacementRequest
    >({
      query: ({ studentId, ...body }) => ({
        url: `/coordinator/students/${studentId}/placements`,
        method: "POST",
        body,
      }),
      // The placed student's row (establishment/progress) and their
      // assignment history both change.
      invalidatesTags: ["Student", "Assignment"],
    }),
    getAssignments: builder.query<TrainingAssignment[], string>({
      query: (studentId) => `/coordinator/students/${studentId}/assignments`,
      providesTags: ["Assignment"],
    }),
    updateAssignment: builder.mutation<
      TrainingAssignment,
      { id: string } & UpdateAssignmentRequest
    >({
      query: ({ id, ...body }) => ({
        url: `/coordinator/assignments/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Student", "Assignment"],
    }),
    /**
     * Records or corrects the coordinator's grade for one placement. The same
     * call for both — the server stamps who and when.
     */
    setAssignmentGrade: builder.mutation<
      TrainingAssignment,
      { id: string } & SetAssignmentGradeRequest
    >({
      query: ({ id, ...body }) => ({
        url: `/coordinator/assignments/${id}/grade`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Assignment"],
      // Every evaluation row carries its placement's grade too, and those live
      // in another slice whose tags this mutation can't reach on its own.
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(evaluationApi.util.invalidateTags(["Evaluation"]));
        } catch {
          // Save failed — nothing else to invalidate.
        }
      },
    }),
    /**
     * The Excel template. Goes through the slice rather than a plain
     * `<a href>` because the route is bearer-authenticated. The response is
     * turned into an object URL here — a string — so no Blob is ever put in
     * the store; the caller clicks it and revokes it. Never cached.
     */
    downloadImportTemplate: builder.query<ImportTemplateDownload, void>({
      query: () => ({
        url: "/coordinator/students/import/template",
        responseHandler: async (response) => {
          // An error still answers in Nest's JSON shape.
          if (!response.ok) return response.json();
          return {
            url: URL.createObjectURL(await response.blob()),
            filename: "OJT-Track-student-import-template.xlsx",
          };
        },
      }),
      keepUnusedDataFor: 0,
    }),
    /** `body` is FormData: `file` (.xlsx) and optional `blockId`. Writes nothing. */
    previewStudentImport: builder.mutation<ImportPreview, FormData>({
      query: (body) => ({
        url: "/coordinator/students/import/preview",
        method: "POST",
        body,
      }),
    }),
    /**
     * The same FormData again. The server re-parses and re-validates the file
     * from scratch, then creates the valid rows in one transaction.
     */
    commitStudentImport: builder.mutation<ImportResult, FormData>({
      query: (body) => ({
        url: "/coordinator/students/import/commit",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Student"],
      // New students change the dashboard's counts too.
      async onQueryStarted(_body, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(dashboardApi.util.invalidateTags(["Dashboard"]));
        } catch {
          // Import failed — nothing was created.
        }
      },
    }),
  }),
});

export const {
  useGetStudentsQuery,
  useCreateStudentMutation,
  useUpdateStudentMutation,
  useDeleteStudentMutation,
  useGetPlacementDefaultsQuery,
  useLazyGetPlacementDefaultsQuery,
  useCreatePlacementMutation,
  useGetAssignmentsQuery,
  useUpdateAssignmentMutation,
  useSetAssignmentGradeMutation,
  useLazyDownloadImportTemplateQuery,
  usePreviewStudentImportMutation,
  useCommitStudentImportMutation,
} = studentApi;
