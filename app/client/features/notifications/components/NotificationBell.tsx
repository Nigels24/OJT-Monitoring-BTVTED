"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { useNotifications } from "../hooks/use-notifications";
import { formatRelativeTime } from "@/lib/format";
import { Z_LAYERS } from "@/components/ui/Overlay";
import type { AppNotification } from "@/lib/api/notificationsApi";

/**
 * The sidebar's notification bell — unread badge, dropdown list, click to
 * read + navigate, "Mark all read". No dedicated /notifications page: the
 * dropdown is the whole feature (Step 5 goal 5 calls that optional and
 * skippable "if the dropdown covers it").
 */
export default function NotificationBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    open,
    items,
    isLoading,
    unreadCount,
    setOpen,
    handleClick,
    handleMarkAllRead,
  } = useNotifications();

  // Outside click closes the dropdown — there is no full-screen backdrop
  // here (Overlay would be overkill for an anchored popover this small), so
  // this is the dropdown's own equivalent.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, setOpen]);

  const onItemClick = (notification: AppNotification) => {
    const link = handleClick(notification);
    if (link) router.push(link);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        title="Notifications"
        className="relative w-8 h-8 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-red-600 ring-1 ring-white/80 text-white text-[10px] font-bold tabular-nums"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{ zIndex: Z_LAYERS.dropdown }}
          className="absolute top-full left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col text-gray-900"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <p className="text-gray-400 text-sm px-4 py-6 text-center">
                Loading...
              </p>
            ) : items.length === 0 ? (
              <p className="text-gray-500 text-sm px-4 py-6 text-center">
                You&apos;re all caught up.
              </p>
            ) : (
              items.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => onItemClick(notification)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 ${
                    notification.readAt ? "" : "bg-blue-50/60"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!notification.readAt && (
                      <span
                        aria-hidden="true"
                        className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {notification.title}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                        {notification.body}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {formatRelativeTime(notification.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
