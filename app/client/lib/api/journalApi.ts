import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";

/**
 * Journal entries with photos, for all three roles.
 *
 * One slice, not three: a journal entry is the same record everywhere — the
 * student writes it (`/student/journals`), the coordinator reviews it
 * (`/coordinator/journals`), the supervisor reads it (`/supervisor/journals`) —
 * and a session only ever holds one role, so the endpoints can never collide.
 */

export type JournalStatus = "SUBMITTED" | "ACCEPTED" | "RETURNED";

/** A journal entry may carry at most this many photos — mirrors the server. */
export const MAX_JOURNAL_PHOTOS = 5;

/** 10MB, the server's ceiling per file. Pre-checked client-side for a faster no. */
export const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png"];

export interface JournalPhoto {
  id: string;
  /**
   * The system-applied name, `StudentNo_JOURNAL_<date>_<n>_SURNAME.jpg` — not
   * whatever the phone called the file.
   */
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
  /**
   * Short-lived signed URL, minted per request. `null` when the stored object is
   * missing — that photo renders as unavailable rather than failing the entry.
   */
  url: string | null;
}

/** The assignment a journal belongs to; a journal is per placement, not per student. */
export interface JournalAssignment {
  id: string;
  status: string;
  academicYear: string;
  dutyDays: string[];
  /** "Mon, Wed, Fri", formatted server-side so both ends agree. */
  dutyDaysLabel: string;
  startDate: string;
  endDate: string | null;
  establishment: { id: string; name: string };
}

/** One entry in the student's own list — photos are a count here, not URLs. */
export interface StudentJournalEntry {
  id: string;
  trainingAssignmentId: string;
  entryDate: string;
  activities: string;
  learnings: string | null;
  status: JournalStatus;
  /** The coordinator's written comments; kept visible after a resubmission. */
  coordinatorRemarks: string | null;
  reviewedAt: string | null;
  submittedAt: string;
  createdAt: string;
  photoCount: number;
  canEdit: boolean;
  canDelete: boolean;
}

export interface StudentJournalList {
  /** `null` when the student has no active placement — the page explains that. */
  assignment: JournalAssignment | null;
  entries: StudentJournalEntry[];
}

/** The full entry with signed photo URLs, shared by all three roles' detail views. */
export interface JournalEntryDetail {
  id: string;
  trainingAssignmentId: string;
  studentId: string;
  entryDate: string;
  activities: string;
  learnings: string | null;
  status: JournalStatus;
  coordinatorRemarks: string | null;
  reviewedAt: string | null;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
  student: {
    id: string;
    studentIdNumber: string;
    firstName: string | null;
    lastName: string | null;
    user: { id: string; name: string };
  };
  trainingAssignment: {
    id: string;
    status: string;
    academicYear: string;
    dutyDays: string[];
    startDate: string;
    endDate: string | null;
    establishment: { id: string; name: string };
    block: { id: string; name: string } | null;
  };
  reviewedBy: { id: string; user: { name: string } } | null;
  photos: JournalPhoto[];
  canEdit: boolean;
}

/** A row in the coordinator's review queue or the supervisor's read-only list. */
export interface JournalListRow {
  id: string;
  entryDate: string;
  /** First 160 characters of the write-up — enough to recognise it in a table. */
  excerpt: string;
  status: JournalStatus;
  coordinatorRemarks: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  student: { id: string; studentIdNumber: string; name: string };
  assignmentId: string;
  academicYear: string;
  establishment: { id: string; name: string };
  block: { id: string; name: string } | null;
  reviewedBy: { id: string; name: string } | null;
  photoCount: number;
}

export interface CoordinatorJournalQuery {
  scope?: "block" | "all";
  status?: JournalStatus | "";
  courseId?: string;
  yearLevel?: number;
  blockId?: string;
  establishmentId?: string;
  from?: string;
  to?: string;
  page?: number;
}

export interface CoordinatorJournalList {
  /** True when the coordinator owns no blocks, so `scope=block` fell back to all. */
  noBlocksAssigned: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  awaitingReview: number;
  rows: JournalListRow[];
}

export interface ReviewJournalRequest {
  id: string;
  decision: "ACCEPT" | "RETURN";
  /** Required by the server on RETURN, ignored on ACCEPT. */
  remarks?: string;
}

export interface SupervisorJournalQuery {
  studentId?: string;
  from?: string;
  to?: string;
}

export const journalApi = createApi({
  reducerPath: "journalApi",
  baseQuery: baseQueryWithAuth,
  tagTypes: ["MyJournals", "JournalReview"],
  endpoints: (builder) => ({
    /* ----- student ----- */
    getMyJournals: builder.query<StudentJournalList, string | void>({
      query: (assignmentId) => ({
        url: "/student/journals",
        params: assignmentId ? { assignmentId } : undefined,
      }),
      providesTags: ["MyJournals"],
    }),
    getMyJournalEntry: builder.query<JournalEntryDetail, string>({
      query: (id) => `/student/journals/${id}`,
      providesTags: ["MyJournals"],
    }),
    /** `body` is FormData: entryDate, activities, learnings? and up to 5 `photos`. */
    createJournalEntry: builder.mutation<JournalEntryDetail, FormData>({
      query: (body) => ({ url: "/student/journals", method: "POST", body }),
      invalidatesTags: ["MyJournals"],
    }),
    /** `body` is FormData: activities?, learnings?, removePhotoIds? and new `photos`. */
    updateJournalEntry: builder.mutation<
      JournalEntryDetail,
      { id: string; body: FormData }
    >({
      query: ({ id, body }) => ({
        url: `/student/journals/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["MyJournals"],
    }),
    deleteJournalEntry: builder.mutation<
      { id: string; deleted: boolean },
      string
    >({
      query: (id) => ({ url: `/student/journals/${id}`, method: "DELETE" }),
      invalidatesTags: ["MyJournals"],
    }),

    /* ----- coordinator ----- */
    getJournalsForReview: builder.query<
      CoordinatorJournalList,
      CoordinatorJournalQuery
    >({
      query: (params) => ({
        url: "/coordinator/journals",
        // Empty strings would fail the server's @IsDateString/@IsIn checks, so
        // only real values are sent.
        params: Object.fromEntries(
          Object.entries(params).filter(
            ([, value]) => value !== undefined && value !== "",
          ),
        ),
      }),
      providesTags: ["JournalReview"],
    }),
    /**
     * Just the SUBMITTED count for the dashboard tile — its own request so
     * flipping that tile's scope doesn't refetch the whole dashboard.
     */
    getJournalsAwaitingCount: builder.query<
      { count: number; noBlocksAssigned: boolean },
      "block" | "all"
    >({
      query: (scope) => ({
        url: "/coordinator/journals/awaiting-count",
        params: { scope },
      }),
      providesTags: ["JournalReview"],
    }),
    getJournalForReview: builder.query<JournalEntryDetail, string>({
      query: (id) => `/coordinator/journals/${id}`,
      providesTags: ["JournalReview"],
    }),
    reviewJournalEntry: builder.mutation<
      JournalEntryDetail,
      ReviewJournalRequest
    >({
      query: ({ id, decision, remarks }) => ({
        url: `/coordinator/journals/${id}/review`,
        method: "PATCH",
        // JSON.stringify drops an undefined remarks, so an ACCEPT body never
        // sends the field at all.
        body: { decision, remarks },
      }),
      invalidatesTags: ["JournalReview"],
    }),

    /* ----- supervisor (read-only) ----- */
    getSupervisorJournals: builder.query<
      JournalListRow[],
      SupervisorJournalQuery
    >({
      query: (params) => ({
        url: "/supervisor/journals",
        params: Object.fromEntries(
          Object.entries(params).filter(
            ([, value]) => value !== undefined && value !== "",
          ),
        ),
      }),
    }),
    getSupervisorJournalEntry: builder.query<JournalEntryDetail, string>({
      query: (id) => `/supervisor/journals/${id}`,
    }),
  }),
});

export const {
  useGetMyJournalsQuery,
  useGetMyJournalEntryQuery,
  useCreateJournalEntryMutation,
  useUpdateJournalEntryMutation,
  useDeleteJournalEntryMutation,
  useGetJournalsForReviewQuery,
  useGetJournalsAwaitingCountQuery,
  useGetJournalForReviewQuery,
  useReviewJournalEntryMutation,
  useGetSupervisorJournalsQuery,
  useGetSupervisorJournalEntryQuery,
} = journalApi;
