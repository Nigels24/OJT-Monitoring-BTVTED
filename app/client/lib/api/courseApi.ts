import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";

/** Courses, their per-year-level requirements, and blocks (`/courses`, `/blocks`). */

export interface CourseRequirement {
  id: string;
  courseId: string;
  yearLevel: number;
  requiredHours: number;
  createdAt: string;
}

export interface BlockCoordinator {
  id: string;
  user: { name: string };
}

export interface Block {
  id: string;
  courseId: string;
  yearLevel: number;
  name: string;
  coordinatorId: string | null;
  academicYear: string;
  createdAt: string;
  course?: { id: string; code: string; name: string };
  coordinator?: BlockCoordinator | null;
  _count?: { students: number; trainingAssignments: number };
}

export interface Course {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  requirements: CourseRequirement[];
  blocks: Block[];
}

export interface CoordinatorSummary {
  id: string;
  user: { id: string; name: string; email: string };
}

export interface CreateCourseRequest {
  code: string;
  name: string;
  isActive?: boolean;
}

export type UpdateCourseRequest = Partial<CreateCourseRequest>;

export interface CreateRequirementRequest {
  yearLevel: number;
  requiredHours: number;
}

export type UpdateRequirementRequest = Partial<CreateRequirementRequest>;

export interface CreateBlockRequest {
  courseId: string;
  yearLevel: number;
  name: string;
  academicYear: string;
  coordinatorId?: string;
}

export interface UpdateBlockRequest {
  yearLevel?: number;
  name?: string;
  academicYear?: string;
  /** `null` clears the assigned coordinator; omit to leave it unchanged. */
  coordinatorId?: string | null;
}

export interface BlockQuery {
  courseId?: string;
  yearLevel?: number;
  academicYear?: string;
}

function toQueryString(params: Record<string, string | number | undefined>) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export const courseApi = createApi({
  reducerPath: "courseApi",
  baseQuery: baseQueryWithAuth,
  tagTypes: ["Course", "Block", "Coordinator"],
  endpoints: (builder) => ({
    getCourses: builder.query<Course[], void>({
      query: () => "/courses",
      providesTags: ["Course"],
    }),
    createCourse: builder.mutation<Course, CreateCourseRequest>({
      query: (body) => ({ url: "/courses", method: "POST", body }),
      invalidatesTags: ["Course"],
    }),
    updateCourse: builder.mutation<Course, { id: string } & UpdateCourseRequest>({
      query: ({ id, ...body }) => ({
        url: `/courses/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Course"],
    }),
    deleteCourse: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/courses/${id}`, method: "DELETE" }),
      invalidatesTags: ["Course"],
    }),
    createRequirement: builder.mutation<
      CourseRequirement,
      { courseId: string } & CreateRequirementRequest
    >({
      query: ({ courseId, ...body }) => ({
        url: `/courses/${courseId}/requirements`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["Course"],
    }),
    updateRequirement: builder.mutation<
      CourseRequirement,
      { id: string } & UpdateRequirementRequest
    >({
      query: ({ id, ...body }) => ({
        url: `/course-requirements/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Course"],
    }),
    deleteRequirement: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/course-requirements/${id}`, method: "DELETE" }),
      invalidatesTags: ["Course"],
    }),
    getBlocks: builder.query<Block[], BlockQuery | void>({
      query: (params) => `/blocks${toQueryString({ ...params })}`,
      providesTags: ["Block"],
    }),
    /** The signed-in coordinator's own blocks — populates the "My Block" scope. */
    getMyBlocks: builder.query<Block[], void>({
      query: () => "/coordinator/me/blocks",
      providesTags: ["Block"],
    }),
    createBlock: builder.mutation<Block, CreateBlockRequest>({
      query: (body) => ({ url: "/blocks", method: "POST", body }),
      // Both: a course's own `blocks` relation (Course list's chips/counts)
      // and the standalone block list/filters.
      invalidatesTags: ["Course", "Block"],
    }),
    updateBlock: builder.mutation<Block, { id: string } & UpdateBlockRequest>({
      query: ({ id, ...body }) => ({
        url: `/blocks/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Course", "Block"],
    }),
    deleteBlock: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/blocks/${id}`, method: "DELETE" }),
      invalidatesTags: ["Course", "Block"],
    }),
    getCoordinators: builder.query<CoordinatorSummary[], void>({
      query: () => "/coordinator/coordinators",
      providesTags: ["Coordinator"],
    }),
  }),
});

export const {
  useGetCoursesQuery,
  useCreateCourseMutation,
  useUpdateCourseMutation,
  useDeleteCourseMutation,
  useCreateRequirementMutation,
  useUpdateRequirementMutation,
  useDeleteRequirementMutation,
  useGetBlocksQuery,
  useGetMyBlocksQuery,
  useCreateBlockMutation,
  useUpdateBlockMutation,
  useDeleteBlockMutation,
  useGetCoordinatorsQuery,
} = courseApi;
