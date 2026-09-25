import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";
import type {
  DocumentRequirement,
  DocumentStage,
  DocumentStatus,
  RequirementState,
} from "./studentPortalApi";

/**
 * The coordinator's cross-student review queue and Table 3 status matrix
 * (`/coordinator/documents*`), plus uploading on a student's behalf.
 *
 * Distinct from `studentPortalApi`'s document endpoints, which are the
 * student's own checklist view of the same table.
 */

export interface CoordinatorDocument {
  id: string;
  studentId: string;
  /**
   * The system-applied filename (`2022-00145_MOA_MUNDO.pdf`) for anything
   * uploaded against a requirement, so a row is identifiable without opening
   * it. Legacy rows still carry the free text the student typed.
   */
  name: string;
  /**
   * Short-lived signed URL that downloads under `name`. `null` when the stored
   * object is missing — the row is shown as unavailable rather than the whole
   * list failing to load.
   */
  fileUrl: string | null;
  status: DocumentStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  uploadedAt: string;
  /** `null` for a legacy upload that predates (or did not map to) Table 3. */
  requirement: DocumentRequirement | null;
  student: {
    id: string;
    studentIdNumber: string;
    user: { name: string };
    establishment: { id: string; name: string } | null;
  };
  reviewedBy: { id: string; user: { name: string } } | null;
  /** Who produced the file — the student, or a coordinator on their behalf. */
  uploadedBy: { id: string; name: string; role: string } | null;
}

/** One cell of the status matrix: one student against one requirement. */
export interface RequirementCell {
  requirementId: string;
  code: string;
  state: RequirementState;
  documentId?: string;
  submittedAt?: string;
}

export interface RequirementStatusRow {
  student: {
    id: string;
    studentIdNumber: string;
    name: string;
    block: { id: string; name: string } | null;
    establishment: { id: string; name: string } | null;
    hasActiveAssignment: boolean;
  };
  cells: RequirementCell[];
  approvedCount: number;
  /** Excludes NOT_APPLICABLE cells, so the ratio means something per student. */
  applicableCount: number;
}

export interface RequirementStatusResponse {
  /** True when the coordinator owns no blocks, so `scope=block` fell back to all. */
  noBlocksAssigned: boolean;
  requirements: DocumentRequirement[];
  stages: DocumentStage[];
  rows: RequirementStatusRow[];
}

export interface RequirementStatusQuery {
  scope?: "block" | "all";
  courseId?: string;
  yearLevel?: number;
  blockId?: string;
  establishmentId?: string;
  stage?: DocumentStage | "";
}

export interface UploadForStudentRequest {
  studentId: string;
  /** FormData with `requirementId` and `file`. */
  body: FormData;
}

export interface ReviewDocumentRequest {
  id: string;
  status: "APPROVED" | "REJECTED";
  /** Required by the server when status is REJECTED, ignored otherwise. */
  reviewNote?: string;
}

export const documentApi = createApi({
  reducerPath: "documentApi",
  baseQuery: baseQueryWithAuth,
  tagTypes: ["Document", "RequirementStatus"],
  endpoints: (builder) => ({
    getDocuments: builder.query<CoordinatorDocument[], void>({
      query: () => "/coordinator/documents",
      providesTags: ["Document"],
    }),
    getRequirementStatus: builder.query<
      RequirementStatusResponse,
      RequirementStatusQuery
    >({
      query: (params) => ({
        url: "/coordinator/documents/status",
        // Empty strings would fail the server's @IsIn checks, so only real
        // values are sent.
        params: Object.fromEntries(
          Object.entries(params).filter(
            ([, value]) => value !== undefined && value !== "",
          ),
        ),
      }),
      providesTags: ["RequirementStatus"],
    }),
    reviewDocument: builder.mutation<
      CoordinatorDocument,
      ReviewDocumentRequest
    >({
      query: ({ id, status, reviewNote }) => ({
        url: `/coordinator/documents/${id}/review`,
        method: "PATCH",
        // JSON.stringify drops an undefined reviewNote, so an APPROVED body
        // never sends the field forbidNonWhitelisted would otherwise ignore.
        body: { status, reviewNote },
      }),
      // A decision changes a matrix cell as well as a queue row.
      invalidatesTags: ["Document", "RequirementStatus"],
    }),
    /** Coordinator uploading for a student — stored already approved. */
    uploadDocumentForStudent: builder.mutation<
      CoordinatorDocument,
      UploadForStudentRequest
    >({
      query: ({ studentId, body }) => ({
        url: `/coordinator/students/${studentId}/documents`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["Document", "RequirementStatus"],
    }),
  }),
});

export const {
  useGetDocumentsQuery,
  useGetRequirementStatusQuery,
  useReviewDocumentMutation,
  useUploadDocumentForStudentMutation,
} = documentApi;
