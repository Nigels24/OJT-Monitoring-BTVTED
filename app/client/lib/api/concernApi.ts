import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";

/**
 * Concerns a supervisor raises about a trainee, and the coordinator's response.
 *
 * A concern is a record against the placement, not a chat message: it is kept
 * permanently and is never part of the 30-day message auto-delete. There is no
 * student endpoint here because the server has none — students do not see
 * concerns.
 */

export type ConcernCategory = "CONDUCT" | "PERFORMANCE" | "ATTENDANCE" | "OTHER";
export type ConcernStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export const CONCERN_CATEGORIES: ConcernCategory[] = [
  "CONDUCT",
  "PERFORMANCE",
  "ATTENDANCE",
  "OTHER",
];

export const CONCERN_CATEGORY_LABEL: Record<ConcernCategory, string> = {
  CONDUCT: "Conduct",
  PERFORMANCE: "Performance",
  ATTENDANCE: "Attendance",
  OTHER: "Other",
};

export const CONCERN_STATUS_LABEL: Record<ConcernStatus, string> = {
  OPEN: "Open",
  ACKNOWLEDGED: "Acknowledged",
  RESOLVED: "Resolved",
};

export interface Concern {
  id: string;
  trainingAssignmentId: string;
  studentId: string;
  /** `null` once the supervisor's account is gone; `raisedByName` remains. */
  raisedById: string | null;
  raisedByName: string;
  category: ConcernCategory;
  description: string;
  status: ConcernStatus;
  coordinatorResponse: string | null;
  respondedAt: string | null;
  respondedBy: { id: string; user: { name: string } } | null;
  createdAt: string;
  updatedAt: string;
  student: { id: string; studentIdNumber: string; user: { name: string } };
  trainingAssignment: {
    id: string;
    status: string;
    academicYear: string;
    establishment: { id: string; name: string };
    block: { id: string; name: string } | null;
  };
}

export interface RaiseConcernRequest {
  assignmentId: string;
  category: ConcernCategory;
  description: string;
}

export interface ConcernListParams {
  /** Defaults server-side to "block" — the coordinator's own blocks. */
  scope?: "block" | "all";
  status?: ConcernStatus | "";
  /** One placement's history; the scope is ignored when this is set. */
  assignmentId?: string;
}

export interface ConcernList {
  /** True when `scope=block` fell back to everything: no blocks assigned yet. */
  noBlocksAssigned: boolean;
  concerns: Concern[];
}

function toQueryString(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) usp.set(key, value);
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export const concernApi = createApi({
  reducerPath: "concernApi",
  baseQuery: baseQueryWithAuth,
  tagTypes: ["Concern"],
  endpoints: (builder) => ({
    /* ---- supervisor ---- */
    raiseConcern: builder.mutation<Concern, RaiseConcernRequest>({
      query: (body) => ({ url: "/supervisor/concerns", method: "POST", body }),
      invalidatesTags: ["Concern"],
    }),
    /** The concerns this supervisor raised, with status and response. */
    getMyConcerns: builder.query<Concern[], void>({
      query: () => "/supervisor/concerns",
      providesTags: ["Concern"],
    }),

    /* ---- coordinator ---- */
    getConcerns: builder.query<ConcernList, ConcernListParams | void>({
      query: (params) =>
        `/coordinator/concerns${toQueryString({
          scope: params?.scope,
          status: params?.status || undefined,
          assignmentId: params?.assignmentId,
        })}`,
      providesTags: ["Concern"],
    }),
    getOpenConcernCount: builder.query<
      { count: number; noBlocksAssigned: boolean },
      "block" | "all"
    >({
      query: (scope) => `/coordinator/concerns/open-count?scope=${scope}`,
      providesTags: ["Concern"],
    }),
    respondToConcern: builder.mutation<
      Concern,
      {
        id: string;
        status: "ACKNOWLEDGED" | "RESOLVED";
        /** `null` clears the response; always sent by the dialog. */
        response: string | null;
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/coordinator/concerns/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Concern"],
    }),
  }),
});

export const {
  useRaiseConcernMutation,
  useGetMyConcernsQuery,
  useGetConcernsQuery,
  useGetOpenConcernCountQuery,
  useRespondToConcernMutation,
} = concernApi;
