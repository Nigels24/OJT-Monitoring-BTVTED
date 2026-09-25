import { useState } from "react";
import {
  useGetNotificationsQuery,
  useGetUnreadCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  AppNotification,
} from "@/lib/api/notificationsApi";

/**
 * The sidebar bell: unread count (polled) plus the dropdown's own list.
 *
 * The count poll (60s, pauses when the tab is unfocused) is intentionally
 * slower than messaging's 10s unread badge — a notification is informational,
 * not something the coordinator is actively waiting on mid-conversation.
 * Per Step 5's own constraint, this is a `fetch` on a timer, not a DOM event,
 * so `IdleSessionManager`'s activity tracker (which only listens for real
 * input — mousemove/keydown/click/scroll/touchstart) never sees it and it
 * cannot itself keep an otherwise-idle session alive.
 */
export function useNotifications() {
  const [open, setOpen] = useState(false);

  const { data: unread } = useGetUnreadCountQuery(undefined, {
    pollingInterval: 60000,
    skipPollingIfUnfocused: true,
  });

  // Only fetched while the dropdown is open — no point polling the full list
  // in the background for something the coordinator isn't looking at.
  const { data: page, isLoading } = useGetNotificationsQuery(undefined, {
    skip: !open,
  });

  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead] = useMarkAllNotificationsReadMutation();

  const handleOpen = (value: boolean) => {
    setOpen(value);
  };

  const handleClick = (notification: AppNotification): string | null => {
    if (!notification.readAt) {
      void markRead(notification.id);
    }
    setOpen(false);
    return notification.link;
  };

  const handleMarkAllRead = () => {
    void markAllRead();
  };

  return {
    open,
    items: page?.items ?? [],
    isLoading,
    unreadCount: unread?.count ?? 0,
    setOpen: handleOpen,
    handleClick,
    handleMarkAllRead,
  };
}
