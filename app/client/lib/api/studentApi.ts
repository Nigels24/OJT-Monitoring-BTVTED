import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";
import { dashboardApi } from "./dashboardApi";
import { attendanceOversightApi } from "./attendanceOversightApi";
import { documentApi } from "./documentApi";
import { evaluationApi } from "./evaluationApi";
import { messagesApi } from "./messagesApi";

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
  coordinatorGrade: string | null;
  coordinatorGradeRemarks: string | null;
  gradedById: string | null;
  gradedAt: string | null;
  createdAt: string;
  updatedAt: string;
  progress: AssignmentProgress;
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
  user: {
    id: string;
    email: string;
    username: string | null;
    name: string;
    createdAt: string;
  };
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
   * taken by the deprecated free-text field — there is no separate stored
   * column for it (server: `resolveCourseFields`). */
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
  /** Set by the coordinator and handed to the student. */
  password: string;
  studentIdNumber: string;
  name?: string;
}

export interface CreateStudentResponse {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: string;
}

export type UpdateStudentRequest = StudentDetailsRequest;

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
    /**
     * Issues a new password for a student who has forgotten theirs.
     * No current password needed — that's the point.
     */
    resetStudentPassword: builder.mutation<
      { id: string; name: string; username: string | null },
      { id: string; password: string }
    >({
      query: ({ id, password }) => ({
        url: `/coordinator/students/${id}/password`,
        method: "PATCH",
        body: { password },
      }),
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
  }),
});

export const {
  useGetStudentsQuery,
  useCreateStudentMutation,
  useUpdateStudentMutation,
  useDeleteStudentMutation,
  useResetStudentPasswordMutation,
  useGetPlacementDefaultsQuery,
  useLazyGetPlacementDefaultsQuery,
  useCreatePlacementMutation,
  useGetAssignmentsQuery,
  useUpdateAssignmentMutation,
} = studentApi;
