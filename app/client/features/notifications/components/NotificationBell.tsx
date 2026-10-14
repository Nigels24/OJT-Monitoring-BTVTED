"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const panelRef = useRef<HTMLDivElement>(null);
  // Where the panel goes, measured from the bell at the moment it opens. The
  // panel is portalled to <body> and `fixed`: the sidebar scrolls
  // (`overflow-y-auto`), and a scroll container clips an absolutely positioned
  // child on both axes — which is what cut a 320px panel off at the sidebar's
  // 256px edge.
  const [position, setPosition] = useState<PanelPosition | null>(null);
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
      const target = e.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    // The measured position is only right for the layout it was measured in.
    const close = () => {
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
    };
  }, [open, setOpen]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const bell = containerRef.current?.getBoundingClientRect();
    if (bell) setPosition(panelPositionFor(bell));
    setOpen(true);
  };

  const onItemClick = (notification: AppNotification) => {
    const link = handleClick(notification);
    if (link) router.push(link);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
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

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            style={{ zIndex: Z_LAYERS.sidebarPopover, ...position }}
            className="fixed bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col text-gray-900"
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

            <div className="flex-1 min-h-0 overflow-y-auto">
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
          </div>,
          document.body,
        )}
    </div>
  );
}

interface PanelPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

const PANEL_WIDTH = 320;
const PANEL_MAX_HEIGHT = 440;
/** Kept clear of every edge of the screen. */
const EDGE = 12;

/**
 * Below the bell, its left edge on the bell's — then pulled back inside the
 * viewport, so it is whole whether the bell sits in the desktop sidebar or at
 * the right end of the phone's top bar. Narrower than 320px on a 360px screen,
 * and never taller than the room under the bell.
 */
function panelPositionFor(bell: DOMRect): PanelPosition {
  const width = Math.min(PANEL_WIDTH, window.innerWidth - EDGE * 2);
  const top = bell.bottom + 8;
  return {
    top,
    left: Math.max(EDGE, Math.min(bell.left, window.innerWidth - width - EDGE)),
    width,
    maxHeight: Math.max(
      160,
      Math.min(PANEL_MAX_HEIGHT, window.innerHeight - top - EDGE),
    ),
  };
}
