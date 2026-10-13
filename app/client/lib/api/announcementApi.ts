import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";

/**
 * Coordinator announcements.
 *
 * The coordinator manages them under `/coordinator/announcements`; students
 * and supervisors read the ones addressed to them from the bare
 * `/announcements`, which the server filters by their role, block and program.
 * Announcements are kept until a coordinator deletes one — they are not
 * messages and are never auto-deleted.
 */

export type AnnouncementAudience = "STUDENTS" | "SUPERVISORS" | "ALL";

export const ANNOUNCEMENT_AUDIENCE_LABEL: Record<AnnouncementAudience, string> =
  {
    STUDENTS: "Students",
    SUPERVISORS: "Supervisors",
    ALL: "Students and supervisors",
  };

interface AnnouncementBase {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  blockId: string | null;
  courseId: string | null;
  block: { id: string; name: string } | null;
  course: { id: string; code: string; name: string } | null;
  postedBy: { id: string; user: { name: string } };
  createdAt: string;
  updatedAt: string;
}

/** As the coordinator sees one, with how many people have read it. */
export interface ManagedAnnouncement extends AnnouncementBase {
  readCount: number;
}

/** As a student or supervisor sees one. */
export interface ReceivedAnnouncement extends AnnouncementBase {
  /** `null` until this viewer marks it read. */
  readAt: string | null;
}

export interface ReceivedAnnouncements {
  unreadCount: number;
  items: ReceivedAnnouncement[];
}

export interface AnnouncementRequest {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  /** `null` = not limited to a block / program. */
  blockId: string | null;
  courseId: string | null;
}

export const announcementApi = createApi({
  reducerPath: "announcementApi",
  baseQuery: baseQueryWithAuth,
  tagTypes: ["Announcement"],
  endpoints: (builder) => ({
    /* ---- coordinator ---- */
    getManagedAnnouncements: builder.query<ManagedAnnouncement[], void>({
      query: () => "/coordinator/announcements",
      providesTags: ["Announcement"],
    }),
    createAnnouncement: builder.mutation<
      ManagedAnnouncement,
      AnnouncementRequest
    >({
      query: (body) => ({
        url: "/coordinator/announcements",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Announcement"],
    }),
    updateAnnouncement: builder.mutation<
      ManagedAnnouncement,
      { id: string } & AnnouncementRequest
    >({
      query: ({ id, ...body }) => ({
        url: `/coordinator/announcements/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Announcement"],
    }),
    deleteAnnouncement: builder.mutation<
      { id: string; deleted: boolean },
      string
    >({
      query: (id) => ({
        url: `/coordinator/announcements/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Announcement"],
    }),

    /* ---- students and supervisors ---- */
    getMyAnnouncements: builder.query<ReceivedAnnouncements, void>({
      query: () => "/announcements",
      providesTags: ["Announcement"],
    }),
    markAnnouncementRead: builder.mutation<
      { id: string; readAt: string },
      string
    >({
      query: (id) => ({ url: `/announcements/${id}/read`, method: "PATCH" }),
      invalidatesTags: ["Announcement"],
    }),
  }),
});

export const {
  useGetManagedAnnouncementsQuery,
  useCreateAnnouncementMutation,
  useUpdateAnnouncementMutation,
  useDeleteAnnouncementMutation,
  useGetMyAnnouncementsQuery,
  useMarkAnnouncementReadMutation,
} = announcementApi;
