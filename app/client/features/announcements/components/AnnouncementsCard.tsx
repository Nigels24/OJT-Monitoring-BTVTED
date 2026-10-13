import { Megaphone } from "lucide-react";
import Card from "@/components/ui/Card";
import {
  useGetMyAnnouncementsQuery,
  useMarkAnnouncementReadMutation,
} from "@/lib/api/announcementApi";

/**
 * The announcements addressed to the signed-in student or supervisor, newest
 * first, with an unread marker. Which ones appear is the server's decision,
 * from the viewer's role, block and program.
 *
 * Announcements are kept — unlike messages they are not auto-deleted — so the
 * list scrolls rather than growing the dashboard.
 */
export default function AnnouncementsCard() {
  const { data, isLoading, isError } = useGetMyAnnouncementsQuery();
  const [markRead, { isLoading: isMarking }] =
    useMarkAnnouncementReadMutation();

  return (
    <Card className="mb-4">
      <h2 className="text-base md:text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <Megaphone size={18} className="text-blue-600" />
        Announcements
        {data && data.unreadCount > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center">
            {data.unreadCount}
          </span>
        )}
      </h2>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : isError ? (
        <p role="alert" className="text-sm text-red-600">
          Could not load announcements.
        </p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-gray-500">No announcements yet.</p>
      ) : (
        <ul className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {data.items.map((announcement) => {
            const unread = announcement.readAt === null;
            return (
              <li
                key={announcement.id}
                className={`rounded-lg border p-3 ${
                  unread ? "border-blue-200 bg-blue-50" : "border-gray-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-gray-900 flex items-center gap-2 min-w-0">
                    {unread && (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-white bg-blue-600 rounded px-1.5 py-0.5">
                        New
                      </span>
                    )}
                    <span className="break-words">{announcement.title}</span>
                  </p>
                  <span className="text-xs text-gray-500 shrink-0">
                    {new Date(announcement.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">
                  {announcement.body}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                  <span className="text-xs text-gray-500">
                    Posted by {announcement.postedBy.user.name}
                  </span>
                  {unread && (
                    <button
                      type="button"
                      disabled={isMarking}
                      onClick={() => {
                        void markRead(announcement.id);
                      }}
                      className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-60"
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
