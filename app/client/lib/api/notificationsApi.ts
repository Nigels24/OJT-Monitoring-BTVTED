import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";

/**
 * Bare `/notifications`, same for all three roles (server: NotificationModule
 * §5-style — see CLAUDE.md's messaging module for the identical shape).
 */

export type NotificationType =
  | "ATTENDANCE_APPROVED"
  | "ATTENDANCE_DECLINED"
  | "ATTENDANCE_OVERDUE"
  | "JOURNAL_RETURNED"
  | "JOURNAL_ACCEPTED"
  | "DOCUMENT_REVIEWED"
  | "ASSESSMENT_COMPLETED"
  | "CONCERN_RAISED"
  | "PLACEMENT_RECORDED"
  | "WEEKLY_TASK_ASSIGNED"
  | "WEEKLY_TASK_DONE"
  | "WEEKLY_TASK_RATED";

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: AppNotification[];
  nextCursor: string | null;
}

export const notificationsApi = createApi({
  reducerPath: "notificationsApi",
  baseQuery: baseQueryWithAuth,
  tagTypes: ["Notification", "UnreadCount"],
  endpoints: (builder) => ({
    getNotifications: builder.query<
      NotificationPage,
      { unreadOnly?: boolean; cursor?: string } | void
    >({
      query: (params) => {
        const usp = new URLSearchParams();
        if (params?.unreadOnly) usp.set("unreadOnly", "true");
        if (params?.cursor) usp.set("cursor", params.cursor);
        const qs = usp.toString();
        return `/notifications${qs ? `?${qs}` : ""}`;
      },
      providesTags: ["Notification"],
    }),
    /** Backs the sidebar bell's badge. Polled — see the bell's own hook for the interval. */
    getUnreadCount: builder.query<{ count: number }, void>({
      query: () => "/notifications/unread-count",
      providesTags: ["UnreadCount"],
    }),
    markNotificationRead: builder.mutation<AppNotification, string>({
      query: (id) => ({
        url: `/notifications/${id}/read`,
        method: "PATCH",
      }),
      invalidatesTags: ["Notification", "UnreadCount"],
    }),
    markAllNotificationsRead: builder.mutation<{ marked: true }, void>({
      query: () => ({
        url: "/notifications/read-all",
        method: "PATCH",
      }),
      invalidatesTags: ["Notification", "UnreadCount"],
    }),
  }),
});

export const {
  useGetNotificationsQuery,
  useGetUnreadCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = notificationsApi;
