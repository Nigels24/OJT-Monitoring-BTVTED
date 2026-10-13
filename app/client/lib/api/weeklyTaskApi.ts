import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";

/**
 * Weekly tasks, for all three roles.
 *
 * One slice, like `journalApi`: a task is the same record everywhere — the
 * supervisor assigns and rates it (`/supervisor/weekly-tasks`), the student
 * marks it done (`/student/weekly-tasks`), the coordinator reads it
 * (`/coordinator/weekly-tasks`) — and a session only ever holds one role.
 *
 * Every list returns the same `WeeklyTaskWeek`, which is also everything the
 * printed Weekly Task Report shows, so the screen and the printout agree.
 */

export type WeeklyTaskStatus = "ASSIGNED" | "DONE" | "RATED";

/** A task may carry at most this many proof photos — mirrors the server. */
export const MAX_TASK_PHOTOS = 5;

export const MIN_TASK_RATING = 1;
export const MAX_TASK_RATING = 5;

export interface WeeklyTaskPhoto {
  id: string;
  /** The system-applied name, `StudentNo_TASK_<date>_<n>_SURNAME.jpg`. */
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  uploadedAt: string;
  /**
   * Short-lived signed URL, minted per request. `null` when the stored object
   * is missing — that photo renders as unavailable rather than failing the week.
   */
  url: string | null;
  /** The same object, served as a download under `originalName`. */
  downloadUrl: string | null;
}

export interface WeeklyTask {
  id: string;
  trainingAssignmentId: string;
  studentId: string;
  /** The Monday of the task's week — a date-only value, render in UTC. */
  weekStart: string;
  title: string;
  description: string | null;
  /** Date-only, render with `formatDateOnly`. */
  dueDate: string;
  status: WeeklyTaskStatus;
  doneAt: string | null;
  studentNote: string | null;
  /** 1-5, the weekly task's own figure — never part of the evaluation sheet. */
  rating: number | null;
  ratingComment: string | null;
  ratedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** `null` when the supervisor who assigned it no longer has an account. */
  assignedBy: { id: string; name: string } | null;
  photos: WeeklyTaskPhoto[];
}

export interface WeeklyTaskWeek {
  /** `null` only for a student who has never been placed. */
  assignment: {
    id: string;
    status: "ACTIVE" | "COMPLETED" | "TRANSFERRED" | "CANCELLED";
    academicYear: string;
    yearLevel: number;
    startDate: string;
    endDate: string | null;
    establishment: { id: string; name: string };
    block: { id: string; name: string } | null;
  } | null;
  student: {
    id: string;
    studentIdNumber: string;
    name: string;
    program: string | null;
    programCode: string | null;
  } | null;
  /** Monday and Sunday of the week, both date-only. */
  week: { start: string; end: string };
  tasks: WeeklyTask[];
  summary: {
    total: number;
    assigned: number;
    done: number;
    rated: number;
    /** Mean of the rated tasks only; `null` until one is rated. No band. */
    averageRating: number | null;
  };
  /** Whoever assigned this week's tasks, for the report's signature line. */
  supervisorName: string | null;
}

/** One placement, one week. `week` is any day of it; omit for the current one. */
export interface WeekParams {
  assignmentId: string;
  week?: string;
}

export interface CreateWeeklyTaskRequest {
  assignmentId: string;
  /** Any day of the week; the server stores that week's Monday. */
  weekStart: string;
  title: string;
  description?: string;
  dueDate: string;
}

export interface UpdateWeeklyTaskRequest {
  title?: string;
  /** `null` clears the description; omit to leave it unchanged. */
  description?: string | null;
  dueDate?: string;
}

function toQueryString(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) usp.set(key, value);
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export const weeklyTaskApi = createApi({
  reducerPath: "weeklyTaskApi",
  baseQuery: baseQueryWithAuth,
  tagTypes: ["WeeklyTask"],
  endpoints: (builder) => ({
    /* ---- supervisor ---- */
    getSupervisorWeek: builder.query<WeeklyTaskWeek, WeekParams>({
      query: ({ assignmentId, week }) =>
        `/supervisor/weekly-tasks${toQueryString({ assignmentId, week })}`,
      providesTags: ["WeeklyTask"],
    }),
    createWeeklyTask: builder.mutation<WeeklyTask, CreateWeeklyTaskRequest>({
      query: (body) => ({
        url: "/supervisor/weekly-tasks",
        method: "POST",
        body,
      }),
      invalidatesTags: ["WeeklyTask"],
    }),
    updateWeeklyTask: builder.mutation<
      WeeklyTask,
      { id: string } & UpdateWeeklyTaskRequest
    >({
      query: ({ id, ...body }) => ({
        url: `/supervisor/weekly-tasks/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["WeeklyTask"],
    }),
    deleteWeeklyTask: builder.mutation<{ id: string; deleted: boolean }, string>(
      {
        query: (id) => ({
          url: `/supervisor/weekly-tasks/${id}`,
          method: "DELETE",
        }),
        invalidatesTags: ["WeeklyTask"],
      },
    ),
    /** Rates a DONE task, or corrects a rating already given. */
    rateWeeklyTask: builder.mutation<
      WeeklyTask,
      { id: string; rating: number; comment: string | null }
    >({
      query: ({ id, ...body }) => ({
        url: `/supervisor/weekly-tasks/${id}/rate`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["WeeklyTask"],
    }),

    /* ---- student ---- */
    /** Defaults server-side to the active placement and the current week. */
    getMyWeek: builder.query<WeeklyTaskWeek, Partial<WeekParams> | void>({
      query: (params) =>
        `/student/weekly-tasks${toQueryString({
          assignmentId: params?.assignmentId,
          week: params?.week,
        })}`,
      providesTags: ["WeeklyTask"],
    }),
    /** `body` is FormData: `note?` and up to 5 `photos`. */
    markWeeklyTaskDone: builder.mutation<
      WeeklyTask,
      { id: string; body: FormData }
    >({
      query: ({ id, body }) => ({
        url: `/student/weekly-tasks/${id}/done`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["WeeklyTask"],
    }),
    undoWeeklyTaskDone: builder.mutation<WeeklyTask, string>({
      query: (id) => ({
        url: `/student/weekly-tasks/${id}/undo`,
        method: "PATCH",
      }),
      invalidatesTags: ["WeeklyTask"],
    }),

    /* ---- coordinator (read-only) ---- */
    getCoordinatorWeek: builder.query<WeeklyTaskWeek, WeekParams>({
      query: ({ assignmentId, week }) =>
        `/coordinator/weekly-tasks${toQueryString({ assignmentId, week })}`,
      providesTags: ["WeeklyTask"],
    }),
  }),
});

export const {
  useGetSupervisorWeekQuery,
  useCreateWeeklyTaskMutation,
  useUpdateWeeklyTaskMutation,
  useDeleteWeeklyTaskMutation,
  useRateWeeklyTaskMutation,
  useGetMyWeekQuery,
  useMarkWeeklyTaskDoneMutation,
  useUndoWeeklyTaskDoneMutation,
  useGetCoordinatorWeekQuery,
} = weeklyTaskApi;
