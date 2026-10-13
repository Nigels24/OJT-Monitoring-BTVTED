import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";
import type { Evaluation } from "./evaluationApi";

/**
 * The signed-in student's own view of their record (`/student/*`).
 *
 * Distinct from `studentApi`, which is the coordinator managing every student
 * through `/coordinator/students`.
 */

export type AttendanceStatus = "PENDING" | "APPROVED" | "DECLINED";

export interface AttendanceRecord {
  id: string;
  date: string;
  timeInAM: string | null;
  timeOutAM: string | null;
  timeInPM: string | null;
  timeOutPM: string | null;
  /** The student's own note. */
  remarks: string | null;
  /** The supervisor's explanation when status is DECLINED. */
  declineReason: string | null;
  status: AttendanceStatus;
  createdAt: string;
  /** Derived server-side from the four clock fields. */
  hours: number;
}

export interface StudentDashboard {
  id: string;
  studentIdNumber: string;
  course: string | null;
  yearLevel: string | null;
  contactNumber: string | null;
  /** Computed by the server from the date of birth; read-only. */
  age: number | null;
  requiredHours: number;
  startDate: string | null;
  status: string;
  user: { id: string; email: string; name: string };
  establishment: {
    id: string;
    name: string;
    industryType: string | null;
    coordinatorFirstName: string | null;
    coordinatorLastName: string | null;
    coordinatorContact: string | null;
    coordinatorEmail: string | null;
  } | null;
  stats: {
    completedHours: number;
    pendingHours: number;
    requiredHours: number;
    remainingHours: number;
    totalLogs: number;
    approvedCount: number;
    pendingCount: number;
    declinedCount: number;
  };
  recentAttendance: AttendanceRecord[];
  /** Both halves of the two-part assessment, across every placement. */
  assessment: {
    grades: CoordinatorGradeRecord[];
    evaluations: MyEvaluationSummary[];
  };
  _count: { documents: number; credentials: number };
}

/**
 * The coordinator's final grade for one of the student's placements — based on
 * the OJT portfolio report and its presentation. Only graded placements are
 * listed, so `coordinatorGrade` is always set.
 */
export interface CoordinatorGradeRecord {
  id: string;
  academicYear: string;
  status: string;
  startDate: string;
  endDate: string | null;
  /** 0-100 as a Decimal string — render it with `formatGrade`. */
  coordinatorGrade: string;
  coordinatorGradeRemarks: string | null;
  gradedAt: string | null;
  gradedBy: { id: string; user: { name: string } } | null;
  establishment: { id: string; name: string };
}

/** One of the supervisor's evaluation sheets for this student, by total. */
export interface MyEvaluationSummary {
  id: string;
  trainingAssignmentId: string | null;
  totalRating: number;
  maxTotalRating: number;
  trainingEmployedAt: string | null;
  evaluatorName: string | null;
  createdAt: string;
}

export interface SubmitAttendanceRequest {
  /** Calendar day, `yyyy-mm-dd`. */
  date: string;
  /** Full ISO timestamps — the server stores real instants, not clock strings. */
  timeInAM?: string;
  timeOutAM?: string;
  timeInPM?: string;
  timeOutPM?: string;
  remarks?: string;
}

export interface StudentProfile {
  id: string;
  studentIdNumber: string;
  course: string | null;
  yearLevel: string | null;
  firstName: string | null;
  lastName: string | null;
  /** The full middle name; `lib/person-name.ts` derives an initial from it. */
  middleName: string | null;
  dateOfBirth: string | null;
  /**
   * Computed by the server from `dateOfBirth`, as of today. Read-only; `null`
   * when there is no date of birth.
   */
  age: number | null;
  /** "Sex" in the UI: Male or Female. */
  gender: string | null;
  contactNumber: string | null;
  /** The standardized address, as names chosen from the PSGC lists. */
  region: string | null;
  province: string | null;
  cityMunicipality: string | null;
  barangay: string | null;
  streetAddress: string | null;
  postalCode: string | null;
  /** DEPRECATED, read-only: the old free-text address, if one was entered. */
  legacyAddress: string | null;
  requiredHours: number;
  startDate: string | null;
  endDate: string | null;
  status: string;
  user: { id: string; email: string; name: string };
  establishment: { id: string; name: string } | null;
  enrolledCourse: { id: string; code: string; name: string } | null;
  block: { id: string; name: string } | null;
}

/** What a student may edit on their own record: contact number and address. */
export interface UpdateProfileRequest {
  /** `null` clears the field; omitting it leaves the stored value alone. */
  contactNumber?: string | null;
  region?: string | null;
  province?: string | null;
  cityMunicipality?: string | null;
  barangay?: string | null;
  streetAddress?: string | null;
  /** 4 digits; must be the known code where the city/municipality has one. */
  postalCode?: string | null;
}

export type DocumentStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Which phase of the placement a required document belongs to (thesis Table 3). */
export type DocumentStage = "APPLICATION" | "ACCEPTANCE" | "COMPLETION";

export const DOCUMENT_STAGE_LABEL: Record<DocumentStage, string> = {
  APPLICATION: "Application",
  ACCEPTANCE: "Acceptance",
  COMPLETION: "Completion",
};

/**
 * A cell/checklist state.
 *
 * `DECLINED` is what a REJECTED document reads as in the checklist (the stored
 * status keeps its own word); `NOT_APPLICABLE` is a per-assignment requirement
 * for a student with no active placement — not missing, just not due yet.
 */
export type RequirementState =
  | "MISSING"
  | "PENDING"
  | "APPROVED"
  | "DECLINED"
  | "NOT_APPLICABLE";

export interface DocumentRequirement {
  id: string;
  /** Short identifier the stored filename carries, e.g. "MOA". */
  code: string;
  name: string;
  stage: DocumentStage;
  /** True = one per placement (endorsement, MOA, waiver, portfolio). */
  perAssignment: boolean;
}

export interface StudentDocument {
  id: string;
  /**
   * The system-applied filename (`2022-00145_MOA_MUNDO.pdf`), or the free text
   * typed before Table 3 existed for a legacy upload.
   */
  name: string;
  /**
   * Short-lived signed URL that downloads under `name`. `null` when the stored
   * object is missing — the row is shown as unavailable rather than the whole
   * list failing to load.
   */
  fileUrl: string | null;
  status: DocumentStatus;
  /** The coordinator's explanation, set only when status is REJECTED. */
  reviewNote: string | null;
  reviewedAt: string | null;
  uploadedAt: string;
  requirement: DocumentRequirement | null;
  uploadedBy: { id: string; name: string; role: string } | null;
}

/** One row of the student's checklist: a requirement and what satisfies it. */
export interface ChecklistRow {
  requirement: DocumentRequirement;
  /** False for a per-assignment requirement with no active placement yet. */
  applicable: boolean;
  state: RequirementState;
  document: StudentDocument | null;
}

export interface DocumentChecklist {
  hasActiveAssignment: boolean;
  establishment: { id: string; name: string } | null;
  stages: { stage: DocumentStage; requirements: ChecklistRow[] }[];
  /** Legacy uploads, and anything the backfill could not map to a requirement. */
  otherUploads: StudentDocument[];
}


/** Mirrors the server's CREDENTIAL_TYPES — no Prisma enum, so keep both lists in sync by hand. */
export const CREDENTIAL_TYPES = [
  "RESUME",
  "ENDORSEMENT_LETTER",
  "MEDICAL_CERTIFICATE",
  "PARENTAL_CONSENT",
  "INSURANCE",
  "CERTIFICATE_OF_REGISTRATION",
  "OTHER",
] as const;

export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export interface StudentCredential {
  id: string;
  type: CredentialType;
  /** A freshly minted 1-hour signed URL, never the raw storage path. */
  /**
   * Short-lived signed URL, minted per request. `null` when the stored object
   * is missing — the row is shown as unavailable rather than the whole list
   * failing to load.
   */
  fileUrl: string | null;
  createdAt: string;
}

export const studentPortalApi = createApi({
  reducerPath: "studentPortalApi",
  baseQuery: baseQueryWithAuth,
  tagTypes: [
    "MyDashboard",
    "MyAttendance",
    "MyProfile",
    "MyDocuments",
    "MyCredentials",
  ],
  endpoints: (builder) => ({
    getMyDashboard: builder.query<StudentDashboard, void>({
      query: () => "/student/dashboard",
      providesTags: ["MyDashboard"],
    }),
    /** One of the student's own evaluation sheets in full — the print view. */
    getMyEvaluation: builder.query<Evaluation, string>({
      query: (id) => `/student/evaluations/${id}`,
    }),
    getMyAttendance: builder.query<AttendanceRecord[], void>({
      query: () => "/student/attendance",
      providesTags: ["MyAttendance"],
    }),
    submitAttendance: builder.mutation<
      AttendanceRecord,
      SubmitAttendanceRequest
    >({
      query: (body) => ({
        url: "/student/attendance",
        method: "POST",
        body,
      }),
      // A new log changes the dashboard totals too.
      invalidatesTags: ["MyAttendance", "MyDashboard"],
    }),
    getMyProfile: builder.query<StudentProfile, void>({
      query: () => "/student/profile",
      providesTags: ["MyProfile"],
    }),
    updateMyProfile: builder.mutation<StudentProfile, UpdateProfileRequest>({
      query: (body) => ({
        url: "/student/profile",
        method: "PATCH",
        body,
      }),
      // The dashboard's spread of the student record carries contactNumber
      // and address too, so it goes stale alongside the profile.
      invalidatesTags: ["MyProfile", "MyDashboard"],
    }),
    /**
     * The Table 3 checklist: every active requirement with its state, plus any
     * legacy uploads. Replaced the old flat document list — which requirement a
     * per-placement document satisfies is a server-side rule.
     */
    getMyDocuments: builder.query<DocumentChecklist, void>({
      query: () => "/student/documents",
      providesTags: ["MyDocuments"],
    }),
    /** `body` is a FormData with `requirementId` and `file`; the system names the file. */
    uploadDocument: builder.mutation<StudentDocument, FormData>({
      query: (body) => ({
        url: "/student/documents",
        method: "POST",
        body,
      }),
      // The dashboard's _count.documents changes on every upload too.
      invalidatesTags: ["MyDocuments", "MyDashboard"],
    }),
    deleteDocument: builder.mutation<{ id: string; deleted: boolean }, string>(
      {
        query: (id) => ({
          url: `/student/documents/${id}`,
          method: "DELETE",
        }),
        invalidatesTags: ["MyDocuments", "MyDashboard"],
      },
    ),
    getMyCredentials: builder.query<StudentCredential[], void>({
      query: () => "/student/credentials",
      providesTags: ["MyCredentials"],
    }),
    /** `body` is a FormData with `type` and `file` fields — see the Credentials upload form. */
    uploadCredential: builder.mutation<StudentCredential, FormData>({
      query: (body) => ({
        url: "/student/credentials",
        method: "POST",
        body,
      }),
      // The dashboard's _count.credentials changes on every upload too.
      invalidatesTags: ["MyCredentials", "MyDashboard"],
    }),
    deleteCredential: builder.mutation<
      { id: string; deleted: boolean },
      string
    >({
      query: (id) => ({
        url: `/student/credentials/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["MyCredentials", "MyDashboard"],
    }),
  }),
});

export const {
  useGetMyDashboardQuery,
  useGetMyEvaluationQuery,
  useGetMyAttendanceQuery,
  useSubmitAttendanceMutation,
  useGetMyProfileQuery,
  useUpdateMyProfileMutation,
  useGetMyDocumentsQuery,
  useUploadDocumentMutation,
  useDeleteDocumentMutation,
  useGetMyCredentialsQuery,
  useUploadCredentialMutation,
  useDeleteCredentialMutation,
} = studentPortalApi;
