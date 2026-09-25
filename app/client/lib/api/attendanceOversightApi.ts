import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";

/**
 * The coordinator's cross-establishment attendance view — read-only.
 *
 * Distinct from `supervisorApi`'s approval queue, which is scoped to one
 * establishment and writes; this only reports.
 */
export interface AttendanceOversightRow {
  id: string;
  studentIdNumber: string;
  name: string;
  establishmentName: string | null;
  /** APPROVED attendance days logged up to today. */
  presentDays: number;
  /** Calendar days from the student's start date to today, inclusive. */
  totalDays: number;
  /**
   * null when there is no window to measure against — the student has no start
   * date, or it is still in the future. Render it as "—", never as 0%.
   */
  attendancePercentage: number | null;
  /**
   * Worst case across this student's own PENDING entries — true once their
   * oldest unactioned one has been waiting more than 21 days
   * (common/attendance-overdue.ts, server-side).
   */
  overdue: boolean;
  /** The oldest PENDING entry's age in days; null when the student has none. */
  daysPending: number | null;
}

export const attendanceOversightApi = createApi({
  reducerPath: "attendanceOversightApi",
  baseQuery: baseQueryWithAuth,
  tagTypes: ["AttendanceOversight"],
  endpoints: (builder) => ({
    getAttendanceOversight: builder.query<AttendanceOversightRow[], void>({
      query: () => "/coordinator/attendance",
      providesTags: ["AttendanceOversight"],
    }),
  }),
});

export const { useGetAttendanceOversightQuery } = attendanceOversightApi;
