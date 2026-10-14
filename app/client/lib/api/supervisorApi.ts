import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";
import type { AttendanceStatus } from "./studentPortalApi";

/** The signed-in supervisor's view of their establishment (`/supervisor/*`). */

export interface SupervisorAttendance {
  id: string;
  date: string;
  timeInAM: string | null;
  timeOutAM: string | null;
  timeInPM: string | null;
  timeOutPM: string | null;
  remarks: string | null;
  declineReason: string | null;
  status: AttendanceStatus;
  createdAt: string;
  hours: number;
  /** PENDING and submitted more than 21 days ago (common/attendance-overdue.ts). */
  overdue: boolean;
  /** null unless PENDING — an approved/declined row has nothing "pending" about it. */
  daysPending: number | null;
  student: {
    id: string;
    studentIdNumber: string;
    course: string | null;
    requiredHours: number;
    user: { name: string; email: string };
  };
  approvedBy: { id: string; user: { name: string } } | null;
}

export interface SupervisorDashboard {
  /** Sections whose queries failed — "students" and/or "attendance". */
  failedSections: string[];
  supervisor: {
    id: string;
    name: string;
    email: string;
    position: string | null;
  };
  establishment: {
    id: string;
    name: string;
    industryType: string | null;
  } | null;
  stats: {
    totalStudents: number;
    activeStudents: number;
    completedStudents: number;
    pendingApprovals: number;
    approvedThisWeek: number;
    declinedCount: number;
    totalApprovedHours: number;
  };
}

/** `GET /supervisor/establishment` — the sidebar's title and address. */
export interface SupervisorEstablishment {
  id: string;
  name: string;
  streetAddress: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
}

export interface SupervisorStudent {
  id: string;
  studentIdNumber: string;
  course: string | null;
  yearLevel: string | null;
  requiredHours: number;
  status: string;
  completedHours: number;
  /** The evaluation sheet's Training Date Started / Ended prefill. */
  startDate: string | null;
  endDate: string | null;
  user: { id: string; email: string; name: string };
  /**
   * The TrainingAssignment this row's hours/progress are drawn from — always
   * one at THIS establishment, never the student's current one elsewhere.
   * `assignmentStatus` is "ACTIVE" for a currently placed student, or
   * TRANSFERRED/COMPLETED for one who has moved on but still has PENDING
   * attendance stranded here awaiting approval (the only reason a non-ACTIVE
   * student still appears in this list at all).
   */
  assignmentId: string;
  assignmentStatus: "ACTIVE" | "COMPLETED" | "TRANSFERRED" | "CANCELLED";
  hasActiveAssignment: boolean;
  /**
   * The coordinator's final grade for that same assignment — read-only here,
   * `null` until one is recorded. A Decimal string; render it with
   * `formatGrade`. The coordinator's remarks are never sent to a supervisor.
   */
  coordinatorGrade: string | null;
  gradedAt: string | null;
  gradedBy: { id: string; user: { name: string } } | null;
}

export const supervisorApi = createApi({
  reducerPath: "supervisorApi",
  baseQuery: baseQueryWithAuth,
  tagTypes: ["SupervisorAttendance", "SupervisorDashboard", "SupervisorStudent"],
  endpoints: (builder) => ({
    getSupervisorDashboard: builder.query<SupervisorDashboard, void>({
      query: () => "/supervisor/dashboard",
      providesTags: ["SupervisorDashboard"],
    }),
    getSupervisorEstablishment: builder.query<SupervisorEstablishment, void>({
      query: () => "/supervisor/establishment",
    }),
    getSupervisorStudents: builder.query<SupervisorStudent[], void>({
      query: () => "/supervisor/students",
      providesTags: ["SupervisorStudent"],
    }),
    /**
     * Marks an OJT finished, or reopens it.
     *
     * COMPLETED students drop out of the approval queue so the next intake
     * starts clean — their attendance records are kept, not deleted.
     */
    setStudentStatus: builder.mutation<
      SupervisorStudent,
      { id: string; status: "ACTIVE" | "COMPLETED" }
    >({
      query: ({ id, status }) => ({
        url: `/supervisor/students/${id}/status`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: [
        "SupervisorStudent",
        "SupervisorAttendance",
        "SupervisorDashboard",
      ],
    }),
    getSupervisorAttendance: builder.query<
      SupervisorAttendance[],
      AttendanceStatus | undefined
    >({
      query: (status) =>
        status ? `/supervisor/attendance?status=${status}` : "/supervisor/attendance",
      providesTags: ["SupervisorAttendance"],
    }),
    approveAttendance: builder.mutation<SupervisorAttendance, string>({
      query: (id) => ({
        url: `/supervisor/attendance/${id}/approve`,
        method: "PATCH",
      }),
      // Approving changes the dashboard counters too.
      invalidatesTags: ["SupervisorAttendance", "SupervisorDashboard"],
    }),
    declineAttendance: builder.mutation<
      SupervisorAttendance,
      { id: string; reason: string }
    >({
      query: ({ id, reason }) => ({
        url: `/supervisor/attendance/${id}/decline`,
        method: "PATCH",
        body: { reason },
      }),
      invalidatesTags: ["SupervisorAttendance", "SupervisorDashboard"],
    }),
  }),
});

export const {
  useGetSupervisorDashboardQuery,
  useGetSupervisorEstablishmentQuery,
  useGetSupervisorStudentsQuery,
  useSetStudentStatusMutation,
  useGetSupervisorAttendanceQuery,
  useApproveAttendanceMutation,
  useDeclineAttendanceMutation,
} = supervisorApi;
