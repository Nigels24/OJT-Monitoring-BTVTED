import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";
import type { AssignmentProgress, AssignmentStatus } from "./studentApi";

/**
 * The printable reports (server: `src/report/`), for all three roles.
 *
 * One slice and one set of URLs: a placement report is the same resource for
 * a student, a supervisor and a coordinator, and the server decides per
 * request whose placement the caller may read. A student may leave
 * `assignmentId` out and gets their own current placement.
 *
 * Nothing is cached for long: a report is opened to be printed, and should
 * print what is true now.
 */

/** What every placement report prints at the top. */
export interface ReportHeader {
  generatedAt: string;
  placement: {
    id: string;
    status: AssignmentStatus;
    academicYear: string;
    yearLevel: number;
    requiredHours: number;
    dutyDays: string[];
    /** "Mon, Wed, Fri". */
    dutyDaysLabel: string;
    startDate: string;
    endDate: string | null;
    establishment: { id: string; name: string };
    block: { id: string; name: string } | null;
  };
  student: {
    id: string;
    studentIdNumber: string;
    name: string;
    /** "Surname, First M." — how a form's name line is written. */
    nameLastFirst: string;
    program: string | null;
    programCode: string | null;
  };
}

export interface DtrDay {
  day: number;
  date: string;
  weekday: string;
  isDutyDay: boolean;
  /** Clock times as the form shows them, e.g. "8:00"; `null` when blank. */
  amArrival: string | null;
  amDeparture: string | null;
  pmArrival: string | null;
  pmDeparture: string | null;
  /** `null` on a day with no approved entry. */
  hours: number | null;
}

export interface DtrReport extends ReportHeader {
  /** "2026-10". */
  month: string;
  /** "October 2026". */
  label: string;
  days: DtrDay[];
  totalHours: number;
  daysRendered: number;
  /** The "In-Charge"; `null` leaves the line to be written in. */
  supervisorName: string | null;
}

export type SummaryDayStatus =
  | "APPROVED"
  | "PENDING"
  | "DECLINED"
  | "MISSING_LOG"
  | "NOT_DUTY_DAY";

export interface AttendanceSummaryReport extends ReportHeader {
  range: { from: string; to: string };
  days: {
    date: string;
    weekday: string;
    status: SummaryDayStatus;
    amArrival: string | null;
    amDeparture: string | null;
    pmArrival: string | null;
    pmDeparture: string | null;
    hours: number | null;
  }[];
  totals: Record<SummaryDayStatus, number>;
  approvedHours: number;
  pendingHours: number;
}

/** The four conditions of completion (server: `assignment-completion.ts`). */
export interface CompletionChecklist {
  hoursMet: boolean;
  portfolioAccepted: boolean;
  evaluationRecorded: boolean;
  gradeRecorded: boolean;
  complete: boolean;
}

export interface ProgressReport extends ReportHeader {
  progress: AssignmentProgress;
  completion: CompletionChecklist;
}

export interface JournalReport extends ReportHeader {
  supervisorName: string | null;
  entries: {
    id: string;
    entryDate: string;
    activities: string;
    learnings: string | null;
    photos: { id: string; originalName: string; url: string | null }[];
  }[];
}

export interface AssessmentReport extends ReportHeader {
  evaluations: {
    id: string;
    totalRating: number;
    maxTotalRating: number;
    evaluatorName: string | null;
    evaluatorPosition: string | null;
    createdAt: string;
  }[];
  coordinatorGrade: {
    grade: string | null;
    /** Always `null` for a supervisor. */
    remarks: string | null;
    gradedAt: string | null;
    gradedByName: string | null;
  };
}

export interface SummaryReport {
  generatedAt: string;
  noBlocksAssigned: boolean;
  counts: {
    totalStudents: number;
    activeTrainees: number;
    completedTrainees: number;
    endedOrCancelled: number;
    noPlacement: number;
  };
  unverifiedAttendance: {
    pending: number;
    overdue: number;
    byEstablishment: {
      id: string | null;
      name: string;
      pending: number;
      overdue: number;
    }[];
  };
  missingDocuments: {
    id: string;
    studentIdNumber: string;
    name: string;
    missing: { code: string; name: string }[];
  }[];
}

type Params = Record<string, string | number | undefined>;

function withQuery(path: string, params: Params): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

interface PlacementArg {
  assignmentId?: string;
}

export const reportApi = createApi({
  reducerPath: "reportApi",
  baseQuery: baseQueryWithAuth,
  keepUnusedDataFor: 0,
  endpoints: (builder) => ({
    getDtrReport: builder.query<DtrReport, PlacementArg & { month: string }>({
      query: (params) => withQuery("/reports/dtr", { ...params }),
    }),
    getAttendanceSummaryReport: builder.query<
      AttendanceSummaryReport,
      PlacementArg & { from?: string; to?: string }
    >({
      query: (params) => withQuery("/reports/attendance", { ...params }),
    }),
    getProgressReport: builder.query<ProgressReport, PlacementArg>({
      query: (params) => withQuery("/reports/progress", { ...params }),
    }),
    getJournalReport: builder.query<JournalReport, PlacementArg>({
      query: (params) => withQuery("/reports/journal", { ...params }),
    }),
    getAssessmentReport: builder.query<AssessmentReport, PlacementArg>({
      query: (params) => withQuery("/reports/assessment", { ...params }),
    }),
    /** Coordinator only. Takes the Students list's own filter parameters. */
    getSummaryReport: builder.query<SummaryReport, Params>({
      query: (params) => withQuery("/reports/summary", params),
    }),
  }),
});

export const {
  useGetDtrReportQuery,
  useGetAttendanceSummaryReportQuery,
  useGetProgressReportQuery,
  useGetJournalReportQuery,
  useGetAssessmentReportQuery,
  useGetSummaryReportQuery,
} = reportApi;
